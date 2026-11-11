/* Engine invariants over the simulated year (t43).

   t35 pins a few aggregate numbers (progress rate, flip-flops, deload count).
   Those move whenever a rule is tuned. This suite asserts the opposite kind of
   thing: properties that must hold of ANY version of the jump / back-off /
   deload rules, so it can sit behind a rule change and say "the engine still
   behaves like a progression engine" without knowing the new numbers.

   8 seeds x 52 weeks x several runs, through the real makeSessionEx() /
   prescribe() / deloadCheck():
     prescribe       follow prescribe() exactly
     illness         a six-week illness from week 22
     flat, plateau, sick-prescribe   lifters the old trend cut used to fire on
     pins            four machine lifts on a stack with uneven spacing
     topback         RDL and Leg Press as one top set plus back-offs
   For every exposure the log carries what prescribe() said, what the lifter did,
   and the trend verdict the engine had just read (yearsim.js).

     1  every load and target is a sane number
     2  every load sits on the lift's step grid (start + k * step), or on its stack
     3  a lift that topped its range moves up, or says why not
     4  no trend back-off: the slope of the last sessions never cuts the load (2.0)
     5  a deload week is lighter and shorter, and never starts straight after one
     6  no single prescription moves the bar further than a step rule allows
     7  no page errors
     8  top + back-offs: back-offs are lighter than the top but not by much, and
        a top-set lift is never held for "Only N of M sets"
     9  stack weights: no prescribed or back-off load off the pin list

   A failure here is a finding, not a flaky test: the assertion is not to be
   loosened to pass. The failing cases are printed with their neighbours.

   The hook is injected as the page loads (page.route), same as t35, so the app
   ships without test code. IRONLOG_MUTANT=<name> breaks one rule in memory (the
   files on disk are never touched) to show the invariant that catches it. */
import { launch, URL, ok, report } from './harness.mjs';
import fs from 'fs';

const SIM = fs.readFileSync(new globalThis.URL('./yearsim.js', import.meta.url), 'utf8');
const HOOK = 'window.__t={get S(){return S}, set S(v){S=v}, prescribe:prescribe,' +
  ' deloadCheck:deloadCheck, deloadStatus:deloadStatus, makeSessionEx:makeSessionEx, exWorking:exWorking,' +
  ' ev:function(src){ return eval(src); }};';

/* Starting loads and fresh reps-to-failure there, for the plan's lifts (as t35). */
const START = {
  'Leg Press': [190, 13], 'Incline DB Press': [55, 12], 'Cable Row': [65, 13], 'Hamstring Curls': [125, 12],
  'Lateral Raise': [15, 19], 'DB Curl': [30, 11], 'Tricep Pushdown': [30, 15], 'Bulgarian Split Squat': [25, 12],
  'DB Overhead Press': [45, 11], 'Lat Pulldown': [150, 11], 'Leg Extension': [90, 15], 'RDL': [225, 10],
  'Flat DB Press': [60, 12], 'DB Row': [65, 13], 'Low to high cable fly': [20, 16], 'Rear Delt Fly': [10, 22] };
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function liftsFor(seed, flat) {
  const r = mulberry(seed * 7919 + 13), out = {};
  for (const [n, [w0, c0]] of Object.entries(START)) out[n] = { w0, c0: c0 + (r() * 3 - 1.5), G: flat ? 0 : 0.05 + r() * 0.10, K: 1 };
  return out;
}
function missedFor(seed) { const r = mulberry(seed * 31 + 7); return [11, 27, 41].map(w => w + Math.round(r() * 4 - 2)); }

/* A stack on purpose uneven: w0, then alternating +5 / +7.5 steps up (12 of them) and down while above zero. */
function stack(w0) {
  const v = [w0];
  let w = w0; for (let i = 0; i < 12; i++) { w += i % 2 ? 7.5 : 5; v.push(w); }
  w = w0; for (let i = 0; ; i++) { w -= i % 2 ? 7.5 : 5; if (w <= 0) break; v.push(w); }
  return v.sort((a, b) => a - b);
}
const PINS = { 'Cable Row': stack(65), 'Tricep Pushdown': stack(30), 'Lat Pulldown': stack(150), 'Low to high cable fly': stack(20) };

/* Self-check: IRONLOG_MUTANT=<name> serves the app with one rule deliberately broken (in memory; the files are
   never touched) so you can see the invariant that should catch it do so. A mutant's text may sit in any of the
   js/ files; the route below patches whichever one has it and refuses to run if none does. */
