const CACHE_NAME = 'archive-shell-v0.1.1'
const APP_SHELL = [
  './',
  './index.html',
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

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return
  if (!request.url.startsWith(self.location.origin)) return
  if (!['document', 'script', 'style', 'image', 'manifest'].includes(request.destination)) return

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
