/*
 * Service worker for the hosted web version only. It caches the app on the
 * first visit so a home-screen install keeps working with no network, which
 * is the whole point of the app. app.js never registers it inside the
 * Capacitor apps, where the files already ship on the device.
 *
 * It makes no request of its own beyond fetching these same-origin files.
 * BUILD is stamped by publish-web.sh with a hash of the published files, so
 * every release gets a fresh cache and the old one is dropped.
 */
var BUILD = "1.1.0-2fad11554c55";
var CACHE = "cidr-" + BUILD;
var FILES = [
  "./",
  "index.html",
  "styles.css",
  "cidr.js",
  "app.js",
  "manifest.webmanifest",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (k) { return k.indexOf("cidr-") === 0 && k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// cache first: the app is fully static, so the cached copy is always usable,
// and a new release arrives as a new worker with a new cache
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(e.request);
    })
  );
});