const MUTANTS = {
  grid:      ['var back=Math.round(w*0.9/step)*step;', 'var back=Math.round(w*0.9);', 'inv 2'],
  bigjump:   ['mode===2?Math.max(0,w-step):w+step; }', 'mode===2?Math.max(0,w-step):w+3*step; }', 'inv 6'],
  stuck:     ['mode===2?Math.max(0,w-step):w+step; }', 'mode===2?Math.max(0,w-step):(w>=100?w:w+step); }', 'inv 3'],
  deloadheavy: ['return {w:easierEx(w,ex),r:low,sets:Math.max(1,Math.round(nsets*0.6))', 'return {w:w+stepFor(ex),r:low,sets:nsets+1', 'inv 5'],
  trendcut:  ['  var rp=rpeMean(last.sets);', '  if(trend(name).state==="down"){ var bk0=easierEx(w,ex); if(bk0<w) return {w:bk0,r:low,sets:nsets,why:"Sliding 3 sessions — back off to "+fmt(bk0),kind:"deload"}; }\n  var rp=rpeMean(last.sets);', 'inv 4'],
  deepback:  ['var T=num(top), t=T*(1-(num(ex.backPct)||0.12)), p=pinsOf(ex);', 'var T=num(top), t=T*0.5, p=pinsOf(ex);', 'inv 8'],
  pinsnap:   ['var n=m===2?pinDown(w,p):pinUp(w,p);', 'var n=m===2?pinDown(w,p):w+stepFor(ex)*1.5;', 'inv 9'],
};
const MUTANT = process.env.IRONLOG_MUTANT ? MUTANTS[process.env.IRONLOG_MUTANT] : null;
if (process.env.IRONLOG_MUTANT && !MUTANT) throw new Error('unknown IRONLOG_MUTANT; one of ' + Object.keys(MUTANTS).join(', '));

const { browser, errors } = await launch();
const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
page.on('pageerror', e => errors.push(String(e) + (process.env.IRONLOG_DEBUG ? ' @ ' + String(e.stack).split('\n').slice(1, 4).join(' / ') : '')));
/* The app is several files: the hook goes after `var S=load();` (12-boot.js) and the mutant into
   whichever file holds the text it breaks (the engine is in 04-engine.js). Same rule as
   tools/review/lib.mjs buildCopy: it must be found exactly once across all of them, or the run
   would report a mutant that never applied. */
let mutantHits = 0;
await page.route('**/js/*.js', async route => {
  const res = await route.fetch();
  let body = (await res.text()).replace('var S=load();', 'var S=load();\n' + HOOK);
  if (MUTANT && body.includes(MUTANT[0])) { mutantHits += body.split(MUTANT[0]).length - 1; body = body.replace(MUTANT[0], MUTANT[1]); }
  route.fulfill({ response: res, body });
});

async function year(seed, sc) {
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => !!window.__t);
  await page.addScriptTag({ content: SIM });
  return page.evaluate(c => window.runSim(c), Object.assign({ seed, lifts: liftsFor(seed, sc.flat), missed: missedFor(seed) }, sc));
}
await page.goto(URL);
await page.waitForFunction(() => !!window.__t);
if (MUTANT && mutantHits !== 1) throw new Error('mutant does not apply: its text was found ' + mutantHits + ' times across js/*.js (need exactly 1)');
const MAX_CUT = await page.evaluate(() => window.__t.ev('MAX_CUT'));

const EPS = 1e-9;
const SEEDS = process.env.IRONLOG_SEEDS ? process.env.IRONLOG_SEEDS.split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8];
const ALL_MODES = [
  ['prescribe', {}],
  ['illness', { illness: { from: 22, len: 6, depth: 0.10, rec: 6 } }],
  /* The two above are growing lifters: a slide almost never shows, which would leave invariant 4 (and most of 5)
     asserting nothing. These make the old trend cut fire, and 2.0 must still not take it. */
  ['flat', { flat: true }],
  ['plateau', { plateau: { lifts: Object.keys(START), from: 14, to: 40 } }],
  ['sick-prescribe', { illness: { from: 20, len: 8, depth: 0.18, rec: 8 } }],
  /* 2.0: machine lifts on a stack, and the RDL / Leg Press as one top set plus back-offs. */
  ['pins', { pins: PINS }],
  ['topback', { topback: ['RDL', 'Leg Press'] }],
  ['pins+flat', { pins: PINS, flat: true }],
];
const MODES = process.env.IRONLOG_MODES ? ALL_MODES.filter(([m]) => process.env.IRONLOG_MODES.split(',').includes(m)) : ALL_MODES;
const INV = [
  [1, 'sane numbers'], [2, 'on the step grid or the stack'], [3, 'progress after success'], [4, 'no trend back-off'],
  [5, 'deload is lighter, shorter, never twice'], [6, 'bounded step size'], [8, 'top + back-offs'], [9, 'stack weights'],
];

