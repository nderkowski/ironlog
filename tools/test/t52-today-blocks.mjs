/* 2.0 package D: Today, blocks, the pump day and off-book sessions.
   UI-driven at 390x844 (Pixel 5, touch) and 320 px: real taps on the real
   buttons. Every expected number is worked out by hand in a comment, not
   computed with the app's formula.

   1  off-book: one quiet button, 10 s undo, the rotation moves, undo x5 before a push leaves the
      backup guard's count alone (amendment 2); the other way round when it had been pushed
   2  every reader that must skip an `unlogged` session (spec 3c), asserted one by one
   3  export / import / gist round trip keeps it
   4  the pump day: created from Today with E's seed, never moves A/B/C, never "skipped", counts for sets + frequency
   5  the rotation counter across variants, pump, freestyle, unlogged, deload, a deleted anchor
   6  the scorecard of a scripted 18-session block, against a hand calculation
   7  an eased session counts in progression, not in the override rate
   8  the stall rule: only after two flat blocks; a lift on some of a day's weeks needs 6 exposures across both
   9  Start block / Deload rotation, with undo; an off-book session that closes a block, undone
   10 block history stays at 40
   11 Start is still the first thing on Today; axe; no overflow at 390 and 320 */
import { launch, getState, ok, eq, has, report, URL, noWarmups } from './harness.mjs';

const { browser, ctx, page, errors } = await launch();
const DAY = 864e5, NOW = Date.now();
const AXE = '/tmp/axe/node_modules/axe-core/axe.min.js';

/* ---------- a known plan ---------- */
let rn = 0, en = 0;
const row = (name, sets, reps, top, mg, mg2 = [], o = {}) => Object.assign({ id: 'p' + (++rn), name, sets, reps, repTop: top, inc: null,
  bw: 0, bar: 0, metric: 0, link: false, mg, mg2, scheme: 'double', backPct: 0.12, pins: [], added: 1 }, o);
const plan = () => (rn = 0, [
  { id: 'rA', key: 'A', name: 'Day A', optional: false, variants: [{ id: 'vA', label: '', exercises: [
    row('Bench Press', 3, 6, 10, 'chest', ['triceps']), row('Cable Row', 3, 8, 12, 'back', ['biceps']) ] }] },
  { id: 'rB', key: 'B', name: 'Day B', optional: false, variants: [
    { id: 'vB1', label: 'Week 1', exercises: [row('Overhead Press', 3, 6, 10, 'front_delts', ['triceps']), row('Cable Crunch', 3, 10, 15, 'core')] },
    { id: 'vB2', label: 'Week 2', exercises: [row('Overhead Press', 3, 6, 10, 'front_delts', ['triceps']), row('Pull-up', 3, 6, 10, 'back', ['biceps'])] }] },
  { id: 'rC', key: 'C', name: 'Day C', optional: false, variants: [{ id: 'vC', label: '', exercises: [
    row('Leg Press', 3, 8, 12, 'quads', ['glutes']), row('RDL', 3, 6, 10, 'hams', ['glutes']), row('Lateral Raise', 3, 12, 20, 'side_delts')] }] }
]);
const pumpR = () => ({ id: 'rP', key: 'P', name: 'Pump day', optional: true, variants: [
  { id: 'vP1', label: 'Arms & delts', exercises: [row('Rope Hammer Curl', 3, 15, 20, 'biceps'), row('Cable Lateral Raise', 3, 15, 20, 'side_delts')] },
  { id: 'vP2', label: 'Chest, back & core', exercises: [row('Pec Deck', 3, 15, 20, 'chest')] }] });
const LIFT = { 'Bench Press': ['chest', ['triceps'], 6, 10], 'Cable Row': ['back', ['biceps'], 8, 12], 'Overhead Press': ['front_delts', ['triceps'], 6, 10],
  'Cable Crunch': ['core', [], 10, 15], 'Pull-up': ['back', ['biceps'], 6, 10], 'Leg Press': ['quads', ['glutes'], 8, 12], 'RDL': ['hams', ['glutes'], 6, 10],
  'Lateral Raise': ['side_delts', [], 12, 20], 'Rope Hammer Curl': ['biceps', [], 15, 20], 'Cable Lateral Raise': ['side_delts', [], 15, 20],
  'Cable Shrug': ['traps', [], 15, 20], 'Pec Deck': ['chest', [], 15, 20] };
/* one logged exercise: n sets of w x r; o.presc = the weight the engine said (the override rate reads it) */
const ex = (name, w, r, o = {}) => { const [mg, mg2, lo, top] = LIFT[name];
  return Object.assign({ id: 'e' + (++en), planId: null, name, reps: o.lo || lo, repTop: o.top || top, mg, mg2, kind: o.kind || 'reps', note: '',
    sets: Array.from({ length: o.n || 3 }, () => ({ w: String(w), r: String(r), done: true, load: w })) },
    o.presc === undefined ? {} : { presc: { w: o.presc, r } }); };
const sess = (id, rid, key, vid, daysAgo, exs, o = {}) => Object.assign({ id, ts: NOW - daysAgo * DAY, endTs: NOW - daysAgo * DAY + 36e5, routineId: rid,
  key, name: o.name || 'Day ' + key, variantId: vid, variantName: o.vname || '', deload: !!o.deload, note: '', bw: 180, exercises: exs },
  o.unlogged ? { unlogged: true } : {}, o.easeBack ? { easeBack: true } : {});
const settings = (extra) => Object.assign({ unit: 'lb', inc: 5, rest: 120, bar: 45, doubleDefault: true, repLow: 8, repHigh: 12, rangeFixHidden: true,
  targetFreq: 3, excludedMuscles: ['calves'], blockRotations: 6, autoRest: false, deloadUntil: 0, deloadSnooze: 0, bodyweight: 180 }, extra || {});
const QUIET = { proposals: [], history: [], lastCheck: NOW };            // the 14-day look is not due, so no rule raises a card unasked
const state = (sessions, over = {}) => Object.assign({ version: 6, settings: settings(over.settings), routines: over.routines || plan(),
  sessions: sessions.slice().sort((a, b) => b.ts - a.ts), active: null,
  block: over.block || { num: 1, startSessId: null, startTs: NOW - 90 * DAY, rotation: 0, history: [] }, coach: over.coach || QUIET }, over.top || {});

/* A plain history of n main-day sessions, oldest first: A, B (weeks alternate), C, A ... with every lift logged. */
const DAYSET = { A: [['Bench Press', 135, 8], ['Cable Row', 100, 10]], B1: [['Overhead Press', 65, 8], ['Cable Crunch', 50, 12]],
  B2: [['Overhead Press', 65, 8], ['Pull-up', 25, 8]], C: [['Leg Press', 190, 10], ['RDL', 225, 8], ['Lateral Raise', 15, 14]] };
function mini(n, spaceDays = 3) {
  const out = []; let bw = 0;
  for (let i = 0; i < n; i++) {
    const key = ['A', 'B', 'C'][i % 3], d = (n - i) * spaceDays;
    const vk = key === 'B' ? (bw++ % 2 ? 'B2' : 'B1') : key;
    out.push(sess('m' + i, 'r' + key, key, key === 'B' ? (vk === 'B1' ? 'vB1' : 'vB2') : 'v' + key, d, DAYSET[vk].map(([nm, w, r]) => ex(nm, w, r, { presc: w }))));
  }
  return out;
}

