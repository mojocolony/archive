import test from 'node:test'
import assert from 'node:assert/strict'
import { getCapabilityReport, runIndexedDbSelfTest } from '../src/features/selfCheck.js'

test('capability report identifies required browser primitives', () => {
  const report = getCapabilityReport({
    indexedDB: {},
    DecompressionStream: function () {},
    crypto: { subtle: {} },
    File: { prototype: { stream() {} } },
    navigator: { serviceWorker: {} },
    isSecureContext: true,
  })
  assert.deepEqual(report, {
    indexedDb: true,
    streamingDeflate: true,
    webCrypto: true,
    fileStreaming: true,
    serviceWorker: true,
    secureContext: true,
  })
})

test('IndexedDB self-test writes, reads, and removes a temporary setting', async () => {
  const rows = new Map()
  const fakeDb = {
    async put(store, value) { rows.set(`${store}:${value.key}`, value) },
    async get(store, key) { return rows.get(`${store}:${key}`) ?? null },
    async delete(store, key) { rows.delete(`${store}:${key}`) },
  }
  assert.equal(await runIndexedDbSelfTest(fakeDb), true)
  assert.equal(rows.size, 0)
})
