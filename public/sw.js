/*
 * QuickSync service worker.
 *
 * Deliberately minimal. It caches only:
 *   - Next.js build assets under /_next/static/ (content-hashed, public, immutable)
 *   - app icons and the static offline page
 *
 * It never caches HTML pages, Server Action responses, API routes or anything from
 * Supabase, so message contents and session data never land in Cache Storage.
 */

const VERSION = "v1";
const STATIC_CACHE = `quicksync-static-${VERSION}`;
const SHELL_CACHE = `quicksync-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const MAX_STATIC_ENTRIES = 150;

const SHELL_ASSETS = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("quicksync-") && key !== STATIC_CACHE && key !== SHELL_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase and other origins: untouched.

  // Page navigations: always go to the network (pages are private and dynamic).
  // Only when the network is unreachable, show the static offline page.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Hashed build assets never change, so serve them from cache for faster launches.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone());
    trimCache(cache);
  }
  return response;
}

async function trimCache(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_STATIC_ENTRIES;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}
