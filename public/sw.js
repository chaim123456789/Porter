const SHELL_VERSION = 'porter-shell-v1';

const CORE_SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-192.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
];

const BUILT_SHELL_ASSETS = /*__BUILT_SHELL_ASSETS__*/[];
const SHELL_ASSETS = Array.from(new Set([...CORE_SHELL_ASSETS, ...BUILT_SHELL_ASSETS]));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_VERSION)
      .then((store) => store.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('porter-shell-') && key !== SHELL_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isStaticAsset(request, url) {
  if (url.origin !== self.location.origin) {
    return false;
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    return true;
  }
  const dest = request.destination;
  return (
    dest === 'script' ||
    dest === 'style' ||
    dest === 'image' ||
    dest === 'font' ||
    dest === 'manifest' ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/icon.svg'
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Navigations: network-first, falling back to stored app shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_VERSION).then((store) => {
              store.put('/index.html', copy.clone());
              store.put('/', copy);
            });
          }
          return response;
        })
        .catch(async () => {
          const store = await caches.open(SHELL_VERSION);
          return (
            (await store.match('/index.html')) ||
            (await store.match('/')) ||
            Response.error()
          );
        })
    );
    return;
  }

  // Static assets: store-first, updating store when fetched from network.
  if (isStaticAsset(request, url)) {
    event.respondWith(
      caches.open(SHELL_VERSION).then(async (store) => {
        const hit = await store.match(request);
        if (hit) {
          return hit;
        }
        try {
          const networkResponse = await fetch(request);
          if (networkResponse && networkResponse.ok) {
            store.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          return Response.error();
        }
      })
    );
  }
});
