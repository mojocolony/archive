import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSearchDocument,
  parseSearchQuery,
  searchDocuments,
} from '../src/search/searchIndex.js'

function sourceConversation({ title = 'Camera workflow', user = 'How do I organize RAW photos?', assistant = 'Use folders and metadata.' } = {}) {
  return {
    conversation_id: 'c1',
    title,
    current_node: 'a1',
    mapping: {
      root: { id: 'root', parent: null, children: ['u1'], message: null },
      u1: {
        id: 'u1', parent: 'root', children: ['a1'],
        message: { id: 'm1', author: { role: 'user' }, create_time: 10, content: { content_type: 'text', parts: [user] } },
      },
      a1: {
        id: 'a1', parent: 'u1', children: [],
        message: { id: 'm2', author: { role: 'assistant' }, create_time: 20, content: { content_type: 'text', parts: [assistant] } },
      },
    },
  }
}

function indexEntry(overrides = {}) {
  return {
    conversationId: 'c1',
    title: 'Camera workflow',
    createTime: 1,
    updateTime: 20,
    isArchived: false,
    isStarred: true,
    pinnedTime: null,
    presentInLatestExport: true,
    sourcePath: '/Archive/Conversations/c1--fp.json',
    ...overrides,
  }
}

test('buildSearchDocument keeps visible message boundaries and archive flags', () => {
  const document = buildSearchDocument(indexEntry(), sourceConversation())

  assert.equal(document.conversationId, 'c1')
  assert.equal(document.title, 'Camera workflow')
  assert.equal(document.messages.length, 2)
  assert.deepEqual(document.messages.map(message => message.role), ['user', 'assistant'])
  assert.equal(document.isStarred, true)
  assert.equal(document.sourcePath, '/Archive/Conversations/c1--fp.json')
  assert.match(document.searchableText, /organize raw photos/i)
})

test('parseSearchQuery separates quoted phrases from normal terms', () => {
  assert.deepEqual(parseSearchQuery('camera "dynamic range" exposure'), {
    raw: 'camera "dynamic range" exposure',
    phrases: ['dynamic range'],
    terms: ['camera', 'exposure'],
  })
})

test('searchDocuments ranks title matches above message-only matches', () => {
  const titleMatch = buildSearchDocument(
    indexEntry({ conversationId: 'title', title: 'Dynamic Range notes' }),
    sourceConversation({ title: 'Dynamic Range notes', user: 'hello', assistant: 'world' }),
  )
  const messageMatch = buildSearchDocument(
    indexEntry({ conversationId: 'message', title: 'Photography notes' }),
    sourceConversation({ title: 'Photography notes', user: 'Tell me about dynamic range', assistant: 'It is useful.' }),
  )

  const results = searchDocuments([messageMatch, titleMatch], 'dynamic range')
  assert.deepEqual(results.map(result => result.conversationId), ['title', 'message'])
})

test('searchDocuments supports quoted phrases and returns matching excerpts', () => {
  const document = buildSearchDocument(
    indexEntry(),
    sourceConversation({ user: 'Explain dynamic range in photography', assistant: 'Dynamic range describes captured tonal span.' }),
  )

  const [result] = searchDocuments([document], '"dynamic range"')
  assert.equal(result.conversationId, 'c1')
  assert.equal(result.excerpts.length > 0, true)
  assert.match(result.excerpts[0].text, /dynamic range/i)
  assert.ok(result.excerpts[0].messageId)
})

test('searchDocuments matches partial words and tolerates one-character typos', () => {
  const document = buildSearchDocument(indexEntry(), sourceConversation({ user: 'Photographing architecture at night', assistant: 'Use a tripod.' }))

  assert.equal(searchDocuments([document], 'architec').length, 1)
  assert.equal(searchDocuments([document], 'archtecture').length, 1)
})

test('searchDocuments favors user-message matches over assistant-only matches', () => {
  const userMatch = buildSearchDocument(
    indexEntry({ conversationId: 'user-match', title: 'One' }),
    sourceConversation({ title: 'One', user: 'Tell me about exposure compensation', assistant: 'Okay.' }),
  )
  const assistantMatch = buildSearchDocument(
    indexEntry({ conversationId: 'assistant-match', title: 'Two' }),
    sourceConversation({ title: 'Two', user: 'Tell me about cameras', assistant: 'Exposure compensation changes brightness.' }),
  )

  const results = searchDocuments([assistantMatch, userMatch], 'exposure compensation')
  assert.deepEqual(results.map(result => result.conversationId), ['user-match', 'assistant-match'])
})


test('searchDocuments does not let a shorter indexed word satisfy a more specific query', () => {
  const document = buildSearchDocument(
    indexEntry({ conversationId: 'stream-only', title: 'Video setup' }),
    sourceConversation({ title: 'Video setup', user: 'Stream video to the TV', assistant: 'Use the streaming device.' }),
  )

  assert.equal(searchDocuments([document], 'Podstream').length, 0)
})


test('searchDocuments uses fuzzy matching only when strict matching finds no results', () => {
  const exact = buildSearchDocument(
    indexEntry({ conversationId: 'exact', title: 'Podstream app' }),
    sourceConversation({ title: 'Podstream app', user: 'Work on Podstream playback', assistant: 'Okay.' }),
  )
  const fuzzyOnly = buildSearchDocument(
    indexEntry({ conversationId: 'fuzzy', title: 'Roadstream notes' }),
    sourceConversation({ title: 'Roadstream notes', user: 'Discuss roadstream routing', assistant: 'Okay.' }),
  )

  assert.deepEqual(searchDocuments([fuzzyOnly, exact], 'Podstream').map(result => result.conversationId), ['exact'])
})

test('searchDocuments still uses fuzzy matching as a fallback for a likely typo', () => {
  const document = buildSearchDocument(
    indexEntry({ conversationId: 'podstream', title: 'Podstream app' }),
    sourceConversation({ title: 'Podstream app', user: 'Work on Podstream playback', assistant: 'Okay.' }),
  )

  assert.deepEqual(searchDocuments([document], 'Podstreem').map(result => result.conversationId), ['podstream'])
})

test('Archive tags are searchable and dashboard stars remain separate from imported ChatGPT stars', () => {
  const document = buildSearchDocument(
    indexEntry({ isStarred: true }),
    sourceConversation({ title: 'Audio app', user: 'Playback notes', assistant: 'Okay.' }),
    { conversationId: 'c1', starred: false, tags: ['Podcasts', 'Priya'] },
  )

  assert.equal(document.isStarred, true)
  assert.equal(document.starred, false)
  assert.deepEqual(document.tags, ['Podcasts', 'Priya'])
  assert.equal(searchDocuments([document], 'Priya').length, 1)
})
