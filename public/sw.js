const CACHE = 'korae-community-v11';
const ROOT = new URL('./', self.location.href).href;
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(['./', './manifest.webmanifest', './koin-korae-violet-192.png', './koin-korae-violet-512.png'])));
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
  event.respondWith(fetch(event.request).then(response => {
    const type = response.headers.get('content-type') || '';
    const cacheable = type.includes('text/html') || type.includes('text/css') || type.includes('javascript') || type.startsWith('image/') || type.startsWith('font/') || type.includes('manifest+json');
    if (response.ok && cacheable) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? await caches.match(ROOT) : null) || Response.error()));
});
