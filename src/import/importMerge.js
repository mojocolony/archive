function previousConversationMap(previousIndex) {
  return previousIndex?.conversations && typeof previousIndex.conversations === 'object'
    ? previousIndex.conversations
    : {}
}

function safeSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, '_')
}

export function conversationVersionPaths(conversationId, fingerprint) {
  const id = safeSegment(conversationId)
  const fp = safeSegment(fingerprint)
  return {
    sourcePath: `/Archive/Conversations/${id}--${fp}.json`,
    markdownPath: `/Archive/Markdown/${id}--${fp}.md`,
  }
}

export function buildImportPreview(parsedExport, previousIndex = null) {
  const previous = previousConversationMap(previousIndex)
  const currentIds = new Set(parsedExport.conversations.map(item => item.conversationId))
  const newIds = []
  const updatedIds = []
  const unchangedIds = []

  for (const conversation of parsedExport.conversations) {
    const old = previous[conversation.conversationId]
    if (!old) newIds.push(conversation.conversationId)
    else if (old.sourceFingerprint === conversation.fingerprint) unchangedIds.push(conversation.conversationId)
    else updatedIds.push(conversation.conversationId)
  }

  const previouslyPresentIds = Object.values(previous)
    .filter(item => item.presentInLatestExport !== false)
    .map(item => item.conversationId)
  const missingIds = previouslyPresentIds.filter(id => !currentIds.has(id)).sort()
  const threshold = Math.max(25, Math.ceil(previouslyPresentIds.length * 0.2))
  const anomalyWarning = missingIds.length > threshold
    ? `${missingIds.length} conversations that were previously present are missing from this export. Archive will not delete them; verify that this export is complete before committing.`
    : null

  return {
    total: parsedExport.conversations.length,
    newCount: newIds.length,
    updatedCount: updatedIds.length,
    unchangedCount: unchangedIds.length,
    missingCount: missingIds.length,
    newIds: newIds.sort(),
    updatedIds: updatedIds.sort(),
    unchangedIds: unchangedIds.sort(),
    missingIds,
    anomalyWarning,
  }
}

export function buildCommittedIndex(parsedExport, previousIndex = null, context = {}) {
  const previous = previousConversationMap(previousIndex)
  const importId = context.importId ?? `import-${Date.now()}`
  const importedAt = context.importedAt ?? new Date().toISOString()
  const attachmentsByConversation = new Map()

  for (const attachment of parsedExport.attachments ?? []) {
    if (!attachment.conversationId) continue
    attachmentsByConversation.set(
      attachment.conversationId,
      (attachmentsByConversation.get(attachment.conversationId) ?? 0) + 1,
    )
  }

  const conversations = {}
  const currentIds = new Set()

  for (const conversation of parsedExport.conversations) {
    currentIds.add(conversation.conversationId)
    const old = previous[conversation.conversationId] ?? null
    const paths = conversationVersionPaths(conversation.conversationId, conversation.fingerprint)
    conversations[conversation.conversationId] = {
      conversationId: conversation.conversationId,
      title: conversation.title,
      projectId: conversation.projectId ?? null,
      createTime: conversation.createTime,
      updateTime: conversation.updateTime,
      isArchived: conversation.isArchived,
      isStarred: conversation.isStarred,
      pinnedTime: conversation.pinnedTime,
      sourceFingerprint: conversation.fingerprint,
      sourcePath: paths.sourcePath,
      markdownPath: paths.markdownPath,
      visibleMessageCount: conversation.visibleMessageCount,
      attachmentCount: attachmentsByConversation.get(conversation.conversationId) ?? 0,
      presentInLatestExport: true,
      firstImportedAt: old?.firstImportedAt ?? importedAt,
      lastImportedAt: importedAt,
      lastSeenImportId: importId,
      sourceExportName: parsedExport.sourceFileName,
    }
  }

  for (const [conversationId, old] of Object.entries(previous)) {
    if (currentIds.has(conversationId)) continue
    conversations[conversationId] = {
      ...old,
      presentInLatestExport: false,
      lastMissingImportId: importId,
    }
  }

  return {
    archiveIndexVersion: 1,
    updatedAt: importedAt,
    lastImportId: importId,
    sourceExportName: parsedExport.sourceFileName,
    sourceExportSize: parsedExport.sourceFileSize,
    conversations,
  }
}
