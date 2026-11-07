/* إتقان — service worker of the hosted iPhone copy.
   install: precaches the page, the encrypted content of this build, the manifest and the icons, so one visit online is enough.
   page: network first (updates arrive when online) with a short timeout, cached copy as fallback; everything else: cache first. */
const CACHE = 'itqan-v1';
const STAMP = '20261107122118-a7e7e820';
const PRECACHE = ['./', './index.html', `./data.bin?v=${STAMP}`, './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const PAGE_TIMEOUT = 6000;
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    const c = await caches.open(CACHE);
    for (const r of await c.keys()) { const u = new URL(r.url); if (u.pathname.endsWith('/data.bin') && u.searchParams.get('v') !== STAMP) await c.delete(r); }
    await self.clients.claim();
  })());
});
const pageFallback = async req => {
  const c = await caches.open(CACHE);
  return (await c.match(req, { ignoreSearch: true })) || (await c.match('./')) || (await c.match('./index.html'));
};
async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), PAGE_TIMEOUT);
    const res = await fetch(req, { signal: ctrl.signal }); clearTimeout(t);
    if (res && res.ok) { const u = new URL(req.url); u.hash = ''; c.put(u.href, res.clone()); }
    return res;
  } catch (e) {
    const hit = await pageFallback(req);
    if (hit) return hit;
    throw e;
  }
}
async function cacheFirst(req) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req) || (new URL(req.url).pathname.endsWith('/data.bin') ? await c.match(req, { ignoreSearch: true }) : null);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
  return res;
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch (x) { return; }
  if (req.mode === 'navigate' || req.destination === 'document') { e.respondWith(networkFirst(req)); return; }
  if (url.origin === self.location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(cacheFirst(req));
});
