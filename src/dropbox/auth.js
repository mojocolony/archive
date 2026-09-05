function base64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function generateCodeVerifier() {
  const bytes = new Uint8Array(48)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

export async function createPkceChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(new Uint8Array(digest))
}

export function validateOAuthState(returnedState, expectedState) {
  return Boolean(returnedState && expectedState && returnedState === expectedState)
}

export function buildAuthorizationUrl({ appKey, redirectUri, state, codeChallenge }) {
  const url = new URL('https://www.dropbox.com/oauth2/authorize')
  url.searchParams.set('client_id', appKey)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('state', state)
  url.searchParams.set('redirect_uri', redirectUri)
  return url.toString()
}

async function tokenRequest(params, fetchImpl) {
  const response = await fetchImpl('https://api.dropboxapi.com/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = payload.error_description || payload.error || `Dropbox token request failed (${response.status})`
    throw new Error(String(message))
  }
  return payload
}

export async function exchangeAuthorizationCode({
  appKey,
  code,
  codeVerifier,
  redirectUri,
  fetchImpl = fetch,
  nowMs = Date.now(),
}) {
  const payload = await tokenRequest({
    code,
    grant_type: 'authorization_code',
    client_id: appKey,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  }, fetchImpl)

  return {
    accessToken: payload.access_token,
    expiresAt: payload.expires_in ? nowMs + payload.expires_in * 1000 : null,
    accountId: payload.account_id ?? null,
  }
}
