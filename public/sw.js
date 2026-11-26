const CACHE_NAME = 'yechao-shell-v2'
const APP_SHELL = [
  './',
  './index.html',
  './yechao-32.png',
  './yechao-180.png',
  './yechao-192.png',
  './yechao-512.png',
  './manifest.webmanifest',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
          }
          return response
        })
        .catch(async () => (
          await caches.match(request)
          || await caches.match('./index.html')
          || await caches.match('./')
        )),
    )
    return
  }

  const isStatic = url.pathname.includes('/assets/')
    || /\.(?:css|js|svg|png|webp|woff2?)$/.test(url.pathname)
  if (!isStatic) return

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
