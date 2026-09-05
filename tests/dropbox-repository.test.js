import test from 'node:test'
import assert from 'node:assert/strict'
import { DropboxArchiveRepository } from '../src/dropbox/archiveRepository.js'

test('saves a sanitized inspection report under System/inspection', async () => {
  const calls = []
  const fakeFetch = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('/files/create_folder_v2')) {
      return new Response(JSON.stringify({ metadata: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ name: 'import-1.json' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }

  const repo = new DropboxArchiveRepository({
    getAccessToken: async () => 'access-token',
    fetchImpl: fakeFetch,
  })

  await repo.saveInspectionReport('import-1', { inspectionVersion: 1, entries: [] })

  assert.equal(calls.length, 3)
  assert.equal(calls[0].url, 'https://api.dropboxapi.com/2/files/create_folder_v2')
  assert.equal(JSON.parse(calls[0].options.body).path, '/System')
  assert.equal(JSON.parse(calls[1].options.body).path, '/System/inspection')
  assert.equal(calls[2].url, 'https://content.dropboxapi.com/2/files/upload')
  assert.deepEqual(JSON.parse(calls[2].options.headers['Dropbox-API-Arg']), {
    path: '/System/inspection/import-1.json',
    mode: 'overwrite',
    autorename: false,
    mute: true,
  })
  assert.equal(calls[2].options.headers.Authorization, 'Bearer access-token')
  assert.match(calls[2].options.body, /"inspectionVersion": 1/)
})

test('treats an existing Dropbox folder as success', async () => {
  const fakeFetch = async () => new Response(JSON.stringify({
    error_summary: 'path/conflict/folder/..',
  }), { status: 409, headers: { 'content-type': 'application/json' } })

  const repo = new DropboxArchiveRepository({
    getAccessToken: async () => 'access-token',
    fetchImpl: fakeFetch,
  })

  await assert.doesNotReject(() => repo.ensureFolder('/System'))
})

test('getArchiveIndex returns an empty archive when Dropbox index is missing', async () => {
  const fakeFetch = async (url) => {
    assert.equal(url, 'https://content.dropboxapi.com/2/files/download')
    return new Response(JSON.stringify({ error_summary: 'path/not_found/..' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    })
  }
  const repo = new DropboxArchiveRepository({
    getAccessToken: async () => 'access-token',
    fetchImpl: fakeFetch,
  })
  assert.deepEqual(await repo.getArchiveIndex(), {
    archiveIndexVersion: 1,
    conversations: {},
  })
})

test('getArchiveIndex downloads and parses the committed Dropbox index', async () => {
  const fakeFetch = async (url, options) => {
    assert.equal(url, 'https://content.dropboxapi.com/2/files/download')
    assert.deepEqual(JSON.parse(options.headers['Dropbox-API-Arg']), {
      path: '/System/archive-index.json',
    })
    return new Response(JSON.stringify({
      archiveIndexVersion: 1,
      conversations: { c1: { conversationId: 'c1' } },
    }), { status: 200 })
  }
  const repo = new DropboxArchiveRepository({
    getAccessToken: async () => 'access-token',
    fetchImpl: fakeFetch,
  })
  assert.equal((await repo.getArchiveIndex()).conversations.c1.conversationId, 'c1')
})

test('saveConversationVersion writes source JSON and Markdown to content-addressed paths', async () => {
  const calls = []
  const fakeFetch = async (url, options) => {
    calls.push({ url, options })
    return new Response('{}', { status: 200 })
  }
  const repo = new DropboxArchiveRepository({
    getAccessToken: async () => 'token',
    fetchImpl: fakeFetch,
  })

  await repo.saveConversationVersion({
    conversationId: 'conv-1',
    fingerprint: 'abc123',
    source: { conversation_id: 'conv-1', title: 'Title' },
    markdown: '# Title\n',
  })

  const uploadCalls = calls.filter(call => call.url.includes('/files/upload'))
  assert.equal(uploadCalls.length, 2)
  const paths = uploadCalls.map(call => JSON.parse(call.options.headers['Dropbox-API-Arg']).path).sort()
  assert.deepEqual(paths, [
    '/Archive/Conversations/conv-1--abc123.json',
    '/Archive/Markdown/conv-1--abc123.md',
  ])
  assert.equal(uploadCalls.some(call => String(call.options.body).includes('conversation_id')), true)
  assert.equal(uploadCalls.some(call => call.options.body === '# Title\n'), true)
})

test('saveAttachmentMetadata and saveArchiveIndex write their canonical files', async () => {
  const calls = []
  const fakeFetch = async (url, options) => {
    calls.push({ url, options })
    return new Response('{}', { status: 200 })
  }
  const repo = new DropboxArchiveRepository({
    getAccessToken: async () => 'token',
    fetchImpl: fakeFetch,
  })

  await repo.saveAttachmentMetadata({ attachments: [{ fileId: 'file-1' }], sourceAssetNameMap: {} })
  await repo.saveArchiveIndex({ archiveIndexVersion: 1, conversations: {} })

  const uploadPaths = calls
    .filter(call => call.url.includes('/files/upload'))
    .map(call => JSON.parse(call.options.headers['Dropbox-API-Arg']).path)
  assert.deepEqual(uploadPaths, [
    '/Archive/Attachments/index.json',
    '/System/archive-index.json',
  ])
})


test('invokes browser fetch with the global receiver instead of the repository instance', async () => {
  async function browserLikeFetch(url) {
    if (this !== globalThis) throw new TypeError('Illegal invocation')
    assert.equal(url, 'https://content.dropboxapi.com/2/files/download')
    return new Response(JSON.stringify({ error_summary: 'path/not_found/..' }), {
      status: 409,
      headers: { 'content-type': 'application/json' },
    })
  }

  const repo = new DropboxArchiveRepository({
    getAccessToken: async () => 'access-token',
    fetchImpl: browserLikeFetch,
  })

  assert.deepEqual(await repo.getArchiveIndex(), {
    archiveIndexVersion: 1,
    conversations: {},
  })
})

test('retries transient Dropbox failures before succeeding', async () => {
  let attempts = 0
  const delays = []
  const fakeFetch = async () => {
    attempts += 1
    if (attempts === 1) return new Response('temporary', { status: 503 })
    return new Response('{}', { status: 200 })
  }

  const repo = new DropboxArchiveRepository({
    getAccessToken: async () => 'token',
    fetchImpl: fakeFetch,
    retryDelaysMs: [7],
    sleepImpl: async ms => delays.push(ms),
  })

  await repo.uploadText('/Archive/test.txt', 'hello')

  assert.equal(attempts, 2)
  assert.deepEqual(delays, [7])
})

test('times out a hung Dropbox request instead of waiting forever', async () => {
  let attempts = 0
  const fakeFetch = async (_url, options) => {
    attempts += 1
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      }, { once: true })
    })
  }

  const repo = new DropboxArchiveRepository({
    getAccessToken: async () => 'token',
    fetchImpl: fakeFetch,
    requestTimeoutMs: 5,
    retryDelaysMs: [0],
    sleepImpl: async () => {},
  })

  await assert.rejects(
    () => repo.uploadText('/Archive/test.txt', 'hello'),
    /timed out/i,
  )
  assert.equal(attempts, 2)
})

