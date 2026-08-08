/* trend() used to read the phase of the double-progression sawtooth rather
   than the trend, and reported "down" on a flawless run — which is what makes
   prescribe() cut 10% off the bar. */
import { launch, boot, getState, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

/* A textbook double-progression run: climb reps to the top, add load, reset.
   `n` sessions, oldest first, then handed to the app newest-first. */
function flawless(name, low, top, startW, step, n, opts) {
  opts = opts || {};
  const out = []; let w = startW, r = low;
  for (let i = 0; i < n; i++) {
    const ts = Date.now() - (n - i) * 3 * 86400000;
    const sets = [];
    for (let k = 0; k < 3; k++) sets.push({ w:String(w), r:String(r), done:true, load:w });
    out.push({ id:'s'+i, ts, endTs:ts, routineId:'r1', key:'A', name:'Day A', variantId:'v1',
      exercises:[ { id:'e'+i, planId:'p1', name, reps:low, repTop:top, sets } ] });
    if (r >= top) { w += step; r = low; } else r += 1;
  }
  return out.reverse();                       // S.sessions is newest-first
}

function state(name, low, top, w, step, n) {
  return {
    version:5, settings:Object.assign({}, SET),
    routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[
      { id:'p1', name, sets:3, reps:low, repTop:top, mg:'chest' } ] } ] } ],
    sessions: flawless(name, low, top, w, step, n),
    active: null
  };
}

const { browser, page, errors } = await launch();

/* Read the verdict the way the user meets it: the chip on the session card. */
async function verdict(st) {
  await boot(page, st);
  await page.click('[data-act="start"][data-id="r1"]');
  await page.waitForSelector('.card.ex');
  const meta = await page.textContent('.card.ex .ex-meta');
  const why = await page.textContent('.card.ex .why');
  const w = await page.inputValue('.card.ex .set input[data-f="w"]');
  await page.click('[data-act="discard"]');
  await page.click('[data-x="ok"]');
  return { meta, why: why.replace(/\s+/g, ' ').trim(), w };
}

/* ---- the cases that used to read "down" on a perfect run ---- */
const cases = [
  { name:'Bench Press',   low:8,  top:12, w:185, step:5, n:14, want:185 + 5*2 },
  { name:'Back Squat',    low:8,  top:12, w:225, step:5, n:14, want:225 + 5*2 },
  { name:'Overhead Press',low:6,  top:10, w:185, step:5, n:14, want:185 + 5*2 },
  { name:'Barbell Row',   low:8,  top:15, w:135, step:5, n:17, want:135 + 5*2 },
];
for (const c of cases) {
  const v = await verdict(state(c.name, c.low, c.top, c.w, c.step, c.n));
  const label = c.name + ' ' + c.low + '-' + c.top + ' @' + c.w;
  ok(!v.meta.includes('SLIPPING'), label + ': not flagged as slipping on a flawless run  [' + v.meta.trim() + ']');
  ok(!/Sliding 3 sessions/.test(v.why), label + ': the engine does not back off  [' + v.why + ']');
  ok(!/back off|drop a set/.test(v.why), label + ': and does not cut a set  [' + v.why + ']');
  /* CLIMBING or FLAT are both honest. An 8-15 range gains 5 lb every eight
     sessions, which really is under the +1.5%-per-3-sessions bar for "up" —
     the chip is a rate now, so a wide range genuinely reads slower. What must
     never happen is SLIPPING, which is what cuts the weight. */
  ok(/CLIMBING|FLAT/.test(v.meta), label + ': reads as climbing or flat  [' + v.meta.trim() + ']');
}

/* ---- it must still say "down" when the lift really is going backwards ---- */
function declining(name, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ts = Date.now() - (n - i) * 3 * 86400000;
    const w = 225 - i * 5;                     // losing 5 lb every session
    const sets = [];
    for (let k = 0; k < 3; k++) sets.push({ w:String(w), r:'8', done:true, load:w });
    out.push({ id:'d'+i, ts, endTs:ts, routineId:'r1', key:'A', name:'Day A', variantId:'v1',
      exercises:[ { id:'x'+i, planId:'p1', name, reps:8, repTop:12, sets } ] });
  }
  return out.reverse();
}
let st = state('Back Squat', 8, 12, 225, 5, 10);
st.sessions = declining('Back Squat', 10);
let v = await verdict(st);
has(v.meta, 'SLIPPING', 'a real decline is still caught');
/* The load itself has fallen every session, so prescribe()'s guard correctly
   says the back-off has already happened and holds instead of cutting again —
   that guard exists so the app can't chase its own tail down. Either verdict
   is right; adding weight would not be. */
