async function readJsonSafe(response) {
  return response.json().catch(() => ({}))
}

function safeSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, '_')
}

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isTransientStatus(status) {
  return status === 429 || (status >= 500 && status <= 599)
}

// Dropbox may return Retry-After either as seconds or as an HTTP date.
export function parseRetryAfterMs(value, nowMs = Date.now()) {
  if (value == null || String(value).trim() === '') return null
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000)
  const date = Date.parse(String(value))
  return Number.isFinite(date) ? Math.max(0, date - nowMs) : null
}

async function serverRetryDelayMs(response, nowMs) {
  const fromHeader = parseRetryAfterMs(response.headers?.get('Retry-After'), nowMs)
  if (fromHeader !== null) return fromHeader

  // Dropbox can put retry_after in a 429 JSON body instead of a header.
  // Clone so the final response remains readable if all retries fail.
  if (response.status !== 429) return null
  const payload = await readJsonSafe(response.clone())
  return parseRetryAfterMs(payload?.error?.retry_after ?? payload?.retry_after, nowMs)
}

function entryPath(entry) {
  return entry?.path_display ?? entry?.path_lower ?? ''
}

function basenameWithoutExtension(path, extension) {
  const name = String(path).split('/').pop() ?? ''
  return name.endsWith(extension) ? name.slice(0, -extension.length) : null
}

export class DropboxArchiveRepository {
  constructor({
    getAccessToken,
    fetchImpl = fetch,
    requestTimeoutMs = 45_000,
    retryDelaysMs = [2_000, 4_000, 8_000, 16_000, 30_000, 60_000, 120_000, 180_000],
    minRequestIntervalMs = 0,
    sleepImpl = defaultSleep,
    nowMs = () => Date.now(),
    onRetry = () => {},
  }) {
    this.getAccessToken = getAccessToken
    this.fetchImpl = fetchImpl.bind(globalThis)
    this.requestTimeoutMs = requestTimeoutMs
    this.retryDelaysMs = retryDelaysMs
    this.minRequestIntervalMs = Math.max(0, minRequestIntervalMs)
    this.sleepImpl = sleepImpl
    this.nowMs = nowMs
    this.onRetry = onRetry
    this.requestsStarted = 0
    this.paceTail = Promise.resolve()
  }

  async paceRequest() {
    if (this.minRequestIntervalMs <= 0) return
    // Serialize start-time pacing across all operations sharing this repository.
    const preceding = this.paceTail
    let release
    this.paceTail = new Promise(resolve => { release = resolve })
    await preceding
    try {
      if (this.requestsStarted > 0) await this.sleepImpl(this.minRequestIntervalMs)
      this.requestsStarted += 1
    } finally {
      release()
    }
  }

  async request(url, options = {}) {
    const attempts = this.retryDelaysMs.length + 1

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await this.paceRequest()
      const accessToken = await this.getAccessToken()
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs)

      try {
        const response = await this.fetchImpl(url, {
          ...options,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(options.headers ?? {}),
          },
          signal: controller.signal,
        })

        if (isTransientStatus(response.status) && attempt < attempts - 1) {
          clearTimeout(timeoutId)
          const serverDelay = await serverRetryDelayMs(response, this.nowMs())
          // Even a server-requested wait of zero should not cause a hot retry loop.
          const delayMs = Math.max(this.retryDelaysMs[attempt], serverDelay ?? 0)
          this.onRetry({ status: response.status, attempt: attempt + 1, maxAttempts: attempts, delayMs })
          await this.sleepImpl(delayMs)
          continue
        }