/* ---------- the scripted block (hand calculation in section 6) ---------- */
function block1(o = {}) {
  const T = o.dense ? (i => 17.5 - i) : (i => 60 - 3 * i);                       // slot i is this many days ago; i = 17 is today's, made by tapping
  const A = [[135, 8, 135], [135, 9, 135], [135, 10, 135], [140, 6, 140], [140, 8, 145], [140, 10, 140]];   // Bench: w, r, what the engine said
  const R = [[100, 10, 100], [100, 10, 100], [100, 10, 100], [100, 10, 100], [100, 10, 100], [100, 10, 105]];  // Cable Row
  const OHP = { 1: [65, 8, 65], 4: [65, 9, 65], 7: [70, 6, 65], 13: [70, 7, 70], 16: [70, 8, 70] };            // B slots by index (10 is unlogged)
  const LP = [[190, 10, 190], [190, 11, 190], [190, 12, 190], [200, 8, 205], [200, 9, 200]];                   // Leg Press C1..C5
  const RD = o.rdlFlat ? [[225, 12, 225], [225, 10, 225], [225, 10, 225], [225, 10, 225], [225, 10, 225]]
    : [[225, 6, 225], [225, 7, 225], [225, 8, 225], [225, 9, 225], [225, 10, 225]];                              // RDL
  const out = [];
  for (let k = 0; k < 6; k++) {                                                                                // A1..A6 at slots 0,3,...,15
    const a = A[k], r = R[k];
    out.push(sess('a' + k, 'rA', 'A', 'vA', T(3 * k), [ex('Bench Press', a[0], a[1], { presc: a[2] })].concat(o.rowKeep !== undefined && k >= o.rowKeep ? [] : [ex('Cable Row', r[0], r[1], { presc: r[2] })]),
      o.eased === k ? { easeBack: true } : {}));
  }
  [1, 4, 7, 10, 13, 16].forEach((i, k) => {                                                                    // B1..B6; B4 is the unlogged one
    const v = k % 2 ? 'vB2' : 'vB1', vn = k % 2 ? 'Week 2' : 'Week 1';
    if (i === 10 && !o.b4logged) { out.push(sess('b' + k, 'rB', 'B', v, T(i), [], { unlogged: true, vname: vn })); return; }
    const x = OHP[i] || [70, 7, 70];
    out.push(sess('b' + k, 'rB', 'B', v, T(i), [ex('Overhead Press', x[0], x[1], { presc: x[2] }),
      k % 2 ? ex('Pull-up', 100, 8, { presc: 100 }) : ex('Cable Crunch', 50, 12, { presc: 50 })], { vname: vn }));
  });
  [2, 5, 8, 11, 14].forEach((i, k) => {                                                                        // C1..C5 (C6 is tapped in)
    const e = [ex('Leg Press', LP[k][0], LP[k][1], { presc: LP[k][2] }), ex('RDL', RD[k][0], RD[k][1], { presc: RD[k][2] })];
    if (k === 1) e.push(ex('Lateral Raise', 15, 14, { kind: 'new', presc: '' }));                              // done once, never prescribed
    out.push(sess('c' + k, 'rC', 'C', 'vC', T(i), e));
  });
  /* what does not fill a slot: a pump session, a freestyle one, a deload week session */
  out.push(sess('pump1', 'rP', 'P', 'vP1', 30.5, [ex('Rope Hammer Curl', 30, 15, { presc: 30 }), ex('Cable Lateral Raise', 15, 15, { presc: 15 })], { name: 'Pump day' }));
  out.push(sess('free1', null, '—', null, 25.5, [ex('Cable Shrug', 60, 15)], { name: 'Freestyle' }));
  out.push(sess('dl1', 'rA', 'A', 'vA', 20.5, [ex('Bench Press', 95, 8, { presc: 95 })], { deload: true }));
  return out;
}
const blockState = (o = {}) => state(block1(o), { routines: plan().concat([pumpR()]), settings: { targetFreq: 7 }, block: o.block, coach: o.coach });

/* ---------- helpers ---------- */
async function put(st, gist) {
  noWarmups(st);                                   // the first set is the first working set (the S3 ramps are C's, t51's)
  await page.goto(URL);
  await page.evaluate(([s, g]) => { localStorage.clear(); localStorage.setItem('ironlog.v1', JSON.stringify(s)); if (g) localStorage.setItem('ironlog.gist', JSON.stringify(g)); }, [st, gist || null]);
  await page.reload(); await page.waitForSelector('#view');
}
const go = async tab => { await page.locator('[data-tab="' + tab + '"]').tap(); await page.waitForTimeout(150); };
const eyebrow = async () => (await page.locator('#view .eyebrow').first().textContent()).replace(/^[^·]*· /, '').trim();
const ev = (fn, arg) => page.evaluate(fn, arg);
const hero = async () => ev(() => document.querySelector('.hero h2').firstChild.textContent.trim());
const gistCount = async () => JSON.parse(await ev(() => localStorage.getItem('ironlog.gist') || '{}')).pushedSessions;
const toastUndo = async () => { await page.locator('.toast.act button').tap(); await page.waitForTimeout(250); };
const noOverflow = async () => ev(() => document.documentElement.scrollWidth <= innerWidth);
const fits = async sel => ev(s => { const c = document.querySelector(s); return !!c && c.scrollWidth <= c.clientWidth + 1; }, sel);
const axeCritical = async () => {
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(() => axe.run(document, { resultTypes: ['violations'] }));
  return r.violations.filter(v => v.impact === 'critical').map(v => v.id + ' x' + v.nodes.length);
};
/* The last slot of the scripted block: the next day is C. Start it, tick Leg Press and RDL (not Lateral Raise), save. */
const closeInfo = {};
async function closeBlockByTapping() {
  await page.locator('#view button[data-act="start"].primary').tap();
  await page.waitForSelector('.set');
  const pre = await ev(() => S.active.exercises.map(e => [e.name, e.sets[0].w, e.sets[0].r]));
  for (const ei of [0, 1]) for (let k = 0; k < 3; k++) await page.locator('.set[data-ei="' + ei + '"] [data-act="toggle"]').nth(k).tap();
  await page.locator('button.primary[data-act="finish"]').tap();
  await page.waitForSelector('.sheet [data-x="save"]');
  closeInfo.sheet = await page.locator('.sheet').innerText();
  await page.locator('.sheet [data-x="save"]').tap();
  await page.waitForSelector('.toast');
  closeInfo.toast = await page.locator('.toast').innerText();
  await go('today');
  return pre;
}
const liftRows = async () => ev(() => [...document.querySelectorAll('#blk-card .blk-l')].map(r => [r.querySelector('.blk-n').textContent, r.querySelector('.blk-m').textContent, (r.querySelector('.chip') || {}).textContent || '']));

/* ======================================================================== */
console.log('1 off-book: the button, the undo, the rotation');
const HIST = mini(8);                                  // A B C A B C A B  -> the next day is C
await put(state(HIST), { pushedSessions: 8 });
const ob = page.locator('.offbook');
eq(await ob.count(), 1, '1 one quiet button on Today idle');
eq((await ob.textContent()).trim(), "Trained Day C, didn't log it", '1 it names the day that is next');
ok((await ob.boundingBox()).height >= 44, '1 it is at least 44 px tall');
ok(await ev(() => { const d = document.querySelector('.hero').closest('.card'); const b = d.querySelector('.offbook'); return !!b; }), '1 it sits inside the day card');
await ob.tap(); await page.waitForTimeout(250);
let st = await getState(page);
eq(st.sessions.length, 9, '1 one tap adds a session');
const s0 = st.sessions[0];
ok(s0.unlogged === true && s0.exercises.length === 0 && s0.routineId === 'rC' && s0.key === 'C' && s0.name === 'Day C' && Math.abs(s0.ts - Date.now()) < 5000 &&
  s0.endTs === s0.ts && s0.deload === false && s0.variantId === 'vC' && s0.note === '',
  '1 the session is Day C, now, with no exercises and unlogged:true');
has(await page.locator('.toast.act').textContent(), 'Day C marked as trained', '1 a toast with Undo says so');
eq((await hero()), 'Day A', '1 the rotation moved on: Day A is next');
has(await page.locator('.lastsess').textContent(), 'not logged', '1 the Last row says "not logged"');
eq(await gistCount(), 8, '1 adding it did not touch the backup guard count (it has not been pushed)');
await toastUndo();
st = await getState(page);
eq(st.sessions.length, 8, '1 Undo removes it');
eq((await hero()), 'Day C', '1 ...and the rotation is back on Day C');
eq(await gistCount(), 8, '1 Undo before any push leaves pushedSessions alone (amendment 2)');
for (let k = 0; k < 5; k++) { await page.locator('.offbook').tap(); await page.waitForTimeout(120); await toastUndo(); }
eq(await gistCount(), 8, '1 off-book + Undo five times: pushedSessions is still 8');
eq((await getState(page)).sessions.length, 8, '1 ...and the log is unchanged');
/* the other way: it had already reached the gist, so Undo takes the count down with it */
await page.locator('.offbook').tap(); await page.waitForTimeout(150);
await ev(() => { const g = JSON.parse(localStorage.getItem('ironlog.gist')); g.pushedSessions = 9; localStorage.setItem('ironlog.gist', JSON.stringify(g)); gistMem = null; });
await toastUndo();
eq(await gistCount(), 8, '1 pushed already (9 > 8 left): Undo moves the count down to 8');
/* a plain delete from the sheet still moves the count with it */
await page.locator('.offbook').tap(); await page.waitForTimeout(150);
eq(await page.locator('.lastsess .ls-edit').textContent(), 'Open', '1 the Last row of an unlogged session offers Open, not Edit');
await page.locator('.lastsess').tap(); await page.waitForSelector('.sheet');
has(await page.locator('.sheet .sub').textContent(), 'Trained, not logged.', '1 tapping it opens the sheet: "Trained, not logged."');
eq(await page.locator('.sheet [data-x="edit"]').count(), 0, '1 ...with no Edit (nothing to edit)');
eq(await page.locator('.sheet [data-x="del"]').count(), 1, '1 ...and Delete is there');
await page.locator('.sheet [data-x="close"]').tap();

