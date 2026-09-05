import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('service worker caches only local app-shell assets and never Dropbox/API responses', async () => {
  const source = await readFile('sw.js', 'utf8')
  assert.match(source, /\.\/index\.html/)
  assert.match(source, /\.\/src\/app\.js/)
  assert.match(source, /\.\/src\/import\/zipDirectory\.js/)
  assert.match(source, /\.\/src\/import\/deepJsonShape\.js/)
  assert.match(source, /request\.url\.startsWith\(self\.location\.origin\)/)
  assert.equal(source.includes('api.dropboxapi.com'), false)
  assert.equal(source.includes('content.dropboxapi.com'), false)
})

test('service worker uses network-first for documents, scripts, and styles so deployments cannot pin stale code', async () => {
  const source = await readFile('sw.js', 'utf8')
  assert.match(source, /NETWORK_FIRST_DESTINATIONS/)
  assert.match(source, /document.*script.*style|document.*style.*script|script.*document.*style|script.*style.*document|style.*document.*script|style.*script.*document/s)
  assert.match(source, /fetch\(request, \{ cache: 'no-store' \}\)/)
})
