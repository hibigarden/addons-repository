#!/usr/bin/env node
// Prepare from validated, published packages without webhook credentials. Send
// separately, so package inspection never receives the Discord secret.
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { inspectDirectory, reportSkipped } from './check.mjs'

const REPOSITORY = 'https://github.com/hibigarden/addons-repository'
const ROLE = '1550310045068296262'
const SHA = /^[0-9a-f]{40}$/
const ID = /^[a-z][a-z0-9-]{0,47}$/
const CHECKPOINT = 'refs/remotes/origin/addon-announcements-state'
// A checkpoint commit holds only this file. Its first parent is the delivered
// main snapshot; each listed entry has a new signature that failed validation
// while announcing, and is compared with the snapshot named for it instead.
const STATE = 'deferred.json'

function git(root, ...args) {
  return gitInput(root, undefined, ...args)
}

function gitInput(root, input, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    input,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH },
    maxBuffer: 8 * 1024 * 1024,
  }).trim()
}

function checkpoint(root) {
  try {
    return git(root, 'rev-parse', '--verify', '--quiet', CHECKPOINT)
  } catch (error) {
    if (error.status !== 1) throw error
  }
}

function isAncestor(root, revision) {
  try {
    git(root, 'merge-base', '--is-ancestor', revision, 'HEAD')
    return true
  } catch {
    return false
  }
}

function checkDeferred(root, deferred) {
  if (
    !deferred ||
    typeof deferred !== 'object' ||
    Array.isArray(deferred) ||
    !Object.entries(deferred).every(
      ([id, since]) =>
        ID.test(id) && SHA.test(since) && isAncestor(root, since),
    )
  )
    throw new Error('invalid announcement state')
  return deferred
}

export function announcementState(root) {
  let base = checkpoint(root)
  let deferred = {}
  if (base && git(root, 'ls-tree', '--name-only', base) === STATE) {
    deferred = JSON.parse(git(root, 'show', `${base}:${STATE}`))
    base = git(root, 'rev-parse', `${base}^1`)
  } else if (!base) {
    // Start just before this notifier was introduced; old catalog entries do
    // not become new announcements when the checkpoint is first created.
    const introduced = git(
      root,
      'log',
      '--first-parent',
      '--diff-merges=first-parent',
      '--reverse',
      '--diff-filter=A',
      '--format=%H',
      'HEAD',
      '--',
      'scripts/announce.mjs',
    ).split('\n')[0]
    if (!SHA.test(introduced))
      throw new Error('cannot find announcement bootstrap commit')
    base = git(root, 'rev-parse', `${introduced}^`)
  }
  if (!SHA.test(base)) throw new Error('invalid announcement checkpoint')
  if (!isAncestor(root, base))
    throw new Error(
      'announcement checkpoint is not an ancestor of this publication',
    )
  return { base, deferred: checkDeferred(root, deferred) }
}

export function announcementBase(root) {
  return announcementState(root).base
}

/**
 * Returns a commit recording HEAD as delivered with `deferred` entries still
 * due. Its parents are HEAD and the current checkpoint, so pushing it to the
 * checkpoint branch is a fast-forward.
 */
export function checkpointCommit(root, deferred) {
  checkDeferred(root, deferred)
  const blob = gitInput(
    root,
    `${JSON.stringify(deferred)}\n`,
    'hash-object',
    '-w',
    '--stdin',
  )
  const tree = gitInput(root, `100644 blob ${blob}\t${STATE}\n`, 'mktree')
  const previous = checkpoint(root)
  return git(
    root,
    '-c',
    'user.name=schmayterling',
    '-c',
    'user.email=ryana@ryanaque.com',
    'commit-tree',
    tree,
    '-p',
    'HEAD',
    ...(previous ? ['-p', previous] : []),
    '-m',
    'chore: record delivered addon announcements',
  )
}

export function readSnapshot(root, revision) {
  if (!SHA.test(revision)) throw new Error('expected a full commit sha')
  if (/^0+$/.test(revision)) return []
  const catalog = JSON.parse(git(root, 'show', `${revision}:catalog.json`))
  const paths = new Set(
    git(
      root,
      'ls-tree',
      '-r',
      '--name-only',
      revision,
      '--',
      'signatures',
    ).split('\n'),
  )
  return catalog.map((entry) => {
    if (!ID.test(entry.id)) throw new Error('invalid historical addon id')
    const path = `signatures/${entry.id}.json`
    if (!paths.has(path)) return { entry, files: null }
    const envelope = JSON.parse(git(root, 'show', `${revision}:${path}`))
    const statement = JSON.parse(
      Buffer.from(envelope.statement, 'base64').toString('utf8'),
    )
    return { entry, version: statement.addonVersion, files: statement.files }
  })
}

