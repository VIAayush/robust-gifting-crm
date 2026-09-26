/* Robust Gifting PWA service worker */
// Bumped from v1: v1 cached every page navigation, including signed-in CRM /
// portal / checkout HTML. Activating v2 deletes that old cache.
const CACHE = 'robust-gifting-pwa-v2'
const PRECACHE = ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png']

// Only public, non-personal pages are ever stored for offline use. Anything
// signed-in or per-customer (/crm, /portal, /checkout, /cart, /wishlist,
// auth pages) always goes to the network and is never written to the cache.
const OFFLINE_PAGE_PREFIXES = ['/about', '/catalogue', '/categories', '/collections', '/home', '/personalized', '/request-quote']

function isOfflinePage(url) {
  if (url.search) return false
  if (url.pathname === '/') return true
  return OFFLINE_PAGE_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // Don't fail the whole SW if one asset 404s — install must succeed for beforeinstallprompt.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.includes('supabase') ||
    url.searchParams.has('code')
  ) {
    return
  }

  if (request.mode === 'navigate') {
    // Network first. Public pages are kept as an offline fallback; private
    // pages are never cached and fall back to the cached home page offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && isOfflinePage(url)) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
          }
          return response
        })
        .catch(async () => (isOfflinePage(url) && (await caches.match(request))) || (await caches.match('/')) || Response.error()),
    )
    return
  }

  // Build output under /_next/static is content-hashed (a new deploy gets new
  // URLs), so cache-first is safe and fast.
  if (url.pathname.startsWith('/_next/static')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (!response.ok) return response
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {})
          return response
        })
      }),
    )
    return
  }

  const isStatic =
    url.pathname.startsWith('/icons') ||
    url.pathname.startsWith('/site') ||
    /\.(?:png|jpg|jpeg|webp|svg|gif|ico|css|js|woff2?)$/i.test(url.pathname)

  if (!isStatic) return

  // Other static files keep the same URL when replaced, so serve the cached
  // copy immediately but refresh it in the background (stale-while-revalidate)
  // - an updated image shows up on the next visit instead of never.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone()).catch(() => {})
          return response
        })
        .catch(() => cached || Response.error())
      return cached || network
    }),
  )
})
