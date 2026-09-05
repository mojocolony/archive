import test from 'node:test'
import assert from 'node:assert/strict'
import {
  activeNodePath,
  visibleMessages,
  conversationToMarkdown,
  fingerprintConversation,
} from '../src/import/conversationParser.js'

function sampleConversation() {
  return {
    conversation_id: 'conv-1',
    title: 'Example Conversation',
    current_node: 'a3',
    create_time: 1,
    update_time: 9,
    mapping: {
      root: { id: 'root', parent: null, message: null },
      u1: {
        id: 'u1',
        parent: 'root',
        message: {
          id: 'm-user-1',
          author: { role: 'user', name: null },
          create_time: 2,
          content: { content_type: 'text', parts: ['Hello'] },
          metadata: {},
        },
      },
      a2: {
        id: 'a2',
        parent: 'u1',
        message: {
          id: 'm-assistant-old',
          author: { role: 'assistant', name: null },
          create_time: 3,
          content: { content_type: 'text', parts: ['Old branch'] },
          metadata: {},
        },
      },
      a3: {
        id: 'a3',
        parent: 'u1',
        message: {
          id: 'm-assistant-new',
          author: { role: 'assistant', name: null },
          create_time: 4,
          content: { content_type: 'text', parts: ['Current branch'] },
          metadata: {},
        },
      },
    },
  }
}

test('activeNodePath follows current_node backward and excludes alternate branches', () => {
  const result = activeNodePath(sampleConversation())
  assert.deepEqual(result.nodeIds, ['root', 'u1', 'a3'])
  assert.deepEqual(result.warnings, [])
})

test('visibleMessages includes only user and assistant text on the active branch', () => {
  const conversation = sampleConversation()
  conversation.mapping.thought = {
    id: 'thought',
    parent: 'a3',
    message: {
      id: 'm-thought',
      author: { role: 'assistant', name: null },
      create_time: 5,
      content: {
        content_type: 'thoughts',
        thoughts: [{ content: 'hidden reasoning', summary: 'hidden summary' }],
      },
      metadata: {},
    },
  }
  conversation.current_node = 'thought'

  const messages = visibleMessages(conversation)
  assert.deepEqual(messages.map(message => [message.role, message.text]), [
    ['user', 'Hello'],
    ['assistant', 'Current branch'],
  ])
  assert.equal(JSON.stringify(messages).includes('hidden reasoning'), false)
})

test('visibleMessages extracts string and text-bearing object parts but ignores non-text parts', () => {
  const conversation = sampleConversation()
  conversation.mapping.a3.message.content = {
    content_type: 'multimodal_text',
    parts: ['Caption', { text: 'Object text' }, { asset_pointer: 'file-123' }],
  }

  const messages = visibleMessages(conversation)
  assert.equal(messages.at(-1).text, 'Caption\n\nObject text')
})

test('activeNodePath reports a missing current node rather than inventing an order', () => {
  const conversation = sampleConversation()
  conversation.current_node = 'missing'
  const result = activeNodePath(conversation)
  assert.deepEqual(result.nodeIds, [])
  assert.match(result.warnings[0], /current_node/i)
})

test('conversationToMarkdown renders title and visible active messages only', () => {
  const markdown = conversationToMarkdown(sampleConversation())
  assert.match(markdown, /^# Example Conversation/m)
  assert.match(markdown, /## You\n\nHello/)
  assert.match(markdown, /## ChatGPT\n\nCurrent branch/)
  assert.equal(markdown.includes('Old branch'), false)
})

test('fingerprintConversation is stable for equal source objects and changes with source data', async () => {
  const a = sampleConversation()
  const b = structuredClone(a)
  assert.equal(await fingerprintConversation(a), await fingerprintConversation(b))
  b.title = 'Renamed'
  assert.notEqual(await fingerprintConversation(a), await fingerprintConversation(b))
})
