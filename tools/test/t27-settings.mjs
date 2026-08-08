/* Settings moved off the foot of the Plan tab into their own screen.
   The rows kept their handlers, which live behind a `TAB !== "plan"` guard —
   miss that and every switch silently does nothing, which is exactly the class
   of bug this app keeps producing. */
import { launch, boot, getState, openSettings, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:true, buzz:true, inc:5, sound:true, notify:false,
  rpe:false, keepTone:false, autoBackup:true, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2}], lastBackup:0 };

const state = {
  version:5, settings:Object.assign({}, SET),
  routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[
    { id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12, mg:'chest' } ] } ] } ],
  sessions:[], active:null
};

const { browser, page, errors } = await launch();
await boot(page, state);

/* ---- getting there and back ---- */
ok(!!(await page.$('[data-act="settings"]')), 'the gear is in the header from Today');
const tabs = await page.$$eval('#tabs button', els => els.map(e => e.textContent.trim()));
eq(tabs.length, 3, 'the bottom bar is still three tabs, not four  [' + tabs.join(',') + ']');

await page.click('[data-tab="plan"]');
has(await page.textContent('#view'), 'Settings', 'Plan carries a row through to Settings');
has(await page.textContent('[data-act="settings"] >> nth=-1'), 'lb',
  'and that row summarises what is set, rather than being a bare label');

await openSettings(page);
has(await page.textContent('.view-title'), 'Settings', 'the screen opens');
const onTab = await page.$$eval('#tabs button.on', els => els.map(e => e.textContent.trim()));
eq(onTab.join(''), 'Plan', 'the bottom bar still shows where you came from');
await page.click('[data-act="settings-back"]');
has(await page.textContent('.view-title'), 'Plan', 'the back arrow returns to Plan');
await openSettings(page);
await page.click('[data-tab="today"]');
has(await page.textContent('.view-title'), 'Ready to lift', 'and any tab tap leaves too');

/* ---- Progression stayed with the split it shapes ---- */
await page.click('[data-tab="plan"]');
const plan = await page.textContent('#view');
has(plan, 'Double progression by default', 'Progression is still on Plan');
has(plan, 'Default rep range', 'including the rep range');
ok(!plan.includes('Rest timer'), 'but Session settings are not');
ok(!plan.includes('Plates you own'), 'nor the plate inventory');
ok(!plan.includes('Erase everything'), 'nor the data controls');
has(plan, 'Iron Log v', 'and the build marker stays where it is documented to be');

/* ---- every control still works from its new home ---- */
await openSettings(page);
const settings = await page.textContent('#view');
for (const row of ['Units', 'Your bodyweight', 'Rest timer', 'Vibrate', 'Alarm when rest ends',
                   'Rate sets (RPE)', 'Back up after every workout', 'Bar weight',
                   'Plates you own', 'Erase everything', 'Version'])
  has(settings, row, 'Settings carries the "' + row + '" row');

/* switches — the guard bug would make every one of these a no-op */
for (const [key, label] of [['autoRest','Start rest automatically'], ['buzz','Vibrate'],
                            ['sound','Alarm when rest ends'], ['rpe','Rate sets (RPE)'],
                            ['autoBackup','Back up after every workout']]) {
  const before = (await getState(page)).settings[key];
  await page.click('[data-set="' + key + '"]');
  await page.waitForTimeout(200);
  const after = (await getState(page)).settings[key];
  ok(before !== after, label + ' actually toggles from Settings  [' + before + ' -> ' + after + ']');
}

/* number fields */
await page.fill('[data-set="rest"]', '90');
await page.locator('[data-set="rest"]').blur();
await page.waitForTimeout(200);
eq((await getState(page)).settings.rest, 90, 'the rest length saves');
await page.fill('[data-set="bodyweight"]', '185');
await page.locator('[data-set="bodyweight"]').blur();
await page.waitForTimeout(200);
eq((await getState(page)).settings.bodyweight, 185, 'and bodyweight');

/* the plate inventory, which updates on input and must not re-render */
await page.evaluate(() => { const i = document.querySelector('[data-pn="0"]'); i.focus(); window.__p = i; });
await page.fill('[data-pn="0"]', '6');
await page.waitForTimeout(200);
eq((await getState(page)).settings.plates[0].n, 6, 'a plate count saves from Settings');
ok(await page.evaluate(() => document.querySelector('[data-pn="0"]') === window.__p),
  'and the field keeps DOM identity, so typing is not interrupted');

await page.click('[data-act="plate-add"]');
await page.waitForTimeout(200);
eq((await getState(page)).settings.plates.length, 3, 'adding a plate size re-renders Settings, not Plan');
has(await page.textContent('.view-title'), 'Settings', 'and leaves you on Settings');
await page.click('[data-act="plate-reset"]');
await page.waitForTimeout(200);
eq((await getState(page)).settings.plates.length, 6, 'resetting the plate set works too');
has(await page.textContent('.view-title'), 'Settings', 'still on Settings');

/* the unit sheet, which lives here now */
await page.selectOption('[data-set="unit"]', 'kg');
await page.waitForSelector('.sheet');
has(await page.textContent('.sheet'), 'Switch to kg', 'the unit switch still asks from Settings');
await page.click('[data-x="cancel"]');
await page.waitForTimeout(200);
has(await page.textContent('.view-title'), 'Settings', 'and cancelling returns to Settings, not Plan');

/* ---- layout ---- */
for (const w of [320, 390]) {
  await page.setViewportSize({ width: w, height: 844 });
  const over = await page.evaluate(() => {
    const v = document.querySelector('#view');
    return v.scrollWidth - v.clientWidth;
  });
  ok(over <= 0, 'Settings does not scroll sideways at ' + w + 'px  [' + over + ']');
  const nested = await page.evaluate(() => !!document.querySelector('#view .field-row .field-row'));
  ok(!nested, 'and has no nested .field-row at ' + w + 'px');
}

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t27 settings');
await browser.close();
