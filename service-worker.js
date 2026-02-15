const CACHE_NAME = 'itinerary-pwa-v23';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;500;600&display=swap'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        // Cache each resource individually to handle failures gracefully
        return Promise.all(
          urlsToCache.map(url => {
            return cache.add(url).catch(err => {
              console.warn('[SW] Failed to cache:', url, err);
              // Continue even if one resource fails
              return Promise.resolve();
            });
          })
        );
      })
      .then(() => {
        console.log('[SW] Service worker installed successfully');
        // Safari-specific: Force immediate activation
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Installation failed:', error);
        // Don't fail installation completely
        return self.skipWaiting();
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // NEVER delete the params cache - it's critical for Safari PWA
          if (cacheName === 'itinerary-params-cache') {
            console.log('[SW] Preserving params cache:', cacheName);
            return;
          }
          // Delete old app caches
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Service worker activated');
      return self.clients.claim(); // Take control immediately
    })
  );
});

// Fetch event - smart caching strategy for Safari compatibility
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // NEVER cache API requests - always fetch fresh from network
  if (request.url.includes('script.google.com') || request.url.includes('format=json')) {
    console.log('[SW] API request - bypassing cache, fetching fresh:', request.url);
    event.respondWith(
      fetch(request, {
        cache: 'no-store'
      }).catch((error) => {
        console.error('[SW] API fetch failed:', error);
        return new Response(JSON.stringify({ error: 'Network error' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Let manifest.json pass through to the static file (no dynamic interception needed
  // since we removed start_url and display:standalone to let iOS preserve the page URL)

  // Skip cross-origin requests that we can't cache
  if (!request.url.startsWith(self.location.origin) &&
      !request.url.includes('fonts.googleapis.com') &&
      !request.url.includes('fonts.gstatic.com') &&
      !request.url.includes('cdn.jsdelivr.net')) {
    return;
  }

  // Determine if this is a static asset (HTML, CSS, JS, fonts)
  const isStaticAsset = url.pathname.endsWith('.html') ||
                        url.pathname.endsWith('.css') ||
                        url.pathname.endsWith('.js') ||
                        url.pathname.endsWith('.json') ||
                        url.pathname === '/' ||
                        url.pathname === './' ||
                        url.hostname.includes('fonts.googleapis.com') ||
                        url.hostname.includes('fonts.gstatic.com') ||
                        url.hostname.includes('cdn.jsdelivr.net');

  if (isStaticAsset) {
    // CACHE-FIRST strategy for static assets (critical for Safari offline mode)
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] Serving from cache:', request.url);

            // Still fetch in background to update cache (stale-while-revalidate)
            fetch(request).then((response) => {
              if (response && response.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, response.clone());
                  console.log('[SW] Updated cache in background:', request.url);
                });
              }
            }).catch(() => {
              // Ignore background fetch errors
            });

            return cachedResponse;
          }

          // Not in cache - fetch from network
          console.log('[SW] Not in cache, fetching:', request.url);
          return fetch(request).then((response) => {
            if (response && response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, responseToCache);
                console.log('[SW] Cached new resource:', request.url);
              });
            }
            return response;
          }).catch((error) => {
            console.error('[SW] Fetch failed:', request.url, error);

            // Return offline fallback for navigation
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }

            return new Response('Offline - resource not available', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' })
            });
          });
        })
    );
  } else {
    // NETWORK-FIRST strategy for other resources (ensures fresh data)
    event.respondWith(
      fetch(request)
        .then((response) => {
          console.log('[SW] Fetched fresh from network:', request.url);

          if (response && response.status === 200 && response.type !== 'error') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
              console.log('[SW] Updated cache:', request.url);
            });
          }

          return response;
        })
        .catch((error) => {
          console.log('[SW] Network failed, trying cache:', request.url);

          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              console.log('[SW] Serving from cache (offline):', request.url);
              return cachedResponse;
            }

            console.error('[SW] No cache available for:', request.url, error);

            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }

            return new Response('Offline - resource not available', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain' })
            });
          });
        })
    );
  }
});

// Listen for messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // NEVER delete the params cache - it's critical for Safari PWA
          if (cacheName === 'itinerary-params-cache') {
            console.log('[SW] Preserving params cache during clear');
            return;
          }
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
      console.log('[SW] All caches cleared (except params)');
      event.ports[0].postMessage({ success: true });
    });
  }
});
