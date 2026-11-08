/* Notes on a single lift, mid-workout.

   The only note used to be the one at the foot of the whole session. Each
   lift now has a quiet "+ Note on this lift" line that opens a box in place
   — never a re-render on the logging path (trap 1) — and the newest note on
   a lift is shown the next time that lift comes up. These notes are also
   what the v26/v27 coach will read. */
import { launch, boot, getState, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };
const seed = () => ({ version:5, settings:Object.assign({}, SET), active:null, sessions:[],
  routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[
    { id:'p1', name:'Leg Press', sets:3, reps:8, repTop:12, mg:'quads' },
    { id:'p2', name:'DB Curl', sets:3, reps:8, repTop:12, mg:'biceps' } ] } ] } ] });

const { browser, page, errors } = await launch();
await boot(page, seed());
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');

/* ---- 1. every lift has the tap line, and it opens in place ---- */
eq(await page.$$eval('.card.ex .exnote-add', b => b.length), 2, 'each lift has a "+ Note on this lift" line');
const row = await page.$('.card.ex .set');                              // proves no re-render below
await page.fill('.card.ex .set input[data-f="w"]', '200');
await page.click('.card.ex >> nth=0 >> .exnote-add');
ok(await page.$('.card.ex >> nth=0 >> textarea[data-act="exnote"]') !== null, 'tapping it opens a note box on that lift');
eq(await page.evaluate(() => document.activeElement && document.activeElement.dataset.act), 'exnote', 'the box takes the focus, ready to type');
ok(await row.evaluate(el => el.isConnected), 'opened in place: the set rows were not rebuilt (trap 1)');
eq(await page.inputValue('.card.ex .set input[data-f="w"]'), '200', 'a weight typed before tapping is still there');
eq(await page.$$eval('.card.ex >> nth=1 >> textarea', t => t.length), 0, 'the other lift is untouched');

/* ---- 2. typing saves to that lift ---- */
await page.type('textarea[data-act="exnote"]', 'Seat at 4, knees a bit sore');
await page.waitForTimeout(700);
eq((await getState(page)).active.exercises[0].note, 'Seat at 4, knees a bit sore', 'typing saves the note on that lift');

/* ---- 3. it is kept with the workout and shown next time ---- */
for (const t of await page.$$('.card.ex .set .tick')) await t.click();
await page.click('[data-act="finish"]'); await page.click('[data-x="save"]');
let st = await getState(page);
eq(st.sessions[0].exercises.find(e => e.name === 'Leg Press').note, 'Seat at 4, knees a bit sore', 'the saved session keeps the note');

await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
has(await page.textContent('.card.ex >> nth=0'), 'Note from today: Seat at 4, knees a bit sore', 'next time, the lift shows its last note');
ok(!(await page.textContent('.card.ex >> nth=1')).includes('Note from'), 'a lift with no note shows none');
ok(await page.$('.card.ex >> nth=0 >> .exnote-add') !== null, 'and today\'s note starts empty, behind the tap line');
await page.click('[data-act="discard"]'); await page.click('[data-x="ok"]');

/* ---- 4. history shows it ---- */
await page.click('[data-tab="progress"]');
await page.click('#view .sess >> nth=0');
await page.waitForSelector('.sheet');
has(await page.textContent('.sheet'), 'Seat at 4, knees a bit sore', 'the session in history shows the lift note');
await page.click('.sheet [data-x="close"]');

/* ---- 5. 320 px ---- */
await page.setViewportSize({ width:320, height:740 });
await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
await page.click('.card.ex >> nth=1 >> .exnote-add');
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 px: a card with a note box and a last note has no sideways scroll');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t37 lift notes');
await browser.close();