        return response
      } catch (error) {
        const timedOut = controller.signal.aborted || error?.name === 'AbortError'
        const retryable = timedOut || error instanceof TypeError

        if (retryable && attempt < attempts - 1) {
          clearTimeout(timeoutId)
          const delayMs = this.retryDelaysMs[attempt]
          this.onRetry({ status: timedOut ? 'timeout' : 'network', attempt: attempt + 1, maxAttempts: attempts, delayMs })
          await this.sleepImpl(delayMs)
          continue
        }

        if (timedOut) {
          throw new Error(`Dropbox request timed out after ${Math.round(this.requestTimeoutMs / 1000)} seconds`)
        }
        throw error
      } finally {
        clearTimeout(timeoutId)
      }
    }

    throw new Error('Dropbox request failed after retries')
  }

  async ensureFolder(path) {
    const response = await this.request(
      'https://api.dropboxapi.com/2/files/create_folder_v2',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path, autorename: false }),
      },
    )

    if (response.ok) return
    const payload = await readJsonSafe(response)
    if (
      response.status === 409 &&
      String(payload.error_summary ?? '').startsWith('path/conflict/folder/')
    ) {
      return
    }
    throw new Error(
      payload.error_summary || `Dropbox folder creation failed (${response.status})`,
    )
  }

  async ensureArchiveStructure() {
    for (const path of [
      '/Archive',
      '/Archive/Conversations',
      '/Archive/Markdown',
      '/Archive/Attachments',
      '/System',
    ]) {
      await this.ensureFolder(path)
    }
  }

  async uploadText(path, text) {
    const response = await this.request('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        'Dropbox-API-Arg': JSON.stringify({
          path,
          mode: 'overwrite',
          autorename: false,
          mute: true,
        }),
        'content-type': 'application/octet-stream',
      },
      body: text,
    })

    if (!response.ok) {
      const payload = await readJsonSafe(response)
      throw new Error(
        payload.error_summary || `Dropbox upload failed (${response.status})`,
      )
    }
  }

  async uploadJson(path, value) {
    await this.uploadText(path, JSON.stringify(value, null, 2))
  }

  async downloadJson(path, { allowNotFound = false } = {}) {
    const response = await this.request('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        'Dropbox-API-Arg': JSON.stringify({ path }),
      },
    })

    if (!response.ok) {
      const payload = await readJsonSafe(response)
      const summary = String(payload.error_summary ?? '')
      if (allowNotFound && response.status === 409 && summary.startsWith('path/not_found/')) {
        return null
      }
      throw new Error(summary || `Dropbox download failed (${response.status})`)
    }

    const text = await response.text()
    try {
      return JSON.parse(text)
    } catch (error) {
      throw new Error(`Dropbox file is not valid JSON: ${path}`)
    }
  }

  async listFolderPaths(path) {
    const paths = []
    let response = await this.request('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, recursive: false, include_deleted: false }),
    })

    while (true) {
      if (!response.ok) {
        const payload = await readJsonSafe(response)
        throw new Error(payload.error_summary || `Dropbox folder listing failed (${response.status})`)
      }

      const payload = await readJsonSafe(response)
      for (const entry of payload.entries ?? []) {
        if (entry?.['.tag'] === 'file') paths.push(entryPath(entry))
      }

      if (!payload.has_more) break
      response = await this.request('https://api.dropboxapi.com/2/files/list_folder/continue', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cursor: payload.cursor }),
      })
    }

    return paths
  }

  async getExistingConversationVersions() {
    const [jsonPaths, markdownPaths] = await Promise.all([
      this.listFolderPaths('/Archive/Conversations'),
      this.listFolderPaths('/Archive/Markdown'),
    ])

    const jsonVersions = new Set(
      jsonPaths.map(path => basenameWithoutExtension(path, '.json')).filter(Boolean),
    )
    const markdownVersions = new Set(
      markdownPaths.map(path => basenameWithoutExtension(path, '.md')).filter(Boolean),
    )

    return new Set([...jsonVersions].filter(version => markdownVersions.has(version)))
  }

  async getArchiveIndex() {
    const index = await this.downloadJson('/System/archive-index.json', { allowNotFound: true })
    return index ?? { archiveIndexVersion: 1, conversations: {} }
  }

  async getConversationMetadataIndex() {
    const index = await this.downloadJson('/System/conversation-metadata.json', { allowNotFound: true })
    return index ?? { metadataVersion: 1, updatedAt: null, conversations: {} }
  }

  async saveConversationMetadataIndex(index) {
    await this.ensureFolder('/System')
    await this.uploadJson('/System/conversation-metadata.json', index)
  }

  async getConversationSource(path) {
    if (!path) throw new Error('Conversation source path is required')
    return this.downloadJson(path)
  }

  async saveInspectionReport(importId, report) {
    await this.ensureFolder('/System')
    await this.ensureFolder('/System/inspection')
    await this.uploadJson(`/System/inspection/${importId}.json`, report)
  }

  async saveConversationVersion(conversation) {
    const conversationId = safeSegment(conversation.conversationId)
    const fingerprint = safeSegment(conversation.fingerprint)
    await this.uploadJson(
      `/Archive/Conversations/${conversationId}--${fingerprint}.json`,
      conversation.source,
    )
    await this.uploadText(
      `/Archive/Markdown/${conversationId}--${fingerprint}.md`,
      conversation.markdown,
    )
  }

  async saveAttachmentMetadata(value) {
    await this.ensureFolder('/Archive')
    await this.ensureFolder('/Archive/Attachments')
    await this.uploadJson('/Archive/Attachments/index.json', value)
  }

  async saveArchiveIndex(index) {
    await this.ensureFolder('/System')
    await this.uploadJson('/System/archive-index.json', index)
  }
}