ok(/Already backed off|Sliding 3 sessions/.test(v.why), 'and the engine responds to it  [' + v.why + ']');
eq(v.w, '180', 'holding at the current load rather than adding to a falling lift');

/* ---- a genuine stall reads flat, not down ---- */
function stalled(name, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ts = Date.now() - (n - i) * 3 * 86400000;
    const sets = [];
    for (let k = 0; k < 3; k++) sets.push({ w:'225', r:'8', done:true, load:225 });
    out.push({ id:'f'+i, ts, endTs:ts, routineId:'r1', key:'A', name:'Day A', variantId:'v1',
      exercises:[ { id:'y'+i, planId:'p1', name, reps:8, repTop:12, sets } ] });
  }
  return out.reverse();
}
st = state('Back Squat', 8, 12, 225, 5, 10);
st.sessions = stalled('Back Squat', 10);
v = await verdict(st);
has(v.meta, 'FLAT', 'a true stall reads flat');
ok(!v.meta.includes('SLIPPING'), 'and is not mistaken for a decline');

/* ---- straight sets have no cycle, and must be unaffected ---- */
function straight(name, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ts = Date.now() - (n - i) * 3 * 86400000;
    const w = 135 + i * 5;
    const sets = [];
    for (let k = 0; k < 3; k++) sets.push({ w:String(w), r:'8', done:true, load:w });
    out.push({ id:'g'+i, ts, endTs:ts, routineId:'r1', key:'A', name:'Day A', variantId:'v1',
      exercises:[ { id:'z'+i, planId:'p1', name, reps:8, repTop:0, sets } ] });
  }
  return out.reverse();
}
st = state('Bench Press', 8, 0, 135, 5, 8);
st.routines[0].variants[0].exercises[0].repTop = 0;
st.sessions = straight('Bench Press', 8);
v = await verdict(st);
has(v.meta, 'CLIMBING', 'straight sets adding 5 lb a session read as climbing');

/* ---- the app still refuses to guess before 4 sessions ---- */
st = state('Bench Press', 8, 12, 185, 5, 3);
v = await verdict(st);
ok(!/CLIMBING|FLAT|SLIPPING/.test(v.meta), 'under 4 sessions it stays quiet  [' + v.meta.trim() + ']');

/* ---- deloadCheck must not fire on a plan that is progressing perfectly ----
   Checked at EVERY phase of the rep cycle, because the whole failure mode is
   that the answer used to depend on where in the cycle you happened to be. */
for (let n = 10; n <= 20; n++) {
  const plan = { version:5, settings:Object.assign({}, SET),
    routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[
      { id:'p1', name:'Bench Press',    sets:3, reps:8, repTop:12, mg:'chest' },
      { id:'p2', name:'Back Squat',     sets:3, reps:8, repTop:12, mg:'quads' },
      { id:'p3', name:'Overhead Press', sets:3, reps:6, repTop:10, mg:'delts' } ] } ] } ],
    sessions: [], active:null };
  const a = flawless('Bench Press', 8, 12, 185, 5, n);
  const b = flawless('Back Squat', 8, 12, 225, 5, n);
  const c = flawless('Overhead Press', 6, 10, 115, 5, n);
  plan.sessions = a.map((s, i) => Object.assign({}, s, { id:'m'+i,
    exercises: [ s.exercises[0], b[i].exercises[0], c[i].exercises[0] ] }));
  await boot(page, plan);
  const body = await page.textContent('#view');
  ok(!body.includes('Deload worth considering'),
    'a flawless 3-lift plan is not told to deload at ' + n + ' sessions');
}

/* ...and it must still fire when the whole plan has genuinely stopped. */
const stuck = { version:5, settings:Object.assign({}, SET),
  routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[
    { id:'p1', name:'Bench Press',    sets:3, reps:8, repTop:12, mg:'chest' },
    { id:'p2', name:'Back Squat',     sets:3, reps:8, repTop:12, mg:'quads' },
    { id:'p3', name:'Overhead Press', sets:3, reps:8, repTop:12, mg:'delts' } ] } ] } ],
  sessions: [], active:null };
stuck.sessions = stalled('Bench Press', 12).map((s, i) => Object.assign({}, s, { id:'k'+i,
  exercises: [ s.exercises[0],
    { id:'kb'+i, planId:'p2', name:'Back Squat',     reps:8, repTop:12, sets:s.exercises[0].sets },
    { id:'kc'+i, planId:'p3', name:'Overhead Press', reps:8, repTop:12, sets:s.exercises[0].sets } ] }));
await boot(page, stuck);
has(await page.textContent('#view'), 'Deload worth considering',
  'a plan that has genuinely stopped moving still gets the nudge');

st = state('Bench Press', 8, 12, 185, 5, 14);
await boot(page, st);

