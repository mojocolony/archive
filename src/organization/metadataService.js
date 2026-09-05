import { makeEmptyArchiveMetadata } from '../domain/models.js'

export function normalizeTags(values = []) {
  const seen = new Set()
  const result = []
  for (const value of values ?? []) {
    const tag = String(value ?? '').trim()
    if (!tag) continue
    const key = tag.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}

function normalizeRow(conversationId, value = {}) {
  return {
    ...makeEmptyArchiveMetadata(conversationId),
    ...value,
    conversationId,
    starred: Boolean(value.starred),
    tags: normalizeTags(value.tags),
  }
}

export function emptyConversationMetadataIndex() {
  return { metadataVersion: 1, updatedAt: null, conversations: {} }
}

export async function loadOrganizationMetadata({ repository, db }) {
  const index = await repository.getConversationMetadataIndex()
  await db.clear('metadata')
  for (const [conversationId, value] of Object.entries(index.conversations ?? {})) {
    const row = normalizeRow(conversationId, value)
    await db.put('metadata', row)
    const document = await db.get('searchDocuments', conversationId)
    if (document) {
      await db.put('searchDocuments', { ...document, starred: row.starred, tags: row.tags })
    }
  }
  return index
}

export async function updateConversationOrganization({
  conversationId,
  patch,
  repository,
  db,
  now = () => new Date().toISOString(),
}) {
  if (!conversationId) throw new Error('Conversation ID is required')
  const index = await repository.getConversationMetadataIndex()
  const current = normalizeRow(conversationId, index.conversations?.[conversationId] ?? {})
  const updatedAt = now()
  const next = normalizeRow(conversationId, {
    ...current,
    ...patch,
    tags: patch?.tags === undefined ? current.tags : patch.tags,
    updatedAt,
  })
  const nextIndex = {
    metadataVersion: 1,
    updatedAt,
    conversations: {
      ...(index.conversations ?? {}),
      [conversationId]: next,
    },
  }

  await repository.saveConversationMetadataIndex(nextIndex)
  await db.put('metadata', next)

  const document = await db.get('searchDocuments', conversationId)
  if (document) {
    await db.put('searchDocuments', {
      ...document,
      starred: next.starred,
      tags: next.tags,
    })
  }

  return next
}
