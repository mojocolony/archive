import test from 'node:test'
import assert from 'node:assert/strict'
import {
  routeFromHash,
  makeInspectionId,
  safeReportFilename,
  progressFromInspectorEvent,
  makeImportId,
  progressFromParseEvent,
  progressFromCommitEvent,
  tokenIsUsable,
  parseAppRoute,
  progressFromSearchIndexEvent,
} from '../src/appLogic.js'

test('routeFromHash recognizes browse and conversation routes', () => {
  assert.equal(routeFromHash(''), 'home')
  assert.equal(routeFromHash('#/'), 'home')
  assert.equal(routeFromHash('#/import'), 'import')
  assert.equal(routeFromHash('#/settings'), 'settings')
  assert.equal(routeFromHash('#/conversations'), 'conversations')
  assert.equal(routeFromHash('#/conversation/c-1'), 'conversation')
  assert.equal(routeFromHash('#/unknown'), 'home')
})

test('inspection IDs and filenames are deterministic from inspectedAt', () => {
  const report = { inspectedAt: '2026-09-04T16:45:12.345Z' }
  assert.equal(makeInspectionId(report), 'inspection-20260904T164512345Z')
  assert.equal(safeReportFilename(report), 'archive-inspection-20260904T164512345Z.json')
})

test('inspector progress maps directory and entry stages to useful UI state', () => {
  assert.deepEqual(progressFromInspectorEvent({ stage: 'directory', completed: 0, total: null }), {
    label: 'Reading ZIP directory…',
    detail: 'Only the end-of-file directory is read, not the entire ZIP.',
    percent: null,
  })
  assert.deepEqual(progressFromInspectorEvent({ stage: 'entries', completed: 5, total: 20 }), {
    label: 'Inspecting structural files…',
    detail: '5 of 20 ZIP entries checked',
    percent: 25,
  })
})


test('tokenIsUsable treats expired browser tokens as disconnected', () => {
  assert.equal(tokenIsUsable(null, 1000), false)
  assert.equal(tokenIsUsable({ accessToken: 'x', expiresAt: 70000 }, 1000), true)
  assert.equal(tokenIsUsable({ accessToken: 'x', expiresAt: 60000 }, 1000), false)
  assert.equal(tokenIsUsable({ accessToken: 'x', expiresAt: null }, 1000), true)
})


test('import IDs are deterministic from parsedAt', () => {
  assert.equal(
    makeImportId({ parsedAt: '2026-09-05T02:03:04.005Z' }),
    'import-20260905T020304005Z',
  )
})

test('parse and commit progress map to user-facing stages', () => {
  assert.deepEqual(progressFromParseEvent({ stage: 'conversations', completed: 2, total: 8, detail: 'conversations-001.json' }), {
    label: 'Reading conversations…',
    detail: '2 of 8 conversation files · conversations-001.json',
    percent: 25,
  })
  assert.deepEqual(progressFromCommitEvent({ stage: 'conversations', completed: 3, total: 6 }), {
    label: 'Saving changed conversations…',
    detail: '3 of 6 saved',
    percent: 50,
  })
  assert.equal(progressFromCommitEvent({ stage: 'commit', completed: 0, total: 1 }).label, 'Committing archive index…')
})

test('commit progress explains resume scanning and identifies the conversation currently being saved', () => {
  assert.deepEqual(progressFromCommitEvent({ stage: 'resume', completed: 741, total: 741, skipped: 739 }), {
    label: 'Checking existing uploads…',
    detail: '739 of 741 conversations already safely stored',
    percent: 100,
  })

  assert.deepEqual(progressFromCommitEvent({
    stage: 'conversation-start',
    position: 740,
    total: 741,
    title: 'Example conversation',
  }), {
    label: 'Saving conversation 740 of 741…',
    detail: 'Example conversation',
    percent: Math.round((739 / 741) * 100),
  })
})


test('parseAppRoute decodes conversation id and local search deep-link parameters', () => {
  assert.deepEqual(parseAppRoute('#/conversation/c%2F1?q=dynamic%20range&m=m%201'), {
    name: 'conversation', conversationId: 'c/1', query: 'dynamic range', messageId: 'm 1',
  })
})

test('search-index progress maps local build stages without implying an upload', () => {
  assert.deepEqual(progressFromSearchIndexEvent({ stage: 'conversations', completed: 25, total: 100 }), {
    label: 'Building local search index…', detail: '25 of 100 conversations indexed', percent: 25,
  })
  assert.equal(progressFromSearchIndexEvent({ stage: 'complete', completed: 100, total: 100 }).label, 'Local search index ready')
})
