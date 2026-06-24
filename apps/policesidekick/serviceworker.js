// Service Worker for Police Sidekick
// Cache-first strategy for datasets, network-first for catalog

const CACHE_NAME = 'police-sidekick-v4';
const STATIC_CACHE = 'police-sidekick-static-v4';
const DYNAMIC_CACHE = 'police-sidekick-dynamic-v4';

// Assets to cache on install
const STATIC_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './styles/style.css',
  './app.js',
  './lib/download-manager.js',
  './lib/storage-manager.js',
  './lib/ui-components.js',
  './manifest.json',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith('police-sidekick-') && cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE)
            .map((cacheName) => caches.delete(cacheName))
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (!event.data) {
    return;
  }

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch event - cache-first strategy
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Always bypass service worker for app shell updates
  if (event.request.url.endsWith('/app.js') ||
      event.request.url.endsWith('/index.html') ||
      event.request.url.endsWith('/styles/style.css') ||
      event.request.url.includes('/lib/')) {
    event.respondWith(fetch(event.request, { cache: 'reload' }));
    return;
  }
  
  // For API/catalog requests, use network-first
  if (event.request.url.includes('DataSets.plist') || event.request.url.includes('Description.plist')) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  
  // For dataset files, use cache-first unless a reload is requested
  if (event.request.url.includes('/DataSets/')) {
    if (event.request.cache === 'reload') {
      event.respondWith(networkFirst(event.request));
      return;
    }
    event.respondWith(cacheFirst(event.request));
    return;
  }
  
  // For other requests, use cache-first with network fallback
  event.respondWith(
    caches.match(event.request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone response for caching
            const responseToCache = response.clone();
            
            caches.open(DYNAMIC_CACHE)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(() => caches.match('./offline.html'));
      })
  );
});

// Cache-first strategy
function cacheFirst(request) {
  return caches.match(request)
    .then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          const responseToCache = response.clone();
          caches.open(DYNAMIC_CACHE)
            .then((cache) => {
              cache.put(request, responseToCache);
            });
          
          return response;
        });
    });
}

// Network-first strategy
function networkFirst(request) {
  return fetch(request, { cache: 'reload' })
    .then((response) => {
      if (!response || response.status !== 200 || response.type !== 'basic') {
        return response;
      }
      
      const responseToCache = response.clone();
      caches.open(DYNAMIC_CACHE)
        .then((cache) => {
          cache.put(request, responseToCache);
        });
      
      return response;
    })
    .catch(() => {
      return caches.match(request);
    });
}

// Background sync for pending downloads
self.addEventListener('sync', (event) => {
  if (event.tag === 'download-sync') {
    event.waitUntil(syncDownloads());
  }
});

function syncDownloads() {
  // Sync pending downloads from IndexedDB
  console.log('Syncing pending downloads');
}
