/* El Rayo — Autodesign Studio Service Worker (Offline PWA + Cache IA) */
const STATIC_CACHE = "el-rayo-static-v7";
const MODEL_CACHE = "el-rayo-models-v3";

const LOCAL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./assets/logo_el_rayo.png",
  "./css/styles.css",
  "./js/app.js",
  "./js/paintEngine.js",
  "./js/segmentation.js",
  "./js/samWorker.js",
  "./js/decalManager.js",
  "./js/quoteCalculator.js",
  "./js/storageAndExport.js"
];

function isModelOrCdnRequest(url) {
  const href = url.href;
  const path = url.pathname.toLowerCase();
  if (
    path.endsWith(".onnx") ||
    path.endsWith(".wasm") ||
    path.endsWith(".mjs") ||
    path.endsWith(".ort")
  ) {
    return true;
  }
  return (
    url.hostname.includes("huggingface.co") ||
    url.hostname.includes("hf.co") ||
    url.hostname.includes("cdn.jsdelivr.net")
  );
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(LOCAL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  const validCaches = new Set([STATIC_CACHE, MODEL_CACHE]);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !validCaches.has(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // 1. Modelos .onnx, binarios .wasm y librerías CDN -> Cache-First permanente
  if (isModelOrCdnRequest(url)) {
    event.respondWith(
      caches.open(MODEL_CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;

        const networkResponse = await fetch(request);
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === "opaque")) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      })
    );
    return;
  }

  // 2. Archivos locales de la app -> Network-First (siempre toma cambios nuevos al recargar y cae a caché si está offline)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async cache => {
        try {
          const networkResponse = await fetch(request, { cache: "no-cache" });
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cached = await cache.match(request, { ignoreSearch: true });
          if (cached) return cached;
          if (request.mode === "navigate") {
            const shell = await cache.match("./index.html");
            if (shell) return shell;
          }
          return new Response("Recurso no disponible sin conexión.", {
            status: 503,
            statusText: "Offline",
            headers: { "Content-Type": "text/plain; charset=utf-8" }
          });
        }
      })
    );
  }
});