/* ======================================================================== */
console.log('2 every reader skips it (spec 3c)');
/* a Day A history, four sessions with lifts; then three unlogged Day A sessions */
const A4 = [20, 14, 8, 2].map((d, i) => sess('x' + i, 'rA', 'A', 'vA', d, [ex('Bench Press', 135 + 5 * i, 8, { presc: 135 + 5 * i }), ex('Cable Row', 100, 10, { presc: 100 })]));
const FILL = mini(6, 4).map(s => Object.assign(s, { ts: s.ts - 30 * DAY, endTs: s.endTs - 30 * DAY }));   // older, so the A history is the newest
await put(state(A4.concat(FILL)));
const SNAP = () => JSON.stringify({
  sets: setsByMuscle(0, Date.now() + 864e5).by, vol: volumeInRange(0, Date.now() + 864e5).v,
  exw: exWorking('Bench Press').length, last: lastPerf('Bench Press'), pr: prBoard().map(p => [p.name, Math.round(p.e * 100)]),
  tr: trend('Bench Press'), tl: trendLong('Bench Press'), dl: deloadStatus().judged.length + '/' + deloadStatus().stalled.length,
  pres: prescribe('Bench Press', planExByName('Bench Press')), dayA: coachDaySessions(S.routines[0]).length,
  all: allExerciseNames().length, note: lastNote('Bench Press') });
const before = await ev(SNAP);
const nBefore = await ev(() => ({ n: volumeInRange(0, Date.now() + 864e5).n, slots: blockSlots(), per: sessionsPerWeek(8).reduce((a, b) => a + b, 0), sessions: S.sessions.length }));
for (let k = 0; k < 3; k++) {                                                    // the hero day changes after each tap; the button follows it
  await page.locator('.offbook').tap(); await page.waitForTimeout(150);
}
const after = await ev(SNAP);
eq(after, before, '2 volume by muscle, volume, lastPerf, PRs, trend, long trend, deload status, prescribe, coachDaySessions, all lifts: identical');
const nAfter = await ev(() => ({ n: volumeInRange(0, Date.now() + 864e5).n, slots: blockSlots(), per: sessionsPerWeek(8).reduce((a, b) => a + b, 0), sessions: S.sessions.length }));
eq([nAfter.n - nBefore.n, nAfter.slots - nBefore.slots, nAfter.per - nBefore.per, nAfter.sessions - nBefore.sessions].join(), '3,3,3,3',
  '2 ...but it counts for frequency: volumeInRange().n, block slots, sessions per week, the session list: +3 each');
/* the coach: three unlogged days must not make every lift of that day "skipped" */
const dayAnow = await ev(() => coachDaySessions(S.routines.find(r => r.key === 'A')).map(s => (s.unlogged ? 'U' : 'L')).join(''));
eq(dayAnow, 'LLLLLL', '2 coachDaySessions(Day A): the six logged Day A sessions and none of the three unlogged ones');
const props = await ev(() => { S.coach.lastCheck = 0; S.coach.proposals = []; const n = coachRun(true); return S.coach.proposals.map(p => p.kind + ':' + p.lift); });
ok(!props.some(p => /^skipped/.test(p)), '2 coachRun: no "skipped lift" card although the last 3 Day A sessions have no lifts  [' + props.join(' | ') + ']');
ok(!props.some(p => /^long/.test(p)), '2 ...nor a "running long" card');
/* the summary Claude reads */
const sum = await ev(() => coachSummaryText(6));
has(sum, '(3 marked trained, not logged)', '2 coachSummaryText: the header counts the marked sessions');
has(sum, '(trained, not logged)', '2 coachSummaryText: the sessions list says "(trained, not logged)" instead of "0 working sets"');
ok(!/: \? min active, \? min first-to-last-set, 0 working sets/.test(sum), '2 ...and does not print them as empty workouts');
/* measuring an accepted suggestion: day mode waits for 4 sessions with lifts. After it was accepted 5 days ago there is one logged Day A
   session (2 days ago) and 3 unlogged ones put in here; counting those would make four and score it. */
const meas = await ev(() => {
  for (const d of [4, 3, 1.5]) S.sessions.unshift({ id: 'ux' + d, ts: Date.now() - d * 864e5 - 1000, endTs: Date.now() - d * 864e5 - 1000, routineId: 'rA', key: 'A', name: 'Day A',
    variantId: 'vA', deload: false, note: '', bw: 180, unlogged: true, exercises: [] });
  S.sessions.sort((a, b) => b.ts - a.ts);
  S.coach.history = [{ type: 'accepted', ts: Date.now() - 5 * 864e5, pid: 'zz', kind: 'trim_sets', act: 'trim', lift: 'Cable Row', from: 'Cable Row', rid: 'rA', mode: 'day',
    baseline: { score: 0, skip: 0.5, min: null }, result: '', checked: 0 }];
  coachMeasure(); return S.coach.history[0].result; });
eq(meas, '', '2 coachMeasure (day mode): the unlogged sessions are not "the next four", so it is still waiting');
/* Progress: History */
await go('progress');
const hist = await page.locator('.sess').allInnerTexts();
ok(/not logged/.test(hist[0]) && !/0 sets/.test(hist[0]), '2 History: the row says "not logged", not "0 sets · 0"  [' + hist[0].replace(/\s+/g, ' ') + ']');
await page.locator('.sess').first().tap(); await page.waitForSelector('.sheet');
eq(await page.locator('.sheet [data-x="edit"]').count(), 0, '2 sessionSheet: no Edit');
has(await page.locator('.sheet .sub').textContent(), 'Trained, not logged.', '2 sessionSheet: "Trained, not logged."');
await page.locator('.sheet [data-x="close"]').tap();
const prog = await page.locator('#view').innerText();
ok(!/0 sets · 0/.test(prog), '2 no "0 sets" anywhere on Progress');
/* the rotation volume window of Progress (package E) skips them: its "last N days" is the last N logged days */
const win = await ev(() => { const w = rotationWindows(); return { n: w.n, cur: w.cur.filter(s => s.unlogged).length, prev: w.prev.filter(s => s.unlogged).length }; });
eq(win.cur + win.prev, 0, '2 rotationWindows (rotation volume on Progress): no unlogged session inside it');

/* the volume rule: a week with an unlogged session in the three is "not enough logged to judge" */
function weekState(extra) {
  const wk = o => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - (((d.getDay() + 6) % 7) + 7 * o) * DAY; };
  const out = [sess('old', 'rA', 'A', 'vA', 40, [ex('Bench Press', 135, 8, { n: 2 })])];
  for (const o of [1, 2, 3]) for (const dd of [1, 3]) {
    const ts0 = wk(o) + dd * DAY + 9 * 36e5;
    out.push(Object.assign(sess('w' + o + dd, 'rA', 'A', 'vA', 0, [ex('Bench Press', 135, 8, { n: 2 }), ex('Cable Crunch', 50, 12, { n: 1 })]), { ts: ts0, endTs: ts0 + 36e5 }));
  }
  return state(out.concat(extra || []), { routines: plan().map(r => (r.key === 'A' ? Object.assign(r, { variants: [{ id: 'vA', label: '', exercises: [row('Bench Press', 3, 6, 10, 'chest', ['triceps']), row('Cable Row', 3, 8, 12, 'back', ['biceps']), row('Cable Crunch', 3, 10, 15, 'core')] }] }) : r)) });
}
await put(weekState());
/* chest: 2 sets x 2 sessions = 4 a week (< 6) -> the rule fires; abs: 1 set x 2 = 2 a week (< 4) -> fires too, chest is the lowest? no: abs 2 < chest 4 */
let vr = await ev(() => coachRuleVolume().map(p => p.title));
eq(vr.join(), 'Abs gets few sets', '2 control: coachRuleVolume speaks, and for the lowest muscle: abs 2 a week (under 4, a small muscle\'s 6 x 2/3), chest 4 is higher  [' + vr + ']');
vr = await ev(() => { S.settings.excludedMuscles = ['calves', 'core']; return coachRuleVolume().map(p => p.title); });
eq(vr.join(), 'Chest gets few sets', '2 an excluded muscle is never raised: with abs skipped it is chest (4 a week, under 6)');
const un = sess('un1', 'rA', 'A', 'vA', 0, [], { unlogged: true }); un.ts = NOW - 9 * DAY; un.endTs = un.ts;
await put(weekState([un]));
const wkOfUn = await ev(() => { const u = S.sessions.find(s => s.id === 'un1'); return [1, 2, 3].map(weekBounds).findIndex(b => u.ts >= b.start && u.ts < b.end); });
ok(wkOfUn >= 0, '2 the unlogged session sits in one of the three weeks the rule reads');
eq(await ev(() => coachRuleVolume().length), 0, '2 coachRuleVolume: silent when one of the three weeks holds an unlogged session');
await put(weekState());
/* per-class bands: abs at 5 a week would have fired under the old flat 6; its band is 6-12 so "thin" is under 4 */
await ev(() => { S.sessions.forEach(s => s.exercises.forEach(e => { if (e.name === 'Cable Crunch') e.sets = Array.from({ length: 3 }, () => ({ w: '50', r: '12', done: true, load: 50 })); })); S.settings.excludedMuscles = ['calves']; });
eq(await ev(() => coachRuleVolume().map(p => p.title).join()), 'Chest gets few sets', '2 abs at 3 sets x 2 = 6 a week is fine; only chest (4, under 6) speaks');
await ev(() => { S.sessions.forEach(s => s.exercises.forEach(e => { if (e.name === 'Cable Crunch') e.sets = Array.from({ length: 2 }, () => ({ w: '50', r: '12', done: true, load: 50 })); })); });
eq(await ev(() => coachRuleVolume().map(p => p.title).join()), 'Chest gets few sets', '2 abs at 2 x 2 = 4 a week is not thin for a small muscle (the floor is 4); chest at 4 is under 6');