test('detects only conversation versions whose JSON and Markdown are both already in Dropbox', async () => {
  const calls = []
  const fakeFetch = async (url, options) => {
    calls.push({ url, options })
    assert.equal(url, 'https://api.dropboxapi.com/2/files/list_folder')
    const body = JSON.parse(options.body)

    if (body.path === '/Archive/Conversations') {
      return new Response(JSON.stringify({
        entries: [
          { '.tag': 'file', path_display: '/Archive/Conversations/c1--f1.json' },
          { '.tag': 'file', path_display: '/Archive/Conversations/c2--f2.json' },
        ],
        has_more: false,
      }), { status: 200 })
    }

    if (body.path === '/Archive/Markdown') {
      return new Response(JSON.stringify({
        entries: [
          { '.tag': 'file', path_display: '/Archive/Markdown/c1--f1.md' },
        ],
        has_more: false,
      }), { status: 200 })
    }

    throw new Error(`Unexpected path ${body.path}`)
  }

  const repo = new DropboxArchiveRepository({
    getAccessToken: async () => 'token',
    fetchImpl: fakeFetch,
  })

  const versions = await repo.getExistingConversationVersions()
  assert.deepEqual([...versions], ['c1--f1'])
  assert.equal(calls.length, 2)
})

test('getConversationSource downloads arbitrary archived conversation JSON by canonical path', async () => {
  const fakeFetch = async (url, options) => {
    assert.equal(url, 'https://content.dropboxapi.com/2/files/download')
    assert.deepEqual(JSON.parse(options.headers['Dropbox-API-Arg']), {
      path: '/Archive/Conversations/c1--fp.json',
    })
    return new Response(JSON.stringify({ conversation_id: 'c1', title: 'Camera' }), { status: 200 })
  }
  const repo = new DropboxArchiveRepository({
    getAccessToken: async () => 'token',
    fetchImpl: fakeFetch,
  })

  assert.deepEqual(await repo.getConversationSource('/Archive/Conversations/c1--fp.json'), {
    conversation_id: 'c1',
    title: 'Camera',
  })
})
