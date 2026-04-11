const VERSION = 'v9'
const STATIC_CACHE = `app-static-${VERSION}`
const DOCUMENT_CACHE = `app-documents-${VERSION}`
const BANNER_CACHE = `banner-images-${VERSION}`
const RESIDENT_API_CACHE = `resident-api-${VERSION}`
const PRECACHE_URLS = ['/', '/index.html']
const IMAGE_HOSTS = [
  'drive.google.com',
  'lh3.googleusercontent.com',
  'googleusercontent.com'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(DOCUMENT_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).catch(() => undefined)
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(
      cacheNames
        .filter((cacheName) => ![STATIC_CACHE, DOCUMENT_CACHE, BANNER_CACHE, RESIDENT_API_CACHE].includes(cacheName))
        .map((cacheName) => caches.delete(cacheName))
    )
    await self.clients.claim()
  })())
})

const isBannerImageRequest = (requestUrl, destination) => {
  if (destination !== 'image') return false

  if (IMAGE_HOSTS.some((host) => requestUrl.hostname.includes(host))) {
    return true
  }

  return requestUrl.pathname.includes('/banner')
}

const isStaticAssetRequest = (requestUrl, request) => {
  if (requestUrl.origin !== self.location.origin) return false

  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'font' || request.destination === 'worker') {
    return true
  }

  return requestUrl.pathname.startsWith('/assets/')
}

const isResidentApiRequest = (requestUrl) => {
  if (requestUrl.origin !== self.location.origin) return false

  return requestUrl.pathname.includes('/.netlify/functions/resident-bootstrap')
}

const staleWhileRevalidate = async (request, cacheName) => {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') {
        void cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => cached)

  return cached || networkFetch
}

const cacheFirstWithRefresh = async (request, cacheName) => {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  const refreshRequest = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') {
        void cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)

  if (cached) {
    void refreshRequest
    return cached
  }

  const networkResponse = await refreshRequest
  if (networkResponse) {
    return networkResponse
  }

  throw new Error('offline')
}

const networkFirstDocument = async (request) => {
  const cache = await caches.open(DOCUMENT_CACHE)

  try {
    const response = await fetch(request)
    if (response.ok) {
      void cache.put(request, response.clone())
    }
    return response
  } catch {
    const cachedDocument = await cache.match(request)
    if (cachedDocument) {
      return cachedDocument
    }

    const appShell = await cache.match('/index.html')
    if (appShell) {
      return appShell
    }

    throw new Error('offline')
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)

  if (isBannerImageRequest(requestUrl, request.destination)) {
    event.respondWith(cacheFirstWithRefresh(request, BANNER_CACHE))
    return
  }

  if (isResidentApiRequest(requestUrl)) {
    event.respondWith(staleWhileRevalidate(request, RESIDENT_API_CACHE))
    return
  }

  if (request.mode === 'navigate' || request.destination === 'document') {
    if (requestUrl.origin === self.location.origin) {
      event.respondWith(networkFirstDocument(request))
    }
    return
  }

  if (isStaticAssetRequest(requestUrl, request)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE))
  }
})
