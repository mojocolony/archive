import test from 'node:test'
import assert from 'node:assert/strict'
import {
  formatBytes,
  renderAppShell,
  renderImportPage,
  renderInspectionReport,
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

test('import page explains that transcript text is not persisted by the inspector', () => {
  const html = renderImportPage({ dropboxConnected: false })
  assert.match(html, /does not import or save conversation text/i)
  assert.match(html, /ChatGPT export ZIP/i)
  assert.match(html, /Save Safe Report to Dropbox/)
  assert.match(html, /disabled/)
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
