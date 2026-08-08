/* Items 2, 3, 5 and 6, driven through the real UI.
   2 — a plan carried forward from before rep ranges existed runs straight sets,
       nothing says so, and the switch does not fix it retroactively.
   3 — rep ranges suit the movement.
   5 — keeping an extra from the finish screen must not drop its settings.
   6 — the session editor's "Add exercise" must not ignore every default. */
import { launch, boot, getState, planExercises, planWeek, ok, eq, has, report } from './harness.mjs';

const SETTINGS = { unit:'lb', rest:120, autoRest:true, buzz:true, inc:5, sound:false,
  notify:false, rpe:false, keepTone:false, autoBackup:false, shareMode:'',
  doubleDefault:true, repLow:8, repHigh:12, rangeFixHidden:false, bodyweight:180,
  deloadUntil:0, deloadSnooze:0, bar:45,
  plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

/* Nick's shape: a v1 plan carried forward. reps only, no repTop anywhere. */
function legacyState(over) {
  return Object.assign({
    version: 4,
    settings: Object.assign({}, SETTINGS, (over && over.settings) || {}),
    routines: [
      { id:'r1', key:'A', name:'Day A', exercises:[
        { id:'p1', name:'Bench Press', sets:3, reps:8 },
        { id:'p2', name:'Barbell Row', sets:3, reps:8 },
        { id:'p3', name:'Cable Curl',  sets:3, reps:10 } ] },
      { id:'r2', key:'B', name:'Day B', exercises:[
        { id:'p4', name:'Back Squat', sets:3, reps:8 } ] }
    ],
    sessions: [
      { id:'s1', ts: Date.now() - 7*86400000, endTs:0, routineId:'r1', key:'A', name:'Day A',
        exercises:[ { id:'e1', planId:'p1', name:'Bench Press', reps:8, sets:[
          {w:'135',r:'8',done:true,load:135},{w:'135',r:'8',done:true,load:135},{w:'135',r:'8',done:true,load:135} ] } ] }
    ],
    active: null
  }, (over && over.top) || {});
}

const { browser, page, errors } = await launch();

/* ---------------------------------------------------------------- item 2 */
await boot(page, legacyState());
await page.click('[data-tab="plan"]');
await page.waitForSelector('.pex');

const rows = await page.$$eval('.pex .pxs', els => els.map(e => e.textContent));
has(rows[0], 'Chest · 3×8', 'the plan row carries the muscle guess and the prescription');

/* The plan row is a width budget: the meta is rigid so the sets×reps can never
   be the thing that truncates, which only works while the meta stays short.
   Adding to it silently starves the exercise name — that already happened
   once. Both halves must survive at 320px. */
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 844 });
  const row = await page.evaluate(() => {
    const n = document.querySelector('.pex .pxn'), s = document.querySelector('.pex .pxs');
    const pex = document.querySelector('.pex');
    return { name: n.clientWidth, metaCut: s.scrollWidth - s.clientWidth,
             over: pex.scrollWidth - pex.clientWidth };
  });
  ok(row.over <= 0, 'the plan row does not overflow at ' + w + 'px  [' + row.over + ']');
  ok(row.metaCut <= 0, 'and the sets×reps is never the half that truncates at ' + w + 'px  [' + row.metaCut + ']');
  ok(row.name >= 40, 'and the exercise name keeps a readable floor at ' + w + 'px  [' + row.name + 'px]');
}
await page.setViewportSize({ width: 390, height: 844 });

const banner = await page.textContent('.banner.warn');
has(banner, '4 exercises still on straight sets', 'Plan warns how many exercises never got a range');
has(banner, 'Bench Press', 'the warning names the exercises');
has(banner, 'only ever applied to new exercises', 'the warning explains why the switch did not fix it');

/* the sheet must not overflow at the narrow end — trap 12 */
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 844 });
  const over = await page.evaluate(() => document.querySelector('#view').scrollWidth - document.querySelector('#view').clientWidth);
  ok(over <= 0, 'Plan does not scroll sideways at ' + w + 'px  [overflow ' + over + ']');
}
await page.setViewportSize({ width: 390, height: 844 });

/* the repair */
await page.click('[data-act="fix-ranges"]');
await page.waitForSelector('.toast.act');
let st = await getState(page);
const byName = n => planExercises(st).find(e => e.name === n);
eq(byName('Bench Press').repTop, 11, 'Bench Press 8 -> 8-11 (bench is a heavy lift, width 3)');
eq(byName('Bench Press').reps, 8, 'the bottom of the range is left exactly where it was');
eq(byName('Back Squat').repTop, 11, 'Back Squat 8 -> 8-11 (heavy width 3)');
eq(byName('Cable Curl').repTop, 14, 'Cable Curl 10 -> 10-14 (isolation width 4)');
ok(!(await page.$('.banner.warn')), 'the warning is gone once the plan is repaired');

/* undo */
await page.click('.toast.act button');
st = await getState(page);
eq(planWeek(st)[0].repTop, undefined, 'undo puts every range back');
ok(!!(await page.$('.banner.warn')), 'and the warning comes back with them');

