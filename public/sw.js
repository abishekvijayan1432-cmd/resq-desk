/* ResQ Desk service worker — keeps the app shell and assets available offline. */
const CACHE = 'resq-desk-v4'
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

function timeout(ms) {
  return new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error('network-timeout')), ms)
  })
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const network = fetch(request).then((response) => {
    if (response && response.status === 200) {
      const copy = response.clone()
      caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
    }
    return response
  })

  event.respondWith(
    Promise.race([network, timeout(3500)]).catch(async () => {
      const cached = await caches.match(request)
      if (cached) return cached
      if (request.mode === 'navigate') {
        const shell = await caches.match('/index.html')
        if (shell) return shell
      }
      // A timed-out response may still arrive; give it one more chance.
      try {
        return await network
      } catch {
        return new Response('Offline', { status: 503, statusText: 'Offline' })
      }
    }),
  )
})
