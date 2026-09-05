import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  inspectChatGptExport,
  sanitizeInspectionReport,
} from '../src/import/inspector.js'

async function fixtureFile() {
  const bytes = await readFile('tests/fixtures/inspector-fixture.zip')
  return new File([bytes], 'export.zip', { type: 'application/zip' })
}

test('inspects structural JSON keys without retaining JSON values', async () => {
  const report = await inspectChatGptExport(await fixtureFile(), {
    now: () => '2026-09-04T12:00:00.000Z',
  })

  const conversations = report.entries.find(entry => entry.path === 'conversations.json')
  assert.deepEqual(conversations.jsonShape.firstArrayItemKeys, [
    'create_time',
    'id',
    'mapping',
    'title',
  ])

  const serialized = JSON.stringify(report)
  assert.equal(serialized.includes('private@example.invalid'), false)
  assert.equal(serialized.includes('conv-1'), false)
  assert.equal(serialized.includes('Example'), false)
})

test('sanitized report keeps structural file names but summarizes asset paths', async () => {
  const report = await inspectChatGptExport(await fixtureFile(), {
    now: () => '2026-09-04T12:00:00.000Z',
  })
  const safe = sanitizeInspectionReport(report)

  assert.equal(safe.entries.some(entry => entry.path === 'conversations.json'), true)
  assert.equal(safe.entries.some(entry => entry.path === 'user.json'), true)
  assert.equal(JSON.stringify(safe).includes('files/image.png'), false)
  assert.deepEqual(safe.assetSummary, [
    { extension: '.png', count: 1, totalOriginalBytes: 15 },
  ])
})
