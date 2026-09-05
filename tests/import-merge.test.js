import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCommittedIndex, buildImportPreview } from '../src/import/importMerge.js'

function parsed(conversations, attachments = []) {
  return {
    sourceFileName: 'export.zip',
    sourceFileSize: 123,
    parsedAt: '2026-09-05T00:00:00.000Z',
    conversations,
    attachments,
    stats: { conversationCount: conversations.length },
  }
}

function conversation(id, fingerprint, title = id) {
  return {
    conversationId: id,
    fingerprint,
    title,
    createTime: 1,
    updateTime: 2,
    isArchived: false,
    isStarred: false,
    pinnedTime: null,
    projectId: null,
    visibleMessageCount: 2,
  }
}

test('buildImportPreview classifies new updated unchanged and missing conversations', () => {
  const previous = {
    archiveIndexVersion: 1,
    conversations: {
      same: { conversationId: 'same', sourceFingerprint: 'aaa', presentInLatestExport: true },
      changed: { conversationId: 'changed', sourceFingerprint: 'old', presentInLatestExport: true },
      missing: { conversationId: 'missing', sourceFingerprint: 'mmm', presentInLatestExport: true },
    },
  }
  const preview = buildImportPreview(parsed([
    conversation('same', 'aaa'),
    conversation('changed', 'new'),
    conversation('new', 'nnn'),
  ]), previous)

  assert.equal(preview.total, 3)
  assert.equal(preview.newCount, 1)
  assert.equal(preview.updatedCount, 1)
  assert.equal(preview.unchangedCount, 1)
  assert.equal(preview.missingCount, 1)
  assert.deepEqual(preview.newIds, ['new'])
  assert.deepEqual(preview.updatedIds, ['changed'])
  assert.deepEqual(preview.missingIds, ['missing'])
  assert.equal(preview.anomalyWarning, null)
})

test('buildImportPreview warns instead of normalizing a suspicious mass disappearance', () => {
  const previousConversations = {}
  for (let i = 0; i < 130; i += 1) {
    previousConversations[`c${i}`] = {
      conversationId: `c${i}`,
      sourceFingerprint: `f${i}`,
      presentInLatestExport: true,
    }
  }
  const current = []
  for (let i = 0; i < 90; i += 1) current.push(conversation(`c${i}`, `f${i}`))
  const preview = buildImportPreview(parsed(current), {
    archiveIndexVersion: 1,
    conversations: previousConversations,
  })
  assert.equal(preview.missingCount, 40)
  assert.match(preview.anomalyWarning, /40 conversations/i)
})

test('buildCommittedIndex preserves missing conversations and marks current conversations present', () => {
  const previous = {
    archiveIndexVersion: 1,
    conversations: {
      keep: {
        conversationId: 'keep',
        title: 'Old title',
        sourceFingerprint: 'old',
        sourcePath: '/old.json',
        markdownPath: '/old.md',
        presentInLatestExport: true,
        firstImportedAt: '2026-08-01T00:00:00.000Z',
      },
      missing: {
        conversationId: 'missing',
        title: 'Missing',
        sourceFingerprint: 'm',
        sourcePath: '/missing.json',
        markdownPath: '/missing.md',
        presentInLatestExport: true,
        firstImportedAt: '2026-08-01T00:00:00.000Z',
      },
    },
  }
  const current = parsed([
    conversation('keep', 'new', 'New title'),
    conversation('added', 'add', 'Added'),
  ], [
    { conversationId: 'keep' },
    { conversationId: 'keep' },
    { conversationId: 'added' },
  ])

  const index = buildCommittedIndex(current, previous, {
    importId: 'import-1',
    importedAt: '2026-09-05T01:00:00.000Z',
  })

  assert.equal(index.conversations.keep.presentInLatestExport, true)
  assert.equal(index.conversations.keep.title, 'New title')
  assert.equal(index.conversations.keep.attachmentCount, 2)
  assert.equal(index.conversations.keep.firstImportedAt, '2026-08-01T00:00:00.000Z')
  assert.match(index.conversations.keep.sourcePath, /\/keep--new\.json$/)
  assert.equal(index.conversations.added.attachmentCount, 1)
  assert.equal(index.conversations.missing.presentInLatestExport, false)
  assert.equal(index.conversations.missing.lastMissingImportId, 'import-1')
})
