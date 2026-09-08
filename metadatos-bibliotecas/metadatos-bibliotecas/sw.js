/**
 * SERVICE WORKER - Metadatos para Bibliotecas
 * Cache-first strategy para assets estáticos
 */

const CACHE_NAME = 'metabiblio-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/utils.js',
    '/js/storage.js',
    '/js/app.js',
    '/manifest.json'
];

// Instalar: cachear assets estáticos
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).catch(() => {
            // Silenciar errores de cacheo (recursos externos no se cachean)
        })
    );
    self.skipWaiting();
});

// Activar: limpiar caches antiguos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch: cache-first para assets, network para APIs
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // No interceptar peticiones a APIs externas
    if (url.hostname !== self.location.hostname) {
        return;
    }
    
    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) {
                return cached;
            }
            return fetch(request).then((response) => {
                // Cachear respuestas exitosas
                if (response.ok && request.method === 'GET') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, clone);
                    });
                }
                return response;
            }).catch(() => {
                // Fallback offline
                if (request.destination === 'document') {
                    return caches.match('/index.html');
                }
                return new Response('Sin conexión', { status: 503 });
            });
        })
    );
});
