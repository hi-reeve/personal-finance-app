// Service worker template. `scripts/precache.ts` fills in VERSION and PRECACHE after each build and
// writes the result to the site root as sw.js. A new build changes this file, which is how browsers
// notice an update.
const VERSION = __VERSION__;
const PRECACHE = __PRECACHE__;
const CACHE = "pfa-shell-" + VERSION;
const SHELL = "/_shell.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        PRECACHE.map(async (url) => {
          const response = await fetch(new Request(url, { cache: "reload" }));
          if (!response.ok) throw new Error("Could not precache " + url + ": " + response.status);
          // A host that answers a missing file with the app shell must not get that shell cached under the file's name.
          const type = response.headers.get("content-type") || "";
          if (type.startsWith("text/html") && !url.endsWith(".html")) {
            throw new Error("Could not precache " + url + ": got HTML");
          }
          await cache.put(url, response);
        }),
      ),
    ),
  );
  // No skipWaiting here: the page asks for it, so an open session is never switched underneath the user.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("pfa-shell-") && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  // Always answer from this version's own cache, never from another version's.
  const fromCache = (key) => caches.open(CACHE).then((cache) => cache.match(key));
  if (request.mode === "navigate") {
    event.respondWith(fromCache(SHELL).then((shell) => shell || fetch(request)));
  } else {
    event.respondWith(fromCache(request).then((cached) => cached || fetch(request)));
  }
});
