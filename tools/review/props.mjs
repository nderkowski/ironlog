/* Phase 2: property / metamorphic tests on the REAL prescribe() and
   shadowPrescribe(), through the hook. No ground truth needed: each property
   says how the answer must (or must not) change when the history changes.
   Synthetic histories only — no private data.
   Usage: (cd tools/review && npm i) && node tools/review/props.mjs [runs=500] */
import fc from 'fast-check';
import { buildCopy, serve, openApp, OUT } from './lib.mjs';
import { join } from 'node:path';

const RUNS = +(process.argv[2] || 500), PORT = 8160, DAY = 864e5;
const dir = buildCopy(join(OUT, 'serve-props'));
const srv = await serve(dir, PORT);
const empty = { version: 5, settings: { unit: 'lb', inc: 5, repLow: 8, repHigh: 12, doubleDefault: true }, routines: [], sessions: [], active: null };
const app = await openApp(PORT, empty);
const page = app.page;
await page.evaluate(() => {
  const T = window.__t;
  T.ev('writeNow=function(){}; save=function(){}; render=function(){}');
  const A = T.ev('({convertUnits, normName})');
  /* Install a synthetic history and ask the engine. h.ex = newest-first list of
     {ts, kind, tgt, sets:[{w,r,out?,warm?}]}; h.row = the plan row. */
  window.ASK = (h, conv) => {
    const S = T.S;
    S.settings = Object.assign(S.settings, { unit: 'lb', inc: 5, repLow: 8, repHigh: 12, deloadUntil: 0, deloadSnooze: 0, repOutDefault: false });
    S.routines = [{ id: 'r1', key: 'A', name: 'Day A', variants: [{ id: 'v1', label: '', exercises: [JSON.parse(JSON.stringify(h.row))] }] }];
    S.sessions = h.ex.map((x, i) => ({ id: 's' + i, ts: x.ts, date: '', routineId: 'r1', name: 'Day A', deload: false, note: '',
      exercises: [{ name: x.name || h.row.name, reps: h.row.reps, repTop: h.row.repTop, inc: h.row.inc, bw: 0, metric: 0,
        targetReps: x.tgt, kind: x.kind, sets: x.sets.map(s => Object.assign({ done: true }, s, { w: String(s.w), r: String(s.r) })) }] }));
    window.__now = h.now;
    if (conv) conv.forEach(u => A.convertUnits(u));
    const row = S.routines[0].variants[0].exercises[0];
    const p = T.prescribe(h.row.name, row), sp = T.shadowPrescribe(h.row.name, row);
    const pick = x => x && { w: x.w === '' ? '' : +x.w, r: +x.r, sets: +x.sets, kind: x.kind ?? x.steps, why: x.why };
    return { p: pick(p), sp: pick(sp) };
  };
});
const ask = (h, conv) => page.evaluate(([h, conv]) => window.ASK(h, conv), [h, conv || null]);

/* ---- generator: one lift, 1–10 exposures on the step grid ---- */
const RANGES = [[8, 12], [12, 16], [8, 11], [8, 0], [12, 20], [6, 10]];
const histArb = fc.record({
  range: fc.constantFrom(...RANGES), step: fc.constantFrom(5, 5, 5, 10), w0: fc.integer({ min: 3, max: 40 }),
  exps: fc.array(fc.record({
    dw: fc.constantFrom(-1, 0, 0, 0, 0, 1), reps: fc.array(fc.integer({ min: -4, max: 4 }), { minLength: 3, maxLength: 3 }),
    out: fc.boolean(), tgtOff: fc.integer({ min: 0, max: 4 }), kind: fc.constantFrom('', 'reps', 'up', 'hold', 'deload'),
    gap: fc.integer({ min: 2, max: 14 }) }), { minLength: 1, maxLength: 10 }),
}).map(g => {
  const [lo, top] = g.range, hi = top || lo;
  let w = g.w0 * g.step, t = Date.UTC(2026, 0, 1);
  const ex = g.exps.map(e => {
    w = Math.max(g.step, w + e.dw * g.step); t += e.gap * DAY;
    const mid = Math.round((lo + hi) / 2);
    const sets = e.reps.map(d => ({ w, r: Math.max(1, mid + d) }));
    if (e.out && top > lo) sets[sets.length - 1].out = true;
    return { ts: t, kind: e.kind, tgt: Math.min(hi, lo + e.tgtOff), sets };
  }).reverse();                                                     // newest first, as the app stores them
  return { row: { id: 'p1', name: 'Lift', sets: 3, reps: lo, repTop: top, inc: g.step, bw: 0, metric: 0 }, ex, now: t + 2 * DAY };
});
const clone = x => JSON.parse(JSON.stringify(x));
const lower = (a, b) => a && b && b.w !== '' && a.w !== '' &&
  (b.w < a.w || (b.w === a.w && (b.r < a.r || (b.r === a.r && b.sets < a.sets))));
