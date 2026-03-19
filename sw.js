/**
 * Service Worker for Jeu de Prompts PWA
 * Cache-first for static assets, network-first for dynamic content.
 */
const CACHE_NAME = 'jdp-cache-v2';
const STATIC_ASSETS = [
    'style.css',
    'toc.js',
    'search_ai.js',
    'manifest.json'
];

// Install: cache static assets
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
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

// Fetch: network-first for PHP, cache-first for static
self.addEventListener('fetch', function(event) {
    var url = new URL(event.request.url);

    // Network-first for dynamic content (PHP)
    if (url.pathname.endsWith('.php') || url.search) {
        event.respondWith(
            fetch(event.request).catch(function() {
                return caches.match(event.request);
            })
        );
        return;
    }

    // Cache-first for static assets
    event.respondWith(
        caches.match(event.request).then(function(cached) {
            return cached || fetch(event.request).then(function(response) {
                if (response.ok) {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            });
        })
    );
});
