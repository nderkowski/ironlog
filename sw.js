/* Iron Log service worker.
   The app has no external requests, so caching its own files is
   enough to make it work with no signal at all. Bump BUILD on every deploy
   that changes any file (they are listed in js/files.js): BUILD names the
   cache, and a deploy that leaves this file's bytes unchanged is not seen by
   browsers as an update at all.

   One version = one cache = one consistent copy of the app.
   - Install downloads the whole shell, past the HTTP cache, or fails. A failed
     install deletes its own partial cache and the old version carries on.
   - There is no skipWaiting() on install. A new version waits until the page
     asks for it (message below), and the page asks only at the moment the app
     is opened and no workout is active. So the files never change under a
     session being logged.
   - Navigations and everything else are answered from this version's own
     cache, never the network. The page and its files can therefore never come
     from two different deploys, whatever GitHub Pages' 10-minute max-age or a
     flaky signal does. Nothing is ever written to the cache after install.
   - Activation deletes every other ironlog-* cache. A version that was
     superseded while it was still waiting is never activated, so its cache
     can linger until the next version activates; it is never read, only
     wasted space. */
const BUILD = "2.0-a1";
const CACHE = "ironlog-" + BUILD;
// The file list is js/files.js, shared with the page and the tests; the query
// string is what makes the browser re-read it with every new BUILD (an imported
// script may otherwise come out of the HTTP cache, up to 10 minutes stale on
// GitHub Pages, with the old list).
importScripts("js/files.js?v=" + BUILD);
const FILES = self.IRONLOG_FILES;
const ICONS = FILES.filter((u) => /^icon-/.test(u));
const CORE = ["./"].concat(FILES.filter((u) => !/^icon-/.test(u)));
// Written last. It is not trusted alone: a cache counts as complete only if it
// has this marker AND every core entry (see install).
const DONE = "./.installed";
// A copy fetched past the HTTP cache, so a version's cache is never built
// from a mix of old and new files.
const fresh = (u) => new Request(u, { cache: "reload" });
const complete = (c) => c.match(DONE).then((m) => m && Promise.all(CORE.map((u) => c.match(u))).then((all) => all.every(Boolean)));

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // Same name, already complete: that is this very version, installed
      // before. Leave it alone; rewriting a cache a running worker reads from
      // could mix two deploys. Complete = the marker and every core entry. A
      // name without them is a crashed install or a cache the browser trimmed:
      // rebuild it.
      complete(c).then((done) => done || caches.delete(CACHE).then(() => caches.open(CACHE)).then((c2) =>
        c2.addAll(CORE.map(fresh))
          // Icons are cosmetic; a missing one must not fail the install.
          .then(() => Promise.all(ICONS.map((u) => c2.add(fresh(u)).catch(() => {}))))
          .then(() => c2.put(DONE, new Response("ok")))
      ))
    // A failed install leaves no half-built cache behind.
    ).catch((err) => caches.delete(CACHE).then(() => Promise.reject(err)))
  );
});

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "skip-waiting") self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.indexOf("ironlog-") === 0).map((k) => caches.delete(k))))
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

/* Always this version's own cache, never caches.match(): while a new version
   waits, the global lookup would search its cache too. */
const mine = (req) => caches.open(CACHE).then((c) => c.match(req));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  // Navigations: the cached shell, with the network only as a last resort for
  // a worker whose cache has none (never the case after a good install).
  if (req.mode === "navigate") {
    e.respondWith(
      mine("./index.html").then((r) => r || mine("./")).then((r) => r || fetch(req))
    );
    return;
  }

  // Everything else: this version's cache, then the network. Whatever the
  // network returns is passed through, never stored.
  e.respondWith(mine(req).then((hit) => hit || fetch(req)));
});
