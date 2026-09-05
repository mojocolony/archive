import { buildSearchDocument } from './searchIndex.js'

function archiveEntries(archiveIndex) {
  return Object.values(archiveIndex?.conversations ?? {})
    .filter(entry => entry?.conversationId && entry?.sourcePath)
    .sort((a, b) => String(a.conversationId).localeCompare(String(b.conversationId)))
}

export async function getLocalSearchStatus({ archiveIndex, db }) {
  const entries = archiveEntries(archiveIndex)
  const total = entries.length
  const [documents, meta] = await Promise.all([
    db.getAll('searchDocuments'),
    db.get('searchMeta', 'main'),
  ])
  const indexedCount = documents.length

  if (!meta) {
    return { state: 'missing', indexedCount, total, builtAt: null }
  }

  const current = meta.archiveUpdatedAt === (archiveIndex?.updatedAt ?? null)
    && meta.conversationCount === total
    && indexedCount === total

  return {
    state: current ? 'current' : 'stale',
    indexedCount,
    total,
    builtAt: meta.builtAt ?? null,
  }
}

export async function buildLocalSearchIndex({
  archiveIndex,
  repository,
  db,
  onProgress = () => {},
  concurrency = 4,
  now = () => new Date().toISOString(),
}) {
  const entries = archiveEntries(archiveIndex)
  const total = entries.length

  await db.clear('searchMeta')
  await db.clear('searchDocuments')
  onProgress({ stage: 'prepare', completed: 0, total })

  let cursor = 0
  let completed = 0
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, total || 1))

  async function worker() {
    while (true) {
      const position = cursor
      cursor += 1
      if (position >= total) return

      const entry = entries[position]
      onProgress({
        stage: 'conversation-start',
        completed,
        total,
        position: position + 1,
        conversationId: entry.conversationId,
        title: entry.title,
      })

      const source = await repository.getConversationSource(entry.sourcePath)
      const metadata = await db.get('metadata', entry.conversationId)
      const document = buildSearchDocument(entry, source, metadata)
      await db.put('searchDocuments', document)
      completed += 1
      onProgress({
        stage: 'conversations',
        completed,
        total,
        conversationId: entry.conversationId,
      })
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  const builtAt = now()
  await db.put('searchMeta', {
    key: 'main',
    archiveUpdatedAt: archiveIndex?.updatedAt ?? null,
    conversationCount: total,
    builtAt,
  })
  onProgress({ stage: 'complete', completed: total, total, builtAt })

  return { indexedCount: total, builtAt }
}
