const BANNER_CACHE = 'banner-images-v1'
const IMAGE_HOSTS = [
  'drive.google.com',
  'lh3.googleusercontent.com'
]

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

const isBannerImageRequest = (requestUrl, destination) => {
  if (destination !== 'image') return false

  if (IMAGE_HOSTS.some((host) => requestUrl.hostname.includes(host))) {
    return true
  }

  return requestUrl.pathname.includes('/banner')
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') return

  const requestUrl = new URL(request.url)
  if (!isBannerImageRequest(requestUrl, request.destination)) return

  event.respondWith(
    caches.open(BANNER_CACHE).then(async (cache) => {
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
    })
  )
})
