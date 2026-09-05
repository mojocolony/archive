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
  return status === 429 || status >= 500
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
    retryDelaysMs = [1_000, 3_000],
    sleepImpl = defaultSleep,
  }) {
    this.getAccessToken = getAccessToken
    this.fetchImpl = fetchImpl.bind(globalThis)
    this.requestTimeoutMs = requestTimeoutMs
    this.retryDelaysMs = retryDelaysMs
    this.sleepImpl = sleepImpl
  }

  async request(url, options = {}) {
    const attempts = this.retryDelaysMs.length + 1

    for (let attempt = 0; attempt < attempts; attempt += 1) {
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
          await this.sleepImpl(this.retryDelaysMs[attempt])
          continue
        }

        return response
      } catch (error) {
        const timedOut = controller.signal.aborted || error?.name === 'AbortError'
        const retryable = timedOut || error instanceof TypeError

        if (retryable && attempt < attempts - 1) {
          clearTimeout(timeoutId)
          await this.sleepImpl(this.retryDelaysMs[attempt])
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
