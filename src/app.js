import { openArchiveDb } from './local/db.js'
import { parseChatGptExport } from './import/exportParser.js'
import { buildImportPreview } from './import/importMerge.js'
import { commitParsedExport } from './import/importService.js'
import { DropboxSession } from './dropbox/session.js'
import { DropboxArchiveRepository } from './dropbox/archiveRepository.js'
import { getCapabilityReport, runIndexedDbSelfTest } from './features/selfCheck.js'
import { buildLocalSearchIndex, getLocalSearchStatus } from './search/indexService.js'
import { searchDocuments } from './search/searchIndex.js'
import { loadOrganizationMetadata, updateConversationOrganization, normalizeTags } from './organization/metadataService.js'
import {
  makeImportId,
  progressFromCommitEvent,
  progressFromParseEvent,
  progressFromSearchIndexEvent,
  parseAppRoute,
  tokenIsUsable,
} from './appLogic.js'
import {
  formatBytes,
  renderAppShell,
  renderHomePage,
  renderImportPage,
  renderImportPreview,
  renderSettingsPage,
  renderConversationListPage,
  renderConversationPage,
  renderTagsPage,
} from './ui.js'

const VERSION = '0.3.1'
const root = document.getElementById('app')

const state = {
  currentFile: null,
  parsedExport: null,
  importPreview: null,
  previousIndex: null,
  importResult: null,
  indexedDbWriteOk: null,
  settingsMessage: null,
  searchQuery: '',
  organizationLoaded: false,
  organizationError: null,
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

async function localArchiveIndex(lastImport = null) {
  const rows = await db.getAll('archiveIndex')
  return {
    archiveIndexVersion: 1,
    updatedAt: lastImport?.importedAt ?? null,
    lastImportId: lastImport?.id ?? null,
    sourceExportName: lastImport?.sourceFileName ?? null,
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

function updateSearchProgress(progress) {
  let card = document.getElementById('live-search-progress')
  if (!card) {
    card = document.createElement('div')
    card.id = 'live-search-progress'
    card.className = 'progress-card search-progress-card'
    card.setAttribute('role', 'status')
    const anchor = document.getElementById('search-index-progress-anchor')
    anchor?.insertAdjacentElement('afterend', card)
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

async function ensureOrganizationMetadata(dropboxConnected) {
  if (!dropboxConnected || state.organizationLoaded) return
  try {
    const repository = await createDropboxRepository()
    await loadOrganizationMetadata({ repository, db })
    state.organizationLoaded = true
    state.organizationError = null
  } catch (error) {
    state.organizationError = error instanceof Error ? error.message : String(error)
  }
}

async function updateOrganization(conversationId, patch) {
  if (!await isDropboxConnected()) throw new Error('Connect Dropbox before changing stars or tags')
  const repository = await createDropboxRepository()
  return updateConversationOrganization({ conversationId, patch, repository, db })
}

async function finishOptimisticOrganizationUpdate(result) {
  const syncOutcome = result.syncPromise.then(
    () => null,
    error => error instanceof Error ? error : new Error(String(error)),
  )
  await render()
  syncOutcome.then(error => {
    if (error) showPageNotice(`Saved locally, but Dropbox sync failed: ${error.message}`, true)
  })
}

function attachOrganizationHandlers() {
  for (const button of document.querySelectorAll('[data-star-conversation]')) {
    button.addEventListener('click', async event => {
      event.preventDefault()
      event.stopPropagation()
      button.disabled = true
      try {
        const result = await updateOrganization(button.dataset.starConversation, { starred: button.dataset.starred !== 'true' })
        await finishOptimisticOrganizationUpdate(result)
      } catch (error) {
        button.disabled = false
        showPageNotice(error instanceof Error ? error.message : String(error), true)
      }
    })
  }

  const form = document.getElementById('add-tag-form')
  form?.addEventListener('submit', async event => {
    event.preventDefault()
    const input = document.getElementById('new-tag')
    const tag = input?.value.trim() ?? ''
    if (!tag) return
    const route = parseAppRoute(location.hash)
    if (route.name !== 'conversation') return
    const current = await db.get('metadata', route.conversationId)
    try {
      const result = await updateOrganization(route.conversationId, { tags: normalizeTags([...(current?.tags ?? []), tag]) })
      await finishOptimisticOrganizationUpdate(result)
    } catch (error) {
      showPageNotice(error instanceof Error ? error.message : String(error), true)
    }
  })

  for (const button of document.querySelectorAll('[data-remove-tag]')) {
    button.addEventListener('click', async () => {
      const route = parseAppRoute(location.hash)
      if (route.name !== 'conversation') return
      const current = await db.get('metadata', route.conversationId)
      const removeKey = String(button.dataset.removeTag ?? '').toLocaleLowerCase()
      const tags = (current?.tags ?? []).filter(tag => tag.toLocaleLowerCase() !== removeKey)
      button.disabled = true
      try {
        const result = await updateOrganization(route.conversationId, { tags })
        await finishOptimisticOrganizationUpdate(result)
      } catch (error) {
        button.disabled = false
        showPageNotice(error instanceof Error ? error.message : String(error), true)
      }
    })
  }
}

function attachHomeHandlers({ dropboxConnected, archiveIndex }) {
  const searchForm = document.getElementById('archive-search-form')
  const searchInput = document.getElementById('archive-search')
  searchForm?.addEventListener('submit', event => {
    event.preventDefault()
    state.searchQuery = searchInput?.value.trim() ?? ''
    render().catch(console.error)
  })

  for (const id of ['build-search-index', 'rebuild-search-index']) {
    const button = document.getElementById(id)
    button?.addEventListener('click', async () => {
      if (!dropboxConnected || !Object.keys(archiveIndex?.conversations ?? {}).length) return
      button.disabled = true
      button.textContent = id === 'rebuild-search-index' ? 'Rebuilding…' : 'Building…'
      document.getElementById('live-search-progress')?.remove()

      try {
        const repository = await createDropboxRepository()
        await buildLocalSearchIndex({
          archiveIndex,
          repository,
          db,
          onProgress(event) {
            updateSearchProgress(progressFromSearchIndexEvent(event))
          },
        })
        state.searchQuery = ''
        document.getElementById('live-search-progress')?.remove()
        await render()
        showPageNotice('Local search index is ready on this device.')
      } catch (error) {
        document.getElementById('live-search-progress')?.remove()
        await render()
        showPageNotice(error instanceof Error ? error.message : String(error), true)
      }
    })
  }
}

function attachConversationHandlers(routeInfo) {
  if (!routeInfo?.messageId) return
  requestAnimationFrame(() => {
    document.getElementById(`message-${routeInfo.messageId}`)?.scrollIntoView({ block: 'center' })
  })
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
    state.organizationLoaded = false
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
  const routeInfo = parseAppRoute(location.hash)
  const [appKey, dropboxConnected, lastImport] = await Promise.all([
    getAppKey(),
    isDropboxConnected(),
    latestImportActivity(),
  ])
  const archiveIndex = await localArchiveIndex(lastImport)
  await ensureOrganizationMetadata(dropboxConnected)
  const searchStatus = await getLocalSearchStatus({ archiveIndex, db })

  let content
  if (routeInfo.name === 'import') {
    content = renderImportPage({
      dropboxConnected,
      parsedExport: state.parsedExport,
      preview: state.importPreview,
      importResult: state.importResult,
    })
  } else if (routeInfo.name === 'settings') {
    content = renderSettingsPage({
      capabilities: getCapabilityReport(),
      indexedDbWriteOk: state.indexedDbWriteOk,
      appKey,
      dropboxConnected,
      message: state.settingsMessage,
    })
    state.settingsMessage = null
  } else if (routeInfo.name === 'conversations') {
    const documents = await db.getAll('searchDocuments')
    content = renderConversationListPage({ documents, searchStatus })
  } else if (routeInfo.name === 'starred') {
    const documents = (await db.getAll('searchDocuments')).filter(document => document.starred)
    content = renderConversationListPage({ documents, searchStatus, title: 'Starred', eyebrow: 'Organization', emptyText: 'No Archive-starred conversations yet.' })
  } else if (routeInfo.name === 'tags') {
    const documents = await db.getAll('searchDocuments')
    if (routeInfo.tag) {
      const key = routeInfo.tag.toLocaleLowerCase()
      const tagged = documents.filter(document => (document.tags ?? []).some(tag => String(tag).toLocaleLowerCase() === key))
      content = renderConversationListPage({ documents: tagged, searchStatus, title: routeInfo.tag, eyebrow: 'Tag', emptyText: `No conversations tagged ${routeInfo.tag}.` })
    } else {
      content = renderTagsPage({ documents })
    }
  } else if (routeInfo.name === 'conversation') {
    const document = await db.get('searchDocuments', routeInfo.conversationId)
    content = renderConversationPage({
      document,
      query: routeInfo.query,
      messageId: routeInfo.messageId,
    })
  } else {
    const documents = searchStatus.state === 'current' ? await db.getAll('searchDocuments') : []
    const searchResults = searchStatus.state === 'current' && state.searchQuery
      ? searchDocuments(documents, state.searchQuery)
      : []
    content = renderHomePage({
      lastInspection: lastImport,
      dropboxConnected,
      searchStatus,
      searchQuery: state.searchQuery,
      searchResults,
    })
  }

  root.innerHTML = renderAppShell({ route: routeInfo.name, content, version: VERSION })

  if (routeInfo.name === 'home') attachHomeHandlers({ dropboxConnected, archiveIndex })
  if (routeInfo.name === 'import') attachImportHandlers(dropboxConnected)
  if (routeInfo.name === 'settings') attachSettingsHandlers(appKey, dropboxConnected)
  if (routeInfo.name === 'conversation') attachConversationHandlers(routeInfo)
  if (['home', 'conversations', 'starred', 'tags', 'conversation'].includes(routeInfo.name)) attachOrganizationHandlers()
  if (state.organizationError) showPageNotice(`Archive organization metadata could not sync: ${state.organizationError}`, true)
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
