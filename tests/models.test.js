import test from 'node:test'
import assert from 'node:assert/strict'
import { makeEmptyArchiveMetadata } from '../src/domain/models.js'

test('makeEmptyArchiveMetadata creates independent Archive-owned metadata', () => {
  assert.deepEqual(makeEmptyArchiveMetadata('conv-123'), {
    conversationId: 'conv-123',
    customTitle: null,
    folderId: null,
    tags: [],
    starred: false,
    note: '',
    reviewed: false,
    trashedAt: null,
    updatedAt: null,
  })
})
