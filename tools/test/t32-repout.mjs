/* The last set of a ranged lift is a rep-out, and the card says so.

   v24 also computed a "shadow" prescription from it, offered behind a Use
   button; that was retired in 2.0 (it never beat double progression). What is
   left, and tested here: the label and its hint, the flag saved on the last
   done set, and the trend's reading of a rep-out and of a drop you chose. */
import { launch, boot, getState, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

/* History oldest-first: each session is { sets:[[w, r, out?], ...], kind? }. */
function state(planEx, history) {
  const p = Object.assign({ id:'p1', sets:3, mg:'back' }, planEx);
  const n = history.length;
  const sessions = history.map((h, i) => {
    const ts = Date.now() - (n - i) * 3 * 86400000;
    const e = { id:'e' + i, planId:'p1', name:p.name, reps:p.reps, repTop:p.repTop, bw:p.bw || 0,
      sets:h.sets.map(([w, r, out]) => Object.assign({ w:String(w), r:String(r), done:true,
        load:p.bw === 2 ? SET.bodyweight - Number(w) : Number(w) }, out ? { out:true } : {})) };
    if (h.kind) e.kind = h.kind;
    return { id:'s' + i, ts, endTs:ts, routineId:'r1', key:'A', name:'Day A', variantId:'v1', exercises:[ e ] };
  }).reverse();
  return { version:5, settings:Object.assign({}, SET),
    routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[ p ] } ] } ],
    sessions, active:null };
}
const RO = (w, rs) => ({ sets: rs.map((r, i) => [w, r, i === rs.length - 1]) });   // last set is the rep-out

const { browser, page, errors } = await launch();

async function start(st) {
  if (st) await boot(page, st);
  await page.click('[data-act="start"][data-id="r1"]');
  await page.waitForSelector('.card.ex');
}
async function discard() { await page.click('[data-act="discard"]'); await page.click('[data-x="ok"]'); }
const text = async sel => { const el = await page.$(sel); return el ? (await el.textContent()).replace(/\s+/g, ' ').trim() : null; };

/* ---- 1. the last working set is labelled a rep-out ---- */
const ROW = { name:'DB Row', reps:8, repTop:12 };
const RAISE = { name:'Lateral Raise', reps:12, repTop:20, mg:'delts' };
await start(state(ROW, [ { sets:[[65,10],[65,10],[65,10]] } ]));
has(await text('.card.ex .outhint'), 'Set 3 is a rep-out', 'compound: the card names set 3 as the rep-out');
has(await text('.card.ex .outhint'), 'stop 1 short of form breaking', 'compound: stop one short');
ok(await page.$eval('.card.ex .set:nth-child(3)', el => el.classList.contains('out')), 'compound: the third row is marked');
ok(!(await page.$eval('.card.ex .set:nth-child(2)', el => el.classList.contains('out'))), 'compound: only the last row is marked');
/* + Set moves it, because the label is decided by position at render. */
await page.click('[data-act="add-set"]');
has(await text('.card.ex .outhint'), 'Set 4 is a rep-out', 'adding a set moves the rep-out to set 4');
await discard();

await start(state(RAISE, [ { sets:[[15,16],[15,16],[15,16]] } ]));
has(await text('.card.ex .outhint'), 'take it to failure', 'isolation: to failure');
await discard();

await start(state({ name:'Barbell Squat', reps:5, repTop:0 }, [ { sets:[[225,5],[225,5],[225,5]] } ]));
eq(await page.$('.card.ex .outhint'), null, 'straight sets: no rep-out (no range for it to drive)');
await discard();

/* ---- 2. saving flags the last done working set, and only it ---- */
await start(state(ROW, [ { sets:[[65,10],[65,10],[65,10]] } ]));
for (const t of await page.$$('.card.ex .set .tick')) await t.click();
await page.click('[data-act="finish"]'); await page.click('[data-x="save"]');
let st = await getState(page);
eq(st.sessions[0].exercises[0].sets.map(s => !!s.out).join(), 'false,false,true', 'saved: out:true on the last set only');
ok(st.sessions[0].exercises[0].shadow === undefined, 'saved: no shadow field any more');

/* ---- 6. the trend: one heavy set doesn't drive it; a drop you chose isn't a decline ---- */
const PD = { name:'Lat Pulldown', reps:8, repTop:12 };
await start(state(PD, [ { sets:[[150,10],[150,10],[150,10]] }, { sets:[[150,10],[190,8],[150,10]] },
  { sets:[[150,10],[150,10],[150,10]] }, { sets:[[150,11],[150,11],[150,11]] }, { sets:[[150,11],[150,11],[150,11]] } ]));
const meta6 = await text('.card.ex .ex-meta');
ok(!meta6.includes('SLIPPING'), 'one test set at 190 among sets at 150: not read as slipping  [' + meta6 + ']');
await discard();

const INC = { name:'Incline DB Press', reps:8, repTop:12, mg:'chest' };
const h65 = [0, 1, 2, 3].map(() => ({ sets:[[65,9],[65,8],[65,7]], kind:'reps' }));
await start(state(INC, h65.concat([ { sets:[[55,10],[55,10],[55,10]], kind:'hold' }, { sets:[[55,10],[55,9],[55,9]], kind:'reps' } ])));
const why6 = await text('.card.ex .why');
ok(!/Already backed off/.test(why6), 'dropping 65 → 55 yourself: not held as "already backed off"  [' + why6 + ']');
ok(!(await text('.card.ex .ex-meta')).includes('SLIPPING'), 'dropping 65 → 55 yourself: not "slipping"');
await discard();
await start(state(INC, h65.concat([ { sets:[[55,8],[55,8],[55,8]], kind:'deload' }, { sets:[[55,8],[55,8],[55,8]], kind:'hold' } ])));
/* The trend still sees a drop the app made (it is not reset like a chosen
   one). Since v25 a lifter meeting the range after it gets ordinary
   progression rather than the "already backed off" label — same 55 × 9. */
has(await text('.card.ex .ex-meta'), 'SLIPPING', 'a drop the APP prescribed still counts as the decline it answered');
eq(await page.inputValue('.card.ex .set input[data-f="w"]') + ' × ' + await page.inputValue('.card.ex .set input[data-f="r"]'),
  '55 × 9', '...and the lifter meeting the range keeps climbing reps from there');
await discard();


report('t32 rep-out label');
await browser.close();
