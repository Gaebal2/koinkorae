const CACHE = 'korae-community-v25-fast-start';
const ROOT = new URL('./', self.location.href).href;
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./', './manifest.webmanifest', './koin-korae-splash-v4-192.png', './koin-korae-splash-v4-512.png'])));
});
self.addEventListener('activate', event => event.waitUntil(Promise.all([
  caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('korae-') && key !== CACHE).map(key => caches.delete(key)))),
  self.clients.claim(),
])));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Account data and API results must never enter the offline cache.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  const staticAsset = /\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?|webmanifest)$/.test(url.pathname);
  if (event.request.mode !== 'navigate' && !staticAsset) return;
  const request = event.request.mode === 'navigate' ? new Request(event.request, {cache:'no-cache'}) : event.request;
  const network = () => fetch(request).then(response => {
    const type = response.headers.get('content-type') || '';
    const cacheable = type.includes('text/html') || type.includes('text/css') || type.includes('javascript') || type.startsWith('image/') || type.startsWith('font/') || type.includes('manifest+json');
    if (response.ok && cacheable) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  });
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    // Content-hashed build files are immutable. HTML stays network-first so
    // new deployments can point at their new chunks without stale entrypoints.
    const immutable = url.pathname.startsWith(new URL('assets/', ROOT).pathname)
      && /-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(url.pathname);
    if (immutable && cached) return cached;
    const pending = network();
    event.waitUntil(pending.catch(() => {}));
    if (event.request.mode === 'navigate') {
      const fallback = cached || await caches.match(ROOT);
      if (fallback) {
        let timer;
        try {
          return await Promise.race([
            pending.catch(() => fallback),
            new Promise(resolve => { timer = setTimeout(() => resolve(fallback), 2500); }),
          ]);
        } finally { clearTimeout(timer); }
      }
    }
    return pending.catch(() => cached || Response.error());
  })());
});
