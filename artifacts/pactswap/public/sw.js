/**
 * PACTSWAP Service Worker
 * Strategy:
 *   - Static assets (JS/CSS/fonts): cache-first
 *   - Navigation (HTML pages): network-first with cache fallback
 *   - API calls + external URLs: always network-only (never cache)
 */

const CACHE_VERSION = 'pactswap-v1';

// ─── Install ─────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  // Skip waiting so new SW activates immediately
  self.skipWaiting();
});

// ─── Activate ────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch ───────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache: API calls, WalletConnect, BSC RPC, other origins
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.hostname !== self.location.hostname
  ) {
    return; // Let browser handle normally
  }

  // Static assets (hashed filenames, fonts, images): cache-first
  if (
    url.pathname.match(/\.(js|css|woff2?|ttf|otf|svg|png|jpg|jpeg|ico|webp)$/)
  ) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Navigation & HTML: network-first, fall back to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
