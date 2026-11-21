const prefix = `reading-room:${self.registration.scope}:`;
const cacheName = prefix + revision;
const indexUrl = new URL('index.html', self.registration.scope).href;
const assets = new Set(files.map(file => new URL(file, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => {
    return cache.addAll([...assets].map(url => new Request(url, { cache: 'reload' })));
  }));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(prefix) && key !== cacheName).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const routeUrl = url.origin + url.pathname;
  const isAppNavigation = event.request.mode === 'navigate' &&
    (routeUrl === indexUrl || routeUrl === self.registration.scope);
  if (!isAppNavigation && !assets.has(url.href)) return;
  event.respondWith(caches.open(cacheName).then(async cache => {
    // These are fixed same-origin build files. Module requests may send an
    // Origin header even though the original precache requests did not.
    const cached = await cache.match(isAppNavigation ? indexUrl : url.href, { ignoreVary: true });
    return cached ?? fetch(event.request);
  }));
});
