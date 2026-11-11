/* Shared plumbing for the suites that play a GitHub Pages deploy against a real
   Chromium service worker (t47, t48). Not a suite itself: runall.sh only runs
   t*.mjs.

   - treeFromGit(ref)    a ref's files extracted to a temp dir (v26.13 is 4f31e5f)
   - deployServer(opts)  a static server whose served tree can be swapped between
                         visits, with per-path overrides and 404s, ETags, and a
                         configurable Cache-Control (GitHub Pages sends max-age=600)
   - newApp(browser)     a Pixel-5 context + page that records errors, failed
                         requests and loads
   - the phone: seed, start / log / save a workout, "open" the app (a reload) and
     "return to the foreground" (a hidden -> visible change) */
import { devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function until(fn, ms = 10000, step = 150) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(step); }
  return false;
}

/* A git ref's tree, extracted. Needs the history (v26.13 = 4f31e5f). */
export function treeFromGit(ref) {
  const dir = mkdtempSync(join(tmpdir(), 'ironlog-tree-'));
  const tarball = execFileSync('git', ['archive', ref], { cwd: ROOT, maxBuffer: 1 << 28 });
  execFileSync('tar', ['-x', '-C', dir], { input: tarball });
  return dir;
}

const MIME = { html: 'text/html', js: 'application/javascript', css: 'text/css', webmanifest: 'application/manifest+json', png: 'image/png' };

/* A static server of one tree at a time. Between visits a test plays a deploy by
   changing `tree`, giving `over[path]` a different body (string or Buffer),
   listing paths in `gone` (404) or in `delay` (ms). `cc` is the Cache-Control it
   sends. */
export async function deployServer({ tree = ROOT, cc = 'no-store' } = {}) {
  const st = { tree, cc, over: {}, gone: new Set(), delay: {}, hits: {} };
  const srv = createServer((req, res) => setTimeout(() => handle(req, res), st.delay[new globalThis.URL(req.url, 'http://x').pathname.slice(1)] || 0));
  const handle = (req, res) => {
    const path = new globalThis.URL(req.url, 'http://x').pathname;
    const rel = path === '/' ? 'index.html' : path.slice(1);
    st.hits[rel] = (st.hits[rel] || 0) + 1;
    if (st.gone.has(rel)) { res.writeHead(404); return res.end('not found'); }
    let body;
    if (rel in st.over) body = Buffer.from(st.over[rel]);
    else if (!rel.includes('..') && existsSync(join(st.tree, rel))) body = readFileSync(join(st.tree, rel));
    else { res.writeHead(404); return res.end('not found'); }
    const etag = '"' + createHash('sha1').update(body).digest('hex').slice(0, 16) + '"';
    const headers = { 'content-type': MIME[rel.split('.').pop()] || 'application/octet-stream', 'cache-control': st.cc, etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    res.writeHead(200, headers);
    res.end(body);
  };
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  st.url = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  st.close = () => new Promise(r => { srv.closeAllConnections && srv.closeAllConnections(); srv.close(r); });
  return st;
}

/* `const BUILD = "..."` in sw.js, bumped: a different byte stream is a new version. */
export const swBuild = src => (/const BUILD = "([^"]+)"/.exec(src) || [])[1];
/* The cache a worker names: a literal `const CACHE = "..."` (v26.13) or "ironlog-" + BUILD (v26.14 on). */
export const cacheName = src => (/const CACHE = "([^"+]+)";/.exec(src) || [])[1] || 'ironlog-' + swBuild(src);
export const bumpSw = (src, suffix) => src.replace(/const BUILD = "([^"]+)"/, (_, b) => 'const BUILD = "' + b + suffix + '"');
/* The app's own BUILD, wherever the tree keeps it (index.html, or js/01-state.js once split). */
export function appBuild(tree) {
  for (const f of ['index.html', 'js/01-state.js']) {
    if (!existsSync(join(tree, f))) continue;
    const m = /var BUILD="([^"]+)"/.exec(readFileSync(join(tree, f), 'utf8'));
    if (m) return m[1];
  }
  return null;
}

