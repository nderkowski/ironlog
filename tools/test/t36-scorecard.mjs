/* v25: the rep-out scorecard, the one-tap takeover, and "Since you started".

   The scorecard is what makes v25's hand-over effortless: the app judges the
   rep-out method on what happened when it was lifted, and offers to make it
   the default only past the ROADMAP gate (≥ 9 uses, ≥ 85% landed). */
import { launch, boot, getState, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

/* `n` sessions of DB Row, 3 days apart, oldest first. Each: [w, last-set reps, shadow used?]. */
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

/* ---- 1. no shadow ever offered: no card ---- */
await boot(page, state([[65, 11, null], [65, 12, null]]));
await progress();
ok(!(await viewText()).includes('Rep-out method'), 'no rep-out data: no scorecard');

/* ---- 2. counting: offered vs used vs landed ---- */
// 6 used (5 landed: last set ≥ 8), 2 offered but not used.
await boot(page, state([[65,10,1],[65,11,1],[70,6,1],[65,10,1],[65,11,1],[65,12,1],[65,12,0],[65,12,0]]));
await progress();
let t = await viewText();
has(t, 'Used 6 of 8 times it was offered', 'scorecard: used of offered');
has(t, 'landed in your range 83%', 'scorecard: 5 of 6 landed');
has(t, '3 to go', 'scorecard: counts toward the 9 needed');
eq(await page.$('[data-act="repout-on"]'), null, 'below the gate: no takeover offered');

/* ---- 3. past the gate: the offer, and taking it ---- */
const good = Array.from({ length: 10 }, (_, i) => [65 + 5 * Math.floor(i / 3), 9 + (i % 3), 1]);   // all land
await boot(page, state(good));
await progress();
has(await viewText(), 'past the 85% it needs', 'past the gate: says so');
await page.click('[data-act="repout-on"]');
await page.waitForSelector('.sheet [data-x="ok"]');
await page.click('.sheet [data-x="ok"]');
await page.waitForSelector('[data-act="repout-off"]');
eq((await getState(page)).settings.repOutDefault, true, 'taking it sets the default');

/* With it as the default, Today's card prescribes from the rep-out and the
   suggestion line is folded into the reason, not shown twice. */
await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
has(await page.textContent('.card.ex .why'), 'Rep-out method', 'default: the reason names the rep-out method');
eq(await page.$('.card.ex .shadow'), null, 'default: no separate suggestion line');
const last = good[good.length - 1];
eq(await page.inputValue('.card.ex .set input[data-f="w"]'), String(last[0]), 'default: prefill is the rep-out prescription  (last set ' + last[1] + ' at ' + last[0] + ')');
for (const b of await page.$$('.card.ex .set .tick')) await b.click();
await page.click('[data-act="finish"]'); await page.click('[data-x="save"]');
const st = await getState(page);
eq(st.sessions[0].exercises[0].shadow.used, true, 'default: the session still counts as a use, so the scorecard keeps judging');

/* Switching back is one tap. */
await progress();
await page.click('[data-act="repout-off"]');
await page.waitForSelector('[data-act="repout-on"]');
eq((await getState(page)).settings.repOutDefault, false, 'switching back clears the default');

/* ---- 4. Since you started ---- */
const long = state(Array.from({ length: 14 }, (_, i) => [60 + 5 * Math.floor(i / 4), 10, null]));
long.sessions.forEach((s, i) => { s.ts = Date.now() - i * 6 * 864e5; s.endTs = s.ts; });   // ~11 weeks, newest first
await boot(page, long);
await progress();
t = await viewText();
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
report('t36 scorecard');
await browser.close();
