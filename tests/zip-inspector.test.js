import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  readZipDirectory,
  readEntryTextPrefix,
  readEntryBytes,
  readEntryText,
  parseZip64ExtendedInfo,
} from '../src/import/zipDirectory.js'

async function fixtureFile() {
  const bytes = await readFile('tests/fixtures/inspector-fixture.zip')
  const file = new File([bytes], 'export.zip', { type: 'application/zip' })
  file.arrayBuffer = () => {
    throw new Error('whole-file arrayBuffer must not be used')
  }
  return file
}

test('reads ZIP central directory without reading the whole source File', async () => {
  const entries = await readZipDirectory(await fixtureFile())
  assert.deepEqual(entries.map(entry => entry.path).sort(), [
    'chat.html',
    'conversations.json',
    'files/image.png',
    'user.json',
  ])
  const conversation = entries.find(entry => entry.path === 'conversations.json')
  assert.equal(conversation.compressionMethod, 8)
  assert.ok(conversation.compressedSize > 0)
  assert.ok(conversation.originalSize > conversation.compressedSize)
})

test('reads only a bounded decompressed text prefix from a deflated ZIP entry', async () => {
  const file = await fixtureFile()
  const entries = await readZipDirectory(file)
  const conversation = entries.find(entry => entry.path === 'conversations.json')
  const text = await readEntryTextPrefix(file, conversation, 32)
  assert.equal(text.length <= 32, true)
  assert.match(text, /^\[\{"id":"conv-1"/)
})

test('parses ZIP64 extended sizes and offsets in sentinel order', () => {
  const bytes = new Uint8Array(4 + 8 + 8 + 8)
  const view = new DataView(bytes.buffer)
  view.setUint16(0, 0x0001, true)
  view.setUint16(2, 24, true)
  view.setBigUint64(4, 5_000_000_000n, true)
  view.setBigUint64(12, 4_000_000_000n, true)
  view.setBigUint64(20, 3_000_000_000n, true)

  assert.deepEqual(
    parseZip64ExtendedInfo(bytes, {
      originalSize32: 0xffffffff,
      compressedSize32: 0xffffffff,
      localHeaderOffset32: 0xffffffff,
      diskStart16: 0,
    }),
    {
      originalSize: 5_000_000_000,
      compressedSize: 4_000_000_000,
      localHeaderOffset: 3_000_000_000,
      diskStart: 0,
    },
  )
})


test('reads a full deflated entry without reading the whole ZIP File', async () => {
  const file = await fixtureFile()
  const entries = await readZipDirectory(file)
  const conversation = entries.find(entry => entry.path === 'conversations.json')
  const bytes = await readEntryBytes(file, conversation)
  const text = new TextDecoder().decode(bytes)
  assert.match(text, /\"title\":\"Example\"/)
  assert.equal(bytes.length, conversation.originalSize)
})

test('reads a full ZIP entry as UTF-8 text', async () => {
  const file = await fixtureFile()
  const entries = await readZipDirectory(file)
  const user = entries.find(entry => entry.path === 'user.json')
  const text = await readEntryText(file, user)
  assert.match(text, /private@example\.invalid/)
})
