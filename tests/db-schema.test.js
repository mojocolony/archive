import test from 'node:test'
import assert from 'node:assert/strict'
import { ARCHIVE_DB_VERSION, ARCHIVE_STORE_DEFINITIONS } from '../src/local/db.js'

test('local Archive schema includes a rebuildable archiveIndex store in version 2', () => {
  assert.equal(ARCHIVE_DB_VERSION, 2)
  assert.deepEqual(ARCHIVE_STORE_DEFINITIONS.archiveIndex, { keyPath: 'conversationId' })
})

test('database open retries without a requested version after VersionError from a newer existing database', async () => {
  const { openCompatibleDatabase } = await import('../src/local/db.js')
  const calls = []
  const database = { version: 2 }
  const factory = {
    open(name, version) {
      calls.push([name, version])
      const request = {}
      queueMicrotask(() => {
        if (version === 2) {
          request.error = Object.assign(new Error('requested version is lower'), { name: 'VersionError' })
          request.onerror?.()
        } else {
          request.result = database
          request.onsuccess?.()
        }
      })
      return request
    },
  }

  const result = await openCompatibleDatabase('archive', 2, factory)
  assert.equal(result, database)
  assert.deepEqual(calls, [['archive', 2], ['archive', undefined]])
})
