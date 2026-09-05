export function getCapabilityReport(env = globalThis) {
  return {
    indexedDb: Boolean(env.indexedDB),
    streamingDeflate: typeof env.DecompressionStream === 'function',
    webCrypto: Boolean(env.crypto?.subtle),
    fileStreaming: typeof env.File?.prototype?.stream === 'function',
    serviceWorker: Boolean(env.navigator?.serviceWorker),
    secureContext: Boolean(env.isSecureContext),
  }
}

export async function runIndexedDbSelfTest(db) {
  const key = `archive.selftest.${Date.now()}.${Math.random().toString(36).slice(2)}`
  const value = { key, value: 'ok' }
  try {
    await db.put('settings', value)
    const readBack = await db.get('settings', key)
    return readBack?.value === 'ok'
  } finally {
    await db.delete('settings', key).catch(() => {})
  }
}
