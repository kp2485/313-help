// Keeps the app itself (page, script, styles, icons) on the phone so it opens with no signal. The list of places is
// not cached here: the app keeps its own verified copy (data.ts). The API and the steward page are never touched.
const SHELL = 'shell-v2';
const skip = (url) => url.origin !== location.origin || /^\/(data|v1|admin)(\/|$)/.test(url.pathname);
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', (e) => { if (e.data && e.data.type === 'cache' && Array.isArray(e.data.urls)) caches.open(SHELL).then((c) => c.addAll(e.data.urls.filter((u) => !skip(new URL(u))))).catch(() => {}); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || skip(url)) return;
  if (e.request.mode === 'navigate') {
    // Only a good copy of the app page replaces the saved one; an error page or another page never does.
    e.respondWith(fetch(e.request).then((r) => { if (r.ok && url.pathname === '/') { const copy = r.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); } return r; }).catch(() => caches.match('/')));
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); } return r; })));
});
