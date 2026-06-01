const CACHE_NAME = "neet-tracker-pwa-v8";
const IS_LOCAL = self.location.hostname === "localhost" || self.location.hostname === "127.0.0.1";
const OFFLINE_URL = "/offline";
const APP_SHELL_ASSETS = [
  OFFLINE_URL,
  "/favicon.ico",
  "/favicon-32.png",
  "/apple-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/maskable-512.png",
  "/doctor-logo.png",
  "/doctor-logo-mark.png",
  "/brand/neet-doctor-logo.png",
  "/brand/neet-doctor-logo-mark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          APP_SHELL_ASSETS.map((asset) =>
            cache.add(new Request(asset, { cache: "reload" })).catch((error) => {
              console.warn("[sw] skipped cache asset", asset, error);
            }),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Build chunks: never let the SW serve a stale chunk (causes "module factory
  // is not available" after a code change). In local dev, pass straight through
  // to the network. In production, use stale-while-revalidate so the cache is
  // always refreshed in the background.
  if (url.pathname.startsWith("/_next/static/")) {
    if (IS_LOCAL) return; // let the browser fetch fresh chunks directly
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request)
            .then((response) => {
              cache.put(request, response.clone());
              return response;
            })
            .catch(() => cached);
          return cached || network;
        }),
      ),
    );
    return;
  }

  // Images and fonts are safe to serve cache-first.
  if (request.destination === "image" || request.destination === "font") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: "New study notification",
      body: event.data ? event.data.text() : "Open your tracker for the latest update.",
    };
  }

  const title = payload.title || "NEET Tracker";
  const urgent = payload.urgent || payload.data?.urgent || payload.data?.tone === "urgent";
  const origin = self.location.origin;
  const options = {
    body: payload.body || "Open your tracker for the latest update.",
    icon: payload.icon ? new URL(payload.icon, origin).href : new URL("/icon-192.png", origin).href,
    badge: payload.badge ? new URL(payload.badge, origin).href : new URL("/icon-192.png", origin).href,
    tag: payload.tag || "neet-tracker-notification",
    data: payload.data || { url: "/dashboard" },
    timestamp: Date.now(),
    vibrate: payload.vibrate || (urgent ? [160, 70, 160, 70, 240] : [80, 40, 80]),
    renotify: Boolean(payload.renotify ?? urgent),
    requireInteraction: Boolean(payload.requireInteraction ?? urgent),
    silent: false,
    actions: [
      {
        action: "open",
        title: "Open tracker",
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  const targetUrl = new URL(url, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client && client.url.startsWith(self.location.origin)) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
