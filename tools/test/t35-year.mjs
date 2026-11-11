/* A simulated year on the recommended plan, through the real engine.

   Trap 17b says simulate the loop, not one verdict; trap 17c says a
   simulated lifter built from the app's own Epley agrees with it by
   construction. This suite is the first: it guards the v25 fixes against
   coming undone. Bounds are loose on purpose (a few seeds, not twenty) and
   sit far from where v24.1 was, so they catch a regression, not noise.

     v24.1 (20 seeds)                           v25 (10 seeds)
     follow prescribe(): unmeetable loads 146   7
                         sessions progressing 40%  53%
     always tap Use:     load flip-flops 198    19
                         rep-out ≥ low 81%      93%   (the v25 gate is 85%)
     illness year:       deload weeks 10.8      2.9

   The hook is injected into the page as it loads (page.route), so the app
   itself carries no test code. */
import { launch, URL, ok, report } from './harness.mjs';
import fs from 'fs';

const SIM = fs.readFileSync(new globalThis.URL('./yearsim.js', import.meta.url), 'utf8');
const HOOK = 'window.__t={get S(){return S}, set S(v){S=v}, prescribe:prescribe,' +
  ' deloadCheck:deloadCheck, deloadStatus:deloadStatus, makeSessionEx:makeSessionEx, exWorking:exWorking,' +
  ' ev:function(src){ return eval(src); }};';

/* Starting loads and fresh reps-to-failure there, for the plan's lifts. */
const START = {
  'Leg Press': [190, 13], 'Incline DB Press': [55, 12], 'Cable Row': [65, 13], 'Hamstring Curls': [125, 12],
  'Lateral Raise': [15, 19], 'DB Curl': [30, 11], 'Tricep Pushdown': [30, 15], 'Bulgarian Split Squat': [25, 12],
  'DB Overhead Press': [45, 11], 'Lat Pulldown': [150, 11], 'Leg Extension': [90, 15], 'RDL': [225, 10],
  'Flat DB Press': [60, 12], 'DB Row': [65, 13], 'Low to high cable fly': [20, 16], 'Rear Delt Fly': [10, 22] };
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function liftsFor(seed) {
  const r = mulberry(seed * 7919 + 13), out = {};
  for (const [n, [w0, c0]] of Object.entries(START)) out[n] = { w0, c0: c0 + (r() * 3 - 1.5), G: 0.05 + r() * 0.10, K: 1 };
  return out;
}
function missedFor(seed) { const r = mulberry(seed * 31 + 7); return [11, 27, 41].map(w => w + Math.round(r() * 4 - 2)); }

/* Its own context with service workers blocked: the app's worker would
   otherwise answer the page load from cache and the hook would never land. */
const { browser, errors } = await launch();
const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
page.on('pageerror', e => errors.push(String(e)));
await page.route('**/js/12-boot.js', async route => {
  const res = await route.fetch();
  const body = (await res.text()).replace('var S=load();', 'var S=load();\n' + HOOK);
  route.fulfill({ response: res, body });
});

async function year(seed, sc) {
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => !!window.__t);
  await page.addScriptTag({ content: SIM });
  return page.evaluate(c => window.runSim(c), Object.assign({ seed, lifts: liftsFor(seed), missed: missedFor(seed) }, sc));
}

/* The few numbers that matter, from the per-exposure log. */
function measure(res) {
  const by = {};
  res.log.filter(x => !x.deload).forEach(x => { (by[x.n] = by[x.n] || []).push(x); });
  let unmeet = 0, flips = 0, prog = 0, exp = 0, used = 0, usedOK = 0;
  for (const L of Object.values(by)) {
    let dir = 0;
    L.forEach((x, i) => {
      if (x.fresh < x.low) unmeet++;
      if (x.used) { used++; if (x.A >= x.low) usedOK++; }
      if (!i) return;
      exp++;
      const p = L[i - 1];
      if (x.W > p.W || (x.W === p.W && x.tgt > p.tgt)) prog++;
      const d = Math.sign(x.W - p.W);
      if (d && dir && d !== dir) flips++;
      if (d) dir = d;
    });
  }
  const weeks = res.sessLog.filter(s => s.started).length;
  let backToBack = 0, lastEnd = -1e9;
  res.sessLog.forEach(s => { if (s.started) { if (s.ts - lastEnd < 3 * 864e5) backToBack++; lastEnd = s.ts + 7 * 864e5; } });
  return { unmeet, flips, prog: prog / exp, usedOK: used ? usedOK / used : null, weeks, backToBack };
}
const mean = (a, k) => a.reduce((s, x) => s + x[k], 0) / a.length;
const SEEDS = [1, 2, 3, 4];

/* ---- following prescribe() only ---- */
const s1 = []; for (const sd of SEEDS) s1.push(measure(await year(sd, {})));
console.log('  prescribe only: unmeetable ' + mean(s1, 'unmeet').toFixed(1) + ', progressing ' +
  (mean(s1, 'prog') * 100).toFixed(0) + '%, flips ' + mean(s1, 'flips').toFixed(1));
ok(mean(s1, 'unmeet') <= 25, 'prescribe: almost never asks for a load he cannot reach the range at  [' + mean(s1, 'unmeet').toFixed(1) + '/yr, v24.1: 146]');
ok(mean(s1, 'prog') >= 0.48, 'prescribe: about half of all sessions progress  [' + (mean(s1, 'prog') * 100).toFixed(0) + '%, v24.1: 40%]');
ok(mean(s1, 'flips') <= 30, 'prescribe: load rarely flips up and down  [' + mean(s1, 'flips').toFixed(1) + ']');

/* ---- an illness mid-year: the deload loop ---- */
const s3 = []; for (const sd of SEEDS) s3.push(measure(await year(sd, { illness: { from: 22, len: 6, depth: 0.10, rec: 6 } })));
console.log('  illness:        deload weeks ' + mean(s3, 'weeks').toFixed(1) + ', back to back ' + mean(s3, 'backToBack').toFixed(1));
ok(mean(s3, 'weeks') <= 5, 'illness: a handful of deload weeks, not a dozen  [' + mean(s3, 'weeks').toFixed(1) + ', v24.1: 10.8]');
ok(s3.every(m => m.backToBack === 0), 'illness: never a deload week straight after another  [' + s3.map(m => m.backToBack).join(',') + ']');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t35 simulated year');
await browser.close();
