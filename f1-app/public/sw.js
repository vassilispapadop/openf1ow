// Minimal, deliberately conservative service worker. Its job is installability
// (the "Add to Home Screen" prompt needs a fetch handler) plus a fast repeat
// load and an offline shell — NOT aggressive caching of a live data app.
//
// Strategy:
//   - /api/* and cross-origin: never intercepted (always fresh from network).
//   - navigations: network-first, fall back to the cached shell only offline
//     (so deploys and fresh data are never masked by the SW).
//   - hashed static assets: cache-first (filenames change on every deploy).
const CACHE = "openf1ow-v2";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // Only keep the true root as the offline shell. Caching a race URL's
          // HTML here would pin a shell that embeds fingerprinted asset refs.
          if (url.pathname === "/") {
            const cache = await caches.open(CACHE);
            cache.put("/", res.clone());
          }
          return res;
        } catch {
          return (await caches.match("/")) || Response.error();
        }
      })(),
    );
    return;
  }

  if (/\/assets\/|\.(?:svg|png|ico|css|js|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, res.clone());
        }
        return res;
      })(),
    );
  }
});
