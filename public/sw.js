const CACHE = "ether-mosh-shell-v2";
const SHELL = [
  "/",
  "/edit",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isCacheable(request) {
  if (request.method !== "GET") return false;
  if (request.headers.has("authorization")) return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (request.mode === "navigate") {
    // Cache only the public app shells, never account/auth/checkout routes or
    // URLs carrying query parameters such as OAuth codes and handoff tokens.
    return !url.search && (url.pathname === "/" || url.pathname === "/edit");
  }
  // Limit runtime caching to immutable build assets and explicitly public PWA
  // files. Future same-origin APIs/JSON endpoints must opt in instead of being
  // cached accidentally.
  return url.pathname.startsWith("/assets/")
    || url.pathname.startsWith("/icons/")
    || url.pathname === "/favicon.ico"
    || url.pathname === "/manifest.webmanifest";
}

function mayStore(response) {
  if (!response.ok || response.type !== "basic") return false;
  const cacheControl = response.headers.get("cache-control") || "";
  return !/\b(?:no-store|private)\b/i.test(cacheControl);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!isCacheable(request)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (mayStore(response)) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const exact = await caches.match(request);
          return exact || caches.match("/edit") || caches.match("/");
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (mayStore(response)) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || network;
    }),
  );
});
