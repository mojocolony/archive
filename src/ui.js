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
  const inspectionText = lastInspection
    ? `${escapeHtml(lastInspection.sourceFileName)} · ${escapeHtml(lastInspection.inspectedAt.slice(0, 10))}`
    : 'No export inspected yet'

  return `
    <section class="page page-home">
      <header class="page-header">
        <p class="eyebrow">ChatGPT archive dashboard</p>
        <h1>Find what you remember.</h1>
        <p class="lede">Archive will keep the durable copy in Dropbox and the search index on your devices. This first build validates the import path before any conversation parser is allowed to make assumptions.</p>
      </header>

      <div class="search-placeholder" aria-disabled="true">
        <span>Search becomes available after the first real import</span>
      </div>

      <div class="home-grid">
        <article class="panel">
          <p class="panel-kicker">Import status</p>
          <h2>${inspectionText}</h2>
          <a class="button primary" href="#/import">Inspect ChatGPT Export</a>
        </article>
        <article class="panel">
          <p class="panel-kicker">Dropbox</p>
          <h2>${dropboxConnected ? 'Connected' : 'Not connected'}</h2>
          <p>${dropboxConnected ? 'Safe inspection reports can be stored in the app folder.' : 'Optional for the first inspection. Connect it before the real importer phase.'}</p>
          <a class="button secondary" href="#/settings">${dropboxConnected ? 'Dropbox Settings' : 'Connect Dropbox'}</a>
        </article>
      </div>
    </section>
  `
}

export function renderImportPage({ dropboxConnected, progress = null, error = null, report = null }) {
  const progressHtml = progress
    ? `<div class="progress-card" role="status"><strong>${escapeHtml(progress.label)}</strong><span>${escapeHtml(progress.detail ?? '')}</span>${progress.percent == null ? '' : `<progress max="100" value="${progress.percent}"></progress>`}</div>`
    : ''
  const errorHtml = error ? `<div class="notice error" role="alert">${escapeHtml(error)}</div>` : ''

  return `
    <section class="page page-import">
      <header class="page-header compact">
        <p class="eyebrow">Import Inspector</p>
        <h1>Inspect a ChatGPT export</h1>
        <p class="lede">This first step does not import or save conversation text. It reads the ZIP directory and a bounded prefix of top-level JSON files only to identify filenames and field names.</p>
      </header>

      <div class="notice privacy">
        <strong>Private by design.</strong>
        <span>The local report may show filenames. The report you download or save to Dropbox removes attachment filenames and never includes message values.</span>
      </div>

      <div class="panel import-panel">
        <label class="file-picker" for="chatgpt-export">
          <span class="file-picker-title">ChatGPT export ZIP</span>
          <span id="file-picker-detail">Choose the official ZIP downloaded from ChatGPT.</span>
          <input id="chatgpt-export" type="file" accept=".zip,application/zip">
        </label>
        <div class="button-row">
          <button class="button primary" id="inspect-button" type="button" disabled>Inspect Export</button>
          <button class="button secondary" id="clear-import-button" type="button">Clear</button>
          ${report ? '' : '<button class="button secondary" type="button" disabled>Save Safe Report to Dropbox</button>'}
        </div>
      </div>

      ${progressHtml}
      ${errorHtml}
      <div id="inspection-results">${report ? renderInspectionReport(report, { dropboxConnected }) : ''}</div>
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
