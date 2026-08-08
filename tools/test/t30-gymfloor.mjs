/* Slice B — the things you meet on the gym floor rather than in the maths.
   A warm-up ramp built from loads you can actually put on the bar, the rest
   you actually took recorded as it happens, and how long this day usually
   takes said before you start it. */
import { launch, boot, getState, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

function hist(name, w, r, count, exOver) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const ts = Date.now() - (i + 1) * 3 * 86400000;
    out.push({ id:'s'+i, ts, endTs:ts + 3300000, routineId:'r1', key:'A', name:'Day A', variantId:'v1',
      exercises:[ Object.assign({ id:'e'+i, planId:'p1', name, reps:8, repTop:12,
        sets:[0,1,2].map(() => ({ w:String(w), r:String(r), done:true, load:w })) }, exOver || {}) ] });
  }
  return out;
}
function base(planEx, sessions) {
  return { version:5, settings:Object.assign({}, SET),
    routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[planEx] } ] } ],
    sessions:sessions || [], active:null };
}

const num = v => Number(v) || 0;

const { browser, page, errors } = await launch();

async function openMenu(st) {
  await boot(page, st);
  await page.click('[data-act="start"][data-id="r1"]');
  await page.waitForSelector('.card.ex');
  await page.click('.card.ex [data-act="ex-menu"]');
  await page.waitForSelector('.sheet');
}

/* ---------- 7. the warm-up ramp ---------- */
/* 225 over a 45 lb bar. 60% is 135, 80% is 180 — both exactly loadable with
   the seeded inventory, so the ramp should read 45, 135, 180 and never a
   number you cannot build. */
await openMenu(base({ id:'p1', name:'Back Squat', sets:3, reps:8, repTop:12, bar:45 },
  hist('Back Squat', 225, 12, 2, { bar:45 })));
let hint = await page.textContent('[data-x="ramp"]').catch(() => '');
ok(!!hint, 'a loaded barbell lift offers a ramp');
has(hint, '45×5', 'it starts with the empty bar');
has(hint, '135×5', 'then 60% of the working weight');
has(hint, '180×3', 'then 80%');
await page.click('[data-x="ramp"]');
await page.waitForTimeout(200);
let st = await getState(page);
let sets = st.active.exercises[0].sets;
eq(sets.filter(s => s.warm).length, 3, 'three warm-up sets are inserted');
eq(sets.filter(s => s.warm).map(s => s.w).join(','), '45,135,180', 'ascending, and in that order');
eq(sets.filter(s => !s.warm).length, 3, 'the working sets are untouched');
eq(sets[3].w, '230', 'and still carry the prescription');
/* Trap 1's boundary: this is a structural change, so re-rendering is allowed —
   what matters is that the ramp is actually on screen afterwards. */
eq((await page.$$('.card.ex .set')).length, 6, 'all six rows render');

/* Undo, because it replaces sets you may have carried forward. */
await page.click('.toast.act button');
await page.waitForTimeout(200);
st = await getState(page);
eq(st.active.exercises[0].sets.filter(s => s.warm).length, 0, 'undo takes the ramp back off');

/* It replaces carried-forward warm-ups rather than stacking on them. */
const carried = hist('Back Squat', 225, 12, 2, { bar:45 });
carried[0].exercises[0].sets.unshift({ w:'95', r:'5', warm:true, done:true, load:95 });
await openMenu(base({ id:'p1', name:'Back Squat', sets:3, reps:8, repTop:12, bar:45 }, carried));
await page.click('[data-x="ramp"]');
await page.waitForTimeout(200);
st = await getState(page);
sets = st.active.exercises[0].sets;
eq(sets.filter(s => s.warm).map(s => s.w).join(','), '45,135,180',
  'a carried-forward warm-up is replaced, not stacked on');

/* An inexact target snaps to what the plates can actually build. 60% of 185
   is 111, which this inventory cannot make — 110 can be. */
await openMenu(base({ id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12, bar:45 },
  hist('Bench Press', 185, 9, 2, { bar:45 })));
await page.click('[data-x="ramp"]');
await page.waitForTimeout(200);
st = await getState(page);
const ws = st.active.exercises[0].sets.filter(s => s.warm).map(s => Number(s.w));
ok(ws.every(w => w === 45 || (w - 45) % 5 === 0), 'every ramp load is buildable  [' + ws.join(',') + ']');
ok(ws.every(w => w < 185), 'and every one is lighter than the working weight  [' + ws.join(',') + ']');

/* No bar: rounds to the weight step instead of inventing plate maths. */
await openMenu(base({ id:'p1', name:'DB Row', sets:3, reps:8, repTop:12 },
  hist('DB Row', 60, 9, 2)));