const same = (a, b) => (!a && !b) || (a && b && a.w === b.w && a.r === b.r && a.sets === b.sets && a.kind === b.kind);

const results = [];
let DETAIL = null;     // what the last violating run saw (set inside a property, printed with its counterexample)
async function check(name, arb, prop, note) {
  DETAIL = null;
  const r = await fc.check(fc.asyncProperty(arb, prop), { numRuns: RUNS, seed: 20261108, endOnFailure: false });
  const ce = r.failed ? r.counterexample : null;
  if (r.failed) { DETAIL = null; await prop(...r.counterexample); }   // re-run the shrunk case to capture its detail
  results.push({ name, failed: r.failed, runs: r.numRuns, shrinks: r.numShrinks, detail: DETAIL });
  console.log(`${r.failed ? 'FAIL' : 'pass'}  ${name}  (${r.numRuns} runs)`);
  if (ce) console.log('      shrunk counterexample ->', JSON.stringify(DETAIL || ce).slice(0, 1200));
}

// P1a/b: more reps never lower the prescription (last exposure / any exposure)
for (const [tag, anyEx] of [['last exposure', false], ['any past exposure', true]]) {
  for (const which of ['p', 'sp']) {
    await check(`P1 ${which === 'p' ? 'prescribe' : 'shadow'}: +reps in ${tag} never lowers it`,
      fc.tuple(histArb, fc.nat(), fc.nat(), fc.integer({ min: 1, max: 3 })),
      async ([h, ei, si, k]) => {
        const i = anyEx ? ei % h.ex.length : 0, j = si % h.ex[i].sets.length;
        const h2 = clone(h); h2.ex[i].sets[j].r += k;
        const a = (await ask(h))[which], b = (await ask(h2))[which];
        const bad = lower(a, b);
        if (bad) { DETAIL = { exposure: i, set: j, plusReps: k, before: a, after: b, hist: h.ex.map(x => ({ kind: x.kind, tgt: x.tgt, sets: x.sets })), range: [h.row.reps, h.row.repTop], step: h.row.inc }; }
        return !bad;
      });
  }
}
// P2: warm-ups below the working load change nothing (flagged, and unflagged ramp before the first working set)
await check('P2a warm-up sets (flagged) below W, any exposure, change nothing',
  fc.tuple(histArb, fc.integer({ min: 1, max: 4 })),
  async ([h, k]) => {
    const h2 = clone(h);
    h2.ex.forEach(x => { const W = x.sets[0].w; for (let i = 0; i < k; i++) x.sets.unshift({ w: Math.max(0, W - (i + 1) * h.row.inc), r: 5, warm: true }); });
    const a = await ask(h), b = await ask(h2);
    const ok = same(a.p, b.p) && same(a.sp, b.sp);
    if (!ok) DETAIL = { k, before: a, after: b };
    return ok;
  });