/* ======================================================================== */
console.log('3 export / import / gist keep it');
await put(state(mini(8)), { pushedSessions: 8 });
await page.locator('.offbook').tap(); await page.waitForTimeout(150);
const exported = await ev(() => payload());
const exp = JSON.parse(exported);
eq(exp.sessions.filter(s => s.unlogged).length, 1, '3 payload(): the unlogged session is in the file');
const gl = await ev(() => JSON.stringify(gistLog().sessions.filter(s => s.unlogged).map(s => [s.key, s.exercises.length])));
eq(gl, '[["C",0]]', '3 the gist copy holds it too');
await put(state([]));                                   // a clean app, then the real Settings import sheet
await page.locator('[data-act="settings"]').first().tap(); await page.waitForSelector('[data-set="unit"]');
await page.locator('[data-act="import"]').first().tap(); await page.waitForSelector('.sheet [data-x="paste"]');
await page.locator('.sheet [data-x="paste"]').fill(exported);
await page.locator('.sheet [data-x="go"]').tap(); await page.waitForTimeout(400);
st = await getState(page);
eq(st.sessions.length, 9, '3 import: all nine sessions arrive');
const u9 = st.sessions[0];
ok(u9.unlogged === true && u9.exercises.length === 0 && u9.routineId === 'rC', '3 import: the off-book session is still unlogged, with no exercises');
has(await page.locator('.lastsess').textContent(), 'not logged', '3 import: Today still says "not logged"');
eq((await hero()), 'Day A', '3 import: the rotation still reads it');
await ev(() => { const x = JSON.parse(payload()); x.version = 5; delete x.block; localStorage.setItem('ironlog.v1', JSON.stringify(x)); });
await page.reload(); await page.waitForSelector('#view');
eq((await getState(page)).sessions.filter(s => s.unlogged).length, 1, '3 a v5-shaped copy (older tab) loads and keeps it (normalize leaves sessions alone)');

/* ======================================================================== */
console.log('4 the pump day');
await put(state(mini(7)));                              // A B C A B C A -> Day B is next
const nextBefore = (await hero());
eq(nextBefore, 'Day B', '4 start: Day B is next');
const pb = page.locator('.pumpbtn');
eq(await pb.count(), 1, '4 a Pump day button on Today idle');
has(await pb.textContent(), 'Pump day', '4 it says Pump day');
const geo = await ev(() => { const s = document.querySelector('[data-act="start"].primary').getBoundingClientRect(), p = document.querySelector('.pumpbtn').getBoundingClientRect(),
  c = document.querySelector('.hero').closest('.card').getBoundingClientRect(), first = document.querySelector('#view button'); return { sb: s.bottom, pt: p.top, ct: c.top, cb: c.bottom, first: first.dataset.act, firstPrimary: first.classList.contains('primary'), vh: innerHeight, pb: p.bottom }; });
ok(geo.first === 'start' && geo.firstPrimary, '4 Start is still the first button on Today');
ok(geo.sb < geo.vh && geo.pb <= geo.vh, '4 Start and the Pump day button are both inside the first screen  [Start bottom ' + Math.round(geo.sb) + ', pump bottom ' + Math.round(geo.pb) + ' of ' + geo.vh + ']');
ok(geo.pt >= geo.cb - 1, '4 the Pump day button sits under the day card');
eq(await ev(() => S.routines.filter(r => r.optional).length), 0, '4 there is no pump routine yet');
await pb.tap(); await page.waitForSelector('.set'); await page.waitForTimeout(300);
st = await getState(page);
const pr = st.routines.find(r => r.optional);
ok(pr && pr.key === 'P' && pr.name === 'Pump day' && st.routines.length === 4, '4 tapping it created the optional routine with E\'s seed');
eq(pr.variants.map(v => v.label + ':' + v.exercises.length).join(), 'Arms & delts:8,Chest, back & core:6', '4 two variants: 8 rows and 6 rows (14 in all)');
ok(pr.variants.every(v => v.exercises.every(e => e.sets === 3 && e.scheme === 'double')), '4 every row is 3 sets, built through newPlanEx');
eq(st.active.routineId, pr.id, '4 and the session started is the pump day');
eq(st.active.exercises.length, 8, '4 on its first menu, Arms & delts (8 lifts)');
const beforePump = await ev(() => ({ sets: JSON.stringify(setsByMuscle(0, Date.now() + 864e5).by), per: sessionsPerWeek(8).reduce((a, b) => a + b, 0), slots: blockSlots(), n: S.sessions.length }));
await page.locator('.set[data-ei="1"] [data-act="toggle"]').first().tap();     // Bayesian Cable Curl: one set done
await page.locator('button.primary[data-act="finish"]').tap(); await page.waitForSelector('.sheet [data-x="save"]');
has(await page.locator('.sheet').textContent(), 'Pump day is extra work', '4 the finish sheet says it is extra and leaves the rotation alone');
await page.locator('.sheet [data-x="save"]').tap(); await page.waitForSelector('.toast'); await go('today');
st = await getState(page);
eq(st.sessions[0].routineId, pr.id, '4 the pump session is saved');
eq((await hero()), nextBefore, '4 the hero is unchanged: Day B is still next (a pump session never moves A/B/C)');
const afterPump = await ev(() => ({ sets: JSON.stringify(setsByMuscle(0, Date.now() + 864e5).by), per: sessionsPerWeek(8).reduce((a, b) => a + b, 0), slots: blockSlots(), n: S.sessions.length }));
eq(afterPump.slots, beforePump.slots, '4 it fills no block slot');
eq(afterPump.per - beforePump.per, 1, '4 it counts toward sessions per week');
ok(afterPump.sets !== beforePump.sets, '4 and its set counts toward volume by muscle');
has(await page.locator('.pumpbtn').textContent(), 'Chest, back & core', '4 the button now offers the other menu (the two alternate by themselves)');
ok(!(await page.locator('.daypick').allInnerTexts()).some(t => /Pump day/.test(t) && /Chest, back/.test(t)), '4 ...and the day pickers do not list the same menu twice');
ok((await page.locator('.daypick').allInnerTexts()).some(t => /Pump day/.test(t) && /Arms/.test(t)), '4 the other pump menu is in the pickers');
await go('plan');
has(await page.locator('#view').innerText(), 'OPTIONAL', '4 Plan: the day card carries an OPTIONAL tag');
/* the balance card's own suggestion goes away once the day exists, and uses the same seed when taken from there */
ok(!(await page.locator('#view').innerText()).includes('Add the optional Pump day'), '4 Plan: the "Add the optional Pump day" suggestion is gone once it exists');
await put(state(mini(7)));
await go('plan');
await page.locator('[data-act="plan-suggest"][data-id="pump"]').tap(); await page.waitForTimeout(300);
eq(await ev(() => S.routines.filter(r => r.optional).length), 1, '4 the Plan suggestion creates the same routine');
await go('today');
await page.locator('.pumpbtn').tap(); await page.waitForSelector('.set');
eq(await ev(() => S.routines.filter(r => r.optional).length), 1, '4 the Today button then uses it instead of creating a second');
eq(await ev(() => S.active.name), 'Pump day', '4 ...and starts it');
/* never "skipped": three weeks unused (and lifts of it done long ago, so the rule would otherwise judge it) */
const pumpOld = [60, 56, 52, 48].map((d, i) => sess('po' + i, 'rP', 'P', 'vP1', d, [ex('Rope Hammer Curl', 30, 15)], { name: 'Pump day' }));
const lateCable = sess('pc', 'rP', 'P', 'vP1', 70, [ex('Cable Lateral Raise', 15, 15)], { name: 'Pump day' });
const mainRecent = mini(9, 2.3);
const skipSt = o => state(pumpOld.concat([lateCable], mainRecent), { routines: plan().concat([Object.assign(pumpR(), o)]), coach: { proposals: [], history: [], lastCheck: 0 } });
await put(skipSt({ optional: false }));
const ctl = await ev(() => coachRuleSkipped().map(p => p.lift));
ok(ctl.includes('Cable Lateral Raise'), '4 control: the same day NOT marked optional is called skipped (Cable Lateral Raise missing in 3 of its last 4)  [' + ctl + ']');
await put(skipSt({ optional: true, id: 'rP' }));
eq(await ev(() => coachRuleSkipped().length), 0, '4 optional: coachRuleSkipped raises nothing for the pump day');
/* and through the real path: finish a main day; the 14-day look runs and raises no skipped card for a pump lift */
await page.locator('#view button[data-act="start"].primary').tap(); await page.waitForSelector('.set');
await page.locator('.set[data-ei="0"] [data-act="toggle"]').first().tap();
await page.locator('button.primary[data-act="finish"]').tap(); await page.waitForSelector('.sheet [data-x="save"]');
await page.locator('.sheet [data-x="save"]').tap(); await page.waitForSelector('.toast');
const kinds = (await getState(page)).coach.proposals.map(p => p.kind + ':' + p.lift);
ok(!kinds.some(k => /^skipped:(Rope|Cable Lateral)/.test(k)), '4 after a real save the coach ran and named no pump lift as skipped  [' + kinds.join(' | ') + ']');
await go('today');

