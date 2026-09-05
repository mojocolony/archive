import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('browser controller uses modular local, Dropbox, and import services without localStorage', async () => {
  const source = await readFile('src/app.js', 'utf8')
  assert.match(source, /openArchiveDb/)
  assert.match(source, /parseChatGptExport/)
  assert.match(source, /buildImportPreview/)
  assert.match(source, /commitParsedExport/)
  assert.match(source, /DropboxSession/)
  assert.match(source, /DropboxArchiveRepository/)
  assert.equal(source.includes('localStorage'), false)
})

test('startup updates the service worker before opening IndexedDB', async () => {
  const source = await readFile('src/app.js', 'utf8')
  const startBody = source.slice(source.indexOf('async function start()'))
  const swIndex = startBody.indexOf('await registerServiceWorker()')
  const dbIndex = startBody.indexOf('await openArchiveDb()')
  assert.ok(swIndex >= 0)
  assert.ok(dbIndex >= 0)
  assert.ok(swIndex < dbIndex)
  assert.match(source, /updateViaCache:\s*'none'/)
})

test('recovery page exists to clear stale service-worker caches without touching IndexedDB', async () => {
  const html = await readFile('reset.html', 'utf8')
  const js = await readFile('reset.js', 'utf8')
  assert.match(html, /reset\.js/)
  assert.match(js, /navigator\.serviceWorker\.getRegistrations\(\)/)
  assert.match(js, /caches\.keys\(\)/)
  assert.equal(js.includes('indexedDB.deleteDatabase'), false)
})