// Signed file hashes include the manifest, code, assets and readme, but not
// signatures. Re-signing or changing only catalog presentation is silent.
export function classifyChanges(before, after) {
  const previous = new Map(before.map((item) => [item.entry.id, item]))
  return after.flatMap(({ entry, version, files }) => {
    if (!files) throw new Error('cannot announce an unsigned package')
    const old = previous.get(entry.id)
    if (!old?.files) return [{ entry, files, kind: 'added' }]
    if (old.version === version && isDeepStrictEqual(old.files, files))
      return []
    return [{ entry, files, kind: 'updated', previousVersion: old.version }]
  })
}

function escapeText(value, limit) {
  const chars = Array.from(
    value
      .replace(/[\p{Cc}\u2028\u2029]/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim(),
  )
  return (chars.slice(0, limit).join('') + (chars.length > limit ? '…' : ''))
    .replace(/@/g, '@\u200b')
    .replace(/[\\`*_{}[\]()<>~|#!+-]/g, '\\$&')
}

function linkUrl(value, fallback) {
  const url = new URL(value).href.replace(
    /[\\()[\]<>`]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return url.length <= 1000 ? url : fallback
}

export function announcementPayloads(changes, revision) {
  if (!SHA.test(revision)) throw new Error('expected a full commit sha')
  const payloads = []
  let description = ''
  const flush = () => {
    if (!description) return
    payloads.push({
      content: payloads.length
        ? 'addon additions and updates (continued).'
        : `<@&${ROLE}> addon additions and updates.`,
      allowed_mentions: { parse: [], roles: [ROLE] },
      embeds: [
        {
          title: '🦋',
          description,
          color: 9568176,
          footer: {
            text: 'these addons are reviewed and signed. refresh the addon manager to see them.',
          },
        },
      ],
      attachments: [],
    })
    description = ''
  }
  for (const {
    entry,
    files,
    kind,
    previousVersion,
    previousRevision,
  } of changes) {
    const catalogUrl = `${REPOSITORY}/blob/${revision}/catalog.json`
    const source = entry.path
      ? `${REPOSITORY}/tree/${revision}/${entry.path}`
      : entry.repository
        ? `${entry.repository.url.replace(/\/$/, '')}/tree/${entry.repository.commit}${entry.repository.path ? `/${entry.repository.path}` : ''}`
        : entry.download.url
    const packageUrl = linkUrl(source, catalogUrl)
    const changelog = Object.keys(files).find((path) =>
      /^(changelog|changes|history)\.md$/i.test(path),
    )
    const links = [
      `[changes](${previousRevision ? `${REPOSITORY}/compare/${previousRevision}...${revision}` : `${REPOSITORY}/commit/${revision}`})`,
    ]
    if (changelog && !entry.download)
      links.push(
        `[changelog](${linkUrl(`${source}/${changelog}`, catalogUrl)})`,
      )
    const version =
      previousVersion && previousVersion !== entry.version
        ? `${escapeText(previousVersion, 40)} → ${escapeText(entry.version, 40)}`
        : escapeText(entry.version, 40)
    const line = `**${kind}** [${escapeText(entry.name, 100)}](${packageUrl}) · **${version}**\n${escapeText(entry.description, 300)}\n${links.join(' · ')}`
    if (description.length + line.length + 2 > 4096) flush()
    description += `${description ? '\n\n' : ''}${line}`
  }
  flush()
  return payloads
}

/**
 * Entries that fail validation or are not signed yet are not announced; each
 * is added to `options.skipped` with the reason. An entry skipped because the
 * signer skipped it keeps its old signature, so it is announced in the run
 * that signs it. One whose new signature fails here is added to
 * `options.deferred` with the snapshot it still compares with (`since`), so a
 * later run announces its latest signature once it validates.
 */
export async function prepareAnnouncements(
  root,
  base,
  { skipped = [], deferred = {}, ...options } = {},
) {
  const state = base ? { base, deferred: {} } : announcementState(root)
  const revision = git(root, 'rev-parse', 'HEAD')
  const results = await inspectDirectory(root, {
    ...options,
    remote: true,
    skipFailures: true,
  })
  const snapshots = new Map()
  const previous = (id, since) => {
    if (!snapshots.has(since))
      snapshots.set(
        since,
        new Map(readSnapshot(root, since).map((item) => [item.entry.id, item])),
      )
    const item = snapshots.get(since).get(id)
    return item ? [item] : []
  }
  const published = new Map(
    readSnapshot(root, revision).map((item) => [item.entry.id, item]),
  )
  const changes = []
  for (const { entry, hashes, problem, failure } of results) {
    const since = state.deferred[entry.id] ?? state.base
    if (failure || problem) {
      skipped.push({ id: entry.id, reason: failure ?? problem })
      const signed = published.get(entry.id)
      if (
        signed?.files &&
        classifyChanges(previous(entry.id, since), [signed]).length
      )
        deferred[entry.id] = since
      continue
    }
    for (const change of classifyChanges(previous(entry.id, since), [
      { entry, version: entry.version, files: hashes },
    ])) {
      change.previousRevision =
        git(
          root,
          'log',
          '-1',
          '--format=%H',
          since,
          '--',
          `signatures/${entry.id}.json`,
        ) || undefined
      changes.push(change)
    }
  }
  return announcementPayloads(changes, revision)
}

export async function sendAnnouncements(
  webhookUrl,
  payloads,
  { fetch: send = globalThis.fetch, sleep = setTimeout } = {},
) {
  if (!webhookUrl) {
    console.log(
      '::notice::HIBI_ADDONS_WEBHOOK_URL is unset; skipping announcement.',
    )
    return false
  }
  if (!payloads.length) return false
  let url
  try {
    url = new URL(webhookUrl)
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'discord.com' ||
      url.username ||
      url.password ||
      !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[\w.-]+$/.test(url.pathname)
    )
      throw new Error()
    url.searchParams.set('wait', 'true')
  } catch {
    throw new Error('invalid addon webhook url')
  }
  for (const [index, payload] of payloads.entries()) {
    for (let attempt = 0; ; attempt++) {
      let response
      try {
        response = await send(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          redirect: 'error',
          signal: AbortSignal.timeout(30_000),
        })
      } catch {
        throw new Error(
          `addon webhook request failed at batch ${index + 1}/${payloads.length}; delivery is uncertain, inspect Discord before retrying`,
        )
      }
      // Only a rejected rate-limited request is safe to retry automatically.
      if (response.status === 429 && attempt < 2) {
        const retry = Number(response.headers.get('retry-after'))
        if (Number.isFinite(retry) && retry > 0 && retry <= 60) {
          await sleep(Math.ceil(retry * 1000))
          continue
        }
      }
      if (!response.ok)
        throw new Error(
          `addon webhook failed: HTTP ${response.status} at batch ${index + 1}/${payloads.length}`,
        )
      break
    }
  }
  return true
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv[2] === 'prepare') {
      const skipped = []
      const deferred = {}
      const payloads = await prepareAnnouncements(process.cwd(), undefined, {
        skipped,
        deferred,
      })
      reportSkipped(skipped, 'Addons not announced')
      writeFileSync('announcements.json', JSON.stringify(payloads))
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(
          process.env.GITHUB_OUTPUT,
          `published=${git(process.cwd(), 'rev-parse', 'HEAD')}\ndeferred=${JSON.stringify(deferred)}\n`,
        )
      console.log(`prepared ${payloads.length} announcement batches`)
    } else if (process.argv[2] === 'send') {
      const delivered = await sendAnnouncements(
        process.env.HIBI_ADDONS_WEBHOOK_URL,
        JSON.parse(readFileSync('announcements.json', 'utf8')),
      )
      if (process.env.GITHUB_OUTPUT)
        appendFileSync(process.env.GITHUB_OUTPUT, `delivered=${delivered}\n`)
    } else if (process.argv[2] === 'checkpoint') {
      console.log(
        checkpointCommit(process.cwd(), JSON.parse(process.env.DEFERRED)),
      )
    } else {
      throw new Error(
        'usage: node scripts/announce.mjs prepare|send|checkpoint',
      )
    }
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