/* ======================================================================== */
console.log('5 the rotation counter');
async function rot(sessions, over) { await put(state(sessions, over)); return eyebrow(); }
eq(await rot([]), 'Rotation 1 of 6', '5 an empty log: Rotation 1 of 6');
eq(await rot(mini(2)), 'Rotation 1 of 6', '5 two sessions: still rotation 1 (N = 3 main days)');
eq(await rot(mini(3)), 'Rotation 2 of 6', '5 three: rotation 2');
eq(await rot(mini(5)), 'Rotation 2 of 6', '5 five: rotation 2');
eq(await rot(mini(6)), 'Rotation 3 of 6', '5 six: rotation 3');
eq(await rot(mini(17)), 'Rotation 6 of 6', '5 seventeen: rotation 6 (the last)');
const ex9 = mini(2).concat([sess('v1', 'rB', 'B', 'vB2', 1, [ex('Overhead Press', 65, 8)])]);
eq(await rot(ex9), 'Rotation 2 of 6', '5 week variants are irrelevant: Day B week 1 and week 2 both count as B');
const out3 = [sess('o1', 'rA', 'A', 'vA', 6, [ex('Bench Press', 135, 8)]), sess('o2', 'rA', 'A', 'vA', 4, [ex('Bench Press', 135, 8)]), sess('o3', 'rA', 'A', 'vA', 2, [ex('Bench Press', 135, 8)])];
eq(await rot(out3), 'Rotation 2 of 6', '5 a rotation is any 3 main-day sessions (A, A, A is training too)');
const extras = [sess('px', 'rP', 'P', 'vP1', 5, [ex('Rope Hammer Curl', 30, 15)], { name: 'Pump day' }), sess('fr', null, '—', null, 4, [ex('Cable Shrug', 60, 15)], { name: 'Freestyle' }),
  sess('dl', 'rA', 'A', 'vA', 3, [ex('Bench Press', 95, 8)], { deload: true })];
const pumpPlan = { routines: plan().concat([pumpR()]) };
eq(await rot(mini(2).concat(extras), pumpPlan), 'Rotation 1 of 6', '5 pump, freestyle and a deload session do not count: 2 + 3 of them is still rotation 1');
eq(await rot(mini(2).concat([sess('un', 'rC', 'C', 'vC', 1, [], { unlogged: true })]), pumpPlan), 'Rotation 2 of 6', '5 an unlogged session counts: 2 + 1 = rotation 2');
eq(await rot(mini(6), { block: { num: 1, startSessId: 'm2', startTs: mini(6).find(s => s.id === 'm2').ts, rotation: 0, history: [] } }), 'Rotation 2 of 6', '5 the block counts from its start time (the time of m2): 3 sessions after it -> rotation 2');
eq(await rot(mini(6), { block: { num: 1, startSessId: 'm2', startTs: 0, rotation: 0, history: [] } }), 'Rotation 3 of 6', '5 startSessId is a note only: with startTs 0 every session counts (6 -> rotation 3), the session it names is not looked up');
eq(await rot(mini(6).filter(s => s.id !== 'm2'), { block: { num: 1, startSessId: 'm2', startTs: mini(6).find(s => s.id === 'm2').ts, rotation: 0, history: [] } }), 'Rotation 2 of 6', '5 a deleted anchor session changes nothing: the time stays (3 sessions after it -> rotation 2)');
eq(await rot(mini(3), { settings: { blockRotations: 4 } }), 'Rotation 2 of 4', '5 the length is a setting: of 4');
ok(!(await rot(mini(5), { routines: plan().concat([pumpR()]) })).includes('Pump'), '5 an optional day is not one of the N (still 3)');
/* a day deleted from the plan: 2 main days -> N = 2 */
const two = plan().filter(r => r.key !== 'B');
eq(await rot(mini(6).filter(s => s.key !== 'B'), { routines: two }), 'Rotation 3 of 6', '5 with two main days a rotation is two sessions (4 -> rotation 3)');

/* ======================================================================== */
console.log('6 the scorecard of a scripted block');
/* 18 main-day sessions: A x6, B x6 (B4 unlogged), C x6 (the sixth is tapped in below), plus a pump, a freestyle and a deload session.
   The rotation counter after 17 slots reads "Rotation 6 of 6"; the 18th closes the block. */
await put(blockState());
eq(await eyebrow(), 'Rotation 6 of 6', '6 17 slots seeded (pump, freestyle, deload do not count): Rotation 6 of 6');
ok(await page.locator('#blk-card').count() === 0, '6 no scorecard before the 18th');
const pre = await closeBlockByTapping();
eq(JSON.stringify(pre), JSON.stringify([['Leg Press', '200', '10'], ['RDL', '230', '6'], ['Lateral Raise', '15', '15']]),
  '6 the engine\'s prefill for the 18th session (so the logged numbers below are what it prescribed): Leg Press 200x10, RDL 230x6');
st = await getState(page);
eq(st.block.num, 2, '6 the 18th main session closed block 1 and started block 2');
eq(st.block.history.length, 1, '6 one scorecard in the history');
eq(await eyebrow(), 'Rotation 1 of 6 · Block 1 done', '6 the eyebrow: Rotation 1 of 6 · Block 1 done');
eq(st.block.startSessId, st.sessions[0].id, '6 block 2 is anchored on the session that closed block 1');
has(closeInfo.sheet, 'Last session of the block', '6 the finish sheet of the 18th session says it closes the block');
has(closeInfo.sheet, 'closes block 1', '6 ...and which one');
has(closeInfo.toast, 'Block 1 done, scorecard on Today', '6 the save toast points at the scorecard');
const card = st.block.history[0];
eq([card.slots, card.logged].join(), '18,17', '6 18 slots, 17 logged (B4 was marked trained)');
/* Per lift, by hand (E = the exposures in the window, oldest first; verdict from the working load, then the best reps at it;
   % = best-set e1RM now over then, e1RM = w x (1 + r/30)):
     Bench Press  6 exposures  135x8 -> 140x10   heavier = up      171.00 -> 186.67 = +9%
     Cable Row    6            100x10 -> 100x10  same, reps same = flat   +0%
     Overhead Press 5 (B4 unlogged)  65x8 -> 70x8   up             82.33 -> 88.67 = +8%
     Cable Crunch 3 (week 1 only)  50x12 -> 50x12 flat, variantOnly
     Pull-up      2 (week 2 only)  100x8 -> 100x8 flat, variantOnly
     Leg Press    6 (C6 is 200x10)  190x10 -> 200x10 up            253.33 -> 266.67 = +5%
     RDL          6 (C6 is 230x6)   225x6 -> 230x6  up             270.00 -> 276.00 = +2%
     Lateral Raise 1               "—" (not judged) */
const L = n => card.lifts.find(l => l.name === n);
const rowOf = n => { const l = L(n); return [l.n, l.w0, l.r0, l.w1, l.r1, l.pct, l.verdict, l.variantOnly].join(); };
eq(card.lifts.map(l => l.name).join(), 'Bench Press,Cable Row,Overhead Press,Cable Crunch,Pull-up,Leg Press,RDL,Lateral Raise', '6 the lifts, in plan order, each once (the pump day\'s are not here)');
eq(rowOf('Bench Press'), '6,135,8,140,10,9,up,false', '6 Bench Press');
eq(rowOf('Cable Row'), '6,100,10,100,10,0,flat,false', '6 Cable Row');
eq(rowOf('Overhead Press'), '5,65,8,70,8,8,up,false', '6 Overhead Press (the unlogged week does not give it a sixth)');
eq(rowOf('Cable Crunch'), '3,50,12,50,12,0,flat,true', '6 Cable Crunch (week 1 only: variantOnly)');
eq(rowOf('Pull-up'), '2,100,8,100,8,0,flat,true', '6 Pull-up (week 2 only: variantOnly)');
eq(rowOf('Leg Press'), '6,190,10,200,10,5,up,false', '6 Leg Press');
eq(rowOf('RDL'), '6,225,6,230,6,2,up,false', '6 RDL');
eq(L('Lateral Raise').n + ':' + L('Lateral Raise').verdict, '1:none', '6 Lateral Raise: one exposure, not judged');
eq(card.flat.join(), 'Cable Row,Cable Crunch,Pull-up', '6 flat: Cable Row (6 >= 4), and the two week-only lifts (>= 2, judged for a stall only on 6 across two blocks)');
eq(card.stallId, '', '6 first block: no two-block history, so no stall card');
/* Override rate: exposures with a prescription, not "new", not eased, not deload, not unlogged: A 12, B 10, C1-C5 10, C6 2 (tapped in, untouched), pump 2 = 36;
   the freestyle shrug has none, the deload session is out, Lateral Raise was "new". Changed: Bench A5 (said 145, did 140), Cable Row A6 (105, 100),
   Overhead Press B3 (65, 70), Leg Press C4 (205, 200) = 4. 4 of 36 = 11%. */
