import test from 'node:test'
import assert from 'node:assert/strict'
import { ARCHIVE_DB_VERSION, ARCHIVE_STORE_DEFINITIONS } from '../src/local/db.js'

test('local Archive schema includes a rebuildable archiveIndex store in version 2', () => {
  assert.equal(ARCHIVE_DB_VERSION, 2)
  assert.deepEqual(ARCHIVE_STORE_DEFINITIONS.archiveIndex, { keyPath: 'conversationId' })
})
