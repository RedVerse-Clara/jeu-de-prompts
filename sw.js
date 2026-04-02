/**
 * Service Worker for Jeu de Prompts PWA
 * Network-first for HTML/CSS/JS (always fresh), cache fallback for offline.
 * Cache-first only for images and fonts.
 */
const CACHE_NAME = 'jdp-cache-v6';

// Install: activate immediately
self.addEventListener('install', function(event) {
    self.skipWaiting();
});

// Activate: clean old caches, claim clients
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(key) { return key !== CACHE_NAME; })
                    .map(function(key) { return caches.delete(key); })
            );
        })
    );
    self.clients.claim();
});

// Fetch handler
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // Skip external requests (analytics, CDN, etc.)
    if (url.origin !== location.origin) return;

    // Network-first for everything (cache as offline fallback)
    event.respondWith(
        fetch(event.request).then(function(response) {
            if (response.ok) {
                var clone = response.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, clone);
                });
            }
            return response;
        }).catch(function() {
            return caches.match(event.request);
        })
    );
});
