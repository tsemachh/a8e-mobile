/* Service worker for jsA8E PWA.
 *
 * Strategy:
 * - Precache a tiny shell (index.html, style.css, manifest).
 * - Runtime cache-first for same-origin static assets (js, shaders, ROMs,
 *   .atr disk images, icons) so everything is offline after first play.
 * - Network-first for the ROM manifest (roms.json) so new games appear,
 *   falling back to cache offline.
 * Bump CACHE_VERSION to invalidate after deploys.
 */

const CACHE_VERSION = "a8e-v1";
const SHELL = ["index.html", "style.css", "manifest.webmanifest"];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then(function (cache) {
        return cache.addAll(SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k !== CACHE_VERSION;
            })
            .map(function (k) {
              return caches.delete(k);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener("fetch", function (event) {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!isSameOrigin(url)) return; // let CDNs (fonts, fflate) hit the network

  const isAlwaysFresh =
    url.pathname.endsWith("roms.json") ||
    url.pathname.endsWith("build-info.json");

  if (isAlwaysFresh) {
    // Network-first: pick up newly added games, fall back offline.
    event.respondWith(
      fetch(request)
        .then(function (response) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(request, copy);
          });
          return response;
        })
        .catch(function () {
          return caches.match(request);
        }),
    );
    return;
  }

  // Cache-first for everything else same-origin.
  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(request, copy);
          });
        }
        return response;
      });
    }),
  );
});
