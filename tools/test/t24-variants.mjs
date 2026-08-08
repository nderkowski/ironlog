/* Item 4 — A/B week variants inside a training day.
   The two rotations (which day, which week) are independent and both derived
   from history, so most of this suite is about proving they don't interfere. */
import { launch, boot, getState, planExercises, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

/* Deliberately the OLD shape — routines with .exercises and no .variants —
   because that is what every existing install and every existing backup is. */
const legacy = {
  version: 4, settings: Object.assign({}, SET),
  routines: [
    { id:'r1', key:'A', name:'Push', exercises:[ { id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12 } ] },
    { id:'r2', key:'B', name:'Pull', exercises:[ { id:'p2', name:'Barbell Row', sets:3, reps:8, repTop:12 } ] }
  ],
  sessions: [], active: null
};

const { browser, page, errors } = await launch();

/* ---------------------------------------------------------- migration */
await boot(page, legacy);
let st = await getState(page);
eq(st.version, 5, 'state migrates to v5 on load');
eq(st.routines[0].variants.length, 1, 'an old routine becomes a single-variant day');
eq(st.routines[0].variants[0].exercises[0].name, 'Bench Press', 'carrying its exercises across');
eq(st.routines[0].exercises, undefined, 'and the old field is removed, so the two cannot drift');
ok(!!st.routines[0].variants[0].id, 'the variant gets an id');

/* a single-variant day is the old app exactly */
await page.click('[data-tab="plan"]');
ok(!(await page.$('.vseg')), 'no week switcher on a day with one week');
has(await page.textContent('.pex .pxn'), 'Bench Press', 'the plan still lists its exercises');
await page.click('[data-tab="today"]');
has(await page.textContent('.hero'), 'Push', 'and Today still offers the day');
ok(!(await page.$('.hero .chip')), 'with no week chip to explain');

/* ------------------------------------------------------ adding a week */
await page.click('[data-tab="plan"]');
await page.click('[data-act="var-add"][data-ri="0"]');
await page.waitForSelector('[data-x="copy"]');
await page.click('[data-x="copy"]');
await page.waitForSelector('.vseg');
st = await getState(page);
eq(st.routines[0].variants.length, 2, 'the day now has two weeks');
eq(st.routines[0].variants[0].label, 'Week 1', 'the original gets named rather than staying blank');
eq(st.routines[0].variants[1].label, 'Week 2', 'and the new one is Week 2');
eq(st.routines[0].variants[1].exercises[0].name, 'Bench Press', 'the copy carries the exercises');
ok(st.routines[0].variants[1].exercises[0].id !== st.routines[0].variants[0].exercises[0].id,
  'with fresh ids, so editing one week does not edit the other');

/* undo */
await page.click('.toast.act button');
st = await getState(page);
eq(st.routines[0].variants.length, 1, 'undo removes the week again');
eq(st.routines[0].variants[0].label, '', 'and un-names the original');

/* redo it, empty this time */
await page.click('[data-act="var-add"][data-ri="0"]');
await page.click('[data-x="empty"]');
await page.waitForSelector('.vseg');
st = await getState(page);
eq(st.routines[0].variants[1].exercises.length, 0, 'an empty week starts empty');

/* --------------------------------------------- editing one week only */
/* the switcher lands on the new week; add a different exercise to it */
await page.click('[data-act="pex-add"][data-ri="0"][data-vi="1"]');
await page.fill('#exq', 'Incline Dumbbell Press');
await page.click('[data-new]');
await page.waitForTimeout(250);
st = await getState(page);
eq(st.routines[0].variants[1].exercises.length, 1, 'the exercise went into week 2');
eq(st.routines[0].variants[0].exercises.length, 1, 'and week 1 is untouched');
eq(st.routines[0].variants[0].exercises[0].name, 'Bench Press', 'week 1 still has its own selection');

/* the switcher swaps the list */
await page.click('.vseg button >> nth=0');
has(await page.textContent('.pex .pxn'), 'Bench Press', 'tapping Week 1 shows week 1');
await page.click('.vseg button >> nth=1');
has(await page.textContent('.pex .pxn'), 'Incline Dumbbell Press', 'tapping Week 2 shows week 2');

/* --------------------------------------------------- the two rotations */
await page.click('[data-tab="today"]');
has(await page.textContent('.hero'), 'Week 1', 'the first session of a two-week day is week 1');
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
has(await page.textContent('.card.ex .ex-name'), 'Bench Press', 'and it prescribes week 1');
await page.click('.card.ex .set >> nth=0 >> .tick');
await page.click('[data-act="finish"] >> nth=0');
await page.click('[data-x="save"]');
await page.waitForTimeout(250);
st = await getState(page);
eq(st.sessions[0].variantId, st.routines[0].variants[0].id, 'the session records which week it was');
eq(st.sessions[0].variantName, 'Week 1', 'and snapshots the label for history');

await page.click('[data-tab="today"]');
has(await page.textContent('.hero'), 'Pull', 'THE POINT: the day rotation moves on to B');
/* ...while Push has independently advanced to week 2 */
const picks = await page.$$eval('.daypick', els => els.map(e => e.textContent));
ok(picks.some(p => p.includes('Push') && p.includes('Week 2')),
  'THE POINT: and Push is independently now on Week 2  [' + picks.join(' | ') + ']');

/* train B, then come back to A and confirm it is still week 2 */
await page.click('[data-act="start"][data-id="r2"]');
await page.waitForSelector('.card.ex');
await page.click('.card.ex .set >> nth=0 >> .tick');
await page.click('[data-act="finish"] >> nth=0');
await page.click('[data-x="save"]');
await page.waitForTimeout(250);
await page.click('[data-tab="today"]');
has(await page.textContent('.hero'), 'Push', 'back round to Push');
has(await page.textContent('.hero'), 'Week 2', 'and it is week 2, not week 1 again');
has(await page.textContent('.hero .exlist'), 'Incline Dumbbell Press', 'showing week 2 exercises');

/* and week 1 comes back after week 2 */
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
await page.click('.card.ex .set >> nth=0 >> .tick');
await page.click('[data-act="finish"] >> nth=0');
await page.click('[data-x="save"]');
await page.waitForTimeout(250);
st = await getState(page);
eq(st.sessions[0].variantName, 'Week 2', 'that session was week 2');
await page.click('[data-tab="today"]');
const picks2 = await page.$$eval('.daypick', els => els.map(e => e.textContent));
ok(picks2.some(p => p.includes('Push') && p.includes('Week 1')),
  'and Push flips back to Week 1  [' + picks2.join(' | ') + ']');

/* Every day's every week is one tap away, not just each day's next one.
   Push is not the hero here (Pull is), and its *other* week still has to be
   reachable — listing only each day's next week would strand it. */
const allPicks = await page.$$eval('.daypick', els => els.map(e => e.textContent));
eq(allPicks.filter(p => p.includes('Push')).length, 2, 'both of Push\'s weeks are offered  [' + allPicks.join(' | ') + ']');
ok(!allPicks.some(p => p.includes('Pull')), 'and the hero day is not repeated in the picks');

/* picking a week explicitly overrides the rotation */
await page.click('.daypick >> text=/Push.*Week 1/');
await page.waitForSelector('.card.ex');
has(await page.textContent('.card.ex .ex-name'), 'Bench Press', 'a week can be picked by hand');
await page.click('[data-act="discard"]');
await page.click('[data-x="ok"]');

/* ------------------------------------ what spans variants, and what does not */
st = await getState(page);
const all = planExercises(st);
eq(all.length, 3, 'both weeks of both days are in the plan');

await page.click('[data-tab="plan"]');
has(await page.textContent('.card .tiny.muted'), '1 lift here runs only in this week',
  'the plan is honest that a one-week lift comes round fortnightly, and agrees in number');

/* a shared lift keeps one history: add Bench to week 2 as well, then check the
   engine reads both weeks' sessions as one line */
await page.click('.vseg button >> nth=1');
await page.click('[data-act="pex-add"][data-ri="0"][data-vi="1"]');
await page.fill('#exq', 'Bench Press');
await page.click('[data-name="Bench Press"]');
await page.waitForTimeout(250);
await page.click('[data-tab="today"]');
await page.click('.daypick >> text=/Push.*Week 2/');
await page.waitForSelector('.card.ex');
const names = await page.$$eval('.card.ex .ex-name', els => els.map(e => e.textContent.trim()));
ok(names.includes('Bench Press'), 'Bench Press appears in week 2 as well');
const shared = await page.textContent('.card.ex >> nth=1 >> .callout');
ok(!shared.includes('First time logging this one'),
  'and it carries the history it built in week 1 — one lift, one line  [' + shared.replace(/\s+/g,' ') + ']');
await page.click('[data-act="discard"]');
await page.click('[data-x="ok"]');

/* ---------------------------------------------- renaming and removing a week */
await page.click('[data-tab="plan"]');
await page.click('[data-act="day-menu"][data-ri="0"]');
await page.waitForSelector('[data-vx="1"]');
await page.click('[data-vx="1"]');
await page.waitForSelector('[data-x="label"]');
await page.fill('[data-x="label"]', 'Volume');
await page.click('[data-x="done"]');
await page.waitForTimeout(250);
st = await getState(page);
eq(st.routines[0].variants[1].label, 'Volume', 'a week can be renamed to anything');
has(await page.textContent('.vseg'), 'Volume', 'and the switcher shows it');

/* a past session keeps the label it was logged under */
eq(st.sessions.find(s => s.variantName === 'Week 2') !== undefined, true,
  'history keeps the label it was logged under, not the renamed one');

await page.click('[data-act="day-menu"][data-ri="0"]');
await page.click('[data-vx="1"]');
await page.click('[data-x="del"]');
await page.waitForSelector('[data-x="ok"]');
await page.click('[data-x="ok"]');
await page.waitForTimeout(250);
st = await getState(page);
eq(st.routines[0].variants.length, 1, 'a week can be removed');
eq(st.routines[0].variants[0].label, '', 'and the survivor goes back to being unnamed');
ok(!(await page.$('.vseg')), 'the switcher disappears with it');

/* Two sessions in history now point at a variant id that no longer exists.
   nextVariantIx has to fall back rather than throw or resolve to nothing. */
await page.click('[data-tab="today"]');
ok(await page.$('[data-act="start"]'), 'Today still works with sessions pointing at a deleted week');
has(await page.textContent('.hero'), 'Pull', 'the day rotation is unharmed (Push was last, so Pull is next)');
const orphan = await page.$$eval('.daypick', els => els.map(e => e.textContent));
eq(orphan.filter(p => p.includes('Push')).length, 1,
  'Push is back to a single week  [' + orphan.join(' | ') + ']');
await page.click('.daypick >> text=/Push/');
await page.waitForSelector('.card.ex');
has(await page.textContent('.card.ex .ex-name'), 'Bench Press',
  'and it starts the surviving week rather than an empty one');
await page.click('[data-act="discard"]');
await page.click('[data-x="ok"]');

/* ------------------------------------------------------ narrow viewport */
await page.click('[data-tab="plan"]');
await page.click('[data-act="var-add"][data-ri="0"]');
await page.click('[data-x="copy"]');
await page.waitForSelector('.vseg');
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 844 });
  const over = await page.evaluate(() => {
    const v = document.querySelector('#view');
    return v.scrollWidth - v.clientWidth;
  });
  ok(over <= 0, 'Plan with a week switcher does not scroll sideways at ' + w + 'px  [' + over + ']');
}

