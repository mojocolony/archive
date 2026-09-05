import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatBytes,
  renderAppShell,
  renderHomePage,
  renderImportPage,
  renderInspectionReport,
  renderImportPreview,
  renderSettingsPage,
} from '../src/ui.js'

test('formatBytes produces compact human-readable sizes', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(1024), '1 KB')
  assert.equal(formatBytes(4 * 1024 ** 3), '4 GB')
})

test('app shell provides restrained primary navigation', () => {
  const html = renderAppShell({ route: 'home', content: '<p>Body</p>', version: '0.1.0' })
  assert.match(html, /Archive/)
  assert.match(html, /href="#\/"/)
  assert.match(html, /href="#\/import"/)
  assert.match(html, /href="#\/settings"/)
  assert.match(html, /0\.1\.0/)
})

test('import page makes local analysis the primary action and keeps Dropbox commit separate', () => {
  const html = renderImportPage({ dropboxConnected: false })
  assert.match(html, /Analyze Export/)
  assert.match(html, /Nothing is uploaded while Archive analyzes/i)
  assert.match(html, /ChatGPT export ZIP/i)
  assert.match(html, /Connect Dropbox before importing/i)
})

test('import preview shows merge counts and preserves missing conversations', () => {
  const html = renderImportPreview({
    parsedExport: {
      sourceFileName: 'export.zip',
      sourceFileSize: 1000,
      stats: { conversationCount: 100, visibleMessageCount: 900, attachmentMetadataCount: 20, linkedAttachmentCount: 18 },
      projectMembershipAvailable: false,
      warnings: [],
    },
    preview: {
      total: 100,
      newCount: 10,
      updatedCount: 5,
      unchangedCount: 83,
      missingCount: 2,
      anomalyWarning: null,
    },
    dropboxConnected: true,
  })
  assert.match(html, /<strong>10<\/strong><span>new<\/span>/)
  assert.match(html, /<strong>5<\/strong><span>updated<\/span>/)
  assert.match(html, /<strong>83<\/strong><span>unchanged<\/span>/)
  assert.match(html, /<strong>2<\/strong><span>not present in latest export<\/span>/)
  assert.match(html, /Import Conversations to Dropbox/)
  assert.match(html, /Project membership is not directly exposed/i)
})

test('inspection report renders structural keys but escapes filenames and never needs JSON values', () => {
  const html = renderInspectionReport({
    sourceFileName: '<export>.zip',
    sourceFileSize: 4096,
    entryCount: 2,
    entries: [{
      path: 'conversations.json',
      category: 'json',
      originalSize: 100,
      compressedSize: 50,
      jsonShape: {
        topLevelType: 'array',
        topLevelKeys: [],
        firstArrayItemKeys: ['id', 'mapping', 'title'],
        complete: false,
      },
      inspectionError: null,
    }],
    assetSummary: [{ extension: '.png', count: 1, totalOriginalBytes: 200 }],
  })
  assert.match(html, /&lt;export&gt;\.zip/)
  assert.match(html, /id, mapping, title/)
  assert.match(html, /\.png/)
})

test('settings page shows browser capability and Dropbox configuration separately', () => {
  const html = renderSettingsPage({
    capabilities: {
      indexedDb: true,
      streamingDeflate: true,
      webCrypto: true,
      fileStreaming: true,
      serviceWorker: false,
      secureContext: true,
    },
    indexedDbWriteOk: null,
    appKey: '',
    dropboxConnected: false,
  })
  assert.match(html, /Browser Self Check/)
  assert.match(html, /IndexedDB/)
  assert.match(html, /Service worker/)
  assert.match(html, /Dropbox App Key/)
})


test('home page reports the latest committed import instead of inspector-only status', () => {
  const html = renderHomePage({
    lastInspection: {
      status: 'imported',
      sourceFileName: 'export.zip',
      importedAt: '2026-09-05T02:00:00.000Z',
      conversationCount: 42,
    },
    dropboxConnected: true,
  })
  assert.match(html, /42 conversations/)
  assert.match(html, /Import ChatGPT Export/)
  assert.match(html, /Conversation archive is stored in Dropbox/i)
})