eq(card.override.judged + '/' + card.override.changed, '36/4', '6 override: 4 of 36');
/* Balance, by hand. Sets in the window (3 a lift a session; deload out; pump and freestyle in; the unlogged day has none):
   chest 18; back 18 + 6 = 24; triceps 9 + 7.5 = 16.5; front delts 15; biceps 9 + 3 + 3 (pump curl) = 15; core 9; quads 18; hams 18;
   glutes 9 + 9 = 18; side delts 3 + 3 (pump) = 6; traps 3 (freestyle, a muscle the plan does not train: not reported). x 7 a week / 17 logged slots:
   chest 7.4, back 9.9, front 6.2, side 2.5, biceps 6.2, triceps 6.8, quads 7.4, hams 7.4, glutes 7.4, abs 3.7.
   Back is in 9-16; abs is judged against 6-12. Calves is excluded; traps, rear delts and forearms are not in the plan. */
eq(JSON.stringify(card.balance.low), JSON.stringify([['chest', 7.4], ['front_delts', 6.2], ['side_delts', 2.5], ['biceps', 6.2], ['triceps', 6.8],
  ['quads', 7.4], ['hams', 7.4], ['glutes', 7.4], ['core', 3.7]]), '6 balance.low: every planned muscle under its band, abs against 6-12; traps (freestyle only, not in the plan) is not reported');
eq(card.balance.high.length, 0, '6 nothing over');
/* the card on Today */
const rows = await liftRows();
eq(JSON.stringify(rows[0]), JSON.stringify(['Bench Press', '135×8 → 140×10', '+9%']), '6 card row: Bench Press 135×8 → 140×10  +9%');
eq(JSON.stringify(rows[1]), JSON.stringify(['Cable Row', '100×10 → 100×10', '0%']), '6 card row: Cable Row flat 0%');
eq(JSON.stringify(rows[7]), JSON.stringify(['Lateral Raise', '—', '']), '6 card row: Lateral Raise "—", no chip');
eq(rows.length, 8, '6 eight lifts');
const ctext = await page.locator('#blk-card').innerText();
has(ctext, 'You changed the weight on 4 of 36 lifts (11%).', '6 card: the override sentence');
has(ctext, 'Under its weekly band: Chest 7.4 (9–16)', '6 card: the balance sentence');
has(ctext, 'Abs 3.7 (6–12)', '6 ...with abs against its own band');
ok(!/Back 9/.test(ctext), '6 ...and back, at 9.9, is not on the list');
eq(await page.locator('#blk-card [data-act="block-next"]').textContent(), 'Start block 2', '6 the one-tap: Start block 2');
eq(await page.locator('#blk-card [data-act="block-deload"]').textContent(), 'Deload rotation', '6 and Deload rotation');
ok(await ev(() => { const c = document.querySelector('#blk-card'), day = document.querySelector('.hero').closest('.card'); return !!(day.compareDocumentPosition(c) & 4); }), '6 the card sits under the day card');
ok(await ev(() => document.querySelector('#view button').dataset.act === 'start'), '6 Start is still the first button on Today with the scorecard showing');
/* the coach cannot have changed the plan */
eq(JSON.stringify((await getState(page)).routines.map(r => r.variants.map(v => v.exercises.map(e => e.sets)))), JSON.stringify(plan().map(r => r.variants.map(v => v.exercises.map(e => e.sets))).concat([[[3, 3], [3]]])) , '6 the plan is exactly as it was (the card changes nothing by itself)');

/* ---- 9 the taps on the card ---- */
console.log('9 Start block / Deload rotation, with undo');
await page.locator('[data-act="block-next"]').tap(); await page.waitForTimeout(250);
eq((await getState(page)).block.history[0].choice, 'next', '9 Start block 2 records the choice');
ok((await page.locator('#blk-card').count()) === 0 && !(await eyebrow()).includes('Block 1 done'), '9 the card and "Block 1 done" go away');
eq(await eyebrow(), 'Rotation 1 of 6', '9 rotation 1 of block 2');
await toastUndo();
eq((await getState(page)).block.history[0].choice, null, '9 Undo puts the card back');
ok(await page.locator('#blk-card').count() === 1, '9 ...and it shows again');
await page.locator('[data-act="block-deload"]').tap(); await page.waitForTimeout(250);
st = await getState(page);
/* N = 3 main days, targetFreq 7: round(7 x 3 / 7) = 3, clamped up to 5 days */
ok(Math.abs(st.settings.deloadUntil - (Date.now() + 5 * DAY)) < 60000, '9 Deload rotation starts a deload week of round(7 x N / freq) days, clamped to 5-10: 5 days here');
eq(st.block.history[0].choice, 'deload', '9 ...and records it');
has(await page.locator('#view').innerText(), 'Deload week', '9 Today shows the deload banner');
await toastUndo();
st = await getState(page);
eq(st.settings.deloadUntil, 0, '9 Undo takes the deload back');
eq(st.block.history[0].choice, null, '9 ...and the card is open again');
/* after ten days with no tap it is let go */
await ev(() => { S.block.history[0].endTs = Date.now() - 11 * 864e5; writeNow(); });
await page.reload(); await page.waitForSelector('#view'); await page.waitForTimeout(400);
ok(await page.locator('#blk-card').count() === 0 && (await getState(page)).block.history[0].choice === 'none', '9 untouched for 10 days: the card is let go (choice "none")');
const chk = await eyebrow();
ok(!chk.includes('Block 1 done'), '9 ...and the eyebrow stops saying so  [' + chk + ']');

/* ---- 11 layout, axe, 320 ---- */
console.log('11 Start first, axe, no overflow at 390 and 320');
await put(await getState(page).then(s => { s.block.history[0].choice = null; s.block.history[0].endTs = Date.now() - DAY; return s; }));
ok(await page.locator('#blk-card').count() === 1, '11 (the card is back for the layout checks)');
ok(await noOverflow(), '11 390 px: no horizontal overflow');
ok(await fits('#blk-card'), '11 390 px: the scorecard fits its box');
const ax = await axeCritical();
eq(ax.join(), '', '11 axe: 0 critical on Today with the scorecard, the pump button and the off-book button  [' + ax + ']');
await page.setViewportSize({ width: 320, height: 640 });
await page.waitForTimeout(200);
ok(await noOverflow(), '11 320 px: no horizontal overflow');
for (const sel of ['#blk-card', '.pumpbtn', '.offbook', '.hero']) ok(await fits(sel), '11 320 px: ' + sel + ' fits');
const g320 = await ev(() => { const b = document.querySelector('[data-act="start"].primary').getBoundingClientRect(); return { first: document.querySelector('#view button').dataset.act, bottom: b.bottom, vh: innerHeight }; });
ok(g320.first === 'start' && g320.bottom <= g320.vh, '11 320 px: Start is still first and on the first screen  [' + Math.round(g320.bottom) + ' of ' + g320.vh + ']');
await page.setViewportSize({ width: 390, height: 844 });

/* ======================================================================== */
console.log('6b a planned muscle the block never trained')
/* ---- 6b a planned muscle the block never trained is reported, at zero ---- */
/* Day A gets a Face Pull row (rear delts, 3 sets) that nobody logged: the plan trains rear delts, the block gave them 0 (band 6-12). */
{
  const withFace = plan().map(r => (r.key === 'A' ? Object.assign(r, { variants: [{ id: 'vA', label: '', exercises: r.variants[0].exercises.concat([row('Face Pull', 3, 12, 15, 'rear_delts', ['back'])]) }] }) : r)).concat([pumpR()]);
  const stt = blockState(); stt.routines = withFace;
  await put(stt);
  await closeBlockByTapping();
  const c6b = (await getState(page)).block.history[0];
  eq(JSON.stringify(c6b.balance.low.find(x => x[0] === 'rear_delts')), JSON.stringify(['rear_delts', 0]), '6b rear delts: planned (Face Pull, 3 sets), logged nothing: reported low at 0');
  ok(!c6b.balance.low.some(x => x[0] === 'forearms' || x[0] === 'calves' || x[0] === 'traps'), '6b forearms and traps (not in the plan) and calves (excluded) stay out');
  has(await page.locator('#blk-card').innerText(), 'Rear delts 0.0 (6–12)', '6b the card says it: Rear delts 0.0 (6–12)');
}

