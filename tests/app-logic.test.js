import test from 'node:test'
import assert from 'node:assert/strict'
import {
  routeFromHash,
  makeInspectionId,
  safeReportFilename,
  progressFromInspectorEvent,
  tokenIsUsable,
} from '../src/appLogic.js'

test('routeFromHash recognizes only the first-slice routes', () => {
  assert.equal(routeFromHash(''), 'home')
  assert.equal(routeFromHash('#/'), 'home')
  assert.equal(routeFromHash('#/import'), 'import')
  assert.equal(routeFromHash('#/settings'), 'settings')
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