const num = x => Number.isFinite(x);
const isInt = x => Number.isInteger(x);
const onGrid = (w, w0, step) => { const q = (w - w0) / step; return Math.abs(q - Math.round(q)) < EPS; };
const onPins = (w, pins, w0) => w === w0 || pins.some(p => Math.abs(p - w) < EPS);
const pinUp = (w, pins) => { const c = pins.filter(p => p > w + EPS); return c.length ? Math.min(...c) : null; };
const pinDown = (w, pins) => { const c = pins.filter(p => p < w - EPS); return c.length ? Math.max(...c) : null; };

function brief(e) {
  if (!e) return '      (none)';
  const p = e.presc;
  return '      #' + e._i + (e.deload ? ' [deload wk]' : '') + (e.scheme === 'topback' ? ' [topback]' : '') + (e.pins.length ? ' [pins]' : '') +
    '  did ' + e.ws.join('/') + ' x ' + e.reps.join(',') +
    '  trend ' + e.tr.state + ' (' + e.tr.pct.toFixed(1) + '%/n=' + e.tr.n + ')' +
    '\n        presc ' + JSON.stringify({ w: p.w, back: p.back, r: p.r, n: p.n, kind: p.kind }) + ' "' + p.why + '"';
}

const STRICT_TOP = !!process.env.IRONLOG_STRICT_TOP;   // =1: count the by-design past-the-top targets as violations too
const slidingSeen = {};    // mode -> trend-cut-shaped prescriptions seen (0 is the point)
const pastTop = {};        // mode -> targets above the top while earning a failed jump back / at the end of a stack (by design)
const found = {};          // mode -> inv -> [{seed, lift, i, window}]
const checks = {};         // mode -> inv -> number of checks
function fail(mode, inv, seed, lift, seq, i, what) {
  const f = (found[mode] = found[mode] || {}); (f[inv] = f[inv] || []).push({ seed, lift, i, what, seq });
}
function chk(mode, inv, k = 1) { const c = (checks[mode] = checks[mode] || {}); c[inv] = (c[inv] || 0) + k; }
const TREND_CUT = /^Sliding|Already backed off|You dropped to/;

