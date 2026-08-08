/* The two exercise menus, after item 2 added a row and a button to both.
   Trap 12: HTML from template strings fails silently, so measure the rendered
   sheet rather than reading the markup. */
import { launch, boot, getState, planWeek, ok, eq, has, report } from './harness.mjs';

const state = {
  version: 4,
  settings: { unit:'lb', rest:120, autoRest:true, buzz:true, inc:5, sound:false, notify:false,
    rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
    repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
    bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 },
  routines: [ { id:'r1', key:'A', name:'Day A', exercises:[
    { id:'p1', name:'Bench Press', sets:3, reps:8 },                       // straight sets
    { id:'p2', name:'Cable Curl', sets:3, reps:10, repTop:14, mg:'biceps' } // has a range
  ] } ],
  sessions: [], active: null
};

const { browser, page, errors } = await launch();
await boot(page, state);

async function sheetOverflow() {
  return page.evaluate(() => {
    const s = document.querySelector('.sheet');
    return { w: s.scrollWidth - s.clientWidth, nested: !!s.querySelector('.field-row .field-row') };
  });
}

/* ---- the plan menu, on a straight-sets exercise ---- */
await page.click('[data-tab="plan"]');
await page.click('[data-act="pex-edit"][data-ei="0"]');
await page.waitForSelector('[data-x="userange"]');
let hint = await page.textContent('.sheet .field-row .fh >> nth=0');
has(hint, 'Straight sets', 'the plan menu says which progression the exercise is on');
has(hint, 'weight goes up as soon as you hit 8 reps', 'and says what that means in practice');
has(await page.textContent('[data-x="userange"]'), 'Climb reps to 11 first',
  'and offers the fix in one tap, at the movement-appropriate width');

for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 844 });
  const m = await sheetOverflow();
  ok(m.w <= 0, 'plan exercise menu does not scroll sideways at ' + w + 'px  [' + m.w + ']');
  ok(!m.nested, 'no .field-row nested inside another at ' + w + 'px');
}
await page.setViewportSize({ width: 390, height: 844 });

await page.click('[data-x="userange"]');
await page.waitForTimeout(200);
let st = await getState(page);
eq(planWeek(st)[0].repTop, 11, 'the one-tap fix writes the range');
hint = await page.textContent('.sheet .field-row .fh >> nth=0');
has(hint, 'Climbing reps from 8 to 11', 'and the hint flips to describe the new mode');
ok(!(await page.$('[data-x="userange"]')), 'the button is gone once there is a range');

/* ---- the plan menu on an exercise that already has one ---- */
await page.click('[data-x="done"]');
await page.click('[data-act="pex-edit"][data-ei="1"]');
await page.waitForSelector('[data-x="low"]');
has(await page.textContent('.sheet .field-row .fh >> nth=0'), 'Climbing reps from 10 to 14',
  'an exercise with a range says so');
ok(!(await page.$('[data-x="userange"]')), 'and is not offered the fix');
await page.click('[data-x="done"]');

/* ---- the in-session menu ---- */
await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
await page.click('[data-act="ex-menu"][data-ei="1"]');
await page.waitForSelector('[data-x="low"]');
has(await page.textContent('.sheet .field-row .fh >> nth=0'), 'Climbing reps from 10 to 14',
  'the in-session menu names the mode too');
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 844 });
  const m = await sheetOverflow();
  ok(m.w <= 0, 'in-session exercise menu does not scroll sideways at ' + w + 'px  [' + m.w + ']');
  ok(!m.nested, 'no nested .field-row in the session menu at ' + w + 'px');
}
await page.setViewportSize({ width: 390, height: 844 });

/* the data-x collision trap: every handler must be bound to its own element */
const bound = await page.evaluate(() => {
  const el = document.querySelector('.sheet') || document.body.lastElementChild;
  const seen = {}, dupes = [];
  el.querySelectorAll('[data-x]').forEach(n => {
    const v = n.dataset.x;
    if (seen[v]) dupes.push(v); else seen[v] = true;
  });
  return dupes;
});
eq(bound.length, 0, 'no duplicated data-x inside the session sheet  [' + bound.join(',') + ']');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t22 menus');
await browser.close();
