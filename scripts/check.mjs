#!/usr/bin/env node
// Validates catalog.json and the packages in addons/. With --remote, it also
// compares linked repositories and downloads with their catalog entries.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fileURLToPath } from 'node:url'

const KEYS = new Set([
  'id',
  'name',
  'description',
  'version',
  'apiVersion',
  'kind',
  'authors',
  'license',
  'homepage',
  'path',
  'repository',
  'download',
])
const SOURCES = ['path', 'repository', 'download']
const METADATA = [
  'id',
  'name',
  'description',
  'version',
  'apiVersion',
  'kind',
  'authors',
]
const ALLOWED_FILES = new Set(
  '.js .mjs .json .css .woff .woff2 .ttf .svg .png .jpg .jpeg .webp .gif .mp3 .ogg .wav .md .txt'.split(
    ' ',
  ),
)
const MAX_DOWNLOAD_BYTES = 25 * 1024 * 1024
const ID = /^[a-z][a-z0-9-]{0,47}$/
const COMMIT = /^[0-9a-f]{40}$/
const SHA256 = /^[0-9a-f]{64}$/
const FOLDER =
  /^(?:[A-Za-z0-9_][A-Za-z0-9._-]*)(?:\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/

const https = (value) => {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' && !url.username && !url.password && !url.hash
    )
  } catch {
    return false
  }
}
const text = (value, max) =>
  typeof value === 'string' && !!value.trim() && value.length <= max
const hidden = (name) =>
  name.startsWith('.') ||
  ['node_modules', '__macosx'].includes(name.toLowerCase())

function files(root, folder = root) {
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => !hidden(entry.name))
    .flatMap((entry) => {
      const path = join(folder, entry.name)
      if (entry.isSymbolicLink())
        throw new Error(`${relative(root, path)} is a symbolic link.`)
      return entry.isDirectory()
        ? files(root, path)
        : [relative(root, path).split(sep).join('/')]
    })
}

function checkEntry(entry, index) {
  const label = `catalog.json entry ${index + 1}${entry?.id ? ` (${entry.id})` : ''}`
  if (!entry || typeof entry !== 'object' || Array.isArray(entry))
    throw new Error(`${label} must be an object.`)
  for (const key of Object.keys(entry))
    if (!KEYS.has(key))
      throw new Error(`${label} has an unknown field: ${key}.`)
  if (!ID.test(entry.id ?? '')) throw new Error(`${label} needs a valid id.`)
  if (
    !text(entry.name, 100) ||
    !text(entry.description, 500) ||
    !text(entry.version, 40)
  )
    throw new Error(`${label} needs a name, description, and version.`)
  if (entry.apiVersion !== 1 && entry.apiVersion !== 2)
    throw new Error(`${label} needs an apiVersion of 1 or 2.`)
  if (!['extension', 'theme'].includes(entry.kind))
    throw new Error(`${label} needs a kind of "extension" or "theme".`)
  if (
    !Array.isArray(entry.authors) ||
    !entry.authors.length ||
    entry.authors.some((author) => !text(author?.displayName, 100))
  )
    throw new Error(`${label} needs authors with display names.`)
  if (!text(entry.license, 100))
    throw new Error(`${label} needs an SPDX license expression.`)
  if (entry.homepage !== undefined && !https(entry.homepage))
    throw new Error(`${label} needs an HTTPS homepage.`)
  const sources = SOURCES.filter((key) => entry[key] !== undefined)
  if (sources.length !== 1)
    throw new Error(
      `${label} needs exactly one of path, repository, or download.`,
    )
  if (entry.path !== undefined && entry.path !== `addons/${entry.id}`)
    throw new Error(`${label} must use the path addons/${entry.id}.`)
  const { repository, download } = entry
  if (repository !== undefined) {
    if (
      !repository ||
      Object.keys(repository).some(
        (key) => !['url', 'commit', 'path'].includes(key),
      ) ||
      !https(repository.url) ||
      !COMMIT.test(repository.commit ?? '') ||
      (repository.path !== undefined && !FOLDER.test(repository.path))
    )
      throw new Error(
        `${label} needs a repository with an HTTPS url, a full 40-character commit, and an optional folder path.`,
      )
  }
  if (download !== undefined) {
    if (
      !download ||
      Object.keys(download).some(
        (key) => !['url', 'sha256', 'size'].includes(key),
      ) ||
      !https(download.url) ||
      !SHA256.test(download.sha256 ?? '') ||
      !Number.isSafeInteger(download.size) ||
      download.size < 1 ||
      download.size > MAX_DOWNLOAD_BYTES
    )
      throw new Error(
        `${label} needs a download with an HTTPS url, a lowercase sha256, and a size up to 25 MiB.`,
      )
  }
}