/* ---- and the Progress chip agrees with the card ---- */
await page.click('[data-tab="progress"]');
await page.waitForSelector('.plift');
const chip = await page.textContent('.plift .chip');
ok(chip.trim().startsWith('+'), 'the Progress trend chip is positive too  [' + chip.trim() + ']');

/* ---- the lift sheet's banners must describe the maths that actually ran ----
   Both were left behind by the v16 rewrite: "three sessions below the three
   before" is the algorithm that was deleted, and "the app has already dropped
   your next prescription 10%" is often simply false — it may be a hold. */
st = state('Back Squat', 8, 12, 225, 5, 10);
st.sessions = declining('Back Squat', 10);
await boot(page, st);
await page.click('[data-tab="progress"]');
await page.waitForSelector('.plift');
await page.click('.plift >> nth=0');
await page.waitForSelector('.sheet .banner');
let banner = (await page.textContent('.sheet .banner')).replace(/\s+/g, ' ').trim();
ok(!/three sessions below the three before/i.test(banner),
  'the down banner no longer describes the deleted 3-vs-3 algorithm  [' + banner + ']');
ok(/per three sessions/.test(banner), 'it describes the slope it actually measured  [' + banner + ']');
ok(!/already dropped your next prescription 10%/i.test(banner),
  'and does not assert a 10% cut it may not be making');
/* On this seed the engine holds rather than cutting — the banner has to say
   whichever it is, by asking prescribe(). */
has(banner, 'Next time:', 'it states the next prescription rather than guessing it');
ok(/already backed off|back off to/i.test(banner),
  'and the next prescription it names is the one the card gives  [' + banner + ']');
await page.click('[data-x="close"]').catch(() => page.keyboard.press('Escape'));

/* A flat lift that already HAS a rep range must not be told to set one. */
st = state('Barbell Row', 8, 15, 135, 5, 12);
await boot(page, st);
await page.click('[data-tab="progress"]');
await page.waitForSelector('.plift');
await page.click('.plift >> nth=0');
await page.waitForSelector('.sheet');
banner = await page.textContent('.sheet .banner').catch(() => '');
if (/Holding flat/.test(banner)) {
  ok(!/Set a rep range/i.test(banner),
    'a flat lift that already has a range is not told to set one  [' + banner + ']');
  has(banner, 'can still be progress', 'it gives the honest wide-range note instead');
} else {
  ok(true, 'the 8-15 lift reads climbing here, so the flat banner does not apply');
  ok(true, '(skipped)');
}
await page.click('[data-x="close"]').catch(() => page.keyboard.press('Escape'));

/* ---- deloadCheck must not judge a range too wide to judge (REVIEW 1.5) ----
   At 8-20 a flawless run's long-window slope crosses zero, so `pct <= 0`
   cannot tell it from a stall. Measured worst-phase flawless slopes: cycle 8
   +0.15%, cycle 9 +0.02%, cycle 10 -0.05%; a stall is exactly 0.00.

   The seed is exact rather than illustrative: three heavy lifts on 8-20 at
   session 34 read -0.13, -0.21 and -0.27 while every rep is being hit, which
   is 3 of 3 "stalled" and a flat "Time to deload" on a perfect block. Change
   the loads or the session count and the phase moves off the crossing. */
const wide = { version:5, settings:Object.assign({}, SET),
  routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[
    { id:'p1', name:'Bench Press',    sets:3, reps:8, repTop:20, mg:'chest' },
    { id:'p2', name:'Back Squat',     sets:3, reps:8, repTop:20, mg:'quads' },
    { id:'p3', name:'Deadlift',       sets:3, reps:8, repTop:20, mg:'back' } ] } ] } ],
  sessions:[], active:null };
{
  const a = flawless('Bench Press', 8, 20, 315, 5, 34);
  const b = flawless('Back Squat', 8, 20, 365, 5, 34);
  const c = flawless('Deadlift', 8, 20, 405, 5, 34);
  wide.sessions = a.map((s, i) => Object.assign({}, s, { id:'w' + i,
    exercises:[ s.exercises[0], b[i].exercises[0], c[i].exercises[0] ] }));
}
await boot(page, wide);
let view = await page.textContent('#view');
ok(!view.includes('Deload worth considering'),
  'a flawless plan on 8-20 ranges is not told to deload');
await page.click('[data-tab="progress"]');
await page.waitForSelector('.plift');
view = await page.textContent('#view');
ok(!/Time to deload|Keep an eye on this/.test(view), 'and Progress does not nag either');
/* ...and it says so, rather than going quiet about a check that is running. */
has(view, 'Deload check: watching', 'the Progress tab says what the deload check is watching');
has(view, 'too wide to judge', 'and names the ranges it had to skip');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t26 trend');
await browser.close();
