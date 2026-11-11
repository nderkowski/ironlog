/* Measurement, not a test: how often does trend() call a FLAT lift "down"?
   Reviewer's claim: 25% of the time at 4 sessions of history, 2.4% at 8.

   A flat lifter here is yearsim's lifter with no strength gain at all (G = 0): Epley capacity
   fixed, +-1 rep of noise plus its 1-rep fatigue drop per set. The verdict is read from the real
   trend() before each session is built (the `tr` field of the yearsim log), so the history it sees
   is whatever the real engine had the lifter do. Three flavours:

     closed    follow prescribe() on a flat lifter, noise only (no bad days, no gaps)
     closed+   the same with yearsim's defaults: 6% bad days at -3 reps, three 10-14 day gaps
     pinned    the bar never moves from its first load (reps still follow the prescription)

   Run: IRONLOG_PORT=8120 node tools/test/t43-trend-flat.mjs */
import { launch, URL } from './harness.mjs';
import fs from 'fs';

const SIM = fs.readFileSync(new globalThis.URL('./yearsim.js', import.meta.url), 'utf8');
const HOOK = 'window.__t={get S(){return S}, set S(v){S=v}, prescribe:prescribe,' +
  ' deloadCheck:deloadCheck, deloadStatus:deloadStatus, makeSessionEx:makeSessionEx, exWorking:exWorking,' +
  ' ev:function(src){ return eval(src); }};';
const START = {
  'Leg Press': [190, 13], 'Incline DB Press': [55, 12], 'Cable Row': [65, 13], 'Hamstring Curls': [125, 12],
  'Lateral Raise': [15, 19], 'DB Curl': [30, 11], 'Tricep Pushdown': [30, 15], 'Bulgarian Split Squat': [25, 12],
  'DB Overhead Press': [45, 11], 'Lat Pulldown': [150, 11], 'Leg Extension': [90, 15], 'RDL': [225, 10],
  'Flat DB Press': [60, 12], 'DB Row': [65, 13], 'Low to high cable fly': [20, 16], 'Rear Delt Fly': [10, 22] };
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const liftsFor = seed => { const r = mulberry(seed * 7919 + 13), out = {};
  for (const [n, [w0, c0]] of Object.entries(START)) out[n] = { w0, c0: c0 + (r() * 3 - 1.5), G: 0, K: 1 }; return out; };

const { browser, errors } = await launch();
const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
page.on('pageerror', e => errors.push(String(e)));
await page.route('**/js/12-boot.js', async route => {
  const res = await route.fetch();
  route.fulfill({ response: res, body: (await res.text()).replace('var S=load();', 'var S=load();\n' + HOOK) });
});
async function run(seed, sc) {
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => !!window.__t);
  await page.addScriptTag({ content: SIM });
  return page.evaluate(c => window.runSim(c), Object.assign({ seed, lifts: liftsFor(seed), maxSessions: 36 }, sc));
}
const FLAVOURS = [
  ['closed ', { useShadow: false, badP: 0, missed: [] }],
  ['closed+', { useShadow: false }],
  ['pinned ', { useShadow: false, badP: 0, missed: [], pinLoad: true }],
];
const SEEDS = Array.from({ length: 60 }, (_, i) => i + 1), HS = [4, 5, 6, 7, 8, 9, 10];
for (const [name, sc] of FLAVOURS) {
  const tally = {}; HS.forEach(h => tally[h] = { down: 0, up: 0, n: 0 });
  for (const sd of SEEDS) {
    const res = await run(sd, Object.assign({}, sc, sc.missed ? {} : { missed: [11, 27, 41] }));
    for (const x of res.log) {
      if (x.deload || !tally[x.tr.n]) continue;       // history of exactly h sessions
      const t = tally[x.tr.n]; t.n++; if (x.tr.state === 'down') t.down++; if (x.tr.state === 'up') t.up++;
    }
  }
  console.log(name + '  history: ' + HS.join('      '));
  console.log('         down:    ' + HS.map(h => (100 * tally[h].down / tally[h].n).toFixed(1).padStart(5) + '%').join(' '));
  console.log('         up:      ' + HS.map(h => (100 * tally[h].up / tally[h].n).toFixed(1).padStart(5) + '%').join(' '));
  console.log('         samples: ' + HS.map(h => String(tally[h].n).padStart(6)).join(' '));
}

/* ---- synthetic: the lifter reduced to its essence ----
   No engine, no plan. 3 sets at one load, 8-12 range, last set a rep-out, the same underlying
   capacity every session, and only rep noise on top. trend() is the real one. */
await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
await page.waitForFunction(() => !!window.__t);
const syn = await page.evaluate(() => {
  const T = window.__t, ev = T.ev, trend = ev('trend');
  const settings = ev('defaultState().settings');
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const ri = () => Math.floor(rnd() * 3) - 1;                // -1, 0, +1 with equal odds
  const MODELS = {
    'every set +-1 (independent)': (c, sess) => [0, 1, 2].map(() => c + ri()),
    'whole session +-1 (shared)': (c, sess) => { const d = ri(); return [c + d, c + d, c + d]; },
    'whole session +-1, last set 1 under': (c, sess) => { const d = ri(); return [c + d, c + d, c + d - 1]; },
  };
  const out = {};
  for (const [name, gen] of Object.entries(MODELS)) for (const c of [8, 10, 12]) {
    const key = name + ', capacity ' + c, tally = {};
    for (let h = 4; h <= 10; h++) tally[h] = { down: 0, n: 0 };
    for (let trial = 0; trial < 2000; trial++) {
      const sessions = [];
      for (let k = 0; k < 10; k++) {
        const reps = gen(c), ts = Date.UTC(2026, 0, 5) + k * 3 * 864e5;
        const sets = reps.map((r, i) => ({ w: '100', r: String(Math.max(1, r)), done: true, load: 100, out: i === 2 }));
        sessions.unshift({ id: 's' + k, ts, endTs: ts + 36e5, routineId: null, key: 'A', name: 'A',
          exercises: [{ id: 'e' + k, planId: null, name: 'Syn Press', reps: 8, repTop: 12, sets }] });
        if (k + 1 >= 4) { T.S = { version: 5, settings, routines: [], sessions: sessions.slice() };
          const t = trend('Syn Press'); tally[k + 1].n++; if (t.state === 'down') tally[k + 1].down++; }
      }
    }
    out[key] = tally;
  }
  return out;
});
console.log('\nsynthetic flat lifter, real trend(), 2000 lifters per row (share of "down")');
console.log('  history:' + ' '.repeat(54) + [4, 5, 6, 7, 8, 9, 10].map(h => String(h).padStart(6)).join(''));
for (const [k, t] of Object.entries(syn)) console.log('  ' + k.padEnd(61) + [4, 5, 6, 7, 8, 9, 10].map(h => (100 * t[h].down / t[h].n).toFixed(1).padStart(5) + '%').join(''));
if (errors.length) console.log('page errors: ' + errors.join(' | '));
await browser.close();
