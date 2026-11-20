// BEACON SEDI offline fallback: keeps the 997 emergency call available without internet.
// Network-first for everything; only when the network fails is the offline page served.
const SCOPE = self.registration.scope;
const CACHE_PREFIX = `beacon-offline:${SCOPE}:`;
const CACHE = `${CACHE_PREFIX}v4`;
const OFFLINE_URL = new URL("offline.html", SCOPE).href;
const ASSETS = [OFFLINE_URL, new URL("icon-192.png", SCOPE).href];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) =>
        (k.startsWith(CACHE_PREFIX) && k !== CACHE) ||
        (new URL(SCOPE).pathname === "/" && k === "beacon-offline-v1")
      ).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || !req.url.startsWith(SCOPE)) return;
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(async () => {
      const cache = await caches.open(CACHE);
      const offline = await cache.match(OFFLINE_URL);
      // Static hosts may redirect offline.html to /offline. A redirected cached
      // response cannot satisfy a navigation whose redirect mode is manual.
      // Reconstruct it to preserve the page while clearing the redirect flag.
      return offline
        ? new Response(offline.body, { status: offline.status, statusText: offline.statusText, headers: offline.headers })
        : Response.error();
    }));
    return;
  }
  if (ASSETS.includes(req.url)) {
    event.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(req)) ?? fetch(req)));
  }
});
