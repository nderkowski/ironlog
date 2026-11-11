/* v26.1: a lift the plan holds at two ranges reads its own range's history.

   Independent review (tools/review/REVIEW.md §3): Nick's lateral raise is
   4×12–20 on Day A and 3×8–12 on Day B under one name. Topping out the 12–20
   day stepped the 8–12 day up; the 12–20 day then missed its bottom at the new
   load and was cut back — 9.9 load cuts a lifter-year and a cut-fail-cut
   spiral in 96% of simulated lifter-years. This suite pins the fix and its
   limits: a lift with ONE range in the plan keeps its whole history (a range
   changed for good must not orphan the past), and a row with no exposure at its
   range yet falls back to all of them. The hook is injected at load (as in
   t35), so the app carries no test code. */
import { launch, URL, ok, eq, report } from './harness.mjs';

const HOOK = 'window.__t={get S(){return S}, prescribe:prescribe, shadowPrescribe:shadowPrescribe};';
const { browser, errors } = await launch();
const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
page.on('pageerror', e => errors.push(String(e)));
await page.route('**/js/12-boot.js', async route => {
  const res = await route.fetch();
  route.fulfill({ response: res, body: (await res.text()).replace('var S=load();', 'var S=load();\n' + HOOK) });
});

const DAY = 864e5, T0 = Date.UTC(2026, 9, 1);
const row = (id, name, sets, reps, repTop) => ({ id, name, sets, reps, repTop, inc: null, bw: 0, metric: 0, mg: '', mg2: [] });
/* sessions: [day, routine, name, reps, repTop, [[w,r],...], out?] oldest first */
function state(plan, sessions) {
  const routines = plan.map(([id, name, exs]) => ({ id, key: name.slice(-1), name, variants: [{ id: id + 'v', label: '', exercises: exs }] }));
  const ss = sessions.map(([d, rid, name, reps, repTop, sets, out], i) => ({
    id: 's' + i, ts: T0 + d * DAY, date: '', routineId: rid, name: rid, variantId: rid + 'v', deload: false, note: '',
    exercises: [{ name, reps, repTop, targetReps: reps, kind: 'reps', bw: 0, metric: 0,
      sets: sets.map(([w, r], j) => Object.assign({ w: String(w), r: String(r), done: true }, out && j === sets.length - 1 ? { out: true } : {})) }]
  })).reverse();
  return { version: 5, settings: { unit: 'lb', inc: 5, repLow: 8, repHigh: 12, doubleDefault: true, deloadUntil: 0, deloadSnooze: 0 },
           routines, sessions: ss, active: null };
}
async function ask(st, rowObj, name) {
  await page.goto(URL);
  await page.evaluate(s => localStorage.setItem('ironlog.v1', JSON.stringify(s)), st);
  await page.reload();
  await page.waitForFunction(() => !!window.__t);
  return page.evaluate(([r, n]) => {
    const p = window.__t.prescribe(n, r), sp = window.__t.shadowPrescribe(n, r);
    return { w: +p.w, r: p.r, kind: p.kind, why: p.why, sw: sp ? +sp.w : null, sr: sp ? sp.r : null };
  }, [rowObj, name]);
}

const A12 = row('a1', 'Lateral Raise', 4, 12, 20), B8 = row('b1', 'Lateral Raise', 3, 8, 12);
const plan2 = [['A', 'Day A', [A12]], ['B', 'Day B', [B8]]];

// 1. The 8–12 day reads the 8–12 history, not the 12–20 day that just topped 12
{
  const st = state(plan2, [
    [0, 'B', 'Lateral Raise', 8, 12, [[15, 10], [15, 10], [15, 9]], true],
    [3, 'A', 'Lateral Raise', 12, 20, [[15, 16], [15, 16], [15, 16], [15, 17]], true],
  ]);
  const p = await ask(st, B8, 'Lateral Raise');
  eq(p.w, 15, 'Day B (8–12) stays at 15 after Day A did 15×16 at 12–20');
  eq(p.r, 10, 'Day B climbs from its own last session (15×10,10,9 → 10)');
  eq(p.sw, 15, 'the rep-out method also reads Day B\'s own rep-out (9 → hold at 15)');
  const q = await ask(st, A12, 'Lateral Raise');
  eq(q.w, 15, 'Day A (12–20) holds 15 after 15×16,16,16,17');
  eq(q.r, 17, 'Day A climbs to 17 from its own session');
}
// 2. The old failure: Day A at 20 after Day B stepped there is no longer cut by Day B's history
{
  const st = state(plan2, [
    [0, 'A', 'Lateral Raise', 12, 20, [[15, 18], [15, 18], [15, 18], [15, 19]], true],
    [3, 'B', 'Lateral Raise', 8, 12, [[20, 9], [20, 9], [20, 8]], true],
  ]);
  const q = await ask(st, A12, 'Lateral Raise');
  eq(q.w, 15, 'Day A keeps its own 15 (it never failed at 20), instead of reading Day B\'s 20×9 as a missed 12');
  ok(q.kind !== 'deload', 'Day A is not given a back-off  [kind: ' + q.kind + ']');
}
// 3. No exposure at this row's range yet: fall back to the whole history
{
  const st = state(plan2, [[0, 'A', 'Lateral Raise', 12, 20, [[15, 14], [15, 14], [15, 14], [15, 15]], true]]);
  const p = await ask(st, B8, 'Lateral Raise');
  eq(p.w, 20, 'Day B with no 8–12 history reads Day A (15×14 tops 12 → 20), as before');
}
// 4. One range in the plan: a range changed for good keeps its whole history
{
  const R610 = row('c1', 'Incline DB Press', 3, 6, 10);
  const st = state([['C', 'Day C', [R610]]], [
    [0, 'C', 'Incline DB Press', 8, 12, [[55, 10], [55, 10], [55, 10]], false],
  ]);
  const p = await ask(st, R610, 'Incline DB Press');
  eq(p.w, 60, 'after moving Incline from 8–12 to 6–10 the 55×10s still count (10 ≥ top → 60)');
}
// 5. Same name, same range on two days: nothing changes
{
  const B12 = row('b2', 'Lateral Raise', 3, 12, 20);
  const st = state([['A', 'Day A', [A12]], ['B', 'Day B', [B12]]], [
    [0, 'B', 'Lateral Raise', 12, 20, [[15, 13], [15, 13], [15, 13]], false],
    [3, 'A', 'Lateral Raise', 12, 20, [[15, 20], [15, 20], [15, 20], [15, 20]], false],
  ]);
  const p = await ask(st, B12, 'Lateral Raise');
  eq(p.w, 20, 'one range on both days: the newest session decides (15×20 → 20)');
}
ok(errors.length === 0, 'no page errors  [' + errors.join(' | ') + ']');
await browser.close();
report('t41-range-history');
