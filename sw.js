// yomu — service worker. Network first (updates show on the next launch), cache when offline.
const CACHE = "yomu-shell-v6";
const SHELL = ["./", "./index.html", "./css/app.css", "./js/core.js", "./js/lists.js", "./js/reader.js", "./js/boot.js", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  const key = e.request.mode === "navigate" ? "./" : e.request;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await Promise.race([fetch(e.request, { cache: "no-cache" }), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3500))]);
      if (res.ok) cache.put(key, res.clone());
      return res;
    } catch (err) {
      const hit = await cache.match(key, { ignoreSearch: true });
      return hit || Response.error();
    }
  })());
});
