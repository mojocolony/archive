import test from 'node:test'
import assert from 'node:assert/strict'
import { DropboxSession } from '../src/dropbox/session.js'

function memoryDb() {
  const rows = new Map()
  return {
    async get(store, key) { return rows.get(`${store}:${key}`) ?? null },
    async put(store, value) { rows.set(`${store}:${value.key}`, structuredClone(value)) },
    async delete(store, key) { rows.delete(`${store}:${key}`) },
    rows,
  }
}

test('beginConnection stores PKCE pending state locally and returns Dropbox authorization URL', async () => {
  const db = memoryDb()
  const session = new DropboxSession({
    db,
    appKey: 'public-key',
    generateVerifier: () => 'verifier',
    generateState: () => 'state-123',
    challengeFn: async () => 'challenge',
  })

  const url = await session.beginConnection({
    redirectUri: 'https://example.test/archive/',
    returnHash: '#/settings',
  })

  assert.equal(new URL(url).searchParams.get('state'), 'state-123')
  assert.deepEqual(await db.get('settings', 'dropbox.oauth.pending'), {
    key: 'dropbox.oauth.pending',
    verifier: 'verifier',
    state: 'state-123',
    redirectUri: 'https://example.test/archive/',
    returnHash: '#/settings',
  })
})

test('finishCallback validates state and stores normalized Dropbox token locally', async () => {
  const db = memoryDb()
  await db.put('settings', {
    key: 'dropbox.oauth.pending',
    verifier: 'verifier',
    state: 'state-123',
    redirectUri: 'https://example.test/archive/',
    returnHash: '#/settings',
  })

  const session = new DropboxSession({
    db,
    appKey: 'public-key',
    exchangeFn: async () => ({
      accessToken: 'access',
      refreshToken: 'unexpected-refresh-token',
      expiresAt: 5000,
      accountId: 'dbid:fixture',
    }),
  })

  const result = await session.finishCallback('https://example.test/archive/?code=abc&state=state-123')
  assert.equal(result.returnHash, '#/settings')
  assert.deepEqual(await db.get('settings', 'dropbox.token'), {
    key: 'dropbox.token',
    accessToken: 'access',
    expiresAt: 5000,
    accountId: 'dbid:fixture',
  })
  assert.equal(await db.get('settings', 'dropbox.oauth.pending'), null)
})

test('getAccessToken rejects an expired browser token and requires reconnect', async () => {
  const db = memoryDb()
  await db.put('settings', {
    key: 'dropbox.token',
    accessToken: 'old',
    expiresAt: 1000,
    accountId: 'dbid:fixture',
  })

  const session = new DropboxSession({
    db,
    appKey: 'public-key',
    nowMs: () => 2000,
  })

  await assert.rejects(() => session.getAccessToken(), /expired.*reconnect/i)
  assert.equal((await db.get('settings', 'dropbox.token')).accessToken, 'old')
})

test('disconnect removes only Dropbox token and pending OAuth state', async () => {
  const db = memoryDb()
  await db.put('settings', { key: 'dropbox.token', accessToken: 'x' })
  await db.put('settings', { key: 'dropbox.oauth.pending', state: 'x' })
  await db.put('settings', { key: 'dropbox.appKey', value: 'public-key' })
  const session = new DropboxSession({ db, appKey: 'public-key' })
  await session.disconnect()
  assert.equal(await db.get('settings', 'dropbox.token'), null)
  assert.equal(await db.get('settings', 'dropbox.oauth.pending'), null)
  assert.equal((await db.get('settings', 'dropbox.appKey')).value, 'public-key')
})
