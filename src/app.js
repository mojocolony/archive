import { openArchiveDb } from './local/db.js'
import { parseChatGptExport } from './import/exportParser.js'
import { buildImportPreview } from './import/importMerge.js'
import { commitParsedExport } from './import/importService.js'
import { DropboxSession } from './dropbox/session.js'
import { DropboxArchiveRepository } from './dropbox/archiveRepository.js'
import { getCapabilityReport, runIndexedDbSelfTest } from './features/selfCheck.js'
import {
  makeImportId,
  progressFromCommitEvent,
  progressFromParseEvent,
  routeFromHash,
  tokenIsUsable,
} from './appLogic.js'
import {
  formatBytes,
  renderAppShell,
  renderHomePage,
  renderImportPage,
  renderImportPreview,
  renderSettingsPage,
} from './ui.js'

const VERSION = '0.2.2'
const root = document.getElementById('app')

const state = {
  currentFile: null,
  parsedExport: null,
  importPreview: null,
  previousIndex: null,
  importResult: null,
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

async function createDropboxRepository() {
  const appKey = await getAppKey()
  if (!appKey) throw new Error('Dropbox App Key is not configured')
  const session = createDropboxSession(appKey)
  return new DropboxArchiveRepository({
    getAccessToken: () => session.getAccessToken(),
  })
}

async function latestImportActivity() {
  const rows = await db.getAll('imports')
  return rows
    .sort((a, b) => String(b.importedAt ?? b.inspectedAt ?? '').localeCompare(String(a.importedAt ?? a.inspectedAt ?? '')))[0] ?? null
}

async function localArchiveIndex() {
  const rows = await db.getAll('archiveIndex')
  return {
    archiveIndexVersion: 1,
    conversations: Object.fromEntries(rows.map(row => [row.conversationId, row])),
  }
}

function updateImportProgress(progress) {
  let card = document.getElementById('live-import-progress')
  if (!card) {
    card = document.createElement('div')
    card.id = 'live-import-progress'
    card.className = 'progress-card'
    card.setAttribute('role', 'status')
    const results = document.getElementById('import-results')
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

function renderCurrentPreview(dropboxConnected) {
  const results = document.getElementById('import-results')
  if (!results || !state.parsedExport || !state.importPreview) return
  results.innerHTML = renderImportPreview({
    parsedExport: state.parsedExport,
    preview: state.importPreview,
    dropboxConnected,
    importResult: state.importResult,
  })
  attachPreviewHandlers(dropboxConnected)
}

function attachPreviewHandlers(dropboxConnected) {
  const importButton = document.getElementById('import-to-dropbox')
  const anomalyCheckbox = document.getElementById('confirm-anomaly')

  anomalyCheckbox?.addEventListener('change', () => {
    if (importButton) importButton.disabled = !dropboxConnected || !anomalyCheckbox.checked
  })

  importButton?.addEventListener('click', async () => {
    if (!dropboxConnected || !state.parsedExport || !state.importPreview || !state.previousIndex) return
    importButton.disabled = true
    importButton.textContent = 'Importing…'
    document.getElementById('live-import-progress')?.remove()

    try {
      const repository = await createDropboxRepository()
      const result = await commitParsedExport({
        parsedExport: state.parsedExport,
        previousIndex: state.previousIndex,
        preview: state.importPreview,
        repository,
        db,
        importId: makeImportId(state.parsedExport),
        allowAnomaly: Boolean(anomalyCheckbox?.checked),
        onProgress(event) {
          updateImportProgress(progressFromCommitEvent(event))
        },
      })
      state.importResult = result
      state.previousIndex = result.index
      document.getElementById('live-import-progress')?.remove()
      renderCurrentPreview(true)
      showPageNotice('Archive import committed to Dropbox.')
    } catch (error) {
      document.getElementById('live-import-progress')?.remove()
      importButton.disabled = false
      importButton.textContent = 'Import Conversations to Dropbox'
      showPageNotice(error instanceof Error ? error.message : String(error), true)
    }
  })
}

function resetImportState({ keepFile = false } = {}) {
  if (!keepFile) state.currentFile = null
  state.parsedExport = null
  state.importPreview = null
  state.previousIndex = null
  state.importResult = null
}

function attachImportHandlers(dropboxConnected) {
  const input = document.getElementById('chatgpt-export')
  const analyzeButton = document.getElementById('analyze-button')
  const clearButton = document.getElementById('clear-import-button')
  const detail = document.getElementById('file-picker-detail')

  if (state.currentFile && analyzeButton && detail) {
    detail.textContent = `${state.currentFile.name} · ${formatBytes(state.currentFile.size)}`
    analyzeButton.disabled = false
  }

  input?.addEventListener('change', () => {
    state.currentFile = input.files?.[0] ?? null
    resetImportState({ keepFile: true })
    if (detail) {
      detail.textContent = state.currentFile
        ? `${state.currentFile.name} · ${formatBytes(state.currentFile.size)}`
        : 'Choose the official ZIP downloaded from ChatGPT.'
    }
    if (analyzeButton) analyzeButton.disabled = !state.currentFile
    document.getElementById('import-results')?.replaceChildren()
  })

  clearButton?.addEventListener('click', async () => {
    resetImportState()
    await render()
  })

  analyzeButton?.addEventListener('click', async () => {
    if (!state.currentFile) return
    analyzeButton.disabled = true
    analyzeButton.textContent = 'Analyzing…'
    state.parsedExport = null
    state.importPreview = null
    state.previousIndex = null
    state.importResult = null
    document.getElementById('import-results')?.replaceChildren()
    document.getElementById('live-import-progress')?.remove()

    try {
      const parsedExport = await parseChatGptExport(state.currentFile, {
        onProgress(event) {
          updateImportProgress(progressFromParseEvent(event))
        },
      })

      let previousIndex
      if (dropboxConnected) {
        const repository = await createDropboxRepository()
        previousIndex = await repository.getArchiveIndex()
      } else {
        previousIndex = await localArchiveIndex()
      }

      state.parsedExport = parsedExport
      state.previousIndex = previousIndex
      state.importPreview = buildImportPreview(parsedExport, previousIndex)

      document.getElementById('live-import-progress')?.remove()
      renderCurrentPreview(dropboxConnected)
      analyzeButton.textContent = 'Analyze Again'
      analyzeButton.disabled = false
    } catch (error) {
      document.getElementById('live-import-progress')?.remove()
      analyzeButton.textContent = 'Analyze Export'
      analyzeButton.disabled = false
      showPageNotice(error instanceof Error ? error.message : String(error), true)
    }
  })

  attachPreviewHandlers(dropboxConnected)
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
  const [appKey, dropboxConnected, lastImport] = await Promise.all([
    getAppKey(),
    isDropboxConnected(),
    latestImportActivity(),
  ])

  let content
  if (route === 'import') {
    content = renderImportPage({
      dropboxConnected,
      parsedExport: state.parsedExport,
      preview: state.importPreview,
      importResult: state.importResult,
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
    content = renderHomePage({ lastInspection: lastImport, dropboxConnected })
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
    const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    await registration.update()
  } catch (error) {
    console.warn('Archive service worker registration failed', error)
  }
}

async function start() {
  try {
    await registerServiceWorker()
    db = await openArchiveDb()
    await completeDropboxCallbackIfPresent()
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
