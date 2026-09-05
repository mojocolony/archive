import { openArchiveDb } from './local/db.js'
import { inspectChatGptExport, sanitizeInspectionReport } from './import/inspector.js'
import { DropboxSession } from './dropbox/session.js'
import { DropboxArchiveRepository } from './dropbox/archiveRepository.js'
import { getCapabilityReport, runIndexedDbSelfTest } from './features/selfCheck.js'
import {
  makeInspectionId,
  progressFromInspectorEvent,
  routeFromHash,
  safeReportFilename,
  tokenIsUsable,
} from './appLogic.js'
import {
  formatBytes,
  renderAppShell,
  renderHomePage,
  renderImportPage,
  renderInspectionReport,
  renderSettingsPage,
} from './ui.js'

const VERSION = '0.1.1-inspector'
const root = document.getElementById('app')

const state = {
  currentFile: null,
  currentReport: null,
  indexedDbWriteOk: null,
  settingsMessage: null,
}

let db

async function getAppKey() {
  return (await db.get('settings', 'dropbox.appKey'))?.value?.trim() ?? ''
}

async function isDropboxConnected() {
  const token = await db.get('settings', 'dropbox.token')
  return tokenIsUsable(token)
}

function createDropboxSession(appKey) {
  return new DropboxSession({ db, appKey })
}

async function latestInspection() {
  const rows = await db.getAll('imports')
  return rows
    .filter(row => row.status === 'inspected' || row.status === 'report-saved')
    .sort((a, b) => String(b.inspectedAt).localeCompare(String(a.inspectedAt)))[0] ?? null
}

function updateImportProgress(progress) {
  let card = document.getElementById('live-import-progress')
  if (!card) {
    card = document.createElement('div')
    card.id = 'live-import-progress'
    card.className = 'progress-card'
    card.setAttribute('role', 'status')
    const results = document.getElementById('inspection-results')
    results?.parentNode?.insertBefore(card, results)
  }

  card.replaceChildren()
  const strong = document.createElement('strong')
  strong.textContent = progress.label
  const detail = document.createElement('span')
  detail.textContent = progress.detail ?? ''
  card.append(strong, detail)

  if (progress.percent != null) {
    const bar = document.createElement('progress')
    bar.max = 100
    bar.value = progress.percent
    card.append(bar)
  }
}

function showPageNotice(message, isError = false) {
  const page = document.querySelector('.page')
  if (!page) return
  document.getElementById('runtime-notice')?.remove()
  const notice = document.createElement('div')
  notice.id = 'runtime-notice'
  notice.className = `notice${isError ? ' error' : ''}`
  notice.setAttribute(isError ? 'role' : 'aria-live', isError ? 'alert' : 'polite')
  notice.textContent = message
  const header = page.querySelector('.page-header')
  header?.insertAdjacentElement('afterend', notice)
}

