/* Switching lb <-> kg. Previously the switch relabelled and nothing else, so a
   225 lb squat became a "225 kg" squat and the bar and plates were stranded in
   the old unit. Both readings of the switch are legitimate, so the app asks. */
import { launch, boot, getState, planExercises, openSettings, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2}], lastBackup:0 };

const ts = Date.now() - 5 * 86400000;
function state(over) {
  return {
    version:5, settings: Object.assign({}, SET, (over && over.settings) || {}),
    routines: [ { id:'r1', key:'A', name:'Push', variants:[ { id:'v1', label:'', exercises:[
      { id:'p1', name:'Back Squat', sets:3, reps:5, repTop:8, bar:45, inc:10, mg:'quads' },
      { id:'p2', name:'Pull-up', sets:3, reps:5, repTop:8, bw:1, mg:'back' } ] } ] } ],
    sessions: [ { id:'s1', ts, endTs:ts, routineId:'r1', key:'A', name:'Push',
      variantId:'v1', variantName:'', bw:180, exercises:[
        { id:'e1', planId:'p1', name:'Back Squat', reps:5, bar:45, sets:[
          {w:'225',r:'5',done:true,load:225}, {w:'225',r:'5',done:true,load:225} ] },
        { id:'e2', planId:'p2', name:'Pull-up', reps:5, bw:1, sets:[
          {w:'25',r:'5',done:true,load:205} ] } ] } ],
    active: null
  };
}

const { browser, page, errors } = await launch();

/* ------------------------------------------------- an empty app just switches */
await boot(page, { version:5, settings:Object.assign({}, SET),
  routines:[{ id:'r1', key:'A', name:'Day A', variants:[{ id:'v1', label:'', exercises:[] }] }],
  sessions:[], active:null });
await openSettings(page);
await page.selectOption('[data-set="unit"]', 'kg');
await page.waitForTimeout(250);
let st = await getState(page);
eq(st.settings.unit, 'kg', 'an empty log switches without being asked');
eq(st.settings.bar, 20, 'and picks up the kg bar');
eq(st.settings.plates[0].w, 25, 'and the kg plate set');
eq(st.settings.inc, 2.5, 'and a kg-sized weight step');

/* ---------------------------------------------- with data, it asks first */
await boot(page, state());
await openSettings(page);
await page.selectOption('[data-set="unit"]', 'kg');
await page.waitForSelector('.sheet');
const sheetText = await page.textContent('.sheet');
has(sheetText, 'Convert my log to kg', 'switching with history offers to convert');
has(sheetText, 'Just change the label', 'or to relabel');
has(sheetText, '225 lb', 'and shows what conversion does to a real number');
has(sheetText, '102.1 kg', 'with the actual arithmetic, not a vague warning');

/* trap 12: measure the rendered sheet, don't read the template string */
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 844 });
  const m = await page.evaluate(() => {
    const el = document.querySelector('.sheet');
    return { over: el.scrollWidth - el.clientWidth, nested: !!el.querySelector('.field-row .field-row') };
  });
  ok(m.over <= 0, 'the unit sheet does not scroll sideways at ' + w + 'px  [' + m.over + ']');
  ok(!m.nested, 'and has no nested .field-row at ' + w + 'px');
}
await page.setViewportSize({ width: 390, height: 844 });

/* cancel changes nothing */
await page.click('[data-x="cancel"]');
await page.waitForTimeout(250);
st = await getState(page);
eq(st.settings.unit, 'lb', 'cancelling leaves the unit alone');
eq(st.sessions[0].exercises[0].sets[0].w, '225', 'and the log untouched');

