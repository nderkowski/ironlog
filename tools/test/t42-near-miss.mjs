/* v26.2: a rep-out one or two reps under the top earns the jump.

   The last working set of a ranged lift is a rep-out, so it ends under the
   earlier sets from fatigue alone; 12, 12, 11 at 8–12 used to be "go for 12"
   and the load lagged (20-seed simulated year: prescriptions >=1 step light in
   37.3% of exposures, 31.9% with this rule — tools/sprint/yearbase.mjs). This
   suite pins the rule and every limit on it: an earlier set short is not a
   near-miss, the rep-out may be at most 2 under the top and never under the
   bottom of the range, dropped sets still hold, a jump that failed before is
   still remembered, and one set (or no range) keeps the strict rule. The hook
   is injected at load (as in t35/t41) so the app carries no test code. */
import { launch, URL, ok, eq, has, report } from './harness.mjs';

const HOOK = 'window.__t={get S(){return S}, prescribe:prescribe, shadowPrescribe:shadowPrescribe};';
const { browser, errors } = await launch();
const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
page.on('pageerror', e => errors.push(String(e)));
await page.route('**/index.html', async route => {
  const res = await route.fetch();
  route.fulfill({ response: res, body: (await res.text()).replace('var S=load();', 'var S=load();\n' + HOOK) });
});

const DAY = 864e5, T0 = Date.UTC(2026, 9, 1);
const row = (name, sets, reps, repTop, inc) => ({ id: 'x1', name, sets, reps, repTop, inc: inc || null, bw: 0, metric: 0, mg: '', mg2: [] });
/* sessions: [day, [[w,r],...], out?] oldest first, all for one lift in one routine */
function state(ex, sessions) {
  const ss = sessions.map(([d, sets, out], i) => ({
    id: 's' + i, ts: T0 + d * DAY, date: '', routineId: 'A', name: 'A', variantId: 'Av', deload: false, note: '',
    exercises: [{ name: ex.name, reps: ex.reps, repTop: ex.repTop, targetReps: ex.reps, kind: 'reps', bw: 0, metric: ex.metric || 0,
      sets: sets.map(([w, r], j) => Object.assign({ w: String(w), r: String(r), done: true }, out !== false && j === sets.length - 1 ? { out: true } : {})) }]
  })).reverse();
  return { version: 5, settings: { unit: 'lb', inc: 5, repLow: 8, repHigh: 12, doubleDefault: true, deloadUntil: 0, deloadSnooze: 0 },
           routines: [{ id: 'A', key: 'A', name: 'Day A', variants: [{ id: 'Av', label: '', exercises: [ex] }] }], sessions: ss, active: null };
}
async function ask(ex, sessions) {
  await page.goto(URL);
  await page.evaluate(s => localStorage.setItem('ironlog.v1', JSON.stringify(s)), state(ex, sessions));
  await page.reload();
  await page.waitForFunction(() => !!window.__t);
  return page.evaluate(r => { const p = window.__t.prescribe(r.name, r); return { w: +p.w, r: p.r, kind: p.kind, why: p.why }; }, ex);
}

