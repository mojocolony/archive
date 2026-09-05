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
  renderConversationListPage,
  renderConversationPage,
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
  assert.match(html, /href="#\/conversations"/)
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
  assert.match(html, /Source conversation JSON files/)
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


test('home page shows a local index build action before search is ready and keeps source filename in details', () => {
  const html = renderHomePage({
    lastInspection: {
      status: 'imported', sourceFileName: 'very-long-export-file.zip', importedAt: '2026-09-05T02:00:00.000Z', conversationCount: 42,
    },
    dropboxConnected: true,
    searchStatus: { state: 'missing', indexedCount: 0, total: 42, builtAt: null },
    searchQuery: '', searchResults: [],
  })
  assert.match(html, /42 conversations/)
  assert.match(html, /Last imported/i)
  assert.match(html, /Build Local Search Index/)
  assert.match(html, /very-long-export-file\.zip/)
  assert.doesNotMatch(html, /Search arrives in the next build/)
})

test('home page enables universal search and renders conversation-level excerpts when local index is current', () => {
  const html = renderHomePage({
    lastInspection: { status: 'imported', importedAt: '2026-09-05T02:00:00.000Z', conversationCount: 42 },
    dropboxConnected: true,
    searchStatus: { state: 'current', indexedCount: 42, total: 42, builtAt: '2026-09-05T03:00:00.000Z' },
    searchQuery: 'dynamic range',
    searchResults: [{ conversationId: 'c1', title: 'Photography', updateTime: 10, excerpts: [{ messageId: 'm1', role: 'user', text: 'Explain dynamic range to me.' }] }],
  })
  assert.match(html, /id="archive-search"/)
  assert.match(html, /1 result/)
  assert.match(html, /Explain dynamic range to me/)
  assert.match(html, /#\/conversation\/c1\?q=dynamic%20range&amp;m=m1/)
})

test('conversation library is a compact list sorted data supplied by the controller', () => {
  const html = renderConversationListPage({ documents: [
    { conversationId: 'c2', title: 'Second', updateTime: 20, isStarred: true, isArchived: false, messages: [] },
    { conversationId: 'c1', title: 'First', updateTime: 10, isStarred: false, isArchived: true, messages: [] },
  ] })
  assert.match(html, /All Conversations/)
  assert.ok(html.indexOf('Second') < html.indexOf('First'))
  assert.match(html, /Starred/)
  assert.match(html, /Archived/)
})

test('conversation page renders readable role-separated transcript with match anchor', () => {
  const html = renderConversationPage({ document: {
    conversationId: 'c1', title: 'Photography', updateTime: 20,
    messages: [
      { messageId: 'm1', role: 'user', text: 'Question text', createTime: 10 },
      { messageId: 'm2', role: 'assistant', text: 'Answer text', createTime: 20 },
    ],
  }, query: 'question', messageId: 'm1' })
  assert.match(html, /Photography/)
  assert.match(html, /You/)
  assert.match(html, /ChatGPT/)
  assert.match(html, /id="message-m1"/)
  assert.match(html, /is-search-hit/)
  assert.match(html, /Question text/)
})

test('completed resumed import reports reused uploaded and total committed counts clearly', () => {
  const html = renderImportPreview({
    parsedExport: {
      sourceFileName: 'export.zip', sourceFileSize: 1000,
      stats: { visibleMessageCount: 10, shardCount: 8, attachmentMetadataCount: 0, linkedAttachmentCount: 0 },
      projectMembershipAvailable: false, warnings: [],
    },
    preview: { total: 741, newCount: 741, updatedCount: 0, unchangedCount: 0, missingCount: 0, anomalyWarning: null },
    dropboxConnected: true,
    importResult: { uploadedConversationCount: 2, skippedExistingConversationCount: 739 },
  })
  assert.match(html, /739 reused/i)
  assert.match(html, /2 uploaded/i)
  assert.match(html, /741 total committed/i)
})

test('app shell uses the Lucide package-open mark instead of a letter tile', () => {
  const html = renderAppShell({ route: 'home', content: '<p>Body</p>', version: '0.2.4' })
  assert.match(html, /lucide-package-open/)
  assert.doesNotMatch(html, /brand-mark[^>]*>A</)
})
