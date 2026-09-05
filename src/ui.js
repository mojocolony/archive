export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function stripInternalReferenceTokens(value) {
  return String(value ?? '')
    .replace(/(?:cite|filecite|memcite)(?:[^]*)?/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
}

function safeMarkdownHref(value) {
  const href = String(value ?? '').trim()
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? href : null
  } catch {
    return null
  }
}

function renderInlineMarkdown(value) {
  let source = String(value ?? '')
  const protectedFragments = []
  const protect = html => {
    const token = `ARCHIVEFRAGMENT${protectedFragments.length}TOKEN`
    protectedFragments.push(html)
    return token
  }

  source = source.replace(/`([^`\n]+)`/g, (_, code) => protect(`<code>${escapeHtml(code)}</code>`))
  source = source.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    const safeHref = safeMarkdownHref(href)
    if (!safeHref) return match
    return protect(`<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`)
  })
  source = source.replace(/\bhttps?:\/\/[^\s<>]+/gi, match => {
    let href = match
    let trailing = ''
    while (/[.,!?;:]$/.test(href)) {
      trailing = href.slice(-1) + trailing
      href = href.slice(0, -1)
    }
    const safeHref = safeMarkdownHref(href)
    if (!safeHref) return match
    return `${protect(`<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>`)}${trailing}`
  })

  let html = escapeHtml(source)
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')
  html = html.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')

  protectedFragments.forEach((fragment, index) => {
    html = html.replaceAll(`ARCHIVEFRAGMENT${index}TOKEN`, fragment)
  })
  return html
}

export function renderTranscriptMarkdown(value) {
  const source = stripInternalReferenceTokens(value).replace(/\r\n?/g, '\n')
  const lines = source.split('\n')
  const blocks = []
  let paragraph = []
  let index = 0

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br>')}</p>`)
    paragraph = []
  }

  while (index < lines.length) {
    const line = lines[index]
    const fence = line.match(/^```\s*([A-Za-z0-9_-]*)\s*$/)
    if (fence) {
      flushParagraph()
      const language = fence[1] || ''
      const codeLines = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      const className = language ? ` class="language-${escapeHtml(language)}"` : ''
      blocks.push(`<pre><code${className}>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      index += 1
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      const level = heading[1].length
      blocks.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`)
      index += 1
      continue
    }

    const unordered = line.match(/^\s*[-+*]\s+(.+)$/)
    if (unordered) {
      flushParagraph()
      const items = []
      while (index < lines.length) {
        const match = lines[index].match(/^\s*[-+*]\s+(.+)$/)
        if (!match) break
        items.push(`<li>${renderInlineMarkdown(match[1])}</li>`)
        index += 1
      }
      blocks.push(`<ul>${items.join('')}</ul>`)
      continue
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (ordered) {
      flushParagraph()
      const items = []
      while (index < lines.length) {
        const match = lines[index].match(/^\s*\d+[.)]\s+(.+)$/)
        if (!match) break
        items.push(`<li>${renderInlineMarkdown(match[1])}</li>`)
        index += 1
      }
      blocks.push(`<ol>${items.join('')}</ol>`)
      continue
    }

    paragraph.push(line)
    index += 1
  }

  flushParagraph()
  return blocks.join('')
}

export function formatBytes(bytes) {
  const value = Number(bytes ?? 0)
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const scaled = value / 1024 ** index
  const rounded = scaled >= 10 || Number.isInteger(scaled) ? scaled.toFixed(0) : scaled.toFixed(1)
  return `${rounded} ${units[index]}`
}

function navLink(route, href, label) {
  const target = href.replace('#/', '') || 'home'
  const active = route === target
    || (route === 'home' && href === '#/')
    || (route === 'conversation' && target === 'conversations')
    || (route === 'tags' && target === 'tags')
  return `<a class="nav-link${active ? ' is-active' : ''}" href="${href}">${escapeHtml(label)}</a>`
}

function formatDateValue(value, { includeTime = false } = {}) {
  if (value == null || value === '') return 'Unknown date'
  let date
  if (typeof value === 'number') {
    date = new Date(value < 1e12 ? value * 1000 : value)
  } else {
    date = new Date(value)
  }
  if (Number.isNaN(date.getTime())) return escapeHtml(String(value))
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: 'short', day: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(date)
}

function encodeConversationHref(conversationId, query = '', messageId = '') {
  let href = `#/conversation/${encodeURIComponent(conversationId)}`
  const params = []
  if (query) params.push(`q=${encodeURIComponent(query)}`)
  if (messageId) params.push(`m=${encodeURIComponent(messageId)}`)
  if (params.length) href += `?${params.join('&')}`
  return escapeHtml(href)
}

function resultMeta(result) {
  const labels = []
  if (result.isStarred) labels.push('ChatGPT Starred')
  if (result.isArchived) labels.push('Archived')
  if (result.presentInLatestExport === false) labels.push('Archive only')
  return labels
}

function starIcon() {
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.12 2.12 0 0 0 1.595 1.16l5.166.751a.53.53 0 0 1 .294.904l-3.738 3.643a2.12 2.12 0 0 0-.61 1.878l.882 5.146a.53.53 0 0 1-.77.559l-4.62-2.429a2.12 2.12 0 0 0-1.969 0l-4.62 2.43a.53.53 0 0 1-.77-.56l.882-5.145a2.12 2.12 0 0 0-.61-1.879L2.16 9.79a.53.53 0 0 1 .294-.904l5.165-.752a2.12 2.12 0 0 0 1.597-1.16z"/></svg>'
}

function starButton(conversationId, starred) {
  return `<button class="star-button${starred ? ' is-starred' : ''}" type="button" data-star-conversation="${escapeHtml(conversationId)}" data-starred="${starred ? 'true' : 'false'}" aria-label="${starred ? 'Remove Archive star' : 'Add Archive star'}" title="${starred ? 'Unstar' : 'Star'}">${starIcon()}</button>`
}

function tagBadges(tags = [], { removable = false } = {}) {
  return (tags ?? []).map(tag => removable
    ? `<span class="tag-chip">${escapeHtml(tag)}<button type="button" data-remove-tag="${escapeHtml(tag)}" aria-label="Remove tag ${escapeHtml(tag)}">×</button></span>`
    : `<span class="tag-chip">${escapeHtml(tag)}</span>`
  ).join('')
}

function renderResultRow(result, query = '') {
  const first = result.excerpts?.[0] ?? null
  const href = encodeConversationHref(result.conversationId, query, first?.messageId ?? '')
  const excerpts = (result.excerpts ?? []).map(excerpt => `
    <div class="search-excerpt">
      <span class="excerpt-role">${excerpt.role === 'user' ? 'You' : 'ChatGPT'}</span>
      <span>${escapeHtml(stripInternalReferenceTokens(excerpt.text))}</span>
    </div>
  `).join('')
  const labels = resultMeta(result)
  return `
    <article class="conversation-row search-result-row">
      <div class="conversation-row-grid">
        <a class="conversation-row-link" href="${href}">
          <div class="conversation-row-main">
            <h3>${escapeHtml(result.title || 'Untitled conversation')}</h3>
            <p class="conversation-date">Updated ${formatDateValue(result.updateTime)}</p>
            ${result.tags?.length ? `<div class="tag-list compact">${tagBadges(result.tags)}</div>` : ''}
            ${labels.length ? `<div class="row-badges">${labels.map(label => `<span>${escapeHtml(label)}</span>`).join('')}</div>` : ''}
          </div>
          ${excerpts ? `<div class="search-excerpts">${excerpts}</div>` : ''}
        </a>
        <div class="conversation-row-actions">${starButton(result.conversationId, Boolean(result.starred))}</div>
      </div>
    </article>
  `
}

export function renderAppShell({ route, content, version }) {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#/" aria-label="Archive home">
          <span class="brand-mark" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package-open"><path d="M12 22v-9"/><path d="M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z"/><path d="M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13"/><path d="M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z"/></svg></span>
          <span>Archive</span>
        </a>
        <nav class="primary-nav" aria-label="Primary">
          ${navLink(route, '#/', 'Home')}
          ${navLink(route, '#/conversations', 'All Conversations')}
          ${navLink(route, '#/starred', 'Starred')}
          ${navLink(route, '#/tags', 'Tags')}
          ${navLink(route, '#/import', 'Import')}
          ${navLink(route, '#/settings', 'Settings')}
        </nav>
        <div class="sidebar-footer">v${escapeHtml(version)}</div>
      </aside>
      <main class="main-pane">${content}</main>
    </div>
  `
}

export function renderHomePage({
  lastInspection,
  dropboxConnected,
  searchStatus = { state: 'missing', indexedCount: 0, total: 0, builtAt: null },
  searchQuery = '',
  searchResults = [],
}) {
  const lastDate = lastInspection?.importedAt ?? lastInspection?.inspectedAt ?? null
  const imported = lastInspection?.status === 'imported'
  const conversationCount = lastInspection?.conversationCount ?? searchStatus.total ?? 0
  const activityTitle = imported
    ? `${escapeHtml(conversationCount)} conversations`
    : lastInspection
      ? 'Export analyzed'
      : 'No export imported yet'
  const activityDetail = lastDate ? `Last imported ${formatDateValue(lastDate)}` : 'Choose an official ChatGPT export to begin.'
  const sourceDetails = lastInspection?.sourceFileName
    ? `<details class="source-details"><summary>Import details</summary><p>${escapeHtml(lastInspection.sourceFileName)}</p></details>`
    : ''

  const searchReady = searchStatus.state === 'current'
  const indexAction = searchStatus.state === 'stale' ? 'Rebuild Local Search Index' : 'Build Local Search Index'
  const searchArea = searchReady
    ? `
      <form class="search-bar" id="archive-search-form" role="search">
        <input id="archive-search" class="search-input" type="search" value="${escapeHtml(searchQuery)}" placeholder="Search conversations, prompts, and replies" autocomplete="off" aria-label="Search Archive">
        <button class="button primary" type="submit">Search</button>
      </form>
    `
    : `
      <div class="search-bar is-disabled" aria-disabled="true">
        <input class="search-input" type="search" placeholder="Build the local index to search conversations" disabled>
        <button class="button primary" type="button" disabled>Search</button>
      </div>
    `

  const resultsHtml = searchReady && searchQuery
    ? `<section class="search-results" aria-live="polite">
        <div class="section-heading"><h2>${searchResults.length} ${searchResults.length === 1 ? 'result' : 'results'}</h2><span>for “${escapeHtml(searchQuery)}”</span></div>
        <div class="conversation-list">${searchResults.map(result => renderResultRow(result, searchQuery)).join('') || '<p class="empty-state">No conversations matched this search.</p>'}</div>
      </section>`
    : ''

  let indexTitle = 'Not built on this device'
  let indexText = 'Archive can build a disposable full-text index locally from the canonical Dropbox conversation archive.'
  if (searchStatus.state === 'current') {
    indexTitle = `${escapeHtml(searchStatus.indexedCount)} conversations indexed`
    indexText = `Search stays on this device${searchStatus.builtAt ? ` · built ${formatDateValue(searchStatus.builtAt)}` : ''}.`
  } else if (searchStatus.state === 'stale') {
    indexTitle = 'Local search index needs refresh'
    indexText = `${escapeHtml(searchStatus.indexedCount)} conversations are indexed, but the Dropbox archive has changed.`
  }

  return `
    <section class="page page-home">
      <header class="page-header">
        <p class="eyebrow">ChatGPT archive dashboard</p>
        <h1>Find what you remember.</h1>
        <p class="lede">Archive keeps a durable conversation archive in Dropbox and searches it locally on this device.</p>
      </header>

      ${searchArea}
      <div id="search-index-progress-anchor"></div>
      ${resultsHtml}

      <div class="home-grid">
        <article class="panel">
          <p class="panel-kicker">Archive status</p>
          <h2>${activityTitle}</h2>
          <p>${activityDetail}</p>
          ${sourceDetails}
          <div class="button-row">
            <a class="button secondary" href="#/conversations">Browse Conversations</a>
            <a class="button quiet" href="#/import">Import ChatGPT Export</a>
          </div>
        </article>
        <article class="panel">
          <p class="panel-kicker">Local search</p>
          <h2>${indexTitle}</h2>
          <p>${indexText}</p>
          ${searchStatus.state === 'current'
            ? '<button class="button secondary" id="rebuild-search-index" type="button">Rebuild Local Search Index</button>'
            : `<button class="button primary" id="build-search-index" type="button" ${dropboxConnected && conversationCount > 0 ? '' : 'disabled'}>${indexAction}</button>`}
          ${!dropboxConnected && searchStatus.state !== 'current' ? '<p class="muted small-copy">Connect Dropbox to build the local index.</p>' : ''}
        </article>
      </div>
    </section>
  `
}

export function renderImportPage({
  dropboxConnected,
  parsedExport = null,
  preview = null,
  importResult = null,
}) {
  return `
    <section class="page page-import">
      <header class="page-header compact">
        <p class="eyebrow">Import</p>
        <h1>Import a ChatGPT export</h1>
        <p class="lede">Archive reads the official export locally, compares it with the last committed archive, and shows the changes before anything is written to Dropbox.</p>
      </header>

      <div class="notice privacy">
        <strong>Local first.</strong>
        <span>Nothing is uploaded while Archive analyzes the ZIP. Conversation data goes to Dropbox only after you review the preview and choose Import.</span>
      </div>

      ${dropboxConnected ? '' : '<div class="notice"><strong>Dropbox is not connected.</strong> You can analyze the export now, but <a href="#/settings">Connect Dropbox before importing</a>.</div>'}

      <div class="panel import-panel">
        <label class="file-picker" for="chatgpt-export">
          <span class="file-picker-title">ChatGPT export ZIP</span>
          <span id="file-picker-detail">Choose the official ZIP downloaded from ChatGPT.</span>
          <input id="chatgpt-export" type="file" accept=".zip,application/zip">
        </label>
        <div class="button-row">
          <button class="button primary" id="analyze-button" type="button" disabled>Analyze Export</button>
          <button class="button secondary" id="clear-import-button" type="button">Clear</button>
        </div>
      </div>

      <div id="import-results">${parsedExport && preview ? renderImportPreview({ parsedExport, preview, dropboxConnected, importResult }) : ''}</div>
    </section>
  `
}

function statCard(value, label) {
  return `<div class="import-stat"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`
}

export function renderImportPreview({ parsedExport, preview, dropboxConnected, importResult = null }) {
  const anomaly = preview.anomalyWarning
  const projectNote = parsedExport.projectMembershipAvailable
    ? 'This export contains a direct project_id field on at least one conversation.'
    : 'Project membership is not directly exposed by the observed export schema, so Archive will not invent Project assignments.'
  const resultHtml = importResult
    ? `<div class="notice success"><strong>Import committed.</strong> ${escapeHtml(importResult.skippedExistingConversationCount ?? 0)} reused · ${escapeHtml(importResult.uploadedConversationCount ?? 0)} uploaded · ${escapeHtml(preview.total)} total committed.</div>`
    : ''

  return `
    <section class="report import-preview" aria-labelledby="preview-title">
      <div class="report-heading">
        <div>
          <p class="eyebrow">Import preview</p>
          <h2 id="preview-title">${escapeHtml(parsedExport.sourceFileName)}</h2>
          <p>${formatBytes(parsedExport.sourceFileSize)} · ${escapeHtml(preview.total)} conversations · ${escapeHtml(parsedExport.stats.visibleMessageCount)} visible messages</p>
        </div>
      </div>

      ${resultHtml}

      <div class="import-stats" aria-label="Import changes">
        ${statCard(preview.newCount, 'new')}
        ${statCard(preview.updatedCount, 'updated')}
        ${statCard(preview.unchangedCount, 'unchanged')}
        ${statCard(preview.missingCount, 'not present in latest export')}
      </div>

      <div class="panel preview-details">
        <h3>What Archive found</h3>
        <ul class="detail-list">
          <li><span>Source conversation JSON files</span><strong>${escapeHtml(parsedExport.stats.shardCount)}</strong></li>
          <li><span>Attachment metadata records</span><strong>${escapeHtml(parsedExport.stats.attachmentMetadataCount)}</strong></li>
          <li><span>Linked to a conversation</span><strong>${escapeHtml(parsedExport.stats.linkedAttachmentCount)}</strong></li>
          <li><span>Parser warnings</span><strong>${escapeHtml(parsedExport.warnings?.length ?? 0)}</strong></li>
        </ul>
        <p class="muted">${escapeHtml(projectNote)}</p>
      </div>

      ${anomaly ? `<div class="notice error"><strong>Import warning.</strong> ${escapeHtml(anomaly)}<label class="confirm-row"><input id="confirm-anomaly" type="checkbox"> I reviewed this warning and want to commit the export without deleting the missing conversations.</label></div>` : ''}

      <div class="notice">
        <strong>Current import scope.</strong>
        Conversation source JSON, readable Markdown, and attachment metadata are imported now. Binary attachments and latest/previous source-ZIP retention remain future work.
      </div>

      <div class="button-row">
        <button class="button primary" id="import-to-dropbox" type="button" ${dropboxConnected && !anomaly ? '' : 'disabled'}>Import Conversations to Dropbox</button>
        ${dropboxConnected ? '' : '<a class="button secondary" href="#/settings">Connect Dropbox</a>'}
      </div>
    </section>
  `
}


export function renderConversationListPage({
  documents = [],
  searchStatus = null,
  title = 'All Conversations',
  eyebrow = 'Library',
  emptyText = 'No conversations in this view.',
}) {
  const sorted = [...documents].sort((a, b) => Number(b.updateTime ?? 0) - Number(a.updateTime ?? 0) || String(a.title).localeCompare(String(b.title)))
  const list = sorted.map(document => {
    const labels = resultMeta(document)
    return `
      <article class="conversation-row">
        <div class="conversation-row-grid">
          <a class="conversation-row-link" href="${encodeConversationHref(document.conversationId)}">
            <div class="conversation-row-main">
              <h3>${escapeHtml(document.title || 'Untitled conversation')}</h3>
              <p class="conversation-date">Updated ${formatDateValue(document.updateTime)} · ${escapeHtml(document.messages?.length ?? 0)} visible messages</p>
              ${document.tags?.length ? `<div class="tag-list compact">${tagBadges(document.tags)}</div>` : ''}
              ${labels.length ? `<div class="row-badges">${labels.map(label => `<span>${escapeHtml(label)}</span>`).join('')}</div>` : ''}
            </div>
          </a>
          <div class="conversation-row-actions">${starButton(document.conversationId, Boolean(document.starred))}</div>
        </div>
      </article>
    `
  }).join('')

  const notReady = searchStatus && searchStatus.state !== 'current'
  return `
    <section class="page page-conversations">
      <header class="page-header compact">
        <p class="eyebrow">${escapeHtml(eyebrow)}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="lede">${escapeHtml(sorted.length)} ${sorted.length === 1 ? 'conversation' : 'conversations'} in this view.</p>
      </header>
      ${notReady ? '<div class="notice"><strong>Local index is not current.</strong> Build or rebuild it from Home before relying on this list.</div>' : ''}
      <div class="conversation-list">${list || `<p class="empty-state">${escapeHtml(emptyText)}</p>`}</div>
    </section>
  `
}

export function renderTagsPage({ documents = [] }) {
  const counts = new Map()
  for (const document of documents) {
    for (const tag of document.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  const tags = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
  const rows = tags.map(([tag, count]) => `
    <a class="tag-directory-row" href="#/tags/${encodeURIComponent(tag)}">
      <span>${escapeHtml(tag)}</span><strong>${escapeHtml(count)} ${count === 1 ? 'conversation' : 'conversations'}</strong>
    </a>
  `).join('')
  return `
    <section class="page page-tags">
      <header class="page-header compact"><p class="eyebrow">Organization</p><h1>Tags</h1><p class="lede">Tags are private Archive metadata synced through Dropbox.</p></header>
      <div class="tag-directory">${rows || '<p class="empty-state">No tags yet. Open a conversation to add one.</p>'}</div>
    </section>
  `
}

export function renderConversationPage({ document, query = '', messageId = '' }) {
  if (!document) {
    return `
      <section class="page page-conversation">
        <header class="page-header compact"><p class="eyebrow">Conversation</p><h1>Conversation unavailable</h1></header>
        <div class="notice">This conversation is not in the local index on this device. <a href="#/">Build or rebuild the local search index</a>.</div>
      </section>
    `
  }

  const messages = (document.messages ?? []).map(message => {
    const hit = messageId && message.messageId === messageId
    const text = renderTranscriptMarkdown(message.text)
    return `
      <article class="transcript-message ${message.role === 'user' ? 'from-user' : 'from-assistant'}${hit ? ' is-search-hit' : ''}" id="message-${escapeHtml(message.messageId)}">
        <div class="message-meta">
          <strong>${message.role === 'user' ? 'You' : 'ChatGPT'}</strong>
          ${message.createTime ? `<span>${formatDateValue(message.createTime, { includeTime: true })}</span>` : ''}
        </div>
        <div class="message-text">${text}</div>
      </article>
    `
  }).join('')
  const sourceHref = `https://chatgpt.com/c/${encodeURIComponent(document.conversationId)}`

  return `
    <section class="page page-conversation">
      <header class="page-header compact conversation-header">
        <p class="eyebrow"><a href="#/conversations">All Conversations</a> / Archived transcript</p>
        <div class="conversation-title-row"><h1>${escapeHtml(document.title || 'Untitled conversation')}</h1>${starButton(document.conversationId, Boolean(document.starred))}</div>
        <p class="lede">Updated ${formatDateValue(document.updateTime)} · ${escapeHtml(document.messages?.length ?? 0)} visible messages${query ? ` · opened from search “${escapeHtml(query)}”` : ''}</p>
        <div class="conversation-actions"><a class="button secondary" href="${escapeHtml(sourceHref)}" target="_blank" rel="noopener noreferrer">Open in ChatGPT ↗</a></div>
      </header>
      <section class="organization-panel" aria-label="Archive organization">
        <div><strong>Tags</strong><div class="tag-list">${tagBadges(document.tags ?? [], { removable: true }) || '<span class="muted">No tags</span>'}</div></div>
        <form id="add-tag-form" class="tag-form"><input id="new-tag" class="text-input" type="text" maxlength="60" placeholder="Add a tag" aria-label="Add a tag"><button class="button secondary" type="submit">Add Tag</button></form>
      </section>
      <div class="transcript">${messages || '<p class="empty-state">No visible user/assistant text was found on the active branch.</p>'}</div>
    </section>
  `
}

function shapeKeys(shape) {
  if (!shape) return '—'
  const keys = shape.topLevelType === 'array' ? shape.firstArrayItemKeys : shape.topLevelKeys
  return keys.length ? keys.map(escapeHtml).join(', ') : 'None detected in inspected prefix'
}

export function renderInspectionReport(report, options = {}) {
  const structuralRows = report.entries.map(entry => `
    <tr>
      <td><code>${escapeHtml(entry.path)}</code></td>
      <td>${escapeHtml(entry.category)}</td>
      <td>${formatBytes(entry.originalSize)}</td>
      <td>${entry.jsonShape ? escapeHtml(entry.jsonShape.topLevelType) : '—'}</td>
      <td class="keys-cell">${shapeKeys(entry.jsonShape)}</td>
    </tr>
  `).join('')

  const assetRows = (report.assetSummary ?? []).map(item => `
    <tr>
      <td><code>${escapeHtml(item.extension)}</code></td>
      <td>${item.count}</td>
      <td>${formatBytes(item.totalOriginalBytes)}</td>
    </tr>
  `).join('')

  return `
    <section class="report" aria-labelledby="report-title">
      <div class="report-heading">
        <div>
          <p class="eyebrow">Safe structural report</p>
          <h2 id="report-title">${escapeHtml(report.sourceFileName)}</h2>
          <p>${formatBytes(report.sourceFileSize)} · ${report.entryCount} ZIP entries · inspected ${escapeHtml(report.inspectedAt)}</p>
        </div>
        <div class="button-row">
          <button class="button secondary" id="download-report-button" type="button">Download Safe Report</button>
          <button class="button secondary" id="save-report-button" type="button" ${options.dropboxConnected ? '' : 'disabled'}>Save Safe Report to Dropbox</button>
        </div>
      </div>

      <div class="panel report-panel">
        <h3>Top-level structural files</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>File</th><th>Type</th><th>Size</th><th>JSON</th><th>Detected keys</th></tr></thead>
            <tbody>${structuralRows || '<tr><td colspan="5">No top-level structural files detected.</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div class="panel report-panel">
        <h3>Other files, redacted by extension</h3>
        <p class="muted">Attachment filenames are deliberately omitted from this safe report.</p>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Extension</th><th>Count</th><th>Total size</th></tr></thead>
            <tbody>${assetRows || '<tr><td colspan="3">No other files detected.</td></tr>'}</tbody>
          </table>
        </div>
      </div>

      <div class="notice next-step"><strong>Next:</strong> download this safe report and upload it to our ChatGPT project. It gives us the real 2026 export schema without exposing the conversation text.</div>
    </section>
  `
}

function capabilityRow(label, value) {
  return `<li><span>${escapeHtml(label)}</span><strong class="status ${value ? 'good' : 'bad'}">${value ? 'Available' : 'Unavailable'}</strong></li>`
}

export function renderSettingsPage({
  capabilities,
  indexedDbWriteOk,
  appKey,
  dropboxConnected,
  message = null,
}) {
  return `
    <section class="page page-settings">
      <header class="page-header compact">
        <p class="eyebrow">Settings</p>
        <h1>Browser and Dropbox</h1>
        <p class="lede">Archive keeps the full-text index local. Dropbox is the only cloud service.</p>
      </header>

      ${message ? `<div class="notice">${escapeHtml(message)}</div>` : ''}

      <div class="settings-grid">
        <article class="panel">
          <p class="panel-kicker">Browser Self Check</p>
          <h2>Local capabilities</h2>
          <ul class="capability-list">
            ${capabilityRow('IndexedDB', capabilities.indexedDb)}
            ${capabilityRow('Streaming ZIP decompression', capabilities.streamingDeflate)}
            ${capabilityRow('Web Crypto', capabilities.webCrypto)}
            ${capabilityRow('File streaming', capabilities.fileStreaming)}
            ${capabilityRow('Service worker', capabilities.serviceWorker)}
            ${capabilityRow('Secure context', capabilities.secureContext)}
            <li><span>IndexedDB write test</span><strong class="status ${indexedDbWriteOk === true ? 'good' : indexedDbWriteOk === false ? 'bad' : ''}">${indexedDbWriteOk === true ? 'Passed' : indexedDbWriteOk === false ? 'Failed' : 'Not run'}</strong></li>
          </ul>
          <button class="button secondary" id="self-check-button" type="button">Run Storage Self Check</button>
        </article>

        <article class="panel">
          <p class="panel-kicker">Dropbox</p>
          <h2>${dropboxConnected ? 'Connected' : 'Not connected'}</h2>
          <p>The Dropbox App Key is public OAuth configuration. Archive never uses or stores a Dropbox app secret.</p>
          <label class="field-label" for="dropbox-app-key">Dropbox App Key</label>
          <input class="text-input" id="dropbox-app-key" autocomplete="off" spellcheck="false" value="${escapeHtml(appKey)}" placeholder="Paste the App Key from Dropbox Developers">
          <div class="button-row">
            <button class="button primary" id="save-dropbox-key" type="button">Save App Key</button>
            <button class="button secondary" id="connect-dropbox" type="button" ${appKey ? '' : 'disabled'}>${dropboxConnected ? 'Reconnect Dropbox' : 'Connect Dropbox'}</button>
            <button class="button quiet" id="disconnect-dropbox" type="button" ${dropboxConnected ? '' : 'disabled'}>Disconnect</button>
          </div>
        </article>
      </div>
    </section>
  `
}
