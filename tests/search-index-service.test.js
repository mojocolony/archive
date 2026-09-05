import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLocalSearchIndex, getLocalSearchStatus } from '../src/search/indexService.js'

function makeDb(initial = {}) {
  const stores = {
    searchDocuments: new Map(),
    searchMeta: new Map(),
    ...initial,
  }
  return {
    stores,
    async get(store, key) { return stores[store]?.get(key) ?? null },
    async getAll(store) { return [...(stores[store]?.values() ?? [])] },
    async put(store, value) { stores[store].set(value.conversationId ?? value.key, structuredClone(value)) },
    async clear(store) { stores[store].clear() },
  }
}

function source(id) {
  return {
    conversation_id: id,
    title: `Conversation ${id}`,
    current_node: 'u1',
    mapping: {
      u1: {
        id: 'u1', parent: null, children: [],
        message: { id: `m-${id}`, author: { role: 'user' }, create_time: 1, content: { content_type: 'text', parts: [`hello ${id}`] } },
      },
    },
  }
}

function archiveIndex(ids = ['a', 'b', 'c'], updatedAt = '2026-09-05T10:00:00Z') {
  return {
    archiveIndexVersion: 1,
    updatedAt,
    conversations: Object.fromEntries(ids.map((id, i) => [id, {
      conversationId: id,
      title: `Conversation ${id}`,
      updateTime: i + 1,
      sourcePath: `/Archive/Conversations/${id}.json`,
      presentInLatestExport: true,
    }])),
  }
}

test('buildLocalSearchIndex downloads archived sources with bounded concurrency and writes local documents incrementally', async () => {
  const db = makeDb()
  let active = 0
  let maxActive = 0
  const repository = {
    async getConversationSource(path) {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
      return source(path.split('/').pop().replace('.json', ''))
    },
  }
  const progress = []

  const result = await buildLocalSearchIndex({
    archiveIndex: archiveIndex(),
    repository,
    db,
    concurrency: 2,
    now: () => '2026-09-05T11:00:00Z',
    onProgress: event => progress.push(event),
  })

  assert.equal(maxActive <= 2, true)
  assert.equal(db.stores.searchDocuments.size, 3)
  assert.equal(result.indexedCount, 3)
  assert.equal(db.stores.searchMeta.get('main').archiveUpdatedAt, '2026-09-05T10:00:00Z')
  assert.equal(db.stores.searchMeta.get('main').builtAt, '2026-09-05T11:00:00Z')
  assert.equal(progress.at(-1).stage, 'complete')
})

test('getLocalSearchStatus distinguishes missing current and stale indexes', async () => {
  const db = makeDb()
  const index = archiveIndex(['a', 'b'])

  assert.deepEqual(await getLocalSearchStatus({ archiveIndex: index, db }), {
    state: 'missing', indexedCount: 0, total: 2, builtAt: null,
  })

  db.stores.searchDocuments.set('a', { conversationId: 'a' })
  db.stores.searchDocuments.set('b', { conversationId: 'b' })
  db.stores.searchMeta.set('main', {
    key: 'main', archiveUpdatedAt: index.updatedAt, conversationCount: 2, builtAt: '2026-09-05T11:00:00Z',
  })

  assert.deepEqual(await getLocalSearchStatus({ archiveIndex: index, db }), {
    state: 'current', indexedCount: 2, total: 2, builtAt: '2026-09-05T11:00:00Z',
  })

  const newer = archiveIndex(['a', 'b'], '2026-09-06T10:00:00Z')
  assert.equal((await getLocalSearchStatus({ archiveIndex: newer, db })).state, 'stale')
})

test('failed local index build never marks a partial index current', async () => {
  const db = makeDb()
  let calls = 0
  const repository = {
    async getConversationSource(path) {
      calls += 1
      if (calls === 2) throw new Error('network broke')
      return source(path.split('/').pop().replace('.json', ''))
    },
  }

  await assert.rejects(
    () => buildLocalSearchIndex({ archiveIndex: archiveIndex(), repository, db, concurrency: 1 }),
    /network broke/,
  )

  assert.equal(await db.get('searchMeta', 'main'), null)
  assert.notEqual((await getLocalSearchStatus({ archiveIndex: archiveIndex(), db })).state, 'current')
})
