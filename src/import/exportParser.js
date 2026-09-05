import { readEntryText, readZipDirectory } from './zipDirectory.js'
import {
  activeNodePath,
  conversationToMarkdown,
  fingerprintConversation,
  visibleMessages,
} from './conversationParser.js'

function shardNumber(path) {
  const match = /^conversations-(\d{3,})\.json$/i.exec(path)
  return match ? Number(match[1]) : null
}

export function conversationEntries(directory) {
  const shards = directory
    .filter(entry => shardNumber(entry.path) != null)
    .sort((a, b) => shardNumber(a.path) - shardNumber(b.path))

  if (shards.length) return shards
  const legacy = directory.find(entry => entry.path === 'conversations.json')
  return legacy ? [legacy] : []
}

function parseJson(text, path) {
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function conversationIdOf(source) {
  const value = source?.conversation_id ?? source?.id
  return value == null ? '' : String(value)
}

function allMessageIds(source) {
  const ids = []
  if (!source?.mapping || typeof source.mapping !== 'object') return ids
  for (const node of Object.values(source.mapping)) {
    const id = node?.message?.id
    if (id != null) ids.push(String(id))
  }
  return ids
}

function fileRecordId(source) {
  if (typeof source?.file_id === 'string') return source.file_id
  if (typeof source?.id === 'string') return source.id
  if (typeof source?.id?.id === 'string') return source.id.id
  return null
}

function normalizedAttachment(source, messageToConversation) {
  const originationMessageId = typeof source?.origination_message_id === 'string'
    ? source.origination_message_id
    : null
  const directConversationId = typeof source?.origination_thread_id === 'string'
    ? source.origination_thread_id
    : typeof source?.initiating_conversation_id === 'string'
      ? source.initiating_conversation_id
      : null
  const conversationId = directConversationId ?? (
    originationMessageId ? messageToConversation.get(originationMessageId) ?? null : null
  )

  return {
    fileId: fileRecordId(source),
    fileName: typeof source?.file_name === 'string' ? source.file_name : null,
    normalizedName: typeof source?.normalized_name === 'string' ? source.normalized_name : null,
    mimeType: typeof source?.mime_type === 'string' ? source.mime_type : null,
    fileSizeBytes: typeof source?.file_size_bytes === 'number' ? source.file_size_bytes : null,
    sha256Digest: typeof source?.sha256_digest === 'string' ? source.sha256_digest : null,
    clientSha256Digest: typeof source?.client_sha256_digest === 'string' ? source.client_sha256_digest : null,
    conversationId,
    originationMessageId,
    originationThreadId: typeof source?.origination_thread_id === 'string'
      ? source.origination_thread_id
      : null,
    initiatingConversationId: typeof source?.initiating_conversation_id === 'string'
      ? source.initiating_conversation_id
      : null,
    libraryFileCategory: typeof source?.library_file_category === 'string'
      ? source.library_file_category
      : null,
    state: typeof source?.state === 'string' ? source.state : null,
    isVisible: typeof source?.is_visible === 'boolean' ? source.is_visible : null,
    isProject: typeof source?.is_project === 'boolean' ? source.is_project : null,
    directoryId: typeof source?.directory_id === 'string' ? source.directory_id : null,
    rootDirectoryId: typeof source?.root_directory_id === 'string' ? source.root_directory_id : null,
    source,
  }
}

export async function parseChatGptExport(file, options = {}) {
  const readDirectory = options.readDirectory ?? readZipDirectory
  const readText = options.readText ?? readEntryText
  const now = options.now ?? (() => new Date().toISOString())
  const onProgress = options.onProgress ?? (() => {})

  onProgress({ stage: 'directory', completed: 0, total: null })
  const directory = await readDirectory(file)
  const shards = conversationEntries(directory)
  if (!shards.length) throw new Error('No ChatGPT conversation JSON files were found in this export')

  const conversations = []
  const seenConversationIds = new Set()
  const messageToConversation = new Map()
  const warnings = []

  for (let shardIndex = 0; shardIndex < shards.length; shardIndex += 1) {
    const entry = shards[shardIndex]
    onProgress({
      stage: 'conversations',
      completed: shardIndex,
      total: shards.length,
      detail: entry.path,
    })

    const sourceArray = parseJson(await readText(file, entry), entry.path)
    if (!Array.isArray(sourceArray)) throw new Error(`${entry.path} is not a JSON array`)

    for (const source of sourceArray) {
      const conversationId = conversationIdOf(source)
      if (!conversationId) throw new Error(`${entry.path} contains a conversation without an ID`)
      if (seenConversationIds.has(conversationId)) {
        throw new Error(`Duplicate conversation ID found in export: ${conversationId}`)
      }
      seenConversationIds.add(conversationId)

      const path = activeNodePath(source)
      warnings.push(...path.warnings)
      const messages = visibleMessages(source)
      for (const messageId of allMessageIds(source)) {
        if (!messageToConversation.has(messageId)) {
          messageToConversation.set(messageId, conversationId)
        }
      }

      conversations.push({
        conversationId,
        projectId: typeof source?.project_id === 'string' ? source.project_id : null,
        title: typeof source?.title === 'string' ? source.title : 'Untitled conversation',
        createTime: typeof source?.create_time === 'number' ? source.create_time : null,
        updateTime: typeof source?.update_time === 'number' ? source.update_time : null,
        isArchived: source?.is_archived === true,
        isStarred: source?.is_starred === true,
        pinnedTime: typeof source?.pinned_time === 'number' ? source.pinned_time : null,
        defaultModelSlug: typeof source?.default_model_slug === 'string'
          ? source.default_model_slug
          : null,
        memoryScope: typeof source?.memory_scope === 'string' ? source.memory_scope : null,
        activeNodeIds: path.nodeIds,
        visibleMessages: messages,
        visibleMessageCount: messages.length,
        fingerprint: await fingerprintConversation(source),
        markdown: conversationToMarkdown(source),
        source,
      })
    }

    onProgress({
      stage: 'conversations',
      completed: shardIndex + 1,
      total: shards.length,
      detail: entry.path,
    })
  }

  let attachments = []
  const libraryEntry = directory.find(entry => entry.path === 'library_files.json')
  if (libraryEntry) {
    onProgress({ stage: 'files', completed: 0, total: 1 })
    const sourceFiles = parseJson(await readText(file, libraryEntry), libraryEntry.path)
    if (!Array.isArray(sourceFiles)) throw new Error('library_files.json is not a JSON array')
    attachments = sourceFiles.map(source => normalizedAttachment(source, messageToConversation))
    onProgress({ stage: 'files', completed: 1, total: 1 })
  }

  let sourceAssetNameMap = {}
  const assetMapEntry = directory.find(entry => entry.path === 'conversation_asset_file_names.json')
  if (assetMapEntry) {
    const parsed = parseJson(await readText(file, assetMapEntry), assetMapEntry.path)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      sourceAssetNameMap = parsed
    }
  }

  const linkedAttachmentCount = attachments.filter(item => item.conversationId).length
  const visibleMessageCount = conversations.reduce((sum, item) => sum + item.visibleMessageCount, 0)

  return {
    parserVersion: 1,
    sourceFileName: file.name || 'export.zip',
    sourceFileSize: file.size,
    parsedAt: now(),
    conversations,
    attachments,
    sourceAssetNameMap,
    projectMembershipAvailable: conversations.some(item => item.projectId != null),
    warnings,
    stats: {
      shardCount: shards.length,
      conversationCount: conversations.length,
      visibleMessageCount,
      attachmentMetadataCount: attachments.length,
      linkedAttachmentCount,
      unlinkedAttachmentCount: attachments.length - linkedAttachmentCount,
    },
  }
}
