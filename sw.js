/* إتقان — service worker of the hosted iPhone copy.
   install: precaches the page, the encrypted content of this build, the manifest and the icons, so one visit online is enough.
   page: network first (updates arrive when online) with a short timeout, cached copy as fallback; everything else: cache first.
   The encrypted content carries the build in its file name (data-<build>.bin). The worker of an earlier build therefore lets the request
   of a newer page through to the network instead of answering it with the content it holds, and an update is complete the first time
   it is opened online (the first copy used «data.bin?v=<build>», which an earlier worker answered from its own store). */
const CACHE = 'itqan-v1';
const STAMP = '20261111192221-c209bd3f';
const DATA = `./data-${STAMP}.bin`;
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const isData = u => /\/data(-[^/]*)?\.bin$/.test(u.pathname);
const PAGE_TIMEOUT = 6000;
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })));
    if (!(await c.match(DATA))) await c.add(new Request(DATA, { cache: 'reload' }));   /* the page may already have stored it while unlocking */
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    const c = await caches.open(CACHE), mine = new URL(DATA, self.location.href).pathname;
    for (const r of await c.keys()) { const u = new URL(r.url); if (isData(u) && u.pathname !== mine) await c.delete(r); }   /* content of earlier builds */
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
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
    return res;
  } catch (e) {
    /* offline and this very content file is not stored: stored content of another build is better than none */
    if (isData(new URL(req.url))) for (const r of await c.keys()) if (isData(new URL(r.url))) return c.match(r);
    throw e;
  }
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch (x) { return; }
  if (req.mode === 'navigate' || req.destination === 'document') { e.respondWith(networkFirst(req)); return; }
  if (url.origin === self.location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(cacheFirst(req));
});