/* ------------------------------------------- what has to span both weeks */
const twoWeek = {
  version: 5, settings: Object.assign({}, SET, { rangeFixHidden: false }),
  routines: [ { id:'r1', key:'A', name:'Push', variants:[
    { id:'v1', label:'Week 1', exercises:[ { id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12, mg:'chest' } ] },
    { id:'v2', label:'Week 2', exercises:[ { id:'p2', name:'Overhead Press', sets:3, reps:8, mg:'delts' } ] }
  ] } ],
  sessions: [], active: null
};
await boot(page, twoWeek);
await page.click('[data-tab="plan"]');
/* straightSetLifts() must see week 2, or the repair judges half the plan */
has(await page.textContent('.banner.warn'), 'Overhead Press',
  'the straight-sets warning spans every week, not just the one on screen');
await page.click('[data-act="fix-ranges"]');
await page.waitForTimeout(250);
st = await getState(page);
eq(st.routines[0].variants[1].exercises[0].repTop, 11, 'and the repair reaches into week 2');

/* the exercise picker offers lifts from every week */
await page.click('[data-act="pex-add"][data-ri="0"][data-vi="0"]');
await page.fill('#exq', 'Overhead');
const known = await page.$('[data-name="Overhead Press"]');
ok(!!known, 'the picker knows about lifts that live in the other week');
await page.keyboard.press('Escape');

