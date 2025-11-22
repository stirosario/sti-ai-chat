/**
 * Service Worker para ChatSTI PWA
 * Versión: 1.0.0
 * Estrategia: Network First con fallback a cache
 * Features: Auto-update, offline support, background sync
 */

const CACHE_VERSION = 'chatsti-v1.0.0';
const CACHE_STATIC = `${CACHE_VERSION}-static`;
const CACHE_DYNAMIC = `${CACHE_VERSION}-dynamic`;
const CACHE_API = `${CACHE_VERSION}-api`;

// Helper para logs solo en desarrollo
const isDev = false; // Cambiar a true para desarrollo local
const log = (...args) => isDev && console.log('[SW]', ...args);
const logError = (...args) => console.error('[SW]', ...args);

// Archivos estáticos para cachear en instalación
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/pwa-install.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Rutas API que NO se deben cachear
const NO_CACHE_ROUTES = [
  '/api/chat',
  '/api/greeting',
  '/api/whatsapp-ticket',
  '/api/logs'
];

// Orígenes permitidos (debe coincidir con CORS del servidor)
const ALLOWED_ORIGINS = [
  'https://sti-rosario-ai.onrender.com',
  'http://localhost:3001',
  'http://127.0.0.1:3001'
];

// Timeout para requests (10 segundos)
const NETWORK_TIMEOUT = 10000;

// ========================================================
// INSTALL: Cachear archivos estáticos
// ========================================================
self.addEventListener('install', (event) => {
  log('Installing Service Worker v' + CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then((cache) => {
        log('Precaching static assets');
        return cache.addAll(STATIC_ASSETS.map(url => new Request(url, { cache: 'reload' })));
      })
      .catch((err) => {
        logError('Failed to cache static assets:', err);
      })
      .then(() => {
        // Forzar activación inmediata
        return self.skipWaiting();
      })
  );
});

// ========================================================
// ACTIVATE: Limpiar caches antiguos
// ========================================================
self.addEventListener('activate', (event) => {
  log('Activating Service Worker v' + CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => {
              // Eliminar caches de versiones anteriores
              return cacheName.startsWith('chatsti-') && cacheName !== CACHE_STATIC && cacheName !== CACHE_DYNAMIC && cacheName !== CACHE_API;
            })
            .map((cacheName) => {
              log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        // Tomar control inmediato de todas las páginas
        return self.clients.claim();
      })
  );
});

// ========================================================
// FETCH: Estrategia de caché inteligente
// ========================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Ignorar requests no HTTP/HTTPS
  if (!request.url.startsWith('http')) {
    return;
  }
  
  // Ignorar Chrome extensions
  if (url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Validar origen (seguridad)
  const origin = url.origin;
  const isSameOrigin = origin === self.location.origin;
  const isAllowedOrigin = ALLOWED_ORIGINS.includes(origin);
  
  if (!isSameOrigin && !isAllowedOrigin) {
    log('Blocked request from unauthorized origin:', origin);
    return;
  }
  
  // Estrategia para API endpoints
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
    return;
  }
  
  // Estrategia para archivos estáticos y páginas
  event.respondWith(handleStaticRequest(request));
});

// ========================================================
// HANDLER: API Requests (Network First)
// ========================================================
async function handleApiRequest(request) {
  const url = new URL(request.url);
  
  // No cachear rutas específicas
  if (NO_CACHE_ROUTES.some(route => url.pathname.startsWith(route))) {
    try {
      return await fetchWithTimeout(request, NETWORK_TIMEOUT);
    } catch (err) {
      logError('API request failed:', url.pathname, err.message);
      return createErrorResponse('network_error', 'No hay conexión. Intentá de nuevo en unos segundos.');
    }
  }
  
  // Para otras APIs: Network First con cache fallback
  try {
    const networkResponse = await fetchWithTimeout(request, NETWORK_TIMEOUT);
    
    // Cachear respuestas exitosas
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_API);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (err) {
    log('Network failed, trying cache:', url.pathname);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Sin cache: respuesta de error
    return createErrorResponse('offline', 'Sin conexión y sin datos en caché');
  }
}

// Helper para respuestas de error consistentes
function createErrorResponse(errorType, message) {
  return new Response(JSON.stringify({ 
    ok: false, 
    error: errorType,
    message: message
  }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ========================================================
// HANDLER: Static Requests (Cache First con network fallback)
// ========================================================
async function handleStaticRequest(request) {
  // Intentar desde caché primero
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // Actualizar caché en background si es navegación
    if (request.mode === 'navigate') {
      event.waitUntil(updateCache(request));
    }
    return cachedResponse;
  }
  
  // No está en caché: fetch desde red
  try {
    const networkResponse = await fetch(request);
    
    // Cachear respuestas exitosas (solo GET)
    if (networkResponse && networkResponse.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_DYNAMIC);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (err) {
    logError('Network failed:', request.url);
    
    // Fallback para navegación: mostrar página offline
    if (request.mode === 'navigate') {
      const offlineResponse = await caches.match('/offline.html');
      if (offlineResponse) {
        return offlineResponse;
      }
    }
    
    // Respuesta genérica de error
    return new Response('Sin conexión', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

// ========================================================
// HELPER: Fetch con timeout
// ========================================================
function fetchWithTimeout(request, timeout) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Network timeout')), timeout)
    )
  ]);
}

// ========================================================
// HELPER: Actualizar caché en background
// ========================================================
async function updateCache(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_DYNAMIC);
      await cache.put(request, networkResponse);
    }
  } catch (err) {
    // Ignorar errores de actualización en background
  }
}

// ========================================================
// MESSAGE: Comunicación con la app
// ========================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CHECK_UPDATE') {
    // Forzar verificación de actualizaciones
    self.registration.update();
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});

// ========================================================
// PUSH: Notificaciones push (futuro)
// ========================================================
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'Nuevo mensaje de ChatSTI',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    tag: 'chatsti-notification',
    requireInteraction: false
  };
  
  event.waitUntil(
    self.registration.showNotification('ChatSTI', options)
  );
});

// ========================================================
// SYNC: Background sync (para envío de mensajes offline)
// ========================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  try {
    // TODO: Implementar sincronización de mensajes pendientes
    // 1. Recuperar mensajes de IndexedDB
    // 2. Enviar a /api/chat
    // 3. Marcar como sincronizados
    log('Background sync: messages');
    return Promise.resolve();
  } catch (err) {
    logError('Background sync failed:', err);
    throw err; // Re-throw para reintentar
  }
}

log('Service Worker loaded');
