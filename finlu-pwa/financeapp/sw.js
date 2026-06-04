const CACHE_NAME = 'finlu-v1.4';

// assets que entram no cache na instalação do SW
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-180.png',
  '/icons/icon-152.png',
  '/icons/icon-120.png',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400&display=swap',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// na ativação remove caches de versoes anteriores
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // fontes e CDN: stale-while-revalidate (serve o cache e atualiza em background)
  if (url.hostname.includes('fonts.g') || url.hostname.includes('jsdelivr') || url.hostname.includes('cdn.')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // arquivos locais: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const fallback = await caches.match('/index.html');
    return fallback || new Response('Offline — abra o Finlu quando tiver conexão', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    }
    return response;
  }).catch(() => cached);
  return cached || fetchPromise;
}

self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Finlu', {
      body:  data.body || '',
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-120.png',
      data:  data.url,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.notification.data) {
    event.waitUntil(clients.openWindow(event.notification.data));
  }
});