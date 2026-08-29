// Service worker for the Kathmandu Bus Route Finder PWA.
//
// Scope, deliberately narrow:
//   1. App shell (the pages/JS/CSS Next.js builds) -- cache-first after the
//      first successful load, so the app still opens with no network.
//   2. Three read-only, slow-changing backend GETs -- /stops, /routes,
//      /congestion -- stale-while-revalidate. These are exactly the three
//      endpoints the backend itself already puts a TTL cache in front of
//      (see backend caching work from an earlier session), so treating them
//      as cacheable here mirrors a decision already made about this data's
//      freshness requirements.
//
// Deliberately NOT cached: /route-finder, /walking-route, and
// /routes/{id}/geometry. All three do live OSRM-dependent work (or, for
// route-finder, encode a live pathfinding result) -- serving a stale
// cached response for any of them would show the user a wrong route or
// wrong walking directions with no indication it's stale. Network-only.

const CACHE_VERSION = "v1";
const SHELL_CACHE = `ktm-bus-shell-${CACHE_VERSION}`;
const API_CACHE = `ktm-bus-api-${CACHE_VERSION}`;

const CACHEABLE_API_PATHS = ["/stops", "/routes", "/congestion"];

const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isCacheableApiRequest(url) {
  // /stops/nearby and /stops/{id}/routes etc. are prefix matches on
  // "/stops" but are per-location or per-id lookups, not the kind of
  // broad, repeatedly-fetched list data worth caching -- only cache exact
  // path matches (ignoring query string), same set the backend caches.
  return CACHEABLE_API_PATHS.includes(url.pathname);
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    // Kick off the revalidation but don't wait on it -- return the cached
    // copy immediately, same UX as a fresh load, just possibly a few
    // minutes stale (bounded by how often this endpoint is naturally
    // re-fetched during normal use).
    void networkFetch;
    return cached;
  }

  const fresh = await networkFetch;
  if (fresh) return fresh;
  throw new Error("No cached response and network fetch failed");
}

async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const offline = await cache.match(OFFLINE_URL);
      if (offline) return offline;
    }
    throw new Error("Offline and nothing cached for this request");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // App shell: pages, JS/CSS chunks, etc.
    event.respondWith(networkFirstShell(request));
    return;
  }

  // Cross-origin: only the backend's three cacheable list endpoints.
  if (isCacheableApiRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
  // Everything else (route-finder, walking-route, geometry, congestion
  // buckets, stop/route detail lookups, and any other origin) falls
  // through to the browser's normal network fetch, untouched.
});
