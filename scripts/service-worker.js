const prefix = `reading-room:${self.registration.scope}:`;
const cacheName = prefix + revision;
const indexUrl = new URL('index.html', self.registration.scope).href;
const assets = new Map(Object.entries(files).map(([file, digest]) => [
  new URL(file, self.registration.scope).href,
  digest,
]));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Verify the whole revision before storing it. A partially deployed site
    // may return a successful HTML fallback for a missing build file.
    const responses = await Promise.all([...assets].map(async ([url, expected]) => {
      const response = await fetch(url, { cache: 'reload', redirect: 'error' });
      if (!response.ok) throw new Error(`Could not download ${url}`);
      const bytes = await response.clone().arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== expected) throw new Error(`Unexpected contents for ${url}`);
      return [url, response];
    }));
    const cache = await caches.open(cacheName);
    const writes = await Promise.allSettled(responses.map(([url, response]) => cache.put(url, response)));
    if (writes.some(write => write.status === 'rejected')) {
      await caches.delete(cacheName);
      throw new Error('The new library could not be saved.');
    }
  })());
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
