// Rehydrates the browser's disposable archive catalogue from the canonical Dropbox index.
// This function intentionally never writes to Dropbox.
export async function restoreArchiveCatalogue({ repository, db }) {
  const index = await repository.getArchiveIndex()
  const conversations = index?.conversations
  if (!conversations || typeof conversations !== 'object' || Array.isArray(conversations)) {
    throw new Error('Dropbox archive index has an invalid conversations section.')
  }

  const entries = Object.entries(conversations)
  if (entries.length === 0) {
    return { status: 'missing', conversationCount: 0 }
  }

  for (const [id, entry] of entries) {
    if (!id || !entry || entry.conversationId !== id ||
        typeof entry.sourcePath !== 'string' ||
        !entry.sourcePath.startsWith('/Archive/Conversations/')) {
      throw new Error('Dropbox archive index contains an invalid conversation entry. No local changes were made.')
    }
  }

  const revision = JSON.stringify([
    index.updatedAt ?? null,
    index.lastImportId ?? null,
    entries.length,
  ])
  const [marker, localRows] = await Promise.all([
    db.get('settings', 'archive.remoteRevision'),
    db.getAll('archiveIndex'),
  ])
  const changed = marker?.value !== revision || localRows.length !== entries.length

  if (changed) {
    // The master index is downloaded and validated before local data is replaced.
    // The revision marker is written last so a failed restore can be retried.
    await db.clear('archiveIndex')
    for (const [, entry] of entries) await db.put('archiveIndex', entry)
    await db.put('settings', { key: 'archive.remoteRevision', value: revision })
  }

  // The original import activity is local-only; reconstruct its visible summary.
  // Never overwrite an actual import record if the browser still has one.
  const importId = index.lastImportId || `restored-${index.updatedAt || 'unknown'}`
  if (!await db.get('imports', importId)) {
    await db.put('imports', {
      id: importId,
      status: 'imported',
      importedAt: index.updatedAt || new Date().toISOString(),
      inspectedAt: index.updatedAt || null,
      conversationCount: entries.length,
      sourceFileName: index.sourceExportName || 'Recovered Dropbox archive',
      sourceFileSize: index.sourceExportSize ?? null,
      reportPath: null,
    })
  }

  return { status: changed ? 'restored' : 'current', conversationCount: entries.length }
}
