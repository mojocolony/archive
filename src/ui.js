export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
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
  const active = route === href.replace('#/', '') || (route === 'home' && href === '#/')
  return `<a class="nav-link${active ? ' is-active' : ''}" href="${href}">${escapeHtml(label)}</a>`
}

export function renderAppShell({ route, content, version }) {
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#/" aria-label="Archive home">
          <span class="brand-mark" aria-hidden="true">A</span>
          <span>Archive</span>
        </a>
        <nav class="primary-nav" aria-label="Primary">
          ${navLink(route, '#/', 'Home')}
          ${navLink(route, '#/import', 'Import')}
          ${navLink(route, '#/settings', 'Settings')}
        </nav>
        <div class="sidebar-footer">v${escapeHtml(version)}</div>
      </aside>
      <main class="main-pane">${content}</main>
    </div>
  `
}

export function renderHomePage({ lastInspection, dropboxConnected }) {
  const lastDate = lastInspection?.importedAt ?? lastInspection?.inspectedAt ?? null
  const imported = lastInspection?.status === 'imported'
  const activityTitle = imported
    ? `${escapeHtml(lastInspection.conversationCount ?? 0)} conversations`
    : lastInspection
      ? 'Export analyzed'
      : 'No export imported yet'
  const activityDetail = lastInspection
    ? `${escapeHtml(lastInspection.sourceFileName)}${lastDate ? ` · ${escapeHtml(String(lastDate).slice(0, 10))}` : ''}`
    : 'Choose an official ChatGPT export to begin.'

  return `
    <section class="page page-home">
      <header class="page-header">
        <p class="eyebrow">ChatGPT archive dashboard</p>
        <h1>Find what you remember.</h1>
        <p class="lede">Archive keeps a durable conversation archive in Dropbox and will build the full-text search index locally on your devices.</p>
      </header>

      <div class="search-placeholder" aria-disabled="true">
        <span>Search arrives in the next build after the conversation archive is populated</span>
      </div>

      <div class="home-grid">
        <article class="panel">
          <p class="panel-kicker">Archive status</p>
          <h2>${activityTitle}</h2>
          <p>${activityDetail}</p>
          <a class="button primary" href="#/import">Import ChatGPT Export</a>
        </article>
        <article class="panel">
          <p class="panel-kicker">Dropbox</p>
          <h2>${dropboxConnected ? 'Connected' : 'Not connected'}</h2>
          <p>${dropboxConnected ? 'Conversation archive is stored in Dropbox; the search index remains local.' : 'Connect Dropbox before committing the first archive import.'}</p>
          <a class="button secondary" href="#/settings">${dropboxConnected ? 'Dropbox Settings' : 'Connect Dropbox'}</a>
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
    ? `<div class="notice success"><strong>Import committed.</strong> ${escapeHtml(importResult.uploadedConversationCount)} new/updated conversation versions were saved and the archive index was committed.</div>`
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
          <li><span>Conversation files</span><strong>${escapeHtml(parsedExport.stats.shardCount)}</strong></li>
          <li><span>Attachment metadata records</span><strong>${escapeHtml(parsedExport.stats.attachmentMetadataCount)}</strong></li>
          <li><span>Linked to a conversation</span><strong>${escapeHtml(parsedExport.stats.linkedAttachmentCount)}</strong></li>
          <li><span>Parser warnings</span><strong>${escapeHtml(parsedExport.warnings?.length ?? 0)}</strong></li>
        </ul>
        <p class="muted">${escapeHtml(projectNote)}</p>
      </div>

      ${anomaly ? `<div class="notice error"><strong>Import warning.</strong> ${escapeHtml(anomaly)}<label class="confirm-row"><input id="confirm-anomaly" type="checkbox"> I reviewed this warning and want to commit the export without deleting the missing conversations.</label></div>` : ''}

      <div class="notice">
        <strong>v0.2.3 scope.</strong>
        Conversation source JSON, readable Markdown, and attachment metadata are imported now. Binary attachments and latest/previous source-ZIP retention come in the next v0.2.x step.
      </div>

      <div class="button-row">
        <button class="button primary" id="import-to-dropbox" type="button" ${dropboxConnected && !anomaly ? '' : 'disabled'}>Import Conversations to Dropbox</button>
        ${dropboxConnected ? '' : '<a class="button secondary" href="#/settings">Connect Dropbox</a>'}
      </div>
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
