import { buildCommittedIndex } from './importMerge.js'

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

  let cursor = 0
  let completed = 0
  const workerCount = Math.max(1, Math.min(Number(concurrency) || 1, changedIds.length || 1))

  async function uploadWorker() {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= changedIds.length) return

      const conversationId = changedIds[index]
      const conversation = byId.get(conversationId)
      if (!conversation) throw new Error(`Import preview references unknown conversation ${conversationId}`)
      await repository.saveConversationVersion(conversation)
      completed += 1
      onProgress({
        stage: 'conversations',
        completed,
        total: changedIds.length,
        conversationId,
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
    uploadedConversationCount: changedIds.length,
  }
}
