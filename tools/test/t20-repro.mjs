/* Item 2, the reported symptom, end to end.

   A plan exercise created before repTop existed (the field is simply absent)
   runs straight sets even with doubleDefault ON, because the switch has only
   ever set a default for *new* exercises. The engine was never wrong — it was
   correctly running the mode the data put it in, and nothing said so.

   The assertions below were written against the broken build first and passed
   there, reading "8 target" and "add 5 lb". They now pin the fix: the app says
   which mode the exercise is on, and repairing it changes the verdict. */
import { launch, boot, ok, eq, has, report } from './harness.mjs';

const legacyPlan = {
  version: 4,
  settings: { unit: 'lb', rest: 120, autoRest: true, buzz: true, inc: 5, sound: true,
              notify: false, rpe: false, keepTone: false, autoBackup: false, shareMode: '',
              doubleDefault: true, repLow: 8, repHigh: 12, bodyweight: 0,
              deloadUntil: 0, deloadSnooze: 0, bar: 45, plates: [{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}],
              lastBackup: 0 },
  routines: [
    /* v1 shape: name, sets, reps only. No repTop, no bar, no metric, no tags. */
    { id: 'r1', key: 'A', name: 'Day A', exercises: [ { id: 'p1', name: 'Bench Press', sets: 3, reps: 8 } ] },
    { id: 'r2', key: 'B', name: 'Day B', exercises: [ { id: 'p2', name: 'Back Squat', sets: 3, reps: 8 } ] }
  ],
  sessions: [
    { id: 's1', ts: Date.now() - 7 * 86400000, endTs: 0, routineId: 'r1', key: 'A', name: 'Day A',
      exercises: [ { id: 'e1', planId: 'p1', name: 'Bench Press', reps: 8,
        sets: [ {w:'135',r:'8',done:true,load:135}, {w:'135',r:'8',done:true,load:135}, {w:'135',r:'8',done:true,load:135} ] } ] }
  ],
  active: null
};

const { browser, page, errors } = await launch();

await boot(page, legacyPlan);

/* --- Plan tab shows what mode the exercise is actually in --- */
await page.click('[data-tab="plan"]');
await page.waitForSelector('.pex');
const planRow = await page.textContent('.pex .pxs');
console.log('plan row: ' + JSON.stringify(planRow));

/* --- start Day A and read the prescription the engine produced --- */
await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');

const meta = (await page.textContent('.card.ex .ex-meta')).trim();
const why = (await page.textContent('.card.ex .callout')).trim();
const firstW = await page.inputValue('.card.ex .set input[data-f="w"]');
const firstR = await page.inputValue('.card.ex .set input[data-f="r"]');

console.log('meta: ' + JSON.stringify(meta));
console.log('why:  ' + JSON.stringify(why.replace(/\s+/g, ' ')));
console.log('prefill: ' + firstW + ' x ' + firstR);

has(planRow, '3×8 straight', 'the Plan row names the mode the exercise is really on');
has(meta, '8 straight', 'and so does the session card — not the old, too-subtle "8 target"');
has(why, 'add 5 lb', 'the engine still adds weight, because straight sets is what the data says');
eq(firstW, '140', 'and the prefill follows it');

/* now take the offered repair and watch the same exercise change its mind */
await page.click('[data-act="discard"]');
await page.click('[data-x="ok"]');
await page.click('[data-tab="plan"]');
await page.click('[data-act="fix-ranges"]');
await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
has((await page.textContent('.card.ex .ex-meta')).trim(), '8–11 range', 'after the repair the card shows a range');
has((await page.textContent('.card.ex .why')).trim(), 'go for 9 this time', 'and the engine asks for a rep first');
eq(await page.inputValue('.card.ex .set input[data-f="w"]'), '135', 'holding the weight at 135');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t20 repro');
await browser.close();
