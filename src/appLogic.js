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

export function makeImportId(parsedExport) {
  return `import-${compactIso(parsedExport.parsedAt)}`
}

export function progressFromParseEvent(event) {
  if (event.stage === 'directory') {
    return {
      label: 'Reading ZIP directory…',
      detail: 'Only ZIP metadata is read before Archive opens the required JSON entries.',
      percent: null,
    }
  }

  if (event.stage === 'conversations') {
    const total = Number(event.total ?? 0)
    const completed = Number(event.completed ?? 0)
    return {
      label: 'Reading conversations…',
      detail: `${completed} of ${total} conversation files${event.detail ? ` · ${event.detail}` : ''}`,
      percent: total > 0 ? Math.round((completed / total) * 100) : null,
    }
  }

  if (event.stage === 'files') {
    return {
      label: 'Reading file metadata…',
      detail: 'Linking exported file records back to conversations and messages.',
      percent: event.completed ? 100 : null,
    }
  }

  return {
    label: 'Analyzing export…',
    detail: '',
    percent: null,
  }
}

export function progressFromCommitEvent(event) {
  if (event.stage === 'prepare') {
    return {
      label: 'Preparing Dropbox archive…',
      detail: 'Creating the Archive app folders if needed.',
      percent: null,
    }
  }

  if (event.stage === 'resume') {
    const total = Number(event.total ?? 0)
    const skipped = Number(event.skipped ?? 0)
    return {
      label: 'Checking existing uploads…',
      detail: `${skipped} of ${total} conversations already safely stored`,
      percent: total > 0 ? 100 : null,
    }
  }

  if (event.stage === 'conversation-start') {
    const total = Number(event.total ?? 0)
    const position = Number(event.position ?? 1)
    return {
      label: `Saving conversation ${position} of ${total}…`,
      detail: String(event.title ?? event.conversationId ?? ''),
      percent: total > 0 ? Math.round(((position - 1) / total) * 100) : null,
    }
  }

  if (event.stage === 'conversations') {
    const total = Number(event.total ?? 0)
    const completed = Number(event.completed ?? 0)
    return {
      label: 'Saving changed conversations…',
      detail: `${completed} of ${total} saved`,
      percent: total > 0 ? Math.round((completed / total) * 100) : 100,
    }
  }

  if (event.stage === 'attachments') {
    return {
      label: 'Saving attachment metadata…',
      detail: 'Binary attachments are not uploaded in v0.2.0.',
      percent: event.completed ? 100 : null,
    }
  }

  if (event.stage === 'commit') {
    return {
      label: 'Committing archive index…',
      detail: 'The index is written last so a failed upload cannot replace the previous committed archive.',
      percent: event.completed ? 100 : null,
    }
  }

  return { label: 'Importing…', detail: '', percent: null }
}
