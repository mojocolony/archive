import test from 'node:test'
import assert from 'node:assert/strict'
import { commitParsedExport } from '../src/import/importService.js'

function parsedExport() {
  return {
    sourceFileName: 'export.zip',
    sourceFileSize: 100,
    conversations: [
      { conversationId: 'new', fingerprint: 'n1', title: 'New', source: { conversation_id: 'new' }, markdown: '# New\n', visibleMessageCount: 1, createTime: 1, updateTime: 2, isArchived: false, isStarred: false, pinnedTime: null, projectId: null },
      { conversationId: 'changed', fingerprint: 'c2', title: 'Changed', source: { conversation_id: 'changed' }, markdown: '# Changed\n', visibleMessageCount: 1, createTime: 1, updateTime: 3, isArchived: false, isStarred: false, pinnedTime: null, projectId: null },
      { conversationId: 'same', fingerprint: 's1', title: 'Same', source: { conversation_id: 'same' }, markdown: '# Same\n', visibleMessageCount: 1, createTime: 1, updateTime: 2, isArchived: false, isStarred: false, pinnedTime: null, projectId: null },
    ],
    attachments: [{ fileId: 'f1', conversationId: 'new' }],
    sourceAssetNameMap: {},
  }
}

test('commitParsedExport uploads only new/updated conversations and commits archive index last', async () => {
  const calls = []
  const repository = {
    ensureArchiveStructure: async () => calls.push('ensure'),
    saveConversationVersion: async conversation => calls.push(`conversation:${conversation.conversationId}`),
    saveAttachmentMetadata: async () => calls.push('attachments'),
    saveArchiveIndex: async () => calls.push('index'),
  }
  const db = {
    clear: async store => calls.push(`clear:${store}`),
    put: async (store, value) => calls.push(`put:${store}:${value.conversationId ?? value.id}`),
  }
  const previousIndex = {
    archiveIndexVersion: 1,
    conversations: {
      changed: { conversationId: 'changed', sourceFingerprint: 'c1', presentInLatestExport: true },
      same: { conversationId: 'same', sourceFingerprint: 's1', presentInLatestExport: true },
    },
  }
  const preview = {
    newIds: ['new'],
    updatedIds: ['changed'],
    anomalyWarning: null,
  }

  const result = await commitParsedExport({
    parsedExport: parsedExport(),
    previousIndex,
    preview,
    repository,
    db,
    now: () => '2026-09-05T02:00:00.000Z',
    importId: 'import-1',
  })

  assert.deepEqual(calls.slice(0, 4), ['ensure', 'conversation:new', 'conversation:changed', 'attachments'])
  assert.equal(calls.indexOf('index') > calls.indexOf('attachments'), true)
  assert.equal(calls.some(call => call === 'conversation:same'), false)
  assert.equal(result.index.lastImportId, 'import-1')
  assert.equal(result.uploadedConversationCount, 2)
})

test('commitParsedExport refuses an anomaly until explicitly allowed', async () => {
  await assert.rejects(() => commitParsedExport({
    parsedExport: parsedExport(),
    previousIndex: { archiveIndexVersion: 1, conversations: {} },
    preview: { newIds: [], updatedIds: [], anomalyWarning: 'Suspicious' },
    repository: {},
    db: {},
  }), /Suspicious/)
})

test('commitParsedExport uploads changed conversations with bounded concurrency', async () => {
  let active = 0
  let maxActive = 0
  const conversations = Array.from({ length: 6 }, (_, i) => ({
    conversationId: `c${i}`,
    fingerprint: `f${i}`,
    title: `C${i}`,
    source: { conversation_id: `c${i}` },
    markdown: `# C${i}\n`,
    visibleMessageCount: 1,
    createTime: 1,
    updateTime: 2,
    isArchived: false,
    isStarred: false,
    pinnedTime: null,
    projectId: null,
  }))
  const repository = {
    ensureArchiveStructure: async () => {},
    saveConversationVersion: async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise(resolve => setTimeout(resolve, 5))
      active -= 1
    },
    saveAttachmentMetadata: async () => {},
    saveArchiveIndex: async () => {},
  }
  const db = { clear: async () => {}, put: async () => {} }
  await commitParsedExport({
    parsedExport: { ...parsedExport(), conversations, attachments: [] },
    previousIndex: { archiveIndexVersion: 1, conversations: {} },
    preview: { newIds: conversations.map(c => c.conversationId), updatedIds: [], anomalyWarning: null },
    repository,
    db,
    concurrency: 3,
  })
  assert.equal(maxActive > 1, true)
  assert.equal(maxActive <= 3, true)
})
