import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('./', import.meta.url)
const corpus = JSON.parse(await readFile(new URL('corpus-v1.json', root), 'utf8'))
const schema = JSON.parse(await readFile(new URL('schema-v1.json', root), 'utf8'))

test('corpus has the declared versioned schema', () => {
  assert.equal(schema.$id, 'https://ok200.app/schemas/http-conformance-v1.json')
  assert.equal(corpus.schemaVersion, schema.properties.schemaVersion.const)
  assert.match(corpus.contractVersion, /^\d+\.\d+\.\d+$/)
  assert.deepEqual(corpus.runtimes, ['swift', 'kotlin', 'rust'])
})

test('fixtures are confined, unique, and portable', () => {
  const paths = [
    ...corpus.fixture.directories,
    ...corpus.fixture.files.map((entry) => entry.path),
    ...corpus.fixture.symlinkEscapes.map((entry) => entry.path),
  ]
  assert.equal(new Set(paths).size, paths.length)
  for (const path of paths) {
    assert.ok(path.length > 0)
    assert.ok(!path.startsWith('/'))
    assert.ok(!path.includes('\\'))
    assert.ok(!path.split('/').some((part) => part === '.' || part === '..'))
  }
})

test('every case is uniquely named and claimed or explicitly excluded by every runtime', () => {
  const ids = new Set()
  for (const entry of corpus.cases) {
    assert.match(entry.id, /^[a-z0-9-]+$/)
    assert.ok(!ids.has(entry.id), `duplicate case ${entry.id}`)
    ids.add(entry.id)
    assert.ok(corpus.configurations[entry.configuration], `${entry.id}: unknown configuration`)
    assert.ok(['request', 'oversizedHead', 'concurrency', 'restart'].includes(entry.kind))
    assert.ok(Array.isArray(entry.expect.statuses) && entry.expect.statuses.length > 0)

    for (const runtime of corpus.runtimes) {
      const claimed = entry.claims.includes(runtime)
      const exclusion = entry.exclusions[runtime]
      assert.notEqual(claimed, Boolean(exclusion), `${entry.id}: ${runtime} must be claimed or excluded`)
    }
    assert.ok(entry.claims.every((runtime) => corpus.runtimes.includes(runtime)))
    assert.ok(Object.keys(entry.exclusions).every((runtime) => corpus.runtimes.includes(runtime)))

    if (entry.kind === 'request' || entry.kind === 'concurrency') assert.ok(entry.request)
    if (entry.kind === 'concurrency') assert.ok(entry.concurrency >= 2 && entry.concurrency <= 32)
    if (entry.kind === 'oversizedHead') assert.ok(entry.oversizedHeaderBytes > 16384)
  }
  assert.ok(ids.size >= 25)
})

test('the initial corpus covers the required contract categories', () => {
  const ids = new Set(corpus.cases.map((entry) => entry.id))
  for (const id of [
    'get-root-index',
    'head-file',
    'options-cors-enabled',
    'unsupported-method',
    'escaped-directory-listing',
    'file-validators',
    'etag-conditional',
    'date-conditional',
    'bounded-byte-range',
    'spa-does-not-mask-missing-asset',
    'encoded-separator-rejected',
    'path-decoded-once',
    'symlink-escape-denied',
    'oversized-request-head',
    'bounded-concurrency',
    'automatic-port-stop-restart',
  ]) {
    assert.ok(ids.has(id), `missing required case ${id}`)
  }
})
