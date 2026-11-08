/* Where do light lifts sit stuck? Dumps runs >= 6 weeks at one load with the engine's why text. */
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
const mode = process.argv[2] === 'use';
const { browser } = await launch();
const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
await page.route('**/index.html', async route => { const res = await route.fetch();
  route.fulfill({ response: res, body: (await res.text()).replace('var S=load();', 'var S=load();\n' + HOOK) }); });
const why = {}, lifts = {};
for (let seed = 1; seed <= 8; seed++) {
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => !!window.__t); await page.addScriptTag({ content: SIM });
  const res = await page.evaluate(c => window.runSim(c), { seed, lifts: liftsFor(seed), missed: missedFor(seed), useShadow: mode });
  const by = {}; res.log.filter(x => !x.deload).forEach(x => (by[x.n] = by[x.n] || []).push(x));
  for (const [n, L] of Object.entries(by)) {
    let s = 0;
    for (let i = 1; i <= L.length; i++) {
      if (i < L.length && L[i].W === L[s].W) continue;
      const wks = ((i < L.length ? L[i].ts : L[L.length - 1].ts) - L[s].ts) / 6048e5;
      if (wks >= 6) {
        lifts[n] = (lifts[n] || 0) + wks;
        for (let k = s; k < i; k++) { const w = String(L[k].presc.why || '').replace(/\d+(\.\d+)?/g, '#').slice(0, 70); why[w] = (why[w] || 0) + 1; }
        if (seed === 1) console.log(n, 'W', L[s].W, wks.toFixed(1) + 'wk', 'range', L[s].low + '-' + L[s].top, 'step', L[s].step,
          'reps', L.slice(s, i).map(x => x.tgt + ':' + x.reps.join(',')).join(' | ').slice(0, 300));
      }
      s = i;
    }
  }
}
console.log('\nweeks stuck (>=6wk runs) by lift, 8 seeds:'); Object.entries(lifts).sort((a, b) => b[1] - a[1]).forEach(([n, w]) => console.log('  ' + n.padEnd(24) + w.toFixed(0)));
console.log('\nwhy text during stuck runs:'); Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([w, c]) => console.log('  ' + c + '  ' + w));
await browser.close();
