/* v25: "Since you started" (first month against the latest, per lift).

   The rep-out scorecard and its one-tap takeover that used to live here were
   retired with the shadow in 2.0 (the history below still carries a `shadow`
   field, which is inert data now). */
import { launch, boot, getState, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

/* `n` sessions of DB Row, 3 days apart, oldest first. Each: [w, last-set reps, legacy shadow (null = none)]. */
function state(list, extra) {
  const n = list.length;
  const sessions = list.map(([w, A, used], i) => {
    const ts = Date.now() - (n - i) * 3 * 864e5;
    return { id:'s' + i, ts, endTs:ts, routineId:'r1', key:'A', name:'Day A', variantId:'v1', exercises:[ {
      id:'e' + i, planId:'p1', name:'DB Row', reps:8, repTop:12, kind:'reps',
      shadow: used === null ? null : { w, r:10, why:'x', stall:false, used:!!used },
      sets:[ { w:String(w), r:'10', done:true, load:w }, { w:String(w), r:'10', done:true, load:w },
             { w:String(w), r:String(A), done:true, load:w, out:true } ] } ] };
  }).reverse();
  return Object.assign({ version:5, settings:Object.assign({}, SET), active:null,
    routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[
      { id:'p1', name:'DB Row', sets:3, reps:8, repTop:12, mg:'back' } ] } ] } ], sessions }, extra || {});
}
const { browser, page, errors } = await launch();
const progress = async () => { await page.click('[data-tab="progress"]'); await page.waitForSelector('#view .view-title'); };
const viewText = async () => (await page.textContent('#view')).replace(/\s+/g, ' ');

/* ---- 4. Since you started ---- */
const long = state(Array.from({ length: 14 }, (_, i) => [60 + 5 * Math.floor(i / 4), 10, null]));
long.sessions.forEach((s, i) => { s.ts = Date.now() - i * 6 * 864e5; s.endTs = s.ts; });   // ~11 weeks, newest first
await boot(page, long);
await progress();
let t = await viewText();
has(t, 'Since you started', 'look back: the card is there');
has(t, '14 sessions in 11 weeks', 'look back: sessions and weeks');
/* Six days apart, the first four weeks hold five sessions (60 ×4, then 65):
   the first month's best working weight is 65, and 65×10 → 75×10 is +15%. */
ok(/DB Row\s*65 → 75/.test(t), 'look back: first-month vs latest-month working weight');
ok(/DB Row\s*65 → 75\s*\+15%/.test(t), 'look back: e1RM change shown as a percentage  [' + (t.match(/DB Row\s*65 → 75\s*\S+/) || [''])[0] + ']');
await page.click('#view .prrow[data-lift="DB Row"]');
await page.waitForSelector('.sheet');
has(await page.textContent('.sheet'), 'DB Row', 'look back: a row opens that lift');
await page.keyboard.press('Escape').catch(() => {});

await boot(page, state([[65, 11, null], [65, 12, null]]));
await progress();
ok(!(await viewText()).includes('Since you started'), 'under four weeks of history: no look-back card');

/* ---- 5. fits 320 px ---- */
await page.setViewportSize({ width:320, height:740 });
await boot(page, Object.assign(long, {}));
await progress();
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Progress with both cards: no sideways scroll at 320 px');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t36 since you started');
await browser.close();
