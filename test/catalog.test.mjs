import assert from 'node:assert/strict'
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkDirectory } from '../scripts/check.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const catalog = () =>
  JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8'))

function scratch(t, entries) {
  const directory = mkdtempSync(join(tmpdir(), 'hibi-directory-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  cpSync(join(root, 'addons'), join(directory, 'addons'), { recursive: true })
  writeFileSync(join(directory, 'catalog.json'), JSON.stringify(entries))
  return directory
}

test('the catalog and nested packages are valid', async () => {
  assert.deepEqual(
    (await checkDirectory(root)).map((entry) => entry.id),
    ['hibi-doom', 'typing-speed'],
  )
})

test('entries name exactly one source', async (t) => {
  const [doom, typing] = catalog()
  await assert.rejects(
    checkDirectory(scratch(t, [{ ...doom, path: 'addons/hibi-doom' }, typing])),
    /exactly one of path, repository, or download/,
  )
  const { repository, ...metadata } = doom
  await assert.rejects(
    checkDirectory(scratch(t, [metadata, typing])),
    /exactly one of path, repository, or download/,
  )
})

test('repository entries pin a full commit', async (t) => {
  const [doom, typing] = catalog()
  await assert.rejects(
    checkDirectory(
      scratch(t, [
        { ...doom, repository: { ...doom.repository, commit: 'main' } },
        typing,
      ]),
    ),
    /full 40-character commit/,
  )
})

test('download entries bind a digest and size', async (t) => {
  const [doom, typing] = catalog()
  const { repository, ...metadata } = doom
  const download = {
    url: 'https://example.com/doom.zip',
    sha256: 'a'.repeat(64),
    size: 10,
  }
  assert.ok(
    await checkDirectory(scratch(t, [{ ...metadata, download }, typing])),
  )
  await assert.rejects(
    checkDirectory(
      scratch(t, [
        { ...metadata, download: { ...download, sha256: 'A'.repeat(64) } },
        typing,
      ]),
    ),
    /lowercase sha256/,
  )
})

test('nested entries match their manifest and every folder is listed', async (t) => {
  const [doom, typing] = catalog()
  await assert.rejects(
    checkDirectory(scratch(t, [doom, { ...typing, version: '9.9.9' }])),
    /version does not match/,
  )
  await assert.rejects(
    checkDirectory(scratch(t, [doom])),
    /addons\/typing-speed is not listed/,
  )
})

test('unknown fields and duplicate ids are refused', async (t) => {
  const [doom, typing] = catalog()
  await assert.rejects(
    checkDirectory(scratch(t, [{ ...doom, signed: true }, typing])),
    /unknown field: signed/,
  )
  await assert.rejects(
    checkDirectory(scratch(t, [doom, doom, typing])),
    /more than once/,
  )
})
