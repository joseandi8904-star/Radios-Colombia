const CACHE_VERSION = 'radio-co-v2.0';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;
const CACHE_IMAGES = `${CACHE_VERSION}-images`;

// Archivos que se deben cachear inmediatamente
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://i.imgur.com/ZcLLrkY.jpg'
];

// Archivos de imágenes de radios (se cachean bajo demanda)
const RADIO_IMAGES = [
  'https://upload.wikimedia.org/wikipedia/commons/4/4e/RCN_Radio_logo.png',
  'https://upload.wikimedia.org/wikipedia/commons/6/6b/Caracol_Radio_logo.png',
  'https://upload.wikimedia.org/wikipedia/commons/1/19/La_Mega_Colombia_logo.png',
  'https://upload.wikimedia.org/wikipedia/commons/5/55/Radio_Nacional_de_Colombia_logo.png'
];

// URLs de streaming (NO cachear)
const STREAMING_URLS = [
  'streaming.rcnradio.com',
  'playerservices.streamtheworld.com',
  'streaming.lamega.com.co',
  'streaming.radionacional.co'
];

// Instalación: cachear archivos estáticos
self.addEventListener('install', event => {
  console.log('[SW] Instalando Service Worker v' + CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        console.log('[SW] Precaching archivos estáticos');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting()) // Activar inmediatamente
  );
});

// Activación: limpiar cachés antiguas
self.addEventListener('activate', event => {
  console.log('[SW] Activando Service Worker v' + CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName.startsWith('radio-co-') && cacheName !== CACHE_STATIC && 
                cacheName !== CACHE_DYNAMIC && cacheName !== CACHE_IMAGES) {
              console.log('[SW] Eliminando caché antigua:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim()) // Tomar control inmediatamente
  );
});

// Función para determinar si es URL de streaming
function isStreamingUrl(url) {
  return STREAMING_URLS.some(domain => url.includes(domain));
}

// Función para determinar si es una imagen
function isImageUrl(url) {
  return url.match(/\.(png|jpg|jpeg|svg|gif|webp)$/i) || 
         RADIO_IMAGES.some(img => url.includes(img));
}

// Estrategia: Cache First para imágenes
async function cacheFirstStrategy(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Error en red:', error);
    // Retornar imagen placeholder si falla
    return new Response('', { status: 404, statusText: 'Offline' });
  }
}

// Estrategia: Network First para HTML/JSON
async function networkFirstStrategy(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Red no disponible, usando caché');
    const cachedResponse = await caches.match(request);
    return cachedResponse || new Response('Offline', { 
      status: 503, 
      statusText: 'Service Unavailable' 
    });
  }
}

// Fetch: interceptar peticiones
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // NO cachear URLs de streaming de audio
  if (isStreamingUrl(request.url)) {
    return event.respondWith(fetch(request));
  }
  
  // Estrategia Cache First para imágenes
  if (isImageUrl(request.url)) {
    return event.respondWith(
      cacheFirstStrategy(request, CACHE_IMAGES)
    );
  }
  
  // Estrategia Network First para HTML/JSON
  if (request.method === 'GET' && 
      (url.pathname.endsWith('.html') || url.pathname === '/' || 
       url.pathname.endsWith('.json'))) {
    return event.respondWith(
      networkFirstStrategy(request, CACHE_STATIC)
    );
  }
  
  // Para todo lo demás: Network with cache fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && request.method === 'GET') {
          const cache = caches.open(CACHE_DYNAMIC);
          cache.then(c => c.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

// Sincronización en background (para futuras features)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-favorites') {
    console.log('[SW] Sincronizando favoritos...');
    // Aquí puedes sincronizar datos cuando vuelva la conexión
  }
});

// Notificaciones push (para futuras features)
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'Nueva notificación',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/'
    }
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Radio Colombia', options)
  );
});

// Click en notificación
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

// Manejo de mensajes desde el cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  // Limpiar cachés manualmente
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
      })
    );
  }
});

// Información de versión
console.log('[SW] Service Worker Radio Colombia Pro v' + CACHE_VERSION + ' cargado');
