/**
 * service-worker.js
 * Small, deliberately conservative caching strategy:
 * - App shell (HTML/CSS/JS/icons) is versioned and precached.
 * - Navigations use network-first so content updates show up immediately,
 *   falling back to the cached shell / offline.html when there's no network.
 * - Static assets use cache-first (safe because the cache name changes on
 *   every deploy — see CACHE_VERSION).
 * - Cross-origin requests (Apps Script API, ImgBB images, Google Fonts) are
 *   NOT intercepted at all. We never cache ImgBB photos ourselves — the
 *   spec explicitly warns against unbounded caching of large images, and
 *   the simplest way to honor that is to not touch them and let the
 *   browser's normal HTTP cache handle reuse.
 */
'use strict';

const CACHE_VERSION = 'showroom-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;

const SHELL_ASSETS = [
  './index.html',
  './offline.html',
  './css/style.css',
  './js/config.js',
  './js/utils.js',
  './js/validation.js',
  './js/api.js',
  './js/carousel.js',
  './js/gallery.js',
  './js/pwa.js',
  './js/app.js',
  './manifest.webmanifest',
  './assets/logo.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/icons/favicon-32.png',
  './assets/icons/favicon-16.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || caches.match('./offline.html');
  }
}

async function cacheFirstStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return cached; // undefined -> browser will surface the network error
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // never cache POST (admin/API calls)

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return; // let the browser handle cross-origin requests natively

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (SHELL_ASSETS.some((path) => url.pathname.endsWith(path.replace('./', '/')))) {
    event.respondWith(cacheFirstStatic(request));
  }
});
