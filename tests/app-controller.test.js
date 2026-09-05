import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('browser controller uses modular local, Dropbox, and import services without localStorage', async () => {
  const source = await readFile('src/app.js', 'utf8')
  assert.match(source, /openArchiveDb/)
  assert.match(source, /inspectChatGptExport/)
  assert.match(source, /sanitizeInspectionReport/)
  assert.match(source, /DropboxSession/)
  assert.match(source, /DropboxArchiveRepository/)
  assert.equal(source.includes('localStorage'), false)
})
