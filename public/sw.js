const CACHE = 'korae-community-v28-chat-cache-badges';
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

// Store only delivery tags/timestamps locally; no extra database requests for badges.
let badgeQueue=Promise.resolve(),badgeFallback=[];
async function badgeStorage(update) {
 try {
  const db=await new Promise((resolve,reject)=>{
   const request=self.indexedDB.open('korae-device-badge',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('state');
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('blocked'));
  });
  try{return await new Promise((resolve,reject)=>{
   const tx=db.transaction('state','readwrite'),store=tx.objectStore('state');let next;
   const request=store.get('unread');request.onsuccess=()=>{next=update(request.result||[]);store.put(next,'unread');};
   tx.oncomplete=()=>resolve(next);tx.onerror=tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
 }catch{return update(badgeFallback);}
}
function updateBadge(update) {
 badgeQueue=badgeQueue.catch(()=>{}).then(async()=>{
  badgeFallback=await badgeStorage(update);
  try {if(badgeFallback.length)await self.navigator?.setAppBadge?.(badgeFallback.length);else await self.navigator?.clearAppBadge?.();}catch{}
 });
 return badgeQueue;
}
self.addEventListener('message',event=>{
 if(event.data?.type==='READ_NOTIFICATIONS' && Number.isFinite(event.data.before)){
  const before=event.data.before;
  event.waitUntil(updateBadge(rows=>rows.filter(row=>row.receivedAt>before)));
 }else if(event.data?.type==='RESET_BADGE')event.waitUntil(updateBadge(()=>[]));
});
self.addEventListener('activate',event=>event.waitUntil(updateBadge(rows=>rows)));
self.addEventListener('push', event => {
 let payload;try{payload=event.data?.json();}catch{}
 if(!payload)return;
 let url;try{url=new URL(payload.url||'./',ROOT);}catch{url=new URL(ROOT);}
 const receivedAt=Date.now(),tag=payload.tag||String(receivedAt)+Math.random();
 event.waitUntil(Promise.all([
  self.registration.showNotification(payload.title||'ㅋㅇㄱㄹ',{
   body:payload.body||'',icon:new URL('koin-korae-splash-v4-192.png',ROOT).href,
   tag:payload.tag,data:{url:url.origin===self.location.origin?url.href:ROOT},
  }),
  updateBadge(rows=>rows.some(row=>row.tag===tag)?rows:[...rows,{tag,receivedAt}]),
 ]));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil((async()=>{
  const url=new URL(event.notification.data?.url||ROOT,ROOT);
  const target=new URL('?screen=notifications',ROOT).href;
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>client.url.startsWith(ROOT));
  if(existing){const navigated=await existing.navigate(target);if(navigated)return navigated.focus();}
  return self.clients.openWindow(target);
 })());
});