/* re-apply, then check the engine actually changed its mind */
await page.click('[data-act="fix-ranges"]');
await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
const meta = (await page.textContent('.card.ex .ex-meta')).trim();
const why = (await page.textContent('.card.ex .why')).trim();
has(meta, '3 × 8–11 range', 'the card now shows a range');
has(why, 'go for 9 this time', 'FIXED: after 3x8 the engine asks for a rep, not more weight');
eq(await page.inputValue('.card.ex .set input[data-f="w"]'), '135', 'and the prefill holds the weight');

/* ---------------------------------------------------- the switch is honest */
await boot(page, legacyState({ settings: { doubleDefault: false } }));
await page.click('[data-tab="plan"]');
ok(!(await page.$('.banner.warn')), 'no warning while double progression is off');
await page.click('[data-set="doubleDefault"]');
await page.waitForSelector('.banner.warn');
has(await page.textContent('.banner.warn'), 'still on straight sets',
  'turning the switch ON offers to fix the plan you already have');

/* ------------------------------------------------------- item 3, defaults */
await boot(page, legacyState({ top: { routines: [{ id:'r1', key:'A', name:'Day A', exercises: [] }], sessions: [] } }));
await page.click('[data-tab="plan"]');
has(await page.textContent('.card .fh >> nth=1'), 'Heavy lifts start at 5–8',
  'the settings row spells out the tiers it derives');

async function addPlan(name) {
  await page.click('[data-act="pex-add"]');
  await page.fill('#exq', name);
  await page.click('[data-new]');
  await page.waitForSelector('.pex');
}
for (const n of ['Deadlift', 'Lateral Raise', 'Dumbbell Bench Press', 'Leg Press', 'Plank']) await addPlan(n);
await page.waitForTimeout(250);        // save() is debounced 120ms
st = await getState(page);
const plan = planWeek(st);
const range = n => { const e = plan.find(x => x.name === n); return e.reps + '-' + e.repTop; };
eq(range('Deadlift'), '5-8', 'a heavy barbell lift starts at 5-8');
eq(range('Lateral Raise'), '12-16', 'an isolation movement starts at 12-16');
eq(range('Dumbbell Bench Press'), '8-12', 'a dumbbell press drops out of the heavy tier');
eq(range('Leg Press'), '8-12', 'an unclassified compound keeps the global default');
eq(range('Plank'), '30-60', 'a timed hold is measured in seconds, not 8-12 of them');
eq(plan.find(x => x.name === 'Plank').metric, 1, 'and arrives as a timed exercise');
eq(plan.find(x => x.name === 'Deadlift').bar, 45, 'newPlanEx still guesses the bar');
eq(plan.find(x => x.name === 'Lateral Raise').mg, 'delts', 'and still tags the muscle');

/* --------------------------------------------------------------- item 5 */
await boot(page, legacyState());
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
await page.click('[data-act="add-ex"]');
await page.fill('#exq', 'Plank');
await page.click('[data-new]');
await page.waitForSelector('.card.ex >> nth=3');
/* log one set of the extra so it survives commit */
await page.click('.card.ex >> nth=3 >> .set >> nth=0 >> .tick');
await page.click('[data-act="finish"] >> nth=0');
await page.waitForSelector('[data-keep]');
await page.click('[data-keep="0"]');
await page.click('[data-x="save"]');
await page.waitForSelector('.card', { timeout: 5000 });
st = await getState(page);
const kept = planWeek(st).find(e => e.name === 'Plank');
ok(!!kept, 'the extra was kept in the plan');
eq(kept.metric, 1, 'FIXED: keeping from the finish screen carries the metric');
eq(kept.mg, 'core', 'FIXED: and the muscle tag');
eq(kept.repTop, 60, 'FIXED: and the rep/hold range');
eq(kept.bar, 0, 'and the bar setting');

/* --------------------------------------------------------------- item 6 */
await boot(page, legacyState());
await page.click('[data-tab="progress"]');
await page.click('[data-sess]');
await page.waitForSelector('[data-x="edit"], [data-act="edit"], .menu button');
const editBtn = await page.$('[data-x="edit"]');
if (editBtn) await editBtn.click();
await page.waitForSelector('[data-x="addex"]');
await page.click('[data-x="addex"]');
await page.fill('#exq', 'Cable Curl');
/* already in the plan, so the picker offers it rather than a "create" button */
await page.click('[data-name="Cable Curl"]');
await page.waitForSelector('[data-x="save"]');
await page.click('[data-x="save"]');
st = await getState(page);
const added = st.sessions[0].exercises.find(e => e.name === 'Cable Curl');
ok(!!added, 'the editor added the exercise');
if (added) {
  eq(added.reps, 12, 'FIXED: the editor honours the isolation default, not a hardcoded 8');
  eq(added.repTop, 16, 'FIXED: and gives it a range instead of repTop: 0');
  eq(added.mg, 'biceps', 'FIXED: and tags the muscle');
}

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t21 ranges');
await browser.close();
