import { buildCommittedIndex } from './importMerge.js'

function safeSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, '_')
}

function conversationVersionKey(conversation) {
  return `${safeSegment(conversation.conversationId)}--${safeSegment(conversation.fingerprint)}`
}

export async function commitParsedExport({
  parsedExport,
  previousIndex,
  preview,
  repository,
  db,
  now = () => new Date().toISOString(),
  importId = `import-${Date.now()}`,
  allowAnomaly = false,
  onProgress = () => {},
  concurrency = 4,
}) {
  if (preview?.anomalyWarning && !allowAnomaly) {
    throw new Error(preview.anomalyWarning)
  }

  const changedIds = [...(preview?.newIds ?? []), ...(preview?.updatedIds ?? [])]
  const byId = new Map(parsedExport.conversations.map(item => [item.conversationId, item]))

  onProgress({ stage: 'prepare', completed: 0, total: changedIds.length })
  await repository.ensureArchiveStructure()

  const existingVersions = typeof repository.getExistingConversationVersions === 'function'
    ? await repository.getExistingConversationVersions()
    : new Set()

  const uploadTasks = []
  let skippedExisting = 0
  for (let index = 0; index < changedIds.length; index += 1) {
    const conversationId = changedIds[index]
    const conversation = byId.get(conversationId)
    if (!conversation) throw new Error(`Import preview references unknown conversation ${conversationId}`)

    if (existingVersions.has(conversationVersionKey(conversation))) {
      skippedExisting += 1
    } else {
      uploadTasks.push({ conversation, position: index + 1 })
    }
  }

  onProgress({
    stage: 'resume',
    completed: changedIds.length,
    total: changedIds.length,
    skipped: skippedExisting,
  })

  let cursor = 0
  let completedUploads = 0
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, uploadTasks.length || 1))

  async function uploadWorker() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= uploadTasks.length) return

      const { conversation, position } = uploadTasks[index]
      onProgress({
        stage: 'conversation-start',
        position,
        total: changedIds.length,
        conversationId: conversation.conversationId,
        title: conversation.title,
      })

      try {
        await repository.saveConversationVersion(conversation)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to save “${conversation.title || 'Untitled'}” (${conversation.conversationId}): ${detail}`)
      }

      completedUploads += 1
      onProgress({
        stage: 'conversations',
        completed: skippedExisting + completedUploads,
        total: changedIds.length,
        conversationId: conversation.conversationId,
      })
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => uploadWorker()))

  onProgress({ stage: 'attachments', completed: 0, total: 1 })
  await repository.saveAttachmentMetadata({
    attachmentIndexVersion: 1,
    updatedAt: now(),
    attachments: parsedExport.attachments ?? [],
    sourceAssetNameMap: parsedExport.sourceAssetNameMap ?? {},
  })
  onProgress({ stage: 'attachments', completed: 1, total: 1 })

  const importedAt = now()
  const index = buildCommittedIndex(parsedExport, previousIndex, {
    importId,
    importedAt,
  })

  // Commit point: all content is uploaded before this authoritative pointer changes.
  onProgress({ stage: 'commit', completed: 0, total: 1 })
  await repository.saveArchiveIndex(index)
  onProgress({ stage: 'commit', completed: 1, total: 1 })

  if (db) {
    await db.clear('archiveIndex')
    for (const entry of Object.values(index.conversations)) {
      await db.put('archiveIndex', entry)
    }
    await db.put('imports', {
      id: importId,
      sourceFileName: parsedExport.sourceFileName,
      sourceFileSize: parsedExport.sourceFileSize,
      inspectedAt: importedAt,
      importedAt,
      conversationCount: parsedExport.conversations.length,
      attachmentMetadataCount: parsedExport.attachments?.length ?? 0,
      status: 'imported',
      reportPath: null,
    })
  }

  return {
    importId,
    importedAt,
    index,
    uploadedConversationCount: uploadTasks.length,
    skippedExistingConversationCount: skippedExisting,
  }
}
