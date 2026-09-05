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
  await row.syncPromise
  assert.equal(saved.conversations.c1.updatedAt, '2026-09-05T10:30:00.000Z')
  assert.equal(db.stores.metadata.get('c1').starred, true)
  assert.deepEqual(db.stores.searchDocuments.get('c1').tags, ['Apps', 'Audio'])
  assert.equal(db.stores.searchDocuments.get('c1').starred, true)
})

test('organization updates apply locally before Dropbox sync finishes', async () => {
  const db = fakeDb({
    metadata: { c1: { conversationId: 'c1', starred: false, tags: [] } },
    searchDocuments: { c1: { conversationId: 'c1', title: 'Podstream', messages: [], starred: false, tags: [] } },
  })
  let releaseSave
  const saveGate = new Promise(resolve => { releaseSave = resolve })
  const repository = {
    async getConversationMetadataIndex() { return { metadataVersion: 1, conversations: {} } },
    async saveConversationMetadataIndex() { await saveGate },
  }

  const updatePromise = updateConversationOrganization({
    conversationId: 'c1',
    patch: { tags: ['Apps'] },
    repository,
    db,
    now: () => '2026-09-05T13:30:00.000Z',
  })

  const outcome = await Promise.race([
    updatePromise.then(value => ({ type: 'resolved', value })),
    new Promise(resolve => setTimeout(() => resolve({ type: 'timeout' }), 20)),
  ])
  const localBeforeDropbox = await db.get('metadata', 'c1')
  const searchBeforeDropbox = await db.get('searchDocuments', 'c1')

  releaseSave()
  const finalValue = outcome.type === 'resolved' ? outcome.value : await updatePromise

  assert.equal(outcome.type, 'resolved', 'local update should resolve without waiting for Dropbox')
  assert.deepEqual(localBeforeDropbox.tags, ['Apps'])
  assert.deepEqual(searchBeforeDropbox.tags, ['Apps'])
  assert.deepEqual(finalValue.row.tags, ['Apps'])
  await finalValue.syncPromise
})

test('rapid organization updates sync to Dropbox in local edit order', async () => {
  const db = fakeDb({
    metadata: { c1: { conversationId: 'c1', starred: false, tags: [] } },
    searchDocuments: { c1: { conversationId: 'c1', title: 'Podstream', messages: [], starred: false, tags: [] } },
  })
  let remoteIndex = { metadataVersion: 1, updatedAt: null, conversations: {} }
  let saveCall = 0
  const repository = {
    async getConversationMetadataIndex() { return structuredClone(remoteIndex) },
    async saveConversationMetadataIndex(value) {
      saveCall += 1
      await new Promise(resolve => setTimeout(resolve, saveCall === 1 ? 30 : 1))
      remoteIndex = structuredClone(value)
    },
  }

  const first = await updateConversationOrganization({
    conversationId: 'c1', patch: { tags: ['Apps'] }, repository, db,
    now: () => '2026-09-05T13:31:00.000Z',
  })
  const second = await updateConversationOrganization({
    conversationId: 'c1', patch: { tags: ['Apps', 'Podcasts'] }, repository, db,
    now: () => '2026-09-05T13:31:01.000Z',
  })

  await Promise.all([first.syncPromise, second.syncPromise])

  assert.deepEqual(remoteIndex.conversations.c1.tags, ['Apps', 'Podcasts'])
  assert.equal(remoteIndex.conversations.c1.updatedAt, '2026-09-05T13:31:01.000Z')
})
