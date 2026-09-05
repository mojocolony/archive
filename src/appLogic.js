export function routeFromHash(hash) {
  if (hash === '#/import') return 'import'
  if (hash === '#/settings') return 'settings'
  return 'home'
}

function compactIso(iso) {
  return String(iso).replace(/[-:.]/g, '')
}

export function makeInspectionId(report) {
  return `inspection-${compactIso(report.inspectedAt)}`
}

export function safeReportFilename(report) {
  return `archive-inspection-${compactIso(report.inspectedAt)}.json`
}

export function progressFromInspectorEvent(event) {
  if (event.stage === 'directory') {
    return {
      label: 'Reading ZIP directory…',
      detail: 'Only the end-of-file directory is read, not the entire ZIP.',
      percent: null,
    }
  }

  const total = Number(event.total ?? 0)
  const completed = Number(event.completed ?? 0)
  return {
    label: 'Inspecting structural files…',
    detail: `${completed} of ${total} ZIP entries checked`,
    percent: total > 0 ? Math.round((completed / total) * 100) : null,
  }
}

export function tokenIsUsable(token, nowMs = Date.now()) {
  if (!token?.accessToken) return false
  if (!token.expiresAt) return true
  return token.expiresAt > nowMs + 60_000
}
