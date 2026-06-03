/* ═══════════════════════════════════════════════
   FINLU — Service Worker · sw.js
   Estratégia: Cache-first para assets estáticos
               Network-first para dados dinâmicos
   ═══════════════════════════════════════════════ */

const CACHE_NAME = 'finlu-v1.2';
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

/* ── INSTALL: pré-cache dos assets essenciais ── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache assets que podemos controlar; ignora erros nos externos
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

/* ── ACTIVATE: limpar caches antigos ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH: estratégia híbrida ── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests não-GET e extensões de browser
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Para Google Fonts e CDN: stale-while-revalidate
  if (url.hostname.includes('fonts.g') || url.hostname.includes('jsdelivr') || url.hostname.includes('cdn.')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Para assets locais: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }
});

/* ── Estratégias de cache ── */
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
    // Offline fallback
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

/* ── Background sync placeholder (quando suportado) ── */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    console.log('[Finlu SW] Background sync triggered');
  }
});

/* ── Push notifications (iOS 16.4+) ── */
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'Finlu', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-120.png',
      data: data.url,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.notification.data) {
    event.waitUntil(clients.openWindow(event.notification.data));
  }
});
