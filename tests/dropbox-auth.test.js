import test from 'node:test'
import assert from 'node:assert/strict'
import {
  generateCodeVerifier,
  createPkceChallenge,
  buildAuthorizationUrl,
  validateOAuthState,
  exchangeAuthorizationCode,
} from '../src/dropbox/auth.js'


test('generates a PKCE verifier using URL-safe characters', () => {
  const verifier = generateCodeVerifier()
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/)
})

test('creates the RFC 7636 S256 challenge', async () => {
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  assert.equal(
    await createPkceChallenge(verifier),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  )
})

test('builds Dropbox authorization URL for short-lived code flow with PKCE', () => {
  const url = new URL(buildAuthorizationUrl({
    appKey: 'public-key',
    redirectUri: 'https://example.test/archive/',
    state: 'state-123',
    codeChallenge: 'challenge-123',
  }))
  assert.equal(url.origin + url.pathname, 'https://www.dropbox.com/oauth2/authorize')
  assert.equal(url.searchParams.get('client_id'), 'public-key')
  assert.equal(url.searchParams.get('response_type'), 'code')
  assert.equal(url.searchParams.get('token_access_type'), null)
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256')
  assert.equal(url.searchParams.get('code_challenge'), 'challenge-123')
  assert.equal(url.searchParams.get('state'), 'state-123')
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.test/archive/')
})

test('validates OAuth state exactly', () => {
  assert.equal(validateOAuthState('abc', 'abc'), true)
  assert.equal(validateOAuthState('abc', 'def'), false)
  assert.equal(validateOAuthState(null, 'abc'), false)
})

test('exchanges authorization code without an app secret', async () => {
  let captured
  const fakeFetch = async (url, options) => {
    captured = { url, options }
    return new Response(JSON.stringify({
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 14400,
      account_id: 'dbid:fixture',
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  }

  const result = await exchangeAuthorizationCode({
    appKey: 'public-key',
    code: 'code-123',
    codeVerifier: 'verifier-123',
    redirectUri: 'https://example.test/archive/',
    fetchImpl: fakeFetch,
    nowMs: 1000,
  })

  assert.equal(captured.url, 'https://api.dropboxapi.com/oauth2/token')
  assert.equal(captured.options.method, 'POST')
  const body = new URLSearchParams(captured.options.body)
  assert.equal(body.get('client_id'), 'public-key')
  assert.equal(body.get('client_secret'), null)
  assert.equal(body.get('code_verifier'), 'verifier-123')
  assert.equal(result.expiresAt, 14_401_000)
  assert.equal(Object.hasOwn(result, 'refreshToken'), false)
})

