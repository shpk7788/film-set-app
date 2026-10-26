// Keeps the app's own files available offline (network first, so updates show straight away).
// Data always comes live from the database.
const CACHE = "filmset-v3";
const FILES = ["./", "index.html", "config.js", "css/app.css", "icon.svg", "manifest.webmanifest",
  "js/main.js", "js/api.js", "js/ui.js", "js/views/auth.js", "js/views/home.js", "js/views/parts.js",
  "js/views/schedule.js", "js/views/crew.js", "js/views/admin.js",
  "js/views/imports.js", "js/views/artists.js", "js/parse.js", "js/importer.js"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html"))),
  );
});