function sameMetadata(label, entry, manifest) {
  for (const key of METADATA)
    if (!isDeepStrictEqual(entry[key], manifest[key]))
      throw new Error(
        `${label}: catalog.json ${key} does not match hibi-addon.json.`,
      )
}

function checkPackage(root, entry) {
  const folder = join(root, entry.path)
  const label = entry.path
  if (!existsSync(join(folder, 'hibi-addon.json')))
    throw new Error(`${label}: hibi-addon.json is missing.`)
  const own = files(folder)
  for (const path of own)
    if (!ALLOWED_FILES.has(extname(path).toLowerCase()))
      throw new Error(
        `${label}: Hibi does not install ${path}. Use LICENSE.txt or LICENSE.md for licenses.`,
      )
  if (own.filter((path) => path.endsWith('hibi-addon.json')).length !== 1)
    throw new Error(
      `${label}: a package folder holds exactly one hibi-addon.json.`,
    )
  if (!own.includes('README.md')) throw new Error(`${label}: add a README.md.`)
  if (!own.some((path) => /^licen[cs]e\.(txt|md)$/i.test(path)))
    throw new Error(`${label}: add LICENSE.txt or LICENSE.md.`)
  const manifest = JSON.parse(
    readFileSync(join(folder, 'hibi-addon.json'), 'utf8'),
  )
  sameMetadata(label, entry, manifest)
  if (manifest.kind === 'extension') {
    if (!/\.m?js$/.test(manifest.entry ?? '') || !own.includes(manifest.entry))
      throw new Error(
        `${label}: "entry" must name a committed .js or .mjs file.`,
      )
    for (const path of own.filter((path) => /\.m?js$/.test(path)))
      execFileSync(process.execPath, ['--check', join(folder, path)], {
        stdio: 'pipe',
      })
  }
  for (const theme of manifest.themes ?? [])
    if (typeof theme === 'string') {
      if (!own.includes(theme))
        throw new Error(`${label}: ${theme} is missing.`)
      JSON.parse(readFileSync(join(folder, theme), 'utf8'))
    }
}

async function fetchBytes(url) {
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`${url} returned ${response.status}.`)
  return Buffer.from(await response.arrayBuffer())
}

async function checkRemote(entry) {
  if (entry.repository) {
    const { url, commit, path } = entry.repository
    const match = new URL(url).pathname.match(
      /^\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
    )
    if (new URL(url).hostname !== 'github.com' || !match) {
      console.log(
        `skip ${entry.id}: remote checks support GitHub repositories only.`,
      )
      return
    }
    const raw = `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${commit}/${path ? `${path}/` : ''}hibi-addon.json`
    sameMetadata(
      entry.id,
      entry,
      JSON.parse((await fetchBytes(raw)).toString('utf8')),
    )
  }
  if (entry.download) {
    const bytes = await fetchBytes(entry.download.url)
    if (bytes.length !== entry.download.size)
      throw new Error(
        `${entry.id}: the download is ${bytes.length} bytes, not ${entry.download.size}.`,
      )
    if (
      createHash('sha256').update(bytes).digest('hex') !== entry.download.sha256
    )
      throw new Error(`${entry.id}: the download does not match its sha256.`)
  }
}

/** Returns the catalog after checking it and every nested package. */
export async function checkDirectory(root, { remote = false } = {}) {
  const catalog = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8'))
  if (!Array.isArray(catalog))
    throw new Error('catalog.json must contain an array.')
  catalog.forEach(checkEntry)
  const ids = catalog.map((entry) => entry.id)
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index)
  if (duplicate)
    throw new Error(`catalog.json lists ${duplicate} more than once.`)
  const listed = new Set(
    catalog.filter((entry) => entry.path).map((entry) => entry.path),
  )
  const folders = existsSync(join(root, 'addons'))
    ? readdirSync(join(root, 'addons'), { withFileTypes: true })
        .filter((entry) => !hidden(entry.name))
        .map((entry) => `addons/${entry.name}`)
    : []
  for (const folder of folders)
    if (!listed.has(folder))
      throw new Error(`${folder} is not listed in catalog.json.`)
  for (const entry of catalog) if (entry.path) checkPackage(root, entry)
  if (remote) for (const entry of catalog) await checkRemote(entry)
  return catalog
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  try {
    for (const entry of await checkDirectory(root, {
      remote: process.argv.includes('--remote'),
    }))
      console.log(
        `ok ${entry.id} ${entry.version} (${SOURCES.find((key) => entry[key])})`,
      )
  } catch (error) {
    console.error(error.stderr?.toString() || error.message)
    process.exitCode = 1
  }
}
