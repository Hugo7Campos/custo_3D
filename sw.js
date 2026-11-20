const CACHE = 'custo3d-static-v1';
const FILES = ['./', './index.html', './icon.svg', './manifest.webmanifest', './src/styles.css', './src/app.js', './src/finance.js', './src/state.js', './src/charts.js'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('custo3d-static-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
