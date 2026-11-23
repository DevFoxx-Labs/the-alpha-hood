/* The Alpha Hood service worker (PWA, M9).
 * Privacy & safety rules:
 * - Only versioned static assets are cached (/_next/static, /brand, /mascot, /icons) — cache-first.
 * - Pages, /api, /account, /checkout and anything with personal data are NEVER cached; they always go to the
 *   network. If a page navigation fails offline, the pre-cached /offline page is shown instead.
 * - Bump VERSION to drop old caches.
 */
const VERSION = "ah-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";
const STATIC_PREFIXES = ["/_next/static/", "/brand/", "/mascot/", "/icons/"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.add(new Request(OFFLINE_URL, { cache: "reload" }))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (STATIC_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok && res.type === "basic") cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())));
  }
});
