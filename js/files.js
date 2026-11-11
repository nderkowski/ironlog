/* The one list of files that make up Iron Log. Three things read it and none of
   them keeps a copy:
     - sw.js (importScripts) precaches exactly these, so the offline copy can
       never disagree with the page;
     - tools/test/t47-split.mjs checks that index.html's <link>/<script> tags
       are this list's css and js entries, in this order, and that every file
       here exists and every file under css/ and js/ is listed;
     - the page itself loads the css/js entries through ordinary tags in
       index.html (js/files.js is the one entry the page does not load: only
       the service worker needs it).
   Add a file here, in index.html and nowhere else. Order matters: the js files
   are classic scripts that share one global scope and run top to bottom.
   Entries starting "icon-" are cached best-effort; every other entry must
   cache or the new service worker does not install.
   The boot integrity gate is an inline script at the end of index.html (it
   must not depend on a file); it carries the number of numbered files, 12, and
   t47 keeps that equal to the count here. */
self.IRONLOG_FILES = [
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "js/01-state.js",
  "js/02-helpers.js",
  "js/03-metrics.js",
  "js/04-engine.js",
  "js/05-shell.js",
  "js/06-today.js",
  "js/07-formcheck.js",
  "js/08-progress.js",
  "js/09-plan.js",
  "js/10-sync-ai.js",
  "js/11-coach.js",
  "js/12-boot.js",
  "js/sw-update.js",
  "js/files.js",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable-512.png",
  "icon-180.png"
];