/* renaming follows a lift across weeks */
await boot(page, twoWeek);
await page.click('[data-tab="plan"]');
await page.click('.vseg button >> nth=1');
await page.click('[data-act="pex-edit"][data-ri="0"][data-vi="1"][data-ei="0"]');
await page.waitForSelector('[data-x="name"]');
await page.fill('[data-x="name"]', 'Seated Press');
await page.click('[data-x="done"]');
await page.waitForTimeout(250);
st = await getState(page);
eq(st.routines[0].variants[1].exercises[0].name, 'Seated Press', 'a rename in week 2 lands in week 2');

/* --------------------------------------------------- deload and the weeks */
/* prescribe() has nothing to say about a lift with no history, deload or not,
   so the deload branch needs a previous session to be reachable at all. */
const benchTs = Date.now() - 4 * 86400000;
await boot(page, Object.assign({}, twoWeek, {
  settings: Object.assign({}, SET, { deloadUntil: Date.now() + 3 * 86400000 }),
  sessions: [ { id:'sd', ts: benchTs, endTs: benchTs, routineId:'r1', key:'A', name:'Push',
    variantId:'v1', variantName:'Week 1',
    exercises:[ { id:'ed', planId:'p1', name:'Bench Press', reps:8, sets:[
      {w:'135',r:'8',done:true,load:135},{w:'135',r:'8',done:true,load:135} ] } ] } ] }));