/* ======================================================================== */
console.log('7 an eased session: in the progression, out of the override rate');
await put(blockState({ eased: 3 }));                      // A4 (Bench 140x6, Cable Row) was the first day back, eased
await closeBlockByTapping();
const c7 = (await getState(page)).block.history[0];
eq(c7.lifts.find(l => l.name === 'Bench Press').n, 6, '7 Bench Press still counts all 6 exposures (the eased one is one that happened)');
eq(c7.lifts.find(l => l.name === 'Cable Row').n, 6, '7 ...and Cable Row');
eq(c7.override.judged + '/' + c7.override.changed, '34/4', '7 the override rate drops the eased session\'s two lifts: 4 of 34');
eq(await ev(() => exWorking('Bench Press').length), 5, '7 exWorking (what prescribe reads) leaves the eased day out; the scorecard reads exWorkingP(..., true)');

/* ======================================================================== */
console.log('8 the stall rule: two flat blocks');
const prevFlat = (flat, lifts) => ({ num: 1, startTs: NOW - 200 * DAY, endTs: NOW - 100 * DAY, slots: 18, logged: 18, lifts, override: { changed: 0, judged: 0 }, balance: { low: [], high: [] },
  flat, stallId: '', choice: 'next' });
const lf = (name, n, verdict, vo) => ({ name, w0: 100, r0: 10, w1: 100, r1: 10, pct: 0, verdict, n, variantOnly: !!vo });
const blk2 = (history, o) => Object.assign({ block: { num: 2, startSessId: null, startTs: NOW - 90 * DAY, rotation: 0, history }, coach: QUIET }, o || {});
/* (a) Cable Row flat in block 1 (6 sessions) and flat again now: one stall card, inside the scorecard */
await put(blockState(blk2([prevFlat(['Cable Row'], [lf('Cable Row', 6, 'flat')])])));
await closeBlockByTapping();
st = await getState(page);
const cardA = st.block.history[1];
eq(cardA.flat.join(), 'Cable Row,Cable Crunch,Pull-up', '8a block 2: the same three are flat');
const stl = st.coach.proposals.filter(p => p.kind === 'stall');
eq(stl.length, 1, '8a exactly one stall proposal (Cable Crunch and Pull-up were not flat in block 1)');
ok(stl[0].lift === 'Cable Row' && stl[0].stage === 1 && cardA.stallId === stl[0].id, '8a it is Cable Row, rung 1, and the scorecard points at it');
has(stl[0].reason, 'Cable Row was flat for two blocks: 100×10 at the start of block 1, 100×10 at the end of block 2.', '8a the reason says what happened in each block');
eq(stl[0].options.map(o => o.act).join(), 'add,shift_range', '8a rung 1 keeps the lift: a set, or a lower range (not a swap)');
ok(await page.locator('#blk-card [data-co="opt"]').count() === 2 && await page.locator('#blk-card [data-co="keep"]').count() === 1, '8a the card is inside the scorecard, with its choices and Keep it');
eq(await page.locator('.card.co').count(), 0, '8a and it is not shown a second time as a Coach card');
await page.locator('#blk-card [data-co="opt"]').first().tap(); await page.waitForTimeout(300);
eq((await getState(page)).routines[0].variants[0].exercises[1].sets, 4, '8a accepting "Add a set" changes Cable Row to 4 sets, on the same row');
await toastUndo();
eq((await getState(page)).routines[0].variants[0].exercises[1].sets, 3, '8a Undo puts it back');
/* (b) flat in block 1 only in the list of another lift: Cable Row went UP last block -> nothing */
await put(blockState(blk2([prevFlat([], [lf('Cable Row', 6, 'up')])])));
await closeBlockByTapping();
eq((await getState(page)).coach.proposals.filter(p => p.kind === 'stall').length, 0, '8b flat now but climbing last block: no stall card');
/* (c) the first block (section 6): flat once -> none (asserted there: stallId "") */
/* (d) a lift on some of a day's weeks: 3 + 3 = 6 exposures across the two blocks -> judged; 3 + 2 = 5 -> not */
const puPrev = prevFlat(['Pull-up'], [lf('Pull-up', 3, 'flat', true)]);
await put(blockState(Object.assign(blk2([puPrev]), { b4logged: true })));
await closeBlockByTapping();
st = await getState(page);
eq(st.block.history[1].lifts.find(l => l.name === 'Pull-up').n, 3, '8d Pull-up has 3 exposures this block (week 2: B2, B4, B6)');
const pu = st.coach.proposals.filter(p => p.kind === 'stall');
ok(pu.length === 1 && pu[0].lift === 'Pull-up', '8d 3 + 3 = 6 across the two blocks: Pull-up gets its stall card');
await page.locator('#blk-card [data-co="keep"]').tap(); await page.waitForTimeout(250);
st = await getState(page);
ok(st.coach.proposals.find(p => p.lift === 'Pull-up').status === 'skipped' && await page.locator('#blk-card [data-co]').count() === 0, '8d Keep it: the card is dismissed, nothing about the plan changed');
await put(blockState(blk2([puPrev])));                     // B4 unlogged: Pull-up has 2 exposures
await closeBlockByTapping();
st = await getState(page);
eq(st.block.history[1].lifts.find(l => l.name === 'Pull-up').n, 2, '8e Pull-up has 2 exposures this block (B4 was marked, not logged)');
eq(st.coach.proposals.filter(p => p.kind === 'stall').length, 0, '8e 3 + 2 = 5 is under 6: the scorecard reports it and does not judge it');
/* (f) the card respects the open cap and cool-downs like any other: a kept Cable Row card stays quiet */
const kept = { proposals: [{ id: 'old1', ts: NOW - 20 * DAY, decided: NOW - 10 * DAY, source: 'rules', kind: 'stall', key: 'stall|cable row', lift: 'Cable Row', rid: '', title: 't', reason: 'r',
  evidence: '', options: [{ act: 'add', lift: 'Cable Row', n: 1, label: 'Add a set to Cable Row' }], status: 'skipped', stage: 1 }], history: [], lastCheck: NOW };
await put(blockState(blk2([prevFlat(['Cable Row'], [lf('Cable Row', 6, 'flat')])], { coach: kept })));
await closeBlockByTapping();
eq((await getState(page)).coach.proposals.filter(p => p.kind === 'stall' && p.status === 'open').length, 0, '8f a lift whose card was kept 10 days ago is cooling down: the block close does not raise it again');

/* (g) a lift on big steps: Cable Crunch at 50 lb moves in 5 lb jumps (10% of the load), so two blocks at 50 say nothing about a stall */
await put(blockState(blk2([prevFlat(['Cable Crunch'], [lf('Cable Crunch', 3, 'flat', true)])])));
await closeBlockByTapping();
st = await getState(page);
ok(st.block.history[1].flat.includes('Cable Crunch') && st.block.history[1].lifts.find(l => l.name === 'Cable Crunch').n === 3, '8g Cable Crunch is flat again on 3 sessions (3 + 3 = 6 across the blocks)');
eq(st.coach.proposals.filter(p => p.kind === 'stall').length, 0, '8g ...but a 5 lb step on 50 lb is over 8% of the load: no stall card (slow progress can\'t make that jump)');

/* ======================================================================== */
console.log('9b off-book closes a block; undo opens it again');
const seventeen = block1().filter(s => s.id !== 'pump1');
await put(state(seventeen.filter(s => s.id !== 'b3'), { routines: plan(), settings: { targetFreq: 7 } }));    // 16 slots + the unlogged one is the one we tap
await ev(() => { writeNow(); });
const slotsNow = await ev(() => blockSlots());
eq(slotsNow, 16, '9b 16 slots seeded (B4 held back)');
await put(state(seventeen.filter(s => s.id !== 'b3').concat([sess('c5x', 'rC', 'C', 'vC', 1, [ex('Leg Press', 200, 10, { presc: 200 }), ex('RDL', 230, 6, { presc: 230 })])]), { routines: plan(), settings: { targetFreq: 7 } }));
eq(await ev(() => blockSlots()), 17, '9b 17 slots');
const nextDay = (await hero());
await page.locator('.offbook').tap(); await page.waitForTimeout(300);
st = await getState(page);
ok(st.block.num === 2 && st.block.history.length === 1 && st.block.history[0].slots === 18 && st.block.history[0].logged === 17, '9b "Trained ' + nextDay + ', didn\'t log it" is the 18th slot: it closes block 1 (18 slots, 17 logged)');
ok(await page.locator('#blk-card').count() === 1, '9b the scorecard is on Today');
await toastUndo();
st = await getState(page);
ok(st.block.num === 1 && st.block.history.length === 0 && st.sessions.length === 19, '9b Undo: the session is gone and block 1 is open again  [' + st.block.num + ',' + st.block.history.length + ',' + st.sessions.length + ']');
ok(await page.locator('#blk-card').count() === 0, '9b ...and the card with it');

