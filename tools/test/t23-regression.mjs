/* Regression cover for the paths items 2/3/5/6 rerouted: every plan exercise
   is now built by one constructor, so templates, the plan picker and the
   in-session picker all changed shape underneath. */
import { launch, boot, getState, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

function base(routines, sessions, over) {
  return { version:4, settings:Object.assign({}, SET, over||{}), routines, sessions, active:null };
}
/* n sessions of `name`, all identical, most recent first. */
function history(name, w, r, nsets, count, exOver) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const ts = Date.now() - (i + 1) * 3 * 86400000;
    const sets = [];
    for (let k = 0; k < nsets; k++) sets.push({ w:String(w), r:String(r), done:true, load:Number(w) });
    out.push({ id:'s'+i, ts, endTs:ts, routineId:'r1', key:'A', name:'Day A',
      exercises:[ Object.assign({ id:'e'+i, planId:'p1', name, sets }, exOver||{}) ] });
  }
  return out;
}

const { browser, page, errors } = await launch();

/* ---- templates still build ordinary, fully-populated routines ---- */
await boot(page, base([{ id:'r1', key:'A', name:'Day A', exercises:[] }], []));
await page.click('[data-tab="plan"]');
await page.click('[data-act="tpl"]');
await page.click('[data-tpl="ppl"]');
const conf = await page.$('[data-x="ok"]');
if (conf) await conf.click();
await page.waitForTimeout(250);
let st = await getState(page);
eq(st.routines.length, 3, 'PPL still builds 3 days');
const all = st.routines.flatMap(r => r.exercises);
eq(all.length, 15, 'and 15 exercises');
eq(all.filter(e => !e.mg).length, 0, 'every one arrives muscle-tagged');
ok(all.some(e => e.bar === 45), 'barbell lifts still get a bar');
eq(all.filter(e => !(e.repTop > e.reps)).length, 0, 'and every one arrives with a rep range');
const plank = all.find(e => /plank/i.test(e.name));
if (plank) {
  eq(plank.metric, 1, 'a template plank is still a timed exercise');
  eq(plank.reps + '-' + plank.repTop, '30-60', 'and no longer asks for 8-12 seconds');
}

/* ---- the four progression verdicts ---- */
async function verdict(planEx, sessions) {
  await boot(page, base([{ id:'r1', key:'A', name:'Day A', exercises:[planEx] }], sessions));
  await page.click('[data-act="start"][data-id="r1"]');
  await page.waitForSelector('.card.ex');
  return {
    why: (await page.textContent('.card.ex .why')).replace(/\s+/g, ' ').trim(),
    w: await page.inputValue('.card.ex .set input[data-f="w"]'),
    r: await page.inputValue('.card.ex .set input[data-f="r"]')
  };
}

let v = await verdict({ id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12 },
                      history('Bench Press', 135, 12, 3, 1));
has(v.why, 'Hit 12s on every set', 'top of the range still adds weight');
eq(v.w, '140', 'and the load steps up');
eq(v.r, '8', 'and reps reset to the bottom');

v = await verdict({ id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12 },
                  history('Bench Press', 135, 9, 3, 1));
has(v.why, 'go for 10 this time', 'inside the range still adds a rep');
eq(v.w, '135', 'and holds the weight');

v = await verdict({ id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12 },
                  history('Bench Press', 135, 6, 3, 1));
has(v.why, 'Fell short of 8', 'short of the bottom still runs it back');

v = await verdict({ id:'p1', name:'Bench Press', sets:3, reps:8, repTop:0 },
                  history('Bench Press', 135, 8, 3, 1));
has(v.why, 'Hit all 8s — add 5 lb', 'straight sets still add weight at the target');

/* assisted work progresses by removing assistance */
v = await verdict({ id:'p1', name:'Assisted Pull-up', sets:3, reps:8, repTop:12, bw:2 },
                  history('Assisted Pull-up', 40, 12, 3, 1, { bw:2 }));
has(v.why, 'take 5 lb off the assist', 'assisted work still progresses downward');
eq(v.w, '35', 'and the number falls rather than rises');

/* an unloaded plank climbs seconds, not weight */
v = await verdict({ id:'p1', name:'Plank', sets:3, reps:30, repTop:60, metric:1 },
                  history('Plank', 0, 60, 3, 1, { metric:1 }));
has(v.why, 'Held 60s on every set', 'an unloaded hold still progresses by time');
eq(v.r, '65', 'and gains 5 seconds');

/* ---- warm-ups stay invisible to the engine ---- */
const warmHist = history('Bench Press', 135, 8, 3, 1);
warmHist[0].exercises[0].sets.unshift({ w:'405', r:'1', done:true, warm:true, load:405 });
v = await verdict({ id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12 }, warmHist);
has(v.why, 'go for 9 this time', 'a 405 lb warm-up still counts for nothing');

/* ---- the set-logging path must not re-render (trap 1) ---- */
await boot(page, base([{ id:'r1', key:'A', name:'Day A',
  exercises:[{ id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12, bar:45 }] }],
  history('Bench Press', 135, 9, 3, 1)));
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
await page.evaluate(() => {
  const i = document.querySelector('.card.ex .set input[data-f="w"]');
  i.focus(); window.__probe = i;
});
await page.click('.card.ex .set >> nth=0 >> .tick');
await page.waitForTimeout(120);
/* Focus lands on the tick, because that is what tapping a button does — the
   thing that must not happen is the input being *replaced*, which is what tore
   the soft keyboard out mid-gesture and desynced Android's touch targets. */
const kept = await page.evaluate(() => {
  const i = document.querySelector('.card.ex .set input[data-f="w"]');
  return { same: i === window.__probe, live: document.activeElement !== document.body,
           logged: document.querySelector('.card.ex .set').classList.contains('done') };
});
ok(kept.logged, 'the set logged');
ok(kept.same, 'the weight input kept DOM identity across a toggle');
ok(kept.live, 'and focus stayed inside the card rather than falling to <body>');

/* the same, through the +/- stepper */
await page.evaluate(() => {
  const i = document.querySelector('.card.ex .set input[data-f="w"]');
  i.focus(); window.__probe2 = i;
});
await page.click('.card.ex .set >> nth=0 >> [data-act="step"][data-f="w"][data-d="1"]');
await page.waitForTimeout(120);
ok(await page.evaluate(() => document.querySelector('.card.ex .set input[data-f="w"]') === window.__probe2),
  'and across a ± stepper tap');

/* The control. "+ Set" is a structural change and is allowed to re-render, so
   it proves the check above is testing something rather than passing by
   construction — and pins the boundary the rule actually draws. */
await page.evaluate(() => {
  const i = document.querySelector('.card.ex .set input[data-f="w"]');
  i.focus(); window.__probe3 = i;
});
await page.click('.card.ex [data-act="add-set"]');
await page.waitForTimeout(120);
const wiped = await page.evaluate(() => ({
  same: document.querySelector('.card.ex .set input[data-f="w"]') === window.__probe3,
  live: document.activeElement !== document.body
}));
ok(!wiped.same && !wiped.live, 'control: a structural re-render does replace the node and drop focus');

/* ---- plate line still resolves ---- */
has(await page.textContent('.card.ex .set >> nth=0 >> .plates'), '45',
  'the plate line still renders under a barbell set');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t23 regression');
await browser.close();