await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="r1"][data-vi="1"]');
await page.waitForSelector('.card.ex');
await page.click('[data-act="discard"]');
await page.click('[data-x="ok"]');
await page.click('[data-act="start"][data-id="r1"][data-vi="0"]');
await page.waitForSelector('.card.ex');
has(await page.textContent('.card.ex .why'), 'Deload week', 'a deload week still prescribes light');
eq(await page.inputValue('.card.ex .set input[data-f="w"]'), '120', 'about 10% off, on the step grid');
await page.click('.card.ex .set >> nth=0 >> .tick');
await page.click('[data-act="finish"] >> nth=0');
await page.click('[data-x="save"]');
await page.waitForTimeout(250);
st = await getState(page);
eq(st.sessions[0].deload, true, 'the session is tagged as a deload');
eq(st.sessions[0].variantName, 'Week 1', 'and still records its week');
await page.click('[data-tab="today"]');
has(await page.textContent('.hero'), 'Week 2',
  'a deload session consumes its slot — the fortnight keeps ticking through it');

/* --------------------------------------------- export / import round trip */
await boot(page, twoWeek);
const exported = await page.evaluate(() => localStorage.getItem('ironlog.v1'));
await page.click('[data-tab="plan"]');
await page.click('[data-act="import"]');
await page.waitForSelector('[data-x="paste"]');
await page.fill('[data-x="paste"]', exported);
await page.click('[data-x="go"]');
await page.waitForTimeout(300);
st = await getState(page);
eq(st.routines[0].variants.length, 2, 'a v5 export round-trips with both weeks');
eq(st.routines[0].variants[1].label, 'Week 2', 'labels included');

/* an OLD backup file — the shape every existing auto-backup on the phone has */
const oldFile = JSON.stringify({
  version: 4, settings: SET,
  routines: [ { id:'r9', key:'A', name:'Legacy Day', exercises:[ { id:'q1', name:'Front Squat', sets:3, reps:5 } ] } ],
  sessions: []
});
/* importing lands you back on Today, so go and get the button again */
await page.click('[data-tab="plan"]');
await page.click('[data-act="import"]');
await page.waitForSelector('[data-x="paste"]');
await page.fill('[data-x="paste"]', oldFile);
await page.click('[data-x="go"]');
await page.waitForTimeout(300);
st = await getState(page);
eq(st.version, 5, 'a v4 backup file is migrated on import');
eq(st.routines[0].variants[0].exercises[0].name, 'Front Squat', 'with its exercises intact');
eq(st.routines[0].exercises, undefined, 'and no stale parallel list left behind');
await page.click('[data-tab="today"]');
ok(await page.$('[data-act="start"]'), 'and the app runs on it');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t24 variants');
await browser.close();