/* ------------------------------------------------------------- converting */
await page.selectOption('[data-set="unit"]', 'kg');
await page.waitForSelector('[data-x="conv"]');
await page.click('[data-x="conv"]');
await page.waitForSelector('.toast.act');
st = await getState(page);
eq(st.settings.unit, 'kg', 'the unit changes');
eq(st.sessions[0].exercises[0].sets[0].w, '102.1', 'FIXED: 225 lb becomes 102.1 kg, not "225 kg"');
eq(st.sessions[0].exercises[0].sets[0].load, 102.1, 'load is converted alongside w, so the pair stays coherent');
eq(st.sessions[0].exercises[0].sets[0].r, '5', 'reps are not weights and are left alone');
eq(st.sessions[0].exercises[1].sets[0].load, 93, 'a bodyweight lift\'s resolved load converts too');
eq(st.sessions[0].bw, 81.6, 'the session bodyweight snapshot converts');
eq(st.settings.bodyweight, 81.6, 'and the current one');
eq(st.settings.bar, 20, 'the bar lands on the standard kg bar, not 20.4');
eq(st.settings.plates[0].w, 25, 'and the plates on a real kg set');
eq(planExercises(st)[0].bar, 20, 'a per-exercise bar that was the standard one snaps to the new standard');
eq(planExercises(st)[0].inc, 4.5, 'while a per-exercise weight step is genuinely converted');
eq(st.sessions[0].exercises[0].bar, 20, 'and the session snapshot of the bar snaps too');

/* the UI agrees */
await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
has(await page.textContent('.card.ex .callout'), '102.1', 'the card shows the converted history');

/* ------------------------------------------------------------------ undo */
await boot(page, state());
await openSettings(page);
await page.selectOption('[data-set="unit"]', 'kg');
await page.waitForSelector('[data-x="conv"]');
await page.click('[data-x="conv"]');
await page.waitForSelector('.toast.act');
await page.click('.toast.act button');
await page.waitForTimeout(250);
st = await getState(page);
eq(st.settings.unit, 'lb', 'undo restores the unit');
eq(st.sessions[0].exercises[0].sets[0].w, '225', 'and every weight in the log');
eq(st.settings.plates[0].w, 45, 'and the plate inventory');
eq(planExercises(st)[0].bar, 45, 'and the per-exercise overrides');

/* ------------------------------------------------------------- relabelling */
await boot(page, state());
await openSettings(page);
await page.selectOption('[data-set="unit"]', 'kg');
await page.waitForSelector('[data-x="label"]');
await page.click('[data-x="label"]');
await page.waitForSelector('.toast.act');
st = await getState(page);
eq(st.settings.unit, 'kg', 'relabelling changes the unit');
eq(st.sessions[0].exercises[0].sets[0].w, '225', 'and deliberately leaves the numbers');
eq(st.settings.bar, 20, 'but still un-strands the bar — 45 was never a kg bar either');
eq(st.settings.plates[0].w, 25, 'and the plates');

/* ------------------------------------------------------------ round trip */
await boot(page, state());
await openSettings(page);
await page.selectOption('[data-set="unit"]', 'kg');
await page.waitForSelector('[data-x="conv"]');
await page.click('[data-x="conv"]');
await page.waitForTimeout(250);
await page.selectOption('[data-set="unit"]', 'lb');
await page.waitForSelector('[data-x="conv"]');
await page.click('[data-x="conv"]');
await page.waitForTimeout(250);
st = await getState(page);
const back = Number(st.sessions[0].exercises[0].sets[0].w);
ok(Math.abs(back - 225) <= 0.2, 'a round trip lands within rounding of where it started  [' + back + ']');
eq(st.settings.bar, 45, 'and the bar is back to 45');

/* A genuinely custom bar has no standard to snap to, so it converts. */
await boot(page, state({ settings: {} }));
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('ironlog.v1'));
  s.routines[0].variants[0].exercises[0].bar = 60;      // trap bar
  localStorage.setItem('ironlog.v1', JSON.stringify(s));
});
await page.reload();
await openSettings(page);
await page.selectOption('[data-set="unit"]', 'kg');
await page.waitForSelector('[data-x="conv"]');
await page.click('[data-x="conv"]');
await page.waitForTimeout(250);
st = await getState(page);
eq(planExercises(st)[0].bar, 27.2, 'a non-standard bar is converted, since there is nothing to snap to');

/* PR flags must survive: every score scales by the same factor */
ok(st.sessions[0].exercises[0].sets.some(s => s.pr !== undefined),
  'recomputePRs ran over the converted history');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t25 units');
await browser.close();
