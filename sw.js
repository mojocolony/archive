const CACHE_NAME = 'archive-shell-v0.2.1'
const NETWORK_FIRST_DESTINATIONS = new Set(['document', 'script', 'style'])
const APP_SHELL = [
  './',
  './index.html',
  './reset.html',
  './reset.js',
  './src/styles.css',
  './src/app.js',
  './src/appLogic.js',
  './src/ui.js',
  './src/local/db.js',
  './src/domain/models.js',
  './src/features/selfCheck.js',
  './src/import/inspector.js',
  './src/import/jsonShape.js',
  './src/import/deepJsonShape.js',
  './src/import/zipDirectory.js',
  './src/import/conversationParser.js',
  './src/import/exportParser.js',
  './src/import/importMerge.js',
  './src/import/importService.js',
  './src/dropbox/auth.js',
  './src/dropbox/session.js',
  './src/dropbox/archiveRepository.js',
  './public/manifest.webmanifest',
  './public/icons/archive-192.png',
  './public/icons/archive-512.png',
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))),
    ),
  )
  self.clients.claim()
})

async function updateCache(request, response) {
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE_NAME)
    await cache.put(request, response.clone())
  }
  return response
}

async function networkFirst(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' })
    return updateCache(request, response)
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) return cached
    throw error
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  return updateCache(request, response)
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  if (!request.url.startsWith(self.location.origin)) return
  if (!['document', 'script', 'style', 'image', 'manifest'].includes(request.destination)) return

  event.respondWith(
    NETWORK_FIRST_DESTINATIONS.has(request.destination)
      ? networkFirst(request)
      : cacheFirst(request),
  )
})