await page.click('[data-x="ramp"]');
await page.waitForTimeout(200);
st = await getState(page);
const dw = st.active.exercises[0].sets.filter(s => s.warm).map(s => Number(s.w));
ok(dw.length > 0 && dw.every(w => w % 5 === 0 && w < 60),
  'a dumbbell lift ramps on the weight step, with no bar set  [' + dw.join(',') + ']');

/* Bodyweight and assisted work has nothing to ramp, like the plate line. */
await openMenu(base({ id:'p1', name:'Pull-up', sets:3, reps:8, repTop:12, bw:1 },
  hist('Pull-up', 0, 9, 2, { bw:1 })));
ok(!(await page.$('[data-x="ramp"]')), 'a bodyweight lift is not offered a ramp');

/* A warm-up set is invisible to the engine, so a ramp must not move the
   prescription. Trap: warm sets carry forward, so this is the regression that
   matters most. */
await openMenu(base({ id:'p1', name:'Back Squat', sets:3, reps:8, repTop:12, bar:45 },
  hist('Back Squat', 225, 12, 2, { bar:45 })));
await page.click('[data-x="ramp"]');
await page.waitForTimeout(200);
const firstWork = await page.$$eval('.card.ex .set', rows =>
  rows.filter(r => !r.classList.contains('warm')).map(r => r.querySelector('input[data-f="w"]').value));
eq(firstWork[0], '230', 'the working prescription is unchanged by the ramp');

/* Trap 12/16 again: the ramp row carries a load list, which is the kind of
   text that grows. Measure the menu with it present, at the narrow width. */
for (const width of [320, 390]) {
  await page.setViewportSize({ width, height:844 });
  await openMenu(base({ id:'p1', name:'Back Squat', sets:3, reps:8, repTop:12, bar:45 },
    hist('Back Squat', 225, 12, 2, { bar:45 })));
  const m = await page.evaluate(() => {
    const s = document.querySelector('.sheet');
    return { over:s.scrollWidth - s.clientWidth,
             nested:!!s.querySelector('.field-row .field-row'),
             ramp:!!s.querySelector('[data-x="ramp"]') };
  });
  ok(m.ramp, 'the ramp row is present at ' + width + 'px');
  ok(m.over <= 0, 'and the menu does not scroll sideways at ' + width + 'px  [' + m.over + ']');
  ok(!m.nested, 'and has no nested .field-row at ' + width + 'px');
}
await page.setViewportSize({ width:390, height:844 });

/* ---------- 8. the rest actually taken ---------- */
await boot(page, base({ id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12 },
  hist('Bench Press', 135, 9, 2)));
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
let rows = await page.$$('.card.ex .set');
await rows[0].$eval('.tick', el => el.click());
await page.waitForTimeout(1200);
await rows[1].$eval('.tick', el => el.click());
await page.waitForTimeout(150);
st = await getState(page);
sets = st.active.exercises[0].sets;
eq(sets[0].rest, undefined, 'the first set of an exercise has no rest before it');
ok(num(sets[1].rest) >= 1, 'the second set records the gap it actually took  [' + sets[1].rest + ']');
ok(num(sets[1].rest) < 60, 'and it is seconds, not milliseconds  [' + sets[1].rest + ']');
/* Un-ticking and re-ticking re-measures rather than keeping a stale gap. */
await rows[1].$eval('.tick', el => el.click());
await page.waitForTimeout(150);
st = await getState(page);
eq(st.active.exercises[0].sets[1].done, false, 'un-ticking clears the set');

/* ---------- 9. how long this day usually takes ---------- */
/* Under three sessions it says nothing rather than extrapolating from one. */
await boot(page, base({ id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12 },
  hist('Bench Press', 135, 9, 2)));
let card = await page.textContent('#view');
ok(!/usually/.test(card), 'with two sessions it stays quiet');

await boot(page, base({ id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12 },
  hist('Bench Press', 135, 9, 5)));
card = await page.textContent('#view');
has(card, 'usually 55m', 'with five it says how long the day usually takes');

/* A session left running for hours is a forgotten finish, not a long workout,
   and must not become "usually". */
const odd = hist('Bench Press', 135, 9, 5);
odd[0].endTs = odd[0].ts + 9 * 3600000;
odd[1].endTs = odd[1].ts + 30000;
await boot(page, base({ id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12 }, odd));
card = await page.textContent('#view');
has(card, 'usually 55m', 'a forgotten finish and a mis-tap are both left out');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t30 gym floor');
await browser.close();
