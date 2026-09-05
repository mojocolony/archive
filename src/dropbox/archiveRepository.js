async function readJsonSafe(response) {
  return response.json().catch(() => ({}))
}

function safeSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]/g, '_')
}

export class DropboxArchiveRepository {
  constructor({ getAccessToken, fetchImpl = fetch }) {
    this.getAccessToken = getAccessToken
    this.fetchImpl = fetchImpl.bind(globalThis)
  }

  async ensureFolder(path) {
    const accessToken = await this.getAccessToken()
    const response = await this.fetchImpl(
      'https://api.dropboxapi.com/2/files/create_folder_v2',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
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
    const accessToken = await this.getAccessToken()
    const response = await this.fetchImpl('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
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
    const accessToken = await this.getAccessToken()
    const response = await this.fetchImpl('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
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

  async getArchiveIndex() {
    const index = await this.downloadJson('/System/archive-index.json', { allowNotFound: true })
    return index ?? { archiveIndexVersion: 1, conversations: {} }
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
