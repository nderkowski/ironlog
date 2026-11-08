/* Engine invariants over the simulated year (t43).

   t35 pins a few aggregate numbers (progress rate, flip-flops, deload count).
   Those move whenever a rule is tuned. This suite asserts the opposite kind of
   thing: properties that must hold of ANY version of the jump / back-off /
   deload rules, so it can sit behind a rule change and say "the engine still
   behaves like a progression engine" without knowing the new numbers.

   8 seeds x 52 weeks x three runs, through the real makeSessionEx() /
   prescribe() / shadowPrescribe() / deloadCheck():
     prescribe  follow prescribe() exactly
     use        always tap Use (the rep-out shadow)
     illness    always tap Use, with a six-week illness from week 22
   For every exposure the log carries what prescribe() and the shadow said, what
   the lifter did, and the trend verdict the engine had just read (yearsim.js).

     1  every load and target is a sane number
     2  every load sits on the lift's step grid (start + k * step)
     3  a lift that topped its range moves up, or says why not
     4  the trend back-off never fires twice inside one trend window
     5  a deload week is lighter and shorter, and never starts straight after one
     6  no single prescription moves the bar further than a step rule allows
     7  no page errors

   A failure here is a finding, not a flaky test: the assertion is not to be
   loosened to pass. The failing cases are printed with their neighbours.

   The hook is injected as the page loads (page.route), same as t35, so the app
   ships without test code. */
import { launch, URL, ok, report } from './harness.mjs';
import fs from 'fs';

const SIM = fs.readFileSync(new globalThis.URL('./yearsim.js', import.meta.url), 'utf8');
const HOOK = 'window.__t={get S(){return S}, set S(v){S=v}, prescribe:prescribe, shadowPrescribe:shadowPrescribe,' +
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

/* Self-check: IRONLOG_MUTANT=<name> serves the page with one rule deliberately broken (in memory;
   index.html is never touched) so you can see the invariant that should catch it do so. */
const MUTANTS = {
  grid:      ['var back=Math.round(w*0.9/step)*step;', 'var back=Math.round(w*0.9);', 'inv 2'],
  bigjump:   ['mode===2?Math.max(0,w-step):w+step; }', 'mode===2?Math.max(0,w-step):w+3*step; }', 'inv 6'],
  stuck:     ['mode===2?Math.max(0,w-step):w+step; }', 'mode===2?Math.max(0,w-step):(w>=100?w:w+step); }', 'inv 3'],
  deloadheavy: ['return {w:easier(w,step,mode),r:low,sets:Math.max(1,Math.round(nsets*0.6))', 'return {w:w+step,r:low,sets:nsets+1', 'inv 5'],
  nocapguard: ['var alreadyDown=mode===2?(w>peak):(w<peak);', 'var alreadyDown=false;', 'inv 4'],
};
const MUTANT = process.env.IRONLOG_MUTANT ? MUTANTS[process.env.IRONLOG_MUTANT] : null;
if (process.env.IRONLOG_MUTANT && !MUTANT) throw new Error('unknown IRONLOG_MUTANT; one of ' + Object.keys(MUTANTS).join(', '));

