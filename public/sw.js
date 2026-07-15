// First Light service worker.
// Cache-first for the app shell + static assets (css/js/modules/icons);
// network-only for /api/* (the server's TTL cache is the freshness authority).

const CACHE = "first-light-v2";
const SHELL = [
  "/",
  "/index.html",
  "/css/app.css",
  "/js/app.js",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Never cache API responses.
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for shell + static (css/js/modules/icons).
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((res) => {
        if (res.ok && (url.pathname.startsWith("/css/") || url.pathname.startsWith("/js/") || url.pathname.startsWith("/modules/") || url.pathname.endsWith(".png"))) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
