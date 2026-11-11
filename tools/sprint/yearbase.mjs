/* Sprint metric runner: 20 seeds x 52 weeks through the real engine (yearsim.js),
   reported per seed so a change can be judged against seed-to-seed spread.
   Usage: node tools/sprint/yearbase.mjs [seeds=20] [--json out.json]
   Needs the app served at 127.0.0.1:8117. Metrics:
     prog      share of non-deload exposures that progress (load up, or same load + higher target)
     stuckMed  median weeks a light/isolation lift sits at one load (run of same-W exposures, non-deload)
     stuckP90  90th percentile of the same
     flips     weight direction reversals per year (always-Use mode, all lifts)
     land      rep-out landing: share of Use exposures whose last set >= low (target 85%)
     behind    share of exposures >=1 step lighter than the heaviest load where fresh reps >= mid-range
     over      share >=1 step heavier than that;  offAbs  mean |steps off|
     unmeet    exposures where fresh capacity at the prescribed load < low   */
import { launch, URL } from '../test/harness.mjs';
import fs from 'fs';
const SIM = fs.readFileSync(new globalThis.URL('../test/yearsim.js', import.meta.url), 'utf8');
const HOOK = 'window.__t={get S(){return S}, set S(v){S=v}, prescribe:prescribe, shadowPrescribe:shadowPrescribe,' +
  ' deloadCheck:deloadCheck, deloadStatus:deloadStatus, makeSessionEx:makeSessionEx, exWorking:exWorking,' +
  ' ev:function(src){ return eval(src); }};';
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
const NSEED = Number(process.argv[2]) || 20;
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const LIGHT = new Set(['Lateral Raise','DB Curl','Tricep Pushdown','Leg Extension','Low to high cable fly','Rear Delt Fly','Hamstring Curls']);
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
const q = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
function measure(res) {
  const by = {};
  res.log.filter(x => !x.deload).forEach(x => { (by[x.n] = by[x.n] || []).push(x); });
  let acc = 0, behind = 0, over = 0, offSum = 0, unmeet = 0, flips = 0, prog = 0, exp = 0, used = 0, usedOK = 0, progL = 0, expL = 0;
  const stuck = [];
  for (const [n, L] of Object.entries(by)) {
    let dir = 0, runStart = 0;
    L.forEach((x, i) => {
      if (x.fresh < x.low) unmeet++;
      // load accuracy: heaviest load on this lift's step grid where fresh reps >= mid-range
      { const mid = (x.low + x.top) / 2, cap = w => 30 * (x.M / w - 1); let wi = x.W;
        if (cap(wi) >= mid) { while (cap(wi + x.step) >= mid) wi += x.step; } else { while (wi - x.step > 0 && cap(wi) < mid) wi -= x.step; }
        const off = Math.round((wi - x.W) / x.step); acc++; if (off >= 1) behind++; if (off <= -1) over++; offSum += Math.abs(off); }
      if (x.used) { used++; if (x.A >= x.low) usedOK++; }
      if (!i) return;
      exp++; if (LIGHT.has(n)) expL++;
      const p = L[i - 1];
      const pr = x.W > p.W || (x.W === p.W && x.tgt > p.tgt);
      if (pr) { prog++; if (LIGHT.has(n)) progL++; }
      const d = Math.sign(x.W - p.W);
      if (d && dir && d !== dir) flips++;
      if (d) dir = d;
      if (x.W !== p.W) { if (LIGHT.has(n)) stuck.push((x.ts - L[runStart].ts) / (7 * 864e5)); runStart = i; }
    });
    if (LIGHT.has(n)) stuck.push((L[L.length - 1].ts - L[runStart].ts) / (7 * 864e5)); // censored final run
  }
  return { behind: behind / acc, over: over / acc, offAbs: offSum / acc, prog: prog / exp, progL: progL / expL, flips, usedOK: used ? usedOK / used : null, unmeet,
    stuckMed: q(stuck, 0.5), stuckP90: q(stuck, 0.9), stuckMax: Math.max(...stuck) };
}
const SEEDS = Array.from({ length: NSEED }, (_, i) => i + 1);
const out = { presc: [], use: [] };
for (const sd of SEEDS) out.presc.push(measure(await year(sd, { useShadow: false })));
for (const sd of SEEDS) out.use.push(measure(await year(sd, { useShadow: true })));
const st = (a, k) => { const v = a.map(x => x[k]).filter(x => x != null); const m = v.reduce((s, x) => s + x, 0) / v.length;
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, v.length - 1)); return { mean: m, sd, se: sd / Math.sqrt(v.length), min: Math.min(...v), max: Math.max(...v) }; };
const f = (o, pct) => pct ? `${(o.mean * 100).toFixed(1)}% (sd ${(o.sd * 100).toFixed(1)}, se ${(o.se * 100).toFixed(1)})` : `${o.mean.toFixed(2)} (sd ${o.sd.toFixed(2)}, se ${o.se.toFixed(2)})`;
const summary = {};
for (const mode of ['presc', 'use']) {
  console.log(`== ${mode === 'presc' ? 'follow prescribe()' : 'always tap Use (shadow)'}  [${NSEED} seeds]`);
  for (const [k, pct] of [['behind', 1], ['over', 1], ['offAbs', 0], ['prog', 1], ['progL', 1], ['stuckMed', 0], ['stuckP90', 0], ['stuckMax', 0], ['flips', 0], ['usedOK', 1], ['unmeet', 0]]) {
    if (k === 'usedOK' && mode === 'presc') continue;
    const s = st(out[mode], k); summary[mode + '.' + k] = s; console.log(`  ${k.padEnd(9)} ${f(s, pct)}`);
  }
}
if (errors.length) console.log('PAGE ERRORS: ' + errors.join(' | '));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ summary, raw: out }, null, 1));
await browser.close();
