const CACHE_NAME = "mf-tickets-v9";
const RUNTIME_ASSETS = new Set([
  "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"
]);
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./supabase-config.js",
  "./ticket-store.js",
  "./boleta.html",
  "./boleta.css",
  "./boleta.js",
  "./manifest.webmanifest",
  "./assets/mf-icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    (async () => {
      const requestUrl = new URL(event.request.url);
      const sameOrigin = requestUrl.origin === self.location.origin;
      const cached = await caches.match(event.request, { ignoreSearch: sameOrigin });
      if (cached) return cached;
      try {
        const response = await fetch(event.request);
        const cacheable = sameOrigin || RUNTIME_ASSETS.has(requestUrl.href);
        if (cacheable && (response.ok || response.type === "opaque")) {
          const responseCopy = response.clone();
          await caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        }
        return response;
      } catch {
        if (event.request.mode !== "navigate") return Response.error();
        const isTicketPage = requestUrl.pathname.endsWith("boleta.html");
        return caches.match(isTicketPage ? "./boleta.html" : "./index.html");
      }
    })()
  );
});
