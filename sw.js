/* Iron Log service worker.
   The app is one HTML file with no external requests, so caching the shell is
   enough to make it work with no signal at all. Bump CACHE on every deploy. */
const CACHE = "ironlog-v24.1";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./icon-180.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // Individually, so one missing icon can't fail the whole install.
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* The rest-timer notification. Tapping it should land you back in the set you
   were mid-way through, not open a second copy of the app. */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.indexOf(self.registration.scope) === 0 && "focus" in c) return c.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow("./") : undefined;
    })
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // Navigations: network first so a deploy lands promptly, cache as the fallback.
  // Only a good response becomes the app shell. A 404 from a mistyped URL, or a
  // 5xx from the host, used to be stored as ./index.html, and the next offline
  // launch was a blank page. A bad response shows the cached shell instead,
  // when there is one.
  if (req.mode === "navigate") {
    const shell = () => caches.match("./index.html").then((r) => r || caches.match("./"));
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (!res.ok) return shell().then((r) => r || res);
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(shell)
    );
    return;
  }

  // Everything else: cache first, it never changes within a version. Errors
  // are passed through but never cached.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => hit))
  );
});