/* ======================================================================== */
console.log('10 history stays at 40; normalize caps it too');
const hist45 = Array.from({ length: 45 }, (_, i) => Object.assign(prevFlat([], []), { num: i + 1, choice: 'next' }));
await put(blockState({ block: { num: 46, startSessId: null, startTs: NOW - 90 * DAY, rotation: 0, history: hist45 } }));
eq(await ev(() => S.block.history.length), 40, '10 normalize keeps the newest 40 of 45');
eq(await ev(() => S.block.history[0].num), 6, '10 ...oldest dropped');
await closeBlockByTapping();
st = await getState(page);
ok(st.block.history.length === 40 && st.block.history[39].num === 46 && st.block.history[0].num === 7, '10 closing one more keeps 40: block 46 is the newest, block 7 the oldest');

/* ======================================================================== */
console.log('12 review: a range edited mid-block, the block start is a time, off-book undo, captions');
async function quickDay() {                                  // the next day, one set ticked, saved
  await page.locator('#view button[data-act="start"].primary').tap(); await page.waitForSelector('.set');
  await page.locator('.set[data-ei="0"] [data-act="toggle"]').first().tap();
  await page.locator('button.primary[data-act="finish"]').tap(); await page.waitForSelector('.sheet [data-x="save"]');
  await page.locator('.sheet [data-x="save"]').tap(); await page.waitForSelector('.toast'); await go('today');
}
/* 12a. RDL logged 5 times at 6-10, the row is edited to 8-12, the sixth session (tapped in) is at 8-12, and the block closes. rangeHist() only
   splits a lift's history when the plan holds it at two ranges at once; here it holds one, so all six exposures are one history. */
{
  const stt = blockState({ rdlFlat: true });
  const rdl = stt.routines.find(r => r.key === 'C').variants[0].exercises.find(e => e.name === 'RDL'); rdl.reps = 8; rdl.repTop = 12;
  await put(stt);
  await closeBlockByTapping();
  const c = (await getState(page)).block.history[0], r = c.lifts.find(l => l.name === 'RDL');
  eq(r.n, 6, '12a RDL: all 6 exposures count (5 at 6-10, 1 at 8-12 after the row was edited)');
  ok(r.verdict === 'flat' && c.flat.includes('RDL'), '12a ...and it can be judged flat  [' + r.w0 + 'x' + r.r0 + ' -> ' + r.w1 + 'x' + r.r1 + ', ' + r.verdict + ']');
}

/* 12b. The block starts at a time, written once when it opens. Close block 1, log two more days, then move the closing session's date back 8
   days: block 2 still has its two. (Dense fixture: seven block-1 sessions fall inside those 8 days, so a block anchored on the session would jump to 9.) */
await put(blockState({ dense: true }));
await closeBlockByTapping();
await quickDay(); await quickDay();
const eb0 = await eyebrow(), startTs0 = (await getState(page)).block.startTs;
eq(await ev(() => blockSlots()), 2, '12b block 2 has 2 sessions');
await ev(() => { const a = S.sessions.find(s => s.id === S.block.history[0].closedBy); a.ts -= 8 * 864e5; a.endTs -= 8 * 864e5; S.sessions.sort((x, y) => y.ts - x.ts); writeNow(); render(); });
eq(await ev(() => blockSlots()), 2, '12b the closing session\'s date moved back 8 days: still 2 sessions in block 2');
eq(await eyebrow(), eb0, '12b ...and the rotation line is unchanged  [' + eb0 + ']');
eq((await getState(page)).block.startTs, startTs0, '12b startTs was not touched');

/* 12c. Off-book, then a main workout saved inside the undo window (the toast is replaced, so the Undo handler is kept from the first one), then Undo.
   The workout closed the block (the 18th slot) and raised a stall card; Undo takes out the marked session and nothing else. */
const seventeenB = block1().filter(s => s.id !== 'pump1' && s.id !== 'b3');                     // 16 slots, no unlogged one
const prevCR = () => prevFlat(['Cable Row'], [lf('Cable Row', 6, 'flat')]);
const stateC = (extra = []) => state(seventeenB.concat(extra), { routines: plan(), settings: { targetFreq: 7 }, block: { num: 2, startSessId: null, startTs: NOW - 90 * DAY, rotation: 0, history: [prevCR()] }, coach: QUIET });
await put(stateC());
const n0 = await ev(() => S.sessions.length);
await page.locator('.offbook').tap(); await page.waitForTimeout(200);
await ev(() => { window.__undo = document.querySelector('.toast.act button'); });
await quickDay();
st = await getState(page);
ok(st.block.num === 3 && st.block.history.length === 2 && st.block.history[1].stallId && st.coach.proposals.some(p => p.kind === 'stall' && p.status === 'open'), '12c the saved workout was the 18th slot: block 2 closed and raised a stall card');
const stallId = st.block.history[1].stallId;
await ev(() => window.__undo.click()); await page.waitForTimeout(300);
st = await getState(page);
eq(st.sessions.length, n0 + 1, '12c Undo took out the marked session only (the workout stays)');
ok(!st.sessions.some(s => s.unlogged), '12c ...no unlogged session left');
ok(st.block.num === 3 && st.block.history.length === 2 && await ev(() => S.block.num === 3 && S.block.history.length === 2 && S.coach.proposals.some(p => p.kind === 'stall')), '12c the block progress the workout made survives (block 3 open, 2 scorecards), saved and in memory');
ok(st.coach.proposals.some(p => p.id === stallId && p.status === 'open'), '12c ...and so does the card it raised');
eq(st.block.rotation, await ev(() => blkRotationNow()), '12c the rotation cache is recounted from the sessions that remain');

/* 12d. The marked session itself closes the block and raises the stall card: Undo retires exactly those and reopens the block. */
await put(stateC([sess('c5x', 'rC', 'C', 'vC', 1, [ex('Leg Press', 200, 10, { presc: 200 }), ex('RDL', 230, 6, { presc: 230 })])]));
await page.locator('.offbook').tap(); await page.waitForTimeout(300);
st = await getState(page);
ok(st.block.num === 3 && st.block.history.length === 2 && st.coach.proposals.some(p => p.kind === 'stall' && p.status === 'open'), '12d the marked session is the 18th slot: it closes block 2 and a stall card is raised');
await toastUndo();
st = await getState(page);
ok(st.block.num === 2 && st.block.history.length === 1 && st.block.history[0].num === 1 && st.block.startTs === NOW - 90 * DAY, '12d Undo reopens block 2 at its own start; block 1\'s scorecard is untouched');
eq(st.coach.proposals.filter(p => p.kind === 'stall').length, 0, '12d ...and the stall card that session raised is gone');
eq(st.block.rotation, 6, '12d the rotation reads 6 of 6 again (17 slots)');
ok(await page.locator('#blk-card').count() === 0, '12d no scorecard on Today');

/* 12e. A block whose every session was only marked has nothing logged to judge: the card says so, not "every muscle is inside its band". */
await put(state(mini(17).map(x => Object.assign(x, { unlogged: true, exercises: [] }))));
await page.locator('.offbook').tap(); await page.waitForTimeout(300);
const t12 = await page.locator('#blk-card').innerText();
has(t12, 'No logged sessions to judge balance.', '12e logged 0: "No logged sessions to judge balance."');
ok(!/inside its weekly band/.test(t12), '12e ...and not the all-clear');

/* 12f. The caption under the lift list says what the code does, read from the constants. */
const caps = await ev(() => ({ j: BLK_JUDGE_N, f: BLK_FLAT_N, v: BLK_FLAT_N_VARIANT, s: BLK_STALL_N_VARIANT }));
eq(caps.j + ',' + caps.f + ',' + caps.v + ',' + caps.s, '2,4,2,6', '12f the thresholds are 2 / 4 / 2 / 6');
await put(blockState());
await closeBlockByTapping();
has(await page.locator('#blk-card').innerText().then(x => x.replace(/\s+/g, ' ')),
  'A lift is judged on ' + caps.j + '+ sessions in the block, and called flat on ' + caps.f + '+ (' + caps.v + '+ for lifts in only some week variants).', '12f the caption quotes the constants');
/* ...and the code uses them: 3 exposures of a lift is not enough to be called flat, 4 is */
for (const [keep, flatIn] of [[3, false], [4, true]]) {
  await put(blockState({ rowKeep: keep }));
  await closeBlockByTapping();
  const c = (await getState(page)).block.history[0];
  ok(c.lifts.find(l => l.name === 'Cable Row').n === keep && c.flat.includes('Cable Row') === flatIn, '12f Cable Row with ' + keep + ' exposures, flat at 100x10: ' + (flatIn ? 'called flat' : 'judged but not called flat'));
}

/* ======================================================================== */
ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t52 today, blocks, pump day, off-book');
await browser.close();
