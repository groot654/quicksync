/*
 * QuickSync service worker.
 *
 * Deliberately minimal. It caches only:
 *   - Next.js build assets under /_next/static/ (content-hashed, public, immutable)
 *   - app icons and the static offline page
 *
 * It never caches HTML pages, Server Action responses, API routes or anything from
 * Supabase, so message contents and session data never land in Cache Storage.
 *
 * It also shows Web Push notifications for messages sent from the user's other devices.
 * One-time codes get "Copy code" and "Copy message" actions. A service worker can't
 * write to the clipboard, so an action opens (or focuses) QuickSync, which copies.
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

// --- Push notifications ------------------------------------------------------------

/** Posted to open QuickSync windows; keep in sync with src/features/notifications/notification-intent.ts. */
const NOTIFICATION_MESSAGE_TYPE = "quicksync:notification";
const NOTIFICATION_ACTIONS = new Set(["copy-code", "copy", "open"]);

self.addEventListener("push", (event) => {
  event.waitUntil(handlePush(event.data));
});

async function handlePush(data) {
  let payload = null;
  try {
    payload = data ? data.json() : null;
  } catch {
    // Not JSON: fall through to a generic notification.
  }

  // While QuickSync is open and focused the message appears live, so stay quiet.
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (windows.some((client) => client.focused)) return;

  if (!payload || payload.type !== "message" || typeof payload.id !== "string") {
    // Browsers require every push to show something.
    await self.registration.showNotification("QuickSync", {
      body: "You have a new message.",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: "quicksync-message",
    });
    return;
  }

  const code = typeof payload.code === "string" && payload.code ? payload.code : null;
  await self.registration.showNotification(payload.title || "New message", {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    // One notification per message; a repeated delivery replaces instead of stacking.
    tag: `message-${payload.id}`,
    timestamp: Date.parse(payload.createdAt) || Date.now(),
    data: { id: payload.id, code },
    actions: code
      ? [
          { action: "copy-code", title: "Copy code" },
          { action: "copy", title: "Copy message" },
        ]
      : [{ action: "copy", title: "Copy" }],
  });
}

self.addEventListener("notificationclick", (event) => {
  const { notification } = event;
  notification.close();

  const data = notification.data || {};
  const messageId = typeof data.id === "string" ? data.id : null;
  // Tapping the notification itself (the only option on iOS) uses "open"; the app then
  // decides whether to copy the code, based on the device's auto-copy setting.
  const action = NOTIFICATION_ACTIONS.has(event.action) ? event.action : "open";

  event.waitUntil(openApp({ action, messageId }));
});

async function openApp(intent) {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  // Only the messages page handles intents (not, for example, the sign-in page).
  const existing = windows.find((client) => new URL(client.url).pathname === "/");

  if (existing) {
    try {
      await existing.focus();
    } catch {
      // Focus can be refused; the message below still reaches the page.
    }
    existing.postMessage({ type: NOTIFICATION_MESSAGE_TYPE, ...intent });
    return;
  }

  // Only the message id goes in the URL, never its content.
  const url = new URL("/", self.location.origin);
  if (intent.messageId) {
    url.searchParams.set("notification", intent.action);
    url.searchParams.set("message", intent.messageId);
  }
  await self.clients.openWindow(url.href);
}

// The browser rotated or expired the subscription. Re-subscribe with the same key; the
// app registers the new endpoint with the server the next time it opens.
self.addEventListener("pushsubscriptionchange", (event) => {
  const options = event.oldSubscription && event.oldSubscription.options;
  if (!options || !options.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
      .catch(() => {}),
  );
});
