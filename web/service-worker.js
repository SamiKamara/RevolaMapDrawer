const CACHE_PREFIX = 'revola-map-drawer-';
const CACHE_NAME = CACHE_PREFIX + '__BUILD_ID__';
const SHELL_URLS = __SHELL_URLS__;
const LAZY_URLS = __LAZY_URLS__;
const HTML_SHA256 = __HTML_SHA256__;
const IMMUTABLE_URLS = new Set([...SHELL_URLS.filter(url => url.startsWith('/assets/')), ...LAZY_URLS]);

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      // Immutable URLs reuse the browser HTTP cache, so installation need not
      // download the just-loaded app/ship twice. HTML must match this worker.
      await cache.addAll(SHELL_URLS.map(url => new Request(url, { cache: url.startsWith('/assets/') ? 'default' : 'reload' })));
      const html = await cache.match('/index.html');
      const hash = await crypto.subtle.digest('SHA-256', await html.arrayBuffer());
      const actual = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== HTML_SHA256) throw new Error('Deployment changed while installing the offline shell.');
    } catch (error) {
      await caches.delete(CACHE_NAME);
      throw error;
    }
    // No forced activation: an existing editor retains its complete version
    // until all tabs using that version close, preserving unsaved work.
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) await caches.delete(key);
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.search) return;
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match('/index.html') || fetch(request);
    })());
  } else if (IMMUTABLE_URLS.has(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
      return response;
    })());
  }
});
