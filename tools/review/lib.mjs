/* Shared plumbing for the independent review.
   Builds a hooked copy of the REAL index.html (PROMPT.md Phase 1 step 1),
   optionally with source-level ablation patches, serves it, and opens it in
   Chromium with Date.now under our control. Nothing here re-implements the
   engine: every prescription comes from the app's own functions. */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
/* Outputs can contain Nick's training data, so they never go in the repo. */
export const OUT = process.env.REVIEW_OUT || '/tmp/ironlog-review-out';
mkdirSync(OUT, { recursive: true });

/* PROMPT.md's hook, plus `ev`: a direct eval inside the app's closure, so the
   harness can read any internal (workLoad, deloadCheck, makeSessionEx…) and,
   for ablations, rebind one. Strict-mode direct eval can read and assign
   existing outer bindings; it cannot add new ones. */
const HOOK = 'var S=load(); window.__t={get S(){return S},prescribe:prescribe,coachRun:coachRun,ev:function(__s){return eval(__s);}};';

/* The app is now several files (index.html, css/app.css, js/*.js; the list is
   js/files.js). buildCopy copies all of them and applies each patch to
   whichever file contains it. Each patch: [find, replace]. find must occur
   exactly once across ALL the files, or we throw — an ablation that silently
   fails to apply would report "no effect". */
function appFiles() {
  /* REVIEW_INDEX pins another build (e.g. the single-file v26 from git) for
     before/after runs: that file is then the whole app. */
  if (process.env.REVIEW_INDEX) return new Map([['index.html', readFileSync(process.env.REVIEW_INDEX, 'utf8')]]);
  const sandbox = { self: {} };
  new Function('self', readFileSync(join(ROOT, 'js', 'files.js'), 'utf8'))(sandbox.self);
  const m = new Map();
  for (const f of sandbox.self.IRONLOG_FILES) {
    if (!existsSync(join(ROOT, f))) continue;
    m.set(f, /\.(html|css|js|webmanifest)$/.test(f) ? readFileSync(join(ROOT, f), 'utf8') : readFileSync(join(ROOT, f)));
  }
  return m;
}
function patchOnce(files, find, rep, what) {
  const hits = [];
  for (const [f, t] of files) if (typeof t === 'string') { const k = t.split(find).length - 1; if (k) hits.push([f, k]); }
  const total = hits.reduce((a, h) => a + h[1], 0);
  if (total !== 1) throw new Error(what + ' found ' + total + ' times' + (what === 'hook line' ? '' : ': ' + find.slice(0, 80)));
  files.set(hits[0][0], files.get(hits[0][0]).replace(find, rep));
}
export function buildCopy(dir, patches = []) {
  const files = appFiles();
  patchOnce(files, '\nvar S=load();\n', '\n' + HOOK + '\n', 'hook line');
  for (const [find, rep] of patches) patchOnce(files, find, rep, 'patch target');
  for (const [f, t] of files) {
    mkdirSync(dirname(join(dir, f)), { recursive: true });
    writeFileSync(join(dir, f), t);
  }
  return dir;
}

export async function serve(dir, port) {
  /* Its own process group, so kill() takes npx's http-server child with it. */
  const p = spawn('npx', ['http-server', '-p', String(port), '-s', '-c-1', dir], { stdio: 'ignore', detached: true });
  const kill = p.kill.bind(p);
  p.kill = () => { try { process.kill(-p.pid, 'SIGTERM'); } catch { kill(); } };
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/index.html`); if (r.ok) return p; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  p.kill(); throw new Error('server did not start on ' + port);
}

/* A page with the app booted on `state`, and Date.now driven by window.__now
   when set (the engine reads Date.now for deload weeks, the coach, step-backs). */
export async function openApp(port, state, browser, path = 'index.html') {
  const own = !browser;
  browser = browser || await chromium.launch();
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  /* Both Date.now() and a bare new Date() (weekBounds, the calendar) follow
     window.__now when it is set. */
  await ctx.addInitScript(() => {
    const RealDate = Date;
    const now = () => (typeof window.__now === 'number' ? window.__now : RealDate.now());
    class SimDate extends RealDate {
      constructor(...a) { if (a.length === 0) super(now()); else super(...a); }
      static now() { return now(); }
    }
    window.Date = SimDate;
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`http://127.0.0.1:${port}/${path}`);
  await page.evaluate(s => localStorage.setItem('ironlog.v1', JSON.stringify(s)), state);
  await page.reload();
  await page.waitForFunction(() => window.__t && window.__t.S);
  return { browser, ctx, page, errors, close: async () => { await ctx.close(); if (own) await browser.close(); } };
}

export function loadExport() {
  const f = process.env.IRONLOG_EXPORT || join(ROOT, 'ironlog-2026-11-07.json');
  if (!existsSync(f)) throw new Error('export not found: ' + f + ' (it is gitignored; Nick attaches it)');
  return JSON.parse(readFileSync(f, 'utf8'));
}
