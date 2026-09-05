export function makeEmptyArchiveMetadata(conversationId) {
  return {
    conversationId,
    customTitle: null,
    folderId: null,
    tags: [],
    starred: false,
    note: '',
    reviewed: false,
    trashedAt: null,
    updatedAt: null,
  }
}