/* ---- the phone ---- */
export async function newApp(browser, opts = {}) {
  const ctx = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, serviceWorkers: 'allow' });
  const app = { ctx, errors: [], failed: [], nav: { loads: 0 }, pages: [] };
  app.open = async (url, label = '') => {
    const page = await ctx.newPage();
    page.on('pageerror', e => app.errors.push(label + String(e)));
    page.on('console', m => { if (m.type() === 'error') app.errors.push(label + 'console: ' + m.text()); });
    page.on('requestfailed', r => app.failed.push(label + r.url() + ' ' + (r.failure() || {}).errorText));
    page.on('load', () => app.nav.loads++);
    /* The app may legitimately reload itself at an open (that is what is under test), so an evaluate
       that lands in the middle of one is retried on the new page rather than failing the run. */
    const ev = page.evaluate.bind(page);
    page.evaluate = async (...a) => {
      for (let i = 0; ; i++) {
        try { return await ev(...a); }
        catch (e) { if (i < 5 && /context was destroyed|navigat/i.test(String(e))) { await sleep(400); continue; } throw e; }
      }
    };
    app.pages.push(page);
    if (url) await page.goto(url);
    return page;
  };
  const page = await app.open(null);
  app.page = page;
  return app;
}

export const SET = { unit: 'lb', rest: 120, autoRest: false, buzz: false, inc: 5, sound: false, notify: false, rpe: false,
  keepTone: false, autoBackup: false, shareMode: '', doubleDefault: true, repLow: 8, repHigh: 12, rangeFixHidden: true,
  bodyweight: 180, deloadUntil: 0, deloadSnooze: 0, bar: 45, plates: [{ w: 45, n: 4 }, { w: 25, n: 2 }, { w: 10, n: 2 }, { w: 5, n: 2 }, { w: 2.5, n: 2 }], lastBackup: 0 };
export function seed() {
  const sessions = [];
  for (let i = 0; i < 6; i++) {
    const ts = Date.now() - (i + 1) * 3 * 86400000;
    sessions.push({ id: 's' + i, ts, endTs: ts + 3600000, routineId: 'r1', key: 'A', name: 'Day A',
      exercises: [{ id: 'e' + i, planId: 'p1', name: 'Bench Press', sets: [0, 1, 2].map(() => ({ w: '135', r: '8', done: true, load: 135 })) }] });
  }
  return { version: 4, settings: SET,
    routines: [{ id: 'r1', key: 'A', name: 'Day A', exercises: [{ id: 'p1', name: 'Bench Press', sets: 3, reps: 8, repTop: 12, bar: 45 }] }],
    sessions, active: null };
}
export const cacheKeys = page => page.evaluate(() => caches.keys().then(k => k.sort()));
export const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog.v1')));
export async function seedAndLoad(page, state, url) {
  await page.goto(url);
  await page.evaluate(s => localStorage.setItem('ironlog.v1', JSON.stringify(s)), state);
  await page.reload();
  await page.waitForSelector('#view');
}
export async function waitController(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  try { await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 6000 }); }
  catch (e) {
    /* Chromium sometimes leaves a page that was reloaded mid-activation uncontrolled until its next
       navigation (reproduced against v26.13's own worker, about 1 first install in 12). A user just
       opens the app again, so do that. */
    await page.reload();
    await page.waitForSelector('#view');
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  }
}
export const startWorkout = async page => { await page.locator('[data-act="start"].primary').tap(); await page.waitForSelector('.card.ex'); };
export const logSet = async page => { await page.locator('.set[data-ei="0"][data-si="0"] .tick').tap(); await page.waitForTimeout(300); };
export const saveWorkout = async page => {
  await page.locator('button[data-act="finish"]').first().tap();
  await page.locator('.sheet [data-x="save"]').tap();
  await page.waitForTimeout(400);
};
export const regState = page => page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return { waiting: !!(r && r.waiting), installing: !!(r && r.installing), active: !!(r && r.active) };
});
/* Leave and come back, the way a phone does: a hidden -> visible change on the same page. */
export async function background(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}
export async function foreground(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}
/* A completed workout on the open page: start, log one set, save. */
export async function oneWorkout(page) { await startWorkout(page); await logSet(page); await saveWorkout(page); }
/* The build the page is running, without touching it: the global once the app is
   split, else read from the inline script (the single-file app keeps BUILD inside
   its IIFE). */
export const pageBuild = page => page.evaluate(() => {
  if (typeof BUILD !== 'undefined') return BUILD;
  for (const s of document.scripts) { const m = /var BUILD="([^"]+)"/.exec(s.textContent); if (m) return m[1]; }
  return null;
});