const { browser, errors } = await launch();
const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
page.on('pageerror', e => errors.push(String(e)));
await page.route('**/index.html', async route => {
  const res = await route.fetch();
  let body = (await res.text()).replace('var S=load();', 'var S=load();\n' + HOOK);
  if (MUTANT) { if (!body.includes(MUTANT[0])) throw new Error('mutant does not apply'); body = body.replace(MUTANT[0], MUTANT[1]); }
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
const MAX_CUT = await page.evaluate(() => window.__t.ev('MAX_CUT'));

const EPS = 1e-9;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const MODES = [
  ['prescribe', { useShadow: false }],
  ['use', { useShadow: true }],
  ['illness', { useShadow: true, illness: { from: 22, len: 6, depth: 0.10, rec: 6 } }],
  /* The three above are growing lifters: the trend back-off almost never fires on them, which
     would leave invariant 4 (and most of 5) asserting nothing. These make it fire. Following
     prescribe(), because a cut only counts if the lifter takes it. */
  ['flat', { useShadow: false, flat: true }],
  ['plateau', { useShadow: false, plateau: { lifts: Object.keys(START), from: 14, to: 40 } }],
  ['sick-prescribe', { useShadow: false, illness: { from: 20, len: 8, depth: 0.18, rec: 8 } }],
];
const INV = [
  [1, 'sane numbers'], [2, 'on the step grid'], [3, 'progress after success'], [4, 'no double back-off'],
  [5, 'deload is lighter, shorter, never twice'], [6, 'bounded step size'],
];

const num = x => Number.isFinite(x);
const isInt = x => Number.isInteger(x);
const onGrid = (w, w0, step) => { const q = (w - w0) / step; return Math.abs(q - Math.round(q)) < EPS; };
const cut = (c) => c.W;   // the load actually done

function brief(e) {
  if (!e) return '      (none)';
  const p = e.presc, s = e.sh;
  return '      #' + e._i + (e.deload ? ' [deload wk]' : '') + (e.used ? ' [Use]' : '') + '  did ' + e.W + ' x ' + e.reps.join(',') +
    '  trend ' + e.tr.state + ' (' + e.tr.pct.toFixed(1) + '%/n=' + e.tr.n + ')' +
    '\n        presc ' + JSON.stringify({ w: p.w, r: p.r, n: p.n, kind: p.kind }) + ' "' + p.why + '"' +
    (s ? '\n        shadow ' + JSON.stringify({ w: s.w, r: s.r, steps: s.steps }) + ' "' + s.why + '"' : '');
}

const STRICT_TOP = !!process.env.IRONLOG_STRICT_TOP;   // =1: count the by-design past-the-top targets as violations too
const cutsTaken = {};
const slidingSeen = {};    // mode -> back-off prescriptions seen (is invariant 4 exercised at all?)
const pastTop = {};        // mode -> targets above the top while earning a failed jump back (by design)
const found = {};          // mode -> inv -> [{seed, lift, i, window}]
const checks = {};         // mode -> inv -> number of checks
function fail(mode, inv, seed, lift, seq, i, what) {
  const f = (found[mode] = found[mode] || {}); (f[inv] = f[inv] || []).push({ seed, lift, i, what, seq });
}
function chk(mode, inv, k = 1) { const c = (checks[mode] = checks[mode] || {}); c[inv] = (c[inv] || 0) + k; }

function analyse(mode, seed, res) {
  const by = {};
  res.log.forEach(x => { (by[x.n] = by[x.n] || []).push(x); });
  for (const [lift, seq] of Object.entries(by)) {
    seq.forEach((e, i) => { e._i = i; });
    const w0 = res.truth[lift].w0;
    let lastWork = null, ndIdx = -1, cuts = [];
    seq.forEach((e, i) => {
      const p = e.presc, s = e.sh, step = e.step, top = e.top, low = e.low;
      const ranged = top > low;
      const prev = lastWork;                                  // the engine's history: non-deload exposures only

      /* 1: sane numbers. A blank load is only ever a lift that was never done. */
      for (const [who, o] of [['prescribe', p], ['shadow', s]]) {
        if (!o) continue;
        chk(mode, 1);
        let bad = null;
        if (o.w === null || o.w === '' ) { if (i > 0) bad = who + ' load is blank on a lift that has been done'; }
        else if (!num(o.w)) bad = who + ' load is ' + o.w;
        else if (o.w < 0) bad = who + ' load is negative: ' + o.w;
        if (!bad) {
          if (!num(o.r) || !isInt(o.r)) bad = who + ' target reps not an integer: ' + o.r;
          else if (o.r < 1) bad = who + ' target reps < 1: ' + o.r;
          else if (ranged && o.r > top) {
            /* v25 on purpose: while a failed jump is being earned the reps run past the top
               (PROJECT_STATE, "While a jump is being earned"). Counted, not failed - but only that case. */
            const earning = who === 'prescribe' ? (p.kind === 'reps' && /^Building reps before/.test(p.why)) : /building reps before/.test(o.why);
            pastTop[mode] = pastTop[mode] || { n: 0, max: 0, other: 0 };
            if (earning && !STRICT_TOP) { pastTop[mode].n++; pastTop[mode].max = Math.max(pastTop[mode].max, o.r - top); }
            else bad = who + ' target reps ' + o.r + ' above the top of the range (' + top + ') with no failed jump to earn back: "' + o.why + '"';
          }
          else if (!ranged && o.r < low) bad = who + ' target reps ' + o.r + ' below ' + low;
        }
        if (!bad && who === 'prescribe' && (!isInt(p.n) || p.n < 1)) bad = 'sets not a positive integer: ' + p.n;
        if (bad) fail(mode, 1, seed, lift, seq, i, bad);
      }

      /* 2: the grid. Checked on prescribe and shadow separately. */
      for (const [who, o] of [['prescribe', p], ['shadow', s]]) {
        if (!o || o.w === null || o.w === '' || !num(o.w)) continue;
        chk(mode, 2);
        if (!onGrid(o.w, w0, step)) fail(mode, 2, seed, lift, seq, i, who + ' load ' + o.w + ' is off the grid ' + w0 + ' + k x ' + step);
      }

      /* 3: a lift that topped its range moves up, or holds for a stated reason. */
      if (prev && !prev.deload && !e.deload && e.tr.state !== 'down') {
        if (prev.reps.every(r => r >= prev.top) && prev.top > prev.low) {
          chk(mode, 3);
          const up = p.w !== null && p.w > prev.W + EPS;
          if (!(up || p.kind === 'reps' || p.kind === 'deload'))
            fail(mode, 3, seed, lift, seq, i, 'topped ' + prev.top + ' on every set at ' + prev.W + ', trend ' + e.tr.state + ', prescribed ' + p.w + ' (' + p.kind + ')');
        }
        /* the same for the shadow, which reads only the rep-out */
        const A = prev.reps[prev.reps.length - 1];
        if (s && A >= prev.top && prev.top > prev.low) {
          chk(mode, 3);
          if (!(s.w > prev.W + EPS || /building reps before/.test(s.why)))
            fail(mode, 3, seed, lift, seq, i, 'rep-out ' + A + ' >= ' + prev.top + ' at ' + prev.W + ', shadow says ' + s.w + ' "' + s.why + '"');
        }
      }

      /* 4: the trend back-off is a cut taken; two of them inside one trend window is the sawtooth of cuts. */
      if (!e.deload) {
        ndIdx++;
        if (p.why.startsWith('Sliding')) slidingSeen[mode] = (slidingSeen[mode] || 0) + 1;
        if (prev && p.why.startsWith('Sliding') && p.w !== null && p.w < prev.W - EPS && !e.used) { cuts.push({ i, nd: ndIdx, tw: e.tw }); cutsTaken[mode] = (cutsTaken[mode] || 0) + 1; }
      }
      /* 5: deload week */
      if (e.deload) {
        chk(mode, 5);
        if (prev && p.w > prev.W + EPS) fail(mode, 5, seed, lift, seq, i, 'deload prescribes ' + p.w + ' above the last working load ' + prev.W);
        else if (p.n > e.nsets) fail(mode, 5, seed, lift, seq, i, 'deload prescribes ' + p.n + ' sets, plan has ' + e.nsets);
        else if (p.kind !== 'deload') fail(mode, 5, seed, lift, seq, i, 'deload week but kind is ' + p.kind);
      }

      /* 6: bounded step size, against the last working load (what the engine read) */
      if (prev) {
        for (const [who, o] of [['prescribe', p], ['shadow', s]]) {
          if (!o || o.w === null || o.w === '' || !num(o.w)) continue;
          chk(mode, 6);
          const d = o.w - prev.W, base = prev.W;
          if (d > Math.max(2 * step, 0.10 * base) + EPS)
            fail(mode, 6, seed, lift, seq, i, who + ' goes up ' + d + ' from ' + base + ' (limit ' + Math.max(2 * step, 0.10 * base).toFixed(2) + ')');
          else if (-d > Math.max(step, MAX_CUT * base) + EPS && !(who === 'prescribe' && /back to/.test(p.why)))
            fail(mode, 6, seed, lift, seq, i, who + ' goes down ' + (-d) + ' from ' + base + ' (limit ' + Math.max(step, MAX_CUT * base).toFixed(2) + ')');
        }
      }
      if (!e.deload) lastWork = e;
    });
    for (let a = 1; a < cuts.length; a++) {
      chk(mode, 4);
      const d = cuts[a].nd - cuts[a - 1].nd;
      if (d < cuts[a].tw) fail(mode, 4, seed, lift, seq, cuts[a].i, 'back-off at #' + cuts[a - 1].i + ' and again at #' + cuts[a].i + ', ' + d + ' working exposures apart, trend window is ' + cuts[a].tw);
    }
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
    if (n === 1 && pastTop[mode]) console.log('  (info) ' + pastTop[mode].n + ' targets ran past the top of the range while earning a failed jump back, by design; at most +' + pastTop[mode].max);
    if (n === 4) console.log('  (info) ' + (slidingSeen[mode] || 0) + ' "Sliding" prescriptions seen (cuts taken: ' + (cutsTaken[mode] || 0) + ')');
    console.log('  inv ' + n + ' ' + name + ': ' + bad.length + ' violation(s) in ' + tot + ' checks');
    ok(bad.length === 0, mode + ' · ' + n + ' ' + name + '  [' + bad.length + '/' + tot + ']');
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