function analyse(mode, seed, res) {
  const by = {};
  res.log.forEach(x => { (by[x.n] = by[x.n] || []).push(x); });
  for (const [lift, seq] of Object.entries(by)) {
    seq.forEach((e, i) => { e._i = i; });
    const w0 = res.truth[lift].w0;
    let lastWork = null;
    seq.forEach((e, i) => {
      const p = e.presc, step = e.step, top = e.top, low = e.low, pins = e.pins, tb = e.scheme === 'topback';
      const ranged = top > low;
      const prev = lastWork;                                  // the engine's history: non-deload exposures only
      const loads = [p.w].concat(p.back || []);               // the top and every planned back-off

      /* 1: sane numbers. A blank load is only ever a lift that was never done. */
      {
        chk(mode, 1);
        let bad = null;
        if (p.w === null || p.w === '') { if (i > 0) bad = 'prescribe load is blank on a lift that has been done'; }
        else if (!num(p.w)) bad = 'prescribe load is ' + p.w;
        else if (p.w < 0) bad = 'prescribe load is negative: ' + p.w;
        if (!bad) {
          if (!num(p.r) || !isInt(p.r)) bad = 'prescribe target reps not an integer: ' + p.r;
          else if (p.r < 1) bad = 'prescribe target reps < 1: ' + p.r;
          else if (ranged && p.r > top) {
            /* v25 on purpose: while a failed jump is being earned the reps run past the top
               (PROJECT_STATE, "While a jump is being earned"). 2.0: and at the end of a stack, where reps are
               the only way up. Counted, not failed - but only those cases. */
            const earning = p.kind === 'reps' && (/^Building reps before/.test(p.why) || /^Top of the stack/.test(p.why));
            pastTop[mode] = pastTop[mode] || { n: 0, max: 0, other: 0 };
            if (earning && !STRICT_TOP) { pastTop[mode].n++; pastTop[mode].max = Math.max(pastTop[mode].max, p.r - top); }
            else bad = 'prescribe target reps ' + p.r + ' above the top of the range (' + top + ') with no failed jump or stack end to earn back: "' + p.why + '"';
          }
          else if (!ranged && p.r < low && !/^Top of the stack/.test(p.why)) bad = 'prescribe target reps ' + p.r + ' below ' + low;
        }
        if (!bad && (!isInt(p.n) || p.n < 1)) bad = 'sets not a positive integer: ' + p.n;
        if (bad) fail(mode, 1, seed, lift, seq, i, bad);
      }

      /* 2: the grid, or the stack. Every prescribed load and every back-off. */
      for (const w of loads) {
        if (w === null || w === '' || !num(w)) continue;
        chk(mode, 2);
        if (pins.length) { if (!onPins(w, pins, w0)) fail(mode, 2, seed, lift, seq, i, 'load ' + w + ' is not on the stack ' + pins.join(',') + ' (or the start ' + w0 + ')'); }
        else if (tb && w !== p.w) { /* a back-off sits on the grid of its own, checked by 8 */ }
        else if (!onGrid(w, w0, step)) fail(mode, 2, seed, lift, seq, i, 'load ' + w + ' is off the grid ' + w0 + ' + k x ' + step);
      }

      /* 3: a lift that topped its range moves up, or holds for a stated reason. A top-set lift is judged on its top set. */
      if (prev && !prev.deload && !e.deload && e.tr.state !== 'down') {
        const toppedAll = tb ? prev.reps[0] >= prev.top : prev.reps.every(r => r >= prev.top);
        if (toppedAll && prev.top > prev.low) {
          chk(mode, 3);
          const up = p.w !== null && p.w > prev.W + EPS;
          if (!(up || p.kind === 'reps' || p.kind === 'deload'))
            fail(mode, 3, seed, lift, seq, i, 'topped ' + prev.top + ' on ' + (tb ? 'the top set' : 'every set') + ' at ' + prev.W + ', trend ' + e.tr.state + ', prescribed ' + p.w + ' (' + p.kind + ')');
        }
      }

      /* 4: no trend back-off. Under 2.0 the slope of the last sessions never cuts the load or a set. */
      if (!e.deload) {
        if (TREND_CUT.test(p.why)) {
          slidingSeen[mode] = (slidingSeen[mode] || 0) + 1;
          fail(mode, 4, seed, lift, seq, i, 'a trend back-off: "' + p.why + '"');
        }
        chk(mode, 4);
      }
      /* 5: deload week */
      if (e.deload) {
        chk(mode, 5);
        if (prev && p.w > prev.W + EPS) fail(mode, 5, seed, lift, seq, i, 'deload prescribes ' + p.w + ' above the last working load ' + prev.W);
        else if (p.n > e.nsets) fail(mode, 5, seed, lift, seq, i, 'deload prescribes ' + p.n + ' sets, plan has ' + e.nsets);
        else if (p.kind !== 'deload') fail(mode, 5, seed, lift, seq, i, 'deload week but kind is ' + p.kind);
      }

      /* 6: bounded step size, against the last working load (what the engine read) */
      if (prev && p.w !== null && p.w !== '' && num(p.w)) {
        chk(mode, 6);
        const d = p.w - prev.W, base = prev.W;
        if (pins.length) {
          const up = pinUp(base, pins), dn = pinDown(base, pins);
          if (d > EPS && (up === null || p.w > up + EPS))
            fail(mode, 6, seed, lift, seq, i, 'goes up ' + d + ' from ' + base + ' on a stack: more than one notch (next pin ' + up + ')');
          else if (d < -EPS && !/back to/.test(p.why)) {
            const lim = p.kind === 'deload' ? Math.max(base - (dn === null ? base : dn), MAX_CUT * base) : (dn === null ? 0 : base - dn);
            if (-d > lim + EPS) fail(mode, 6, seed, lift, seq, i, 'goes down ' + (-d) + ' from ' + base + ' on a stack (limit ' + lim.toFixed(2) + ', ' + p.kind + ')');
          }
        } else if (d > Math.max(2 * step, 0.10 * base) + EPS)
          fail(mode, 6, seed, lift, seq, i, 'goes up ' + d + ' from ' + base + ' (limit ' + Math.max(2 * step, 0.10 * base).toFixed(2) + ')');
        else if (-d > Math.max(step, MAX_CUT * base) + EPS && !/back to/.test(p.why))
          fail(mode, 6, seed, lift, seq, i, 'goes down ' + (-d) + ' from ' + base + ' (limit ' + Math.max(step, MAX_CUT * base).toFixed(2) + ')');
      }

      /* 8: top + back-offs. */
      if (tb) {
        chk(mode, 8);
        const bp = 0.12;
        if (/^Only \d+ of \d+ sets/.test(p.why)) fail(mode, 8, seed, lift, seq, i, 'a top-set lift held for "' + p.why + '"');
        if (p.w !== null && p.w !== '' && p.n > 1) {
          if (p.roles[0] !== 'top' || !p.roles.slice(1).every(r => r === 'back')) fail(mode, 8, seed, lift, seq, i, 'roles are ' + p.roles.join(','));
          for (const b of p.back) {
            chk(mode, 8);
            if (!(b < p.w - EPS) || b < p.w * (1 - bp) - Math.max(step, 5) - EPS)
              fail(mode, 8, seed, lift, seq, i, 'back-off ' + b + ' under a top of ' + p.w + ' (want below it, within 12% less one step)');
          }
        }
      }
      /* 9: stack weights. */
      if (pins.length) {
        for (const w of loads) {
          if (w === null || w === '' || !num(w)) continue;
          chk(mode, 9);
          if (!onPins(w, pins, w0)) fail(mode, 9, seed, lift, seq, i, 'load ' + w + ' is off the stack ' + pins.join(','));
        }
      }
      if (!e.deload) lastWork = e;
    });
  }
  /* 5: a deload week never starts within 3 days of the previous one ending */
  let lastEnd = -Infinity;
  for (const s of res.sessLog) if (s.started) {
    chk(mode, 5);
    if (s.startTs - lastEnd < 3 * 864e5)
      fail(mode, 5, seed, '(whole block)', [], 0, 'deload week started ' + ((s.startTs - lastEnd) / 864e5).toFixed(1) + ' days after the last ended (session ' + s.sess + ', week ' + s.wk.toFixed(1) + ')');
    lastEnd = s.endTs;
  }
}

