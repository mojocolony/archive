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
