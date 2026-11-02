import test from 'node:test'
import assert from 'node:assert/strict'
import { restoreArchiveCatalogue } from '../src/sync/restoreService.js'

function makeDb() {
  const stores = Object.fromEntries(['settings', 'archiveIndex', 'imports'].map(name => [name, new Map()]))
  return {
    stores,
    async get(name, key) { return stores[name].get(key) ?? null },
    async getAll(name) { return [...stores[name].values()] },
    async put(name, value) {
      const key = value.key ?? value.conversationId ?? value.id
      stores[name].set(key, structuredClone(value))
    },
    async clear(name) { stores[name].clear() },
  }
}
function sampleIndex(ids = ['one', 'two']) {
  return {
    archiveIndexVersion: 1,
    updatedAt: '2026-11-02T17:00:00Z',
    lastImportId: 'import-20261102',
    sourceExportName: 'chatgpt-export.zip',
    conversations: Object.fromEntries(ids.map(id => [id, {
      conversationId: id,
      title: id,
      sourcePath: `/Archive/Conversations/${id}.json`,
    }])),
  }
}

test('restores an empty local catalogue from Dropbox without remote writes', async () => {
  const db = makeDb()
  const index = sampleIndex()
  const repository = { async getArchiveIndex() { return index } }
  const result = await restoreArchiveCatalogue({ repository, db })
  assert.deepEqual(result, { status: 'restored', conversationCount: 2 })
  assert.equal(db.stores.archiveIndex.size, 2)
  assert.equal(db.stores.imports.get('import-20261102').status, 'imported')
  assert.equal(db.stores.imports.get('import-20261102').sourceFileName, 'chatgpt-export.zip')
  assert.deepEqual(await restoreArchiveCatalogue({ repository, db }), { status: 'current', conversationCount: 2 })
})

test('restores updated remote catalogue on another device without overwriting import history', async () => {
  const db = makeDb()
  const repository = { async getArchiveIndex() { return sampleIndex(['one']) } }
  await restoreArchiveCatalogue({ repository, db })
  const prior = structuredClone(db.stores.imports.get('import-20261102'))
  repository.getArchiveIndex = async () => ({ ...sampleIndex(['one', 'two']), updatedAt: '2026-11-03T17:00:00Z' })
  assert.equal((await restoreArchiveCatalogue({ repository, db })).status, 'restored')
  assert.equal(db.stores.archiveIndex.size, 2)
  assert.deepEqual(db.stores.imports.get('import-20261102'), prior)
})

test('missing or invalid Dropbox index never clears the local catalogue', async () => {
  const db = makeDb()
  await db.put('archiveIndex', { conversationId: 'saved', sourcePath: '/Archive/Conversations/saved.json' })
  const repository = { async getArchiveIndex() { return { conversations: {} } } }
  assert.deepEqual(await restoreArchiveCatalogue({ repository, db }), { status: 'missing', conversationCount: 0 })
  assert.equal(db.stores.archiveIndex.size, 1)

  repository.getArchiveIndex = async () => ({ conversations: { damaged: { conversationId: 'damaged', sourcePath: '/other.json' } } })
  await assert.rejects(() => restoreArchiveCatalogue({ repository, db }), /invalid conversation entry/)
  assert.equal(db.stores.archiveIndex.size, 1)
})

test('local restore is retryable if an IndexedDB write fails', async () => {
  const db = makeDb()
  const original = db.put
  let fails = 1
  db.put = async (name, value) => {
    if (name === 'archiveIndex' && fails-- > 0) throw new Error('Storage failed')
    return original(name, value)
  }
  const repository = { async getArchiveIndex() { return sampleIndex() } }
  await assert.rejects(() => restoreArchiveCatalogue({ repository, db }), /Storage failed/)
  assert.equal(await db.get('settings', 'archive.remoteRevision'), null)
  assert.equal((await restoreArchiveCatalogue({ repository, db })).status, 'restored')
  assert.equal(db.stores.archiveIndex.size, 2)
})
