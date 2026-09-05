import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeTags,
  loadOrganizationMetadata,
  updateConversationOrganization,
} from '../src/organization/metadataService.js'

function fakeDb(initial = {}) {
  const stores = {
    metadata: new Map(Object.entries(initial.metadata ?? {})),
    searchDocuments: new Map(Object.entries(initial.searchDocuments ?? {})),
  }
  return {
    stores,
    async clear(store) { stores[store].clear() },
    async put(store, value) { stores[store].set(value.conversationId ?? value.key, structuredClone(value)) },
    async get(store, key) { return structuredClone(stores[store].get(key) ?? null) },
  }
}

test('normalizeTags trims, removes blanks, and deduplicates case-insensitively', () => {
  assert.deepEqual(normalizeTags([' Apps ', 'apps', '', 'Photography', ' photography ']), ['Apps', 'Photography'])
})

test('loadOrganizationMetadata makes Dropbox metadata authoritative locally', async () => {
  const db = fakeDb({ metadata: { old: { conversationId: 'old', starred: true, tags: ['Old'] } } })
  const repository = {
    async getConversationMetadataIndex() {
      return {
        metadataVersion: 1,
        conversations: {
          c1: { conversationId: 'c1', starred: true, tags: ['Apps'], updatedAt: '2026-09-05T10:00:00.000Z' },
        },
      }
    },
  }

  const index = await loadOrganizationMetadata({ repository, db })

  assert.equal(index.conversations.c1.starred, true)
  assert.equal(db.stores.metadata.has('old'), false)
  assert.deepEqual(db.stores.metadata.get('c1').tags, ['Apps'])
})

test('updateConversationOrganization saves Dropbox metadata and updates the local search document', async () => {
  const db = fakeDb({ searchDocuments: { c1: { conversationId: 'c1', title: 'Podstream', messages: [], starred: false, tags: [] } } })
  let saved = null
  const repository = {
    async getConversationMetadataIndex() { return { metadataVersion: 1, conversations: {} } },
    async saveConversationMetadataIndex(value) { saved = structuredClone(value) },
  }

  const row = await updateConversationOrganization({
    conversationId: 'c1',
    patch: { starred: true, tags: [' Apps ', 'apps', 'Audio'] },
    repository,
    db,
    now: () => '2026-09-05T10:30:00.000Z',
  })

  assert.deepEqual(row.tags, ['Apps', 'Audio'])
  assert.equal(row.starred, true)
  assert.equal(saved.conversations.c1.updatedAt, '2026-09-05T10:30:00.000Z')
  assert.equal(db.stores.metadata.get('c1').starred, true)
  assert.deepEqual(db.stores.searchDocuments.get('c1').tags, ['Apps', 'Audio'])
  assert.equal(db.stores.searchDocuments.get('c1').starred, true)
})
