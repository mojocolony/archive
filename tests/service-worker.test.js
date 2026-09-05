import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('service worker caches only local app-shell assets and never Dropbox/API responses', async () => {
  const source = await readFile('sw.js', 'utf8')
  assert.match(source, /\.\/index\.html/)
  assert.match(source, /\.\/src\/app\.js/)
  assert.match(source, /\.\/src\/import\/zipDirectory\.js/)
  assert.match(source, /request\.url\.startsWith\(self\.location\.origin\)/)
  assert.equal(source.includes('api.dropboxapi.com'), false)
  assert.equal(source.includes('content.dropboxapi.com'), false)
})
