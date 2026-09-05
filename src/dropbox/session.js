import {
  buildAuthorizationUrl,
  createPkceChallenge,
  exchangeAuthorizationCode,
  generateCodeVerifier,
  validateOAuthState,
} from './auth.js'

function defaultState() {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

export class DropboxSession {
  constructor({
    db,
    appKey,
    generateVerifier = generateCodeVerifier,
    generateState = defaultState,
    challengeFn = createPkceChallenge,
    exchangeFn = exchangeAuthorizationCode,
    nowMs = () => Date.now(),
  }) {
    this.db = db
    this.appKey = appKey
    this.generateVerifier = generateVerifier
    this.generateState = generateState
    this.challengeFn = challengeFn
    this.exchangeFn = exchangeFn
    this.nowMs = nowMs
  }

  assertConfigured() {
    if (!this.appKey?.trim()) throw new Error('Dropbox app key is not configured')
  }

  async beginConnection({ redirectUri, returnHash = '#/settings' }) {
    this.assertConfigured()
    const verifier = this.generateVerifier()
    const state = this.generateState()
    const codeChallenge = await this.challengeFn(verifier)

    await this.db.put('settings', {
      key: 'dropbox.oauth.pending',
      verifier,
      state,
      redirectUri,
      returnHash,
    })

    return buildAuthorizationUrl({
      appKey: this.appKey,
      redirectUri,
      state,
      codeChallenge,
    })
  }

  async finishCallback(callbackUrl) {
    this.assertConfigured()
    const pending = await this.db.get('settings', 'dropbox.oauth.pending')
    if (!pending) throw new Error('No pending Dropbox connection was found')

    const url = new URL(callbackUrl)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const errorDescription = url.searchParams.get('error_description')
    const error = url.searchParams.get('error')

    if (error || errorDescription) throw new Error(errorDescription || error)
    if (!code) throw new Error('Dropbox callback is missing an authorization code')
    if (!validateOAuthState(state, pending.state)) {
      throw new Error('Dropbox OAuth state mismatch')
    }

    const token = await this.exchangeFn({
      appKey: this.appKey,
      code,
      codeVerifier: pending.verifier,
      redirectUri: pending.redirectUri,
    })

    await this.db.put('settings', {
      key: 'dropbox.token',
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      accountId: token.accountId,
    })
    await this.db.delete('settings', 'dropbox.oauth.pending')

    return { returnHash: pending.returnHash || '#/settings' }
  }

  async disconnect() {
    await this.db.delete('settings', 'dropbox.token')
    await this.db.delete('settings', 'dropbox.oauth.pending')
  }

  async getAccessToken() {
    this.assertConfigured()
    const token = await this.db.get('settings', 'dropbox.token')
    if (!token?.accessToken) throw new Error('Dropbox is not connected')

    const refreshThreshold = this.nowMs() + 60_000
    if (!token.expiresAt || token.expiresAt > refreshThreshold) return token.accessToken
    throw new Error('Dropbox access token expired; reconnect Dropbox in Settings')

  }
}