let exposures = 0, deloadWeeks = {};
for (const [mode, sc] of MODES) {
  deloadWeeks[mode] = 0;
  for (const sd of SEEDS) {
    const res = await year(sd, sc);
    exposures += res.log.length;
    deloadWeeks[mode] += res.sessLog.filter(s => s.started).length;
    analyse(mode, sd, res);
  }
}
console.log('  ' + exposures + ' exposures; deload weeks started: ' + MODES.map(([m]) => m + ' ' + deloadWeeks[m]).join(', ') + '; MAX_CUT ' + MAX_CUT);

for (const [mode] of MODES) {
  console.log('\n== ' + mode + ' ==');
  for (const [n, name] of INV) {
    const bad = (found[mode] || {})[n] || [], tot = (checks[mode] || {})[n] || 0;
    if ((n === 8 && mode !== 'topback') || (n === 9 && !mode.startsWith('pins'))) continue;    // only where the feature is on
    if (n === 1 && pastTop[mode]) console.log('  (info) ' + pastTop[mode].n + ' targets ran past the top of the range (a failed jump being earned back, or the end of a stack), by design; at most +' + pastTop[mode].max);
    if (n === 4) console.log('  (info) ' + (slidingSeen[mode] || 0) + ' trend-cut prescriptions seen (must be 0)');
    console.log('  inv ' + n + ' ' + name + ': ' + bad.length + ' violation(s) in ' + tot + ' checks');
    ok(bad.length === 0, mode + ' · ' + n + ' ' + name + '  [' + bad.length + '/' + tot + ']');
    if (n === 8 || n === 9) ok(tot > 0, mode + ' · ' + n + ' ' + name + ' was actually checked  [' + tot + ' checks]');
    bad.slice(0, 3).forEach(b => {
      console.log('    seed ' + b.seed + ', ' + b.lift + ', exposure #' + b.i + ': ' + b.what);
      if (b.seq.length) for (const j of [b.i - 1, b.i, b.i + 1]) console.log(brief(b.seq[j]));
    });
    if (bad.length > 3) console.log('    ... and ' + (bad.length - 3) + ' more');
  }
}

ok(errors.length === 0, '7 no page errors  ' + errors.join(' | '));
report('t43 engine invariants');
await browser.close();