function downloadJson(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = safeReportFilename(report)
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

async function saveReportToDropbox(report) {
  const appKey = await getAppKey()
  if (!appKey) throw new Error('Dropbox App Key is not configured')
  const session = createDropboxSession(appKey)
  const repository = new DropboxArchiveRepository({
    getAccessToken: () => session.getAccessToken(),
  })
  const id = makeInspectionId(report)
  await repository.saveInspectionReport(id, report)

  await db.put('imports', {
    id,
    sourceFileName: report.sourceFileName,
    sourceFileSize: report.sourceFileSize,
    inspectedAt: report.inspectedAt,
    entryCount: report.entryCount,
    status: 'report-saved',
    reportPath: `/System/inspection/${id}.json`,
  })
}

function attachReportActions() {
  const report = state.currentReport
  if (!report) return

  document.getElementById('download-report-button')?.addEventListener('click', () => {
    downloadJson(report)
  })

  document.getElementById('save-report-button')?.addEventListener('click', async event => {
    const button = event.currentTarget
    button.disabled = true
    const originalText = button.textContent
    button.textContent = 'Saving…'
    try {
      await saveReportToDropbox(report)
      button.textContent = 'Saved to Dropbox'
      showPageNotice('Safe inspection report saved to Dropbox.')
    } catch (error) {
      button.disabled = false
      button.textContent = originalText
      showPageNotice(error instanceof Error ? error.message : String(error), true)
    }
  })
}

function attachImportHandlers(dropboxConnected) {
  const input = document.getElementById('chatgpt-export')
  const inspectButton = document.getElementById('inspect-button')
  const clearButton = document.getElementById('clear-import-button')
  const detail = document.getElementById('file-picker-detail')

  if (state.currentFile && input && inspectButton && detail) {
    detail.textContent = `${state.currentFile.name} · ${formatBytes(state.currentFile.size)}`
    inspectButton.disabled = false
  }

  input?.addEventListener('change', () => {
    state.currentFile = input.files?.[0] ?? null
    state.currentReport = null
    if (detail) {
      detail.textContent = state.currentFile
        ? `${state.currentFile.name} · ${formatBytes(state.currentFile.size)}`
        : 'Choose the official ZIP downloaded from ChatGPT.'
    }
    if (inspectButton) inspectButton.disabled = !state.currentFile
    document.getElementById('inspection-results')?.replaceChildren()
  })

  clearButton?.addEventListener('click', async () => {
    state.currentFile = null
    state.currentReport = null
    await render()
  })

  inspectButton?.addEventListener('click', async () => {
    if (!state.currentFile) return
    inspectButton.disabled = true
    inspectButton.textContent = 'Inspecting…'
    document.getElementById('inspection-results')?.replaceChildren()
    document.getElementById('live-import-progress')?.remove()

    try {
      const localReport = await inspectChatGptExport(state.currentFile, {
        onProgress(event) {
          updateImportProgress(progressFromInspectorEvent(event))
        },
      })
      const safeReport = sanitizeInspectionReport(localReport)
      state.currentReport = safeReport
      const id = makeInspectionId(safeReport)

      await db.put('imports', {
        id,
        sourceFileName: safeReport.sourceFileName,
        sourceFileSize: safeReport.sourceFileSize,
        inspectedAt: safeReport.inspectedAt,
        entryCount: safeReport.entryCount,
        status: 'inspected',
        reportPath: null,
      })

      document.getElementById('live-import-progress')?.remove()
      const results = document.getElementById('inspection-results')
      if (results) {
        results.innerHTML = renderInspectionReport(safeReport, { dropboxConnected })
      }
      attachReportActions()
      inspectButton.textContent = 'Inspect Again'
      inspectButton.disabled = false
    } catch (error) {
      document.getElementById('live-import-progress')?.remove()
      inspectButton.textContent = 'Inspect Export'
      inspectButton.disabled = false
      showPageNotice(error instanceof Error ? error.message : String(error), true)
    }
  })

  attachReportActions()
}

function attachSettingsHandlers(appKey, dropboxConnected) {
  const input = document.getElementById('dropbox-app-key')
  const saveButton = document.getElementById('save-dropbox-key')
  const connectButton = document.getElementById('connect-dropbox')
  const disconnectButton = document.getElementById('disconnect-dropbox')
  const selfCheckButton = document.getElementById('self-check-button')

  input?.addEventListener('input', () => {
    if (connectButton) connectButton.disabled = !input.value.trim()
  })

  saveButton?.addEventListener('click', async () => {
    const value = input?.value.trim() ?? ''
    if (value) {
      await db.put('settings', { key: 'dropbox.appKey', value })
      state.settingsMessage = 'Dropbox App Key saved locally.'
    } else {
      await db.delete('settings', 'dropbox.appKey')
      state.settingsMessage = 'Dropbox App Key removed.'
    }
    await render()
  })

  connectButton?.addEventListener('click', async () => {
    const value = input?.value.trim() || appKey
    if (!value) return
    await db.put('settings', { key: 'dropbox.appKey', value })
    const session = createDropboxSession(value)
    const redirectUri = `${location.origin}${location.pathname}`
    try {
      const url = await session.beginConnection({
        redirectUri,
        returnHash: '#/settings',
      })
      location.assign(url)
    } catch (error) {
      showPageNotice(error instanceof Error ? error.message : String(error), true)
    }
  })

  disconnectButton?.addEventListener('click', async () => {
    if (!dropboxConnected) return
    const session = createDropboxSession(appKey)
    await session.disconnect()
    state.settingsMessage = 'Dropbox disconnected. The public App Key remains saved.'
    await render()
  })

  selfCheckButton?.addEventListener('click', async () => {
    selfCheckButton.disabled = true
    selfCheckButton.textContent = 'Checking…'
    try {
      state.indexedDbWriteOk = await runIndexedDbSelfTest(db)
      state.settingsMessage = state.indexedDbWriteOk
        ? 'Local storage self check passed.'
        : 'Local storage self check failed.'
    } catch (error) {
      state.indexedDbWriteOk = false
      state.settingsMessage = error instanceof Error ? error.message : String(error)
    }
    await render()
  })
}

async function render() {
  const route = routeFromHash(location.hash)
  const [appKey, dropboxConnected, lastInspection] = await Promise.all([
    getAppKey(),
    isDropboxConnected(),
    latestInspection(),
  ])

  let content
  if (route === 'import') {
    content = renderImportPage({
      dropboxConnected,
      report: state.currentReport,
    })
  } else if (route === 'settings') {
    content = renderSettingsPage({
      capabilities: getCapabilityReport(),
      indexedDbWriteOk: state.indexedDbWriteOk,
      appKey,
      dropboxConnected,
      message: state.settingsMessage,
    })
    state.settingsMessage = null
  } else {
    content = renderHomePage({ lastInspection, dropboxConnected })
  }

  root.innerHTML = renderAppShell({ route, content, version: VERSION })

  if (route === 'import') attachImportHandlers(dropboxConnected)
  if (route === 'settings') attachSettingsHandlers(appKey, dropboxConnected)
}

async function completeDropboxCallbackIfPresent() {
  const params = new URLSearchParams(location.search)
  if (!params.has('code') && !params.has('error') && !params.has('error_description')) return

  const appKey = await getAppKey()
  if (!appKey) throw new Error('Dropbox returned to Archive, but no App Key is saved locally')

  const session = createDropboxSession(appKey)
  const result = await session.finishCallback(location.href)
  state.settingsMessage = 'Dropbox connected.'
  history.replaceState(null, '', `${location.pathname}${result.returnHash}`)
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !isSecureContext) return
  try {
    await navigator.serviceWorker.register('./sw.js')
  } catch (error) {
    console.warn('Archive service worker registration failed', error)
  }
}

async function start() {
  try {
    db = await openArchiveDb()
    await completeDropboxCallbackIfPresent()
    await registerServiceWorker()
    addEventListener('hashchange', () => render().catch(console.error))
    await render()
  } catch (error) {
    root.innerHTML = `
      <main class="fatal-error">
        <h1>Archive could not start</h1>
        <p>${String(error instanceof Error ? error.message : error).replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>
        <p>Use a current Chrome or Safari browser in a normal secure tab.</p>
      </main>
    `
  }
}

start()
