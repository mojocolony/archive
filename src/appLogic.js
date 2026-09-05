export function parseAppRoute(hash) {
  const value = String(hash ?? '')
  const raw = value.startsWith('#/') ? value.slice(2) : ''
  const [pathPart, queryPart = ''] = raw.split('?', 2)
  const params = new URLSearchParams(queryPart)

  if (pathPart === 'import') return { name: 'import' }
  if (pathPart === 'settings') return { name: 'settings' }
  if (pathPart === 'conversations') return { name: 'conversations' }
  if (pathPart === 'starred') return { name: 'starred' }
  if (pathPart === 'tags') return { name: 'tags', tag: '' }
  if (pathPart.startsWith('tags/')) {
    const encodedTag = pathPart.slice('tags/'.length)
    return { name: 'tags', tag: encodedTag ? decodeURIComponent(encodedTag) : '' }
  }
  if (pathPart.startsWith('conversation/')) {
    const encodedId = pathPart.slice('conversation/'.length)
    if (!encodedId) return { name: 'home' }
    return {
      name: 'conversation',
      conversationId: decodeURIComponent(encodedId),
      query: params.get('q') ?? '',
      messageId: params.get('m') ?? '',
    }
  }
  return { name: 'home' }
}

export function routeFromHash(hash) {
  return parseAppRoute(hash).name
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


export function progressFromSearchIndexEvent(event) {
  const total = Number(event.total ?? 0)
  const completed = Number(event.completed ?? 0)

  if (event.stage === 'prepare') {
    return {
      label: 'Preparing local search index…',
      detail: 'Search data stays on this device.',
      percent: total > 0 ? 0 : null,
    }
  }

  if (event.stage === 'conversation-start') {
    return {
      label: 'Building local search index…',
      detail: String(event.title ?? event.conversationId ?? ''),
      percent: total > 0 ? Math.round((completed / total) * 100) : null,
    }
  }

  if (event.stage === 'conversations') {
    return {
      label: 'Building local search index…',
      detail: `${completed} of ${total} conversations indexed`,
      percent: total > 0 ? Math.round((completed / total) * 100) : null,
    }
  }

  if (event.stage === 'complete') {
    return {
      label: 'Local search index ready',
      detail: `${completed} conversations indexed on this device`,
      percent: 100,
    }
  }

  return { label: 'Building local search index…', detail: '', percent: null }
}