await check('P2b unflagged ramp sets (1–2, lighter, before the first working set) change nothing',
  fc.tuple(histArb, fc.integer({ min: 1, max: 2 })),
  async ([h, k]) => {
    const h2 = clone(h);
    h2.ex.forEach(x => { const W = x.sets[0].w; for (let i = 0; i < k; i++) if (W - (i + 1) * h.row.inc > 0) x.sets.unshift({ w: W - (i + 1) * h.row.inc, r: 8 }); });
    const a = await ask(h), b = await ask(h2);
    const ok = same(a.p, b.p) && same(a.sp, b.sp);
    if (!ok) DETAIL = { k, before: a, after: b, hist: h.ex.map(x => ({ kind: x.kind, tgt: x.tgt, sets: x.sets })), range: [h.row.reps, h.row.repTop] };
    return ok;
  });
// P3: units
await check('P3a lb→kg→lb round trip gives the same prescription (load within 0.5 lb)',
  histArb, async h => {
    const a = (await ask(h)).p, b = (await ask(h, ['kg', 'lb'])).p;
    const ok = a.kind === b.kind && a.r === b.r && a.sets === b.sets && (a.w === '' ? b.w === '' : Math.abs(a.w - b.w) <= 0.5);
    if (!ok) DETAIL = { lb: a, roundTrip: b, step: h.row.inc, lastSets: h.ex[0].sets };
    return ok;
  });
await check('P3b the same log in kg prescribes the same thing (load within 1 lb)',
  histArb, async h => {
    const a = (await ask(h)).p, b = (await ask(h, ['kg'])).p;
    const bw = b.w === '' ? '' : b.w / 0.45359237;
    const ok = a.kind === b.kind && a.r === b.r && a.sets === b.sets && (a.w === '' ? b.w === '' : Math.abs(a.w - bw) <= 1);
    if (!ok) DETAIL = { lb: a, kg: b, kgAsLb: bw, step: h.row.inc, hist: h.ex.map(x => ({ kind: x.kind, sets: x.sets })), range: [h.row.reps, h.row.repTop] };
    return ok;
  });
// P4: reordering the sets at the working load (rep-out flag stays on the last position) — prescribe() reads the minimum
await check('P4 prescribe: permuting sets at W (flag kept on the last set) changes nothing',
  fc.tuple(histArb, fc.nat()), async ([h, s]) => {
    const h2 = clone(h);
    h2.ex.forEach((x, i) => {
      const had = x.sets.some(q => q.out); x.sets.forEach(q => delete q.out);
      const r = x.sets.map(q => q.r); const k = (s + i) % 3; x.sets.forEach((q, j) => { q.r = r[(j + k) % 3]; });
      if (had) x.sets[x.sets.length - 1].out = true;
    });
    const a = (await ask(h)).p, b = (await ask(h2)).p;
    const ok = same(a, b);
    if (!ok) DETAIL = { before: a, after: b };
    return ok;
  });
// P5: shifting the whole log and the clock by the same amount changes nothing
await check('P5 time translation changes nothing', fc.tuple(histArb, fc.integer({ min: 1, max: 900 })), async ([h, d]) => {
  const h2 = clone(h); h2.ex.forEach(x => { x.ts += d * DAY; }); h2.now += d * DAY;
  const a = await ask(h), b = await ask(h2);
  return same(a.p, b.p) && same(a.sp, b.sp);
});
// P6: another lift's sessions in between change nothing
await check('P6 sessions of another lift in between change nothing', histArb, async h => {
  const h2 = clone(h); const other = h.ex.map(x => ({ ...clone(x), ts: x.ts - 3600e3, name: 'Other' }));
  h2.ex = h.ex.flatMap((x, i) => [x, other[i]]);
  const a = await ask(h), b = await ask(h2);
  return same(a.p, b.p) && same(a.sp, b.sp);
});

console.log('\nSUMMARY');
results.forEach(r => console.log(`${r.failed ? 'FAIL' : 'pass'} | ${r.name}`));
await app.close(); srv.kill();
