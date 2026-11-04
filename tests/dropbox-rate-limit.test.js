import test from 'node:test'
import assert from 'node:assert/strict'
import { DropboxArchiveRepository, parseRetryAfterMs } from '../src/dropbox/archiveRepository.js'

function makeRepo(fetchImpl, options = {}) {
  return new DropboxArchiveRepository({
    getAccessToken: async () => 'token',
    fetchImpl,
    ...options,
  })
}

test('parses Retry-After seconds and HTTP dates', () => {
  const now = Date.parse('2026-11-04T20:00:00Z')
  assert.equal(parseRetryAfterMs('17', now), 17_000)
  assert.equal(parseRetryAfterMs(new Date(now + 8_000).toUTCString(), now), 8_000)
  assert.equal(parseRetryAfterMs('not-a-time', now), null)
  assert.equal(parseRetryAfterMs(null, now), null)
})

test('honors Dropbox Retry-After seconds before retrying a 429', async () => {
  let attempts = 0
  const waits = []
  const reports = []
  const repo = makeRepo(async () => {
    attempts += 1
    return attempts === 1
      ? new Response(JSON.stringify({ error_summary: 'too_many_requests/..' }), {
        status: 429, headers: { 'Retry-After': '17' },
      })
      : new Response('{}', { status: 200 })
  }, {
    retryDelaysMs: [2_000],
    sleepImpl: async delay => waits.push(delay),
    onRetry: data => reports.push(data),
  })
  await repo.uploadText('/Archive/one.json', '{}')
  assert.equal(attempts, 2)
  assert.deepEqual(waits, [17_000])
  assert.deepEqual(reports, [{ status: 429, attempt: 1, maxAttempts: 2, delayMs: 17_000 }])
})

test('uses Dropbox JSON retry_after when header is absent', async () => {
  let attempts = 0
  const waits = []
  const repo = makeRepo(async () => {
    attempts += 1
    return attempts === 1
      ? new Response(JSON.stringify({ error: { '.tag': 'too_many_requests', retry_after: 11 } }), { status: 429 })
      : new Response('{}', { status: 200 })
  }, {
    retryDelaysMs: [2_000],
    sleepImpl: async delay => waits.push(delay),
  })
  await repo.uploadText('/Archive/one.json', '{}')
  assert.deepEqual(waits, [11_000])
})

test('uses exponential fallback when Dropbox supplies no Retry-After', async () => {
  let attempts = 0
  const waits = []
  const repo = makeRepo(async () => {
    attempts += 1
    return attempts <= 2
      ? new Response('{}', { status: 503 })
      : new Response('{}', { status: 200 })
  }, {
    retryDelaysMs: [2_000, 4_000],
    sleepImpl: async delay => waits.push(delay),
  })
  await repo.uploadText('/Archive/one.json', '{}')
  assert.deepEqual(waits, [2_000, 4_000])
})

test('does not retry a nontransient 4xx error', async () => {
  let attempts = 0
  const repo = makeRepo(async () => {
    attempts += 1
    return new Response(JSON.stringify({ error_summary: 'path/not_found/..' }), { status: 409 })
  }, {
    sleepImpl: async () => { throw new Error('must not wait') },
  })
  await assert.rejects(() => repo.uploadText('/bad', 'x'), /path\/not_found/)
  assert.equal(attempts, 1)
})

test('stops after finite retries if Dropbox continues returning 429', async () => {
  let attempts = 0
  const waits = []
  const repo = makeRepo(async () => {
    attempts += 1
    return new Response('{}', { status: 429, headers: { 'Retry-After': '0' } })
  }, {
    retryDelaysMs: [2_000, 4_000],
    sleepImpl: async delay => waits.push(delay),
  })
  await assert.rejects(() => repo.uploadText('/Archive/one.json', '{}'), /429/)
  assert.equal(attempts, 3)
  assert.deepEqual(waits, [2_000, 4_000])
})

test('paces sequential import requests but leaves other repository operations unpaced by default', async () => {
  const waits = []
  const repo = makeRepo(async () => new Response('{}', { status: 200 }), {
    minRequestIntervalMs: 350,
    sleepImpl: async delay => waits.push(delay),
  })
  await repo.uploadText('/one.json', 'one')
  await repo.uploadText('/two.json', 'two')
  await repo.uploadText('/three.json', 'three')
  assert.deepEqual(waits, [350, 350])
})
