import test from 'node:test'
import assert from 'node:assert/strict'
import { parseChatGptExport } from '../src/import/exportParser.js'

function sourceConversation(id, title, current = 'a1') {
  return {
    conversation_id: id,
    id,
    title,
    create_time: 1,
    update_time: 2,
    current_node: current,
    is_archived: false,
    is_starred: null,
    pinned_time: null,
    default_model_slug: 'gpt-test',
    memory_scope: 'global',
    mapping: {
      u1: {
        id: 'u1',
        parent: null,
        message: {
          id: `${id}-user`,
          author: { role: 'user' },
          create_time: 1,
          content: { content_type: 'text', parts: [`Hello ${id}`] },
        },
      },
      a1: {
        id: 'a1',
        parent: 'u1',
        message: {
          id: `${id}-assistant`,
          author: { role: 'assistant' },
          create_time: 2,
          content: { content_type: 'text', parts: [`Reply ${id}`] },
        },
      },
    },
  }
}

test('parseChatGptExport reads sharded conversations in numeric order and fingerprints them', async () => {
  const entries = [
    { path: 'conversations-001.json' },
    { path: 'library_files.json' },
    { path: 'conversations-000.json' },
  ]
  const texts = new Map([
    ['conversations-000.json', JSON.stringify([sourceConversation('c0', 'Zero')])],
    ['conversations-001.json', JSON.stringify([sourceConversation('c1', 'One')])],
    ['library_files.json', '[]'],
  ])

  const result = await parseChatGptExport(new File(['x'], 'export.zip'), {
    readDirectory: async () => entries,
    readText: async (_file, entry) => texts.get(entry.path),
    now: () => '2026-09-05T00:00:00.000Z',
  })

  assert.deepEqual(result.conversations.map(item => item.conversationId), ['c0', 'c1'])
  assert.equal(result.conversations[0].fingerprint.length, 64)
  assert.equal(result.conversations[0].visibleMessages.length, 2)
  assert.equal(result.stats.shardCount, 2)
  assert.equal(result.stats.conversationCount, 2)
  assert.equal(result.projectMembershipAvailable, false)
})

test('parseChatGptExport supports legacy conversations.json when no shards exist', async () => {
  const entries = [{ path: 'conversations.json' }]
  const result = await parseChatGptExport(new File(['x'], 'export.zip'), {
    readDirectory: async () => entries,
    readText: async () => JSON.stringify([sourceConversation('legacy', 'Legacy')]),
  })
  assert.deepEqual(result.conversations.map(item => item.conversationId), ['legacy'])
  assert.equal(result.stats.shardCount, 1)
})

test('parseChatGptExport links library files by thread ID and message ID fallback', async () => {
  const conversation = sourceConversation('c0', 'Zero')
  const entries = [
    { path: 'conversations-000.json' },
    { path: 'library_files.json' },
    { path: 'conversation_asset_file_names.json' },
  ]
  const files = [
    {
      file_id: 'file-1',
      file_name: 'direct.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: 12,
      origination_thread_id: 'c0',
      origination_message_id: 'c0-user',
      sha256_digest: 'abc',
      is_visible: true,
      state: 'ready',
    },
    {
      file_id: 'file-2',
      file_name: 'fallback.png',
      mime_type: 'image/png',
      file_size_bytes: 34,
      origination_thread_id: null,
      initiating_conversation_id: null,
      origination_message_id: 'c0-assistant',
      is_visible: true,
      state: 'ready',
    },
    {
      file_id: 'file-3',
      file_name: 'orphan.txt',
      mime_type: 'text/plain',
      file_size_bytes: 5,
      origination_message_id: 'unknown-message',
    },
  ]
  const texts = new Map([
    ['conversations-000.json', JSON.stringify([conversation])],
    ['library_files.json', JSON.stringify(files)],
    ['conversation_asset_file_names.json', JSON.stringify({ 'file-archive.dat': 'direct.pdf' })],
  ])

  const result = await parseChatGptExport(new File(['x'], 'export.zip'), {
    readDirectory: async () => entries,
    readText: async (_file, entry) => texts.get(entry.path),
  })

  assert.deepEqual(result.attachments.map(item => item.conversationId), ['c0', 'c0', null])
  assert.equal(result.stats.attachmentMetadataCount, 3)
  assert.equal(result.stats.linkedAttachmentCount, 2)
  assert.equal(result.stats.unlinkedAttachmentCount, 1)
  assert.deepEqual(result.sourceAssetNameMap, { 'file-archive.dat': 'direct.pdf' })
})

test('parseChatGptExport reports direct project_id only when the export actually contains it', async () => {
  const conversation = sourceConversation('c0', 'Zero')
  conversation.project_id = 'project-1'
  const result = await parseChatGptExport(new File(['x'], 'export.zip'), {
    readDirectory: async () => [{ path: 'conversations-000.json' }],
    readText: async () => JSON.stringify([conversation]),
  })
  assert.equal(result.projectMembershipAvailable, true)
  assert.equal(result.conversations[0].projectId, 'project-1')
})
