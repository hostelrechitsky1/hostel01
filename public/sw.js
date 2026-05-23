const VERSION = 'v11'
const STATIC_CACHE = `app-static-${VERSION}`
const BANNER_CACHE = `banner-images-${VERSION}`
const RESIDENT_API_CACHE = `resident-api-${VERSION}`
const ACTIVE_CACHES = [STATIC_CACHE, BANNER_CACHE, RESIDENT_API_CACHE]
const IMAGE_HOSTS = [
  'drive.google.com',
  'lh3.googleusercontent.com',
  'googleusercontent.com'
]

self.addEventListener('install', (event) => {
  event.waitUntil(Promise.resolve())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys()
    await Promise.all(
      cacheNames
        .filter((cacheName) => !ACTIVE_CACHES.includes(cacheName))
        .map((cacheName) => caches.delete(cacheName))
    )
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
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

const buildAssetRefreshModule = () => new Response(
  [
    "try {",
    "  sessionStorage.setItem('hostel_asset_recovery_attempted', Date.now().toString());",
    "  location.reload();",
    "} catch {",
    "  location.reload();",
    "}",
    "export {};",
  ].join('\n'),
  {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  }
)

const networkFirstStatic = async (request, cacheName) => {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)

  try {
    const response = await fetch(request)
    if (response.ok || response.type === 'opaque') {
      void cache.put(request, response.clone())
    }

    if (response.status === 404 && request.destination === 'script') {
      return buildAssetRefreshModule()
    }

    return response
  } catch {
    if (cached) {
      return cached
    }

    if (request.destination === 'script') {
      return buildAssetRefreshModule()
    }

    throw new Error('offline')
  }
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
  try {
    return await fetch(request, { cache: 'no-store' })
  } catch {
    return new Response(
      '<!doctype html><title>Refreshing Hostel Portal</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f1230;color:#fff;font-family:system-ui,sans-serif}main{max-width:320px;padding:24px;text-align:center}</style><main><h1>Refreshing...</h1><p>Please check your connection. This page will try again shortly.</p></main><script>setTimeout(function(){location.reload()},2500)</script>',
      {
        status: 503,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      }
    )
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
    event.respondWith(networkFirstStatic(request, STATIC_CACHE))
  }
})
