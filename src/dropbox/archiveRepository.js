async function readJsonSafe(response) {
  return response.json().catch(() => ({}))
}

export class DropboxArchiveRepository {
  constructor({ getAccessToken, fetchImpl = fetch }) {
    this.getAccessToken = getAccessToken
    this.fetchImpl = fetchImpl
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

  async uploadJson(path, value) {
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
      body: JSON.stringify(value, null, 2),
    })

    if (!response.ok) {
      const payload = await readJsonSafe(response)
      throw new Error(
        payload.error_summary || `Dropbox upload failed (${response.status})`,
      )
    }
  }

  async saveInspectionReport(importId, report) {
    await this.ensureFolder('/System')
    await this.ensureFolder('/System/inspection')
    await this.uploadJson(`/System/inspection/${importId}.json`, report)
  }
}