const PRESS = row('Test Press', 3, 8, 12);
// Review fix: a loaded timed lift has no rep-out, so no near-miss
{
  const carry = Object.assign(row('Test Carry', 3, 30, 60, 5), { metric: 1 });
  const p = await ask(carry, [[0, [[50, 60], [50, 60], [50, 58]]]]);
  eq(p.w, 50, 'timed carry 60,60,58 s at 50 lb holds: no rep-out on a timed lift');
}
// 1. The headline: 12, 12, 11 on the rep-out jumps
{
  const p = await ask(PRESS, [[0, [[60, 12], [60, 12], [60, 11]]]]);
  eq(p.w, 65, '12,12,11 at 8–12 on a 60 lb press → 65');
  eq(p.kind, 'up', 'and it is an "up"');
  eq(p.r, 8, 'back to the bottom of the range at the new load');
  has(p.why, 'Hit 12, rep-out 11', 'the why says what happened');
  has(p.why, 'add 5 lb', 'and what to do');
  ok(p.why.length <= 50, 'and stays inside the row width budget  [' + p.why.length + ' chars]');
}
// 2. The slack is 2, not more
{
  const p10 = await ask(PRESS, [[0, [[60, 12], [60, 12], [60, 10]]]]);
  eq(p10.w, 65, '12,12,10 (two under) still jumps');
  const p9 = await ask(PRESS, [[0, [[60, 12], [60, 12], [60, 9]]]]);
  eq(p9.w, 60, '12,12,9 holds at 60');
  eq(p9.kind, 'reps', '…as a reps target, unchanged from before');
  eq(p9.r, 10, '…and the target is still built from the 9 (not changed here)');
}
// 3. An earlier set short is not a near-miss
{
  const a = await ask(PRESS, [[0, [[60, 12], [60, 11], [60, 12]]]]);
  eq(a.w, 60, '12,11,12 holds (a middle set was short)');
  const b = await ask(PRESS, [[0, [[60, 11], [60, 12], [60, 12]]]]);
  eq(b.w, 60, '11,12,12 holds (the first set was short)');
  const c = await ask(PRESS, [[0, [[60, 12], [60, 12], [60, 12]]]]);
  eq(c.w, 65, '12,12,12 still jumps');
  has(c.why, 'on every set', '…with the original wording');
}
// 4. Near-miss without the rep-out flag still reads honestly
{
  const p = await ask(PRESS, [[0, [[60, 12], [60, 12], [60, 11]], false]]);
  eq(p.w, 65, 'no rep-out flag: still jumps');
  has(p.why, 'last set 11', 'and says "last set", not "rep-out"');
}
// 5. Never below the bottom of the range
{
  const narrow = row('Test Narrow', 3, 5, 6);
  const p = await ask(narrow, [[0, [[100, 6], [100, 6], [100, 4]]]]);
  eq(p.w, 100, '6,6,4 at 5–6 holds: a miss of the bottom is not a near-miss');
  const q = await ask(narrow, [[0, [[100, 6], [100, 6], [100, 5]]]]);
  eq(q.w, 100, '6,6,5 at 5–6 holds: a 1-rep range has no slack (review: slack is at most half the range)');
  const n8 = row('Test Eight', 3, 8, 10);
  eq((await ask(n8, [[0, [[100, 10], [100, 10], [100, 8]]]])).w, 100, '10,10,8 at 8–10 holds: a last set on the floor is not a near-miss');
  eq((await ask(n8, [[0, [[100, 10], [100, 10], [100, 9]]]])).w, 105, '10,10,9 at 8–10 jumps (slack 1)');
}
// 6. A big relative step is allowed (measured: the gain/harm does not track step size)
{
  const LAT = row('Test Raise', 3, 12, 20);
  const p = await ask(LAT, [[0, [[15, 20], [15, 20], [15, 19]]]]);
  eq(p.w, 20, '20,20,19 at 12–20 on a 15 lb raise → 20 (+33%)');
}
// 7. Dropped sets still hold, ahead of the near-miss
{
  const p = await ask(PRESS, [[0, [[60, 12], [60, 12], [55, 11]]]]);
  eq(p.w, 60, '12,12 at 60 then 55×11 holds at 60');
  has(p.why, 'Only 2 of 3', 'with the dropped-set wording');
}
// 8. One set at the load is not a pattern
{
  const one = row('Test One', 1, 8, 12);
  const a = await ask(one, [[0, [[60, 12]]]]);
  eq(a.w, 65, 'single-set exercise: 12 → 65 (strict rule, as before)');
  const b = await ask(one, [[0, [[60, 11]]]]);
  eq(b.w, 60, 'single-set exercise: 11 holds (no near-miss on one set)');
  const c = await ask(PRESS, [[0, [[60, 11]]]]);
  eq(c.w, 60, 'a 3-set exercise that logged only one set of 11 holds');
  const d = await ask(PRESS, [[0, [[60, 12], [60, 11]]]]);
  eq(d.w, 60, 'a 3-set plan that logged 12 then 11 and skipped the third holds: a short session, not a rep-out');
}
// 9. Unloaded lift: the near-miss does not apply (a +5 lb jump from nothing is no step)
{
  const bw = Object.assign(row('Test Pullup', 3, 6, 10), { bw: 1 });
  const p = await ask(bw, [[0, [[0, 10], [0, 10], [0, 9]]]]);
  eq(p.w, 0, 'bodyweight 10,10,9 at 6–10 does not add load on a near-miss');
}
// 10. A jump that failed before is still remembered: the same block runs
{
  const LAT = row('Test Raise', 3, 12, 20);
  const p = await ask(LAT, [
    [0, [[15, 20], [15, 20], [15, 20]]],
    [3, [[20, 7], [20, 6], [20, 5]]],
    [7, [[15, 20], [15, 20], [15, 19]]],
  ]);
  eq(p.w, 15, '15×20,20,19 after a failed 20×7,6,5 does not jump again');
  has(p.why, 'Building reps before 20', 'it says the jump is being earned back');
}
// 11. RPE and the trend back-off keep precedence
{
  const sess = [[0, [[60, 12], [60, 12], [60, 11]]]];
  const st = state(PRESS, sess);
  st.sessions[0].exercises[0].sets.forEach(s => { s.rpe = 10; });
  await page.goto(URL);
  await page.evaluate(s => localStorage.setItem('ironlog.v1', JSON.stringify(s)), st);
  await page.reload();
  await page.waitForFunction(() => !!window.__t);
  const p = await page.evaluate(r => { const q = window.__t.prescribe(r.name, r); return { w: +q.w, why: q.why }; }, PRESS);
  eq(p.w, 60, 'RPE 10 on every set: the near-miss does not jump past the RPE hold');
  has(p.why, 'RPE', 'with the RPE wording');
}

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
report('t42-near-miss');
