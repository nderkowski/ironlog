/* Which weight a session was "at", and what a slide does to a light dumbbell.

   prescribe() used to read the load off the FIRST set and the reps off the
   worst set at ANY load. Logs that ramp up or drop down broke both halves:
   130/150/170 prescribed 135, 225/185/135 × 8 was judged three eights at 225,
   and one test set at 170 between two at 150 would have become the weight.

   The back-off was a 10% cut on the step grid, which on a 15 lb dumbbell
   rounds to a third and on a 5 lb one to zero. */
import { launch, boot, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

/* One plan lift, and history given oldest-first as arrays of [w, r] pairs. */
function state(planEx, history) {
  const p = Object.assign({ id:'p1', sets:3, mg:'chest' }, planEx);
  const n = history.length;
  const sessions = history.map((sets, i) => {
    const ts = Date.now() - (n - i) * 3 * 86400000;
    return { id:'s' + i, ts, endTs:ts, routineId:'r1', key:'A', name:'Day A', variantId:'v1',
      exercises:[ { id:'e' + i, planId:'p1', name:p.name, reps:p.reps, repTop:p.repTop, bw:p.bw || 0,
        sets:sets.map(([w, r]) => ({ w:String(w), r:String(r), done:true,
          load:p.bw === 2 ? SET.bodyweight - Number(w) : Number(w) })) } ] };
  }).reverse();                                     // newest first, as the app stores it
  return { version:5, settings:Object.assign({}, SET),
    routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[ p ] } ] } ],
    sessions, active:null };
}

const { browser, page, errors } = await launch();

/* What the user meets: the session card's prefill and its reason. */
async function card(st) {
  await boot(page, st);
  await page.click('[data-act="start"][data-id="r1"]');
  await page.waitForSelector('.card.ex');
  const rows = await page.$$('.card.ex .set');
  const w = await page.inputValue('.card.ex .set input[data-f="w"]');
  const r = await page.inputValue('.card.ex .set input[data-f="r"]');
  const why = (await page.textContent('.card.ex .why')).replace(/\s+/g, ' ').trim();
  await page.click('[data-act="discard"]');
  await page.click('[data-x="ok"]');
  return { w:Number(w), r:Number(r), sets:rows.length, why };
}

const RDL = { name:'RDL', reps:8, repTop:11 };

/* ---- 1. back-offs after the working load are drops, and they hold ---- */
let c = await card(state(RDL, [ [[225,8],[225,8],[225,8]], [[225,8],[185,8],[135,8]] ]));
eq(c.w, 225, 'top set + back-offs: stays at the top weight');
eq(c.r, 8, 'top set + back-offs: at the reps actually done there, not 9');
has(c.why, 'Only 1 of 3 sets at 225', 'top set + back-offs: says why it is holding');

/* A set dropped mid-exercise is not a miss at the heavier weight: the 6 at 225
   still counts, the 8 at 185 is not mistaken for an 8 at 225. */
c = await card(state(RDL, [ [[225,8],[225,8],[225,8]], [[225,8],[225,6],[185,8]] ]));
eq(c.w, 225, 'weight dropped mid-exercise: holds at the working weight');
eq(c.r, 8, 'weight dropped mid-exercise: back to the bottom of the range');
has(c.why, 'Only 2 of 3 sets at 225', 'weight dropped mid-exercise: names the drop');

/* ---- 2. a ramp is warm-ups, and the work above it progresses ---- */
const OHP = { name:'DB Overhead Press', reps:8, repTop:12 };
c = await card(state(OHP, [ [[35,10],[35,10],[35,10]], [[30,12],[35,12],[35,12]] ]));
eq(c.w, 40, 'ramp 30/35/35 at the top of the range: adds to 35, not to the 30 warm-up');
eq(c.r, 8, 'ramp: reps reset to the bottom after the step');
has(c.why, 'Hit 12s on every set', 'ramp: reads as a clean top-of-range session');

c = await card(state({ name:'Leg Press', reps:8, repTop:12 },
  [ [[140,10],[140,10],[140,10]], [[140,12],[150,10],[170,10]] ]));
eq(c.w, 170, 'ascending pyramid, one set at each: the heaviest is the work');
eq(c.r, 11, 'ascending pyramid: one more rep at it, not at the 140 opener');

/* A ramp INTO a drop is still a drop: the warm-up is ignored, the 185 is not. */
c = await card(state(RDL, [ [[225,8],[225,8],[225,8]], [[135,8],[225,8],[225,6],[185,8]] ]));
eq(c.w, 225, 'ramp then drop: working weight is the one most sets were at');
has(c.why, 'Only 2 of 3 sets at 225', 'ramp then drop: the ramp is not counted, the drop is');

/* ---- 3. one heavier set is not the working weight ---- */
c = await card(state({ name:'Lat Pulldown', reps:8, repTop:12 },
  [ [[150,10],[150,10],[150,10]], [[150,10],[170,8],[150,10]] ]));
eq(c.w, 150, 'one test set at 170 between two at 150: works from 150');
eq(c.r, 11, 'one test set: and progresses the reps there');
has(c.why, 'Same weight', 'one test set: no hold, nothing was dropped');

/* ---- 4. a blank weight is a set nobody retyped ---- */
c = await card(state({ name:'Cable Row', reps:8, repTop:12 },
  [ [[100,9],[100,9],[100,9]], [[100,10],['',10],[100,10]] ]));
eq(c.w, 100, 'blank weight on a loaded lift: not read as a set at zero');
eq(c.r, 11, 'blank weight: counts toward the reps, no hold');

/* ---- 5. assisted work, where lighter means MORE help ---- */
const AP = { name:'Assisted Pull-up', reps:8, repTop:12, bw:2, mg:'back' };
c = await card(state(AP, [ [[30,10],[30,10],[30,10]], [[40,12],[30,12],[30,12]] ]));
eq(c.w, 25, 'assisted ramp from more help: progresses from the least help, 30 → 25');
c = await card(state(AP, [ [[30,10],[30,10],[30,10]], [[30,12],[30,12],[40,12]] ]));
eq(c.w, 30, 'assisted, extra help on the last set: holds at 30');
has(c.why, 'Only 2 of 3 sets at', 'assisted drop: names it as a drop');

/* ---- 6. a slide on a light dumbbell takes a set, not a third of the load ----
   15 lb sliding from 20 reps to 14 is a real decline (trend well below −2%).
   The old cut was 15 → 10, a third; on a 5 lb dumbbell it was 5 → 0. */
const RAISE = { name:'Lateral Raise', reps:12, repTop:20, sets:4, mg:'delts' };
const slide = r => [r].concat([r, r, r]).map(x => [15, x]);
c = await card(state(RAISE, [20, 19, 18, 16, 15, 14].map(slide)));
eq(c.w, 15, '15 lb raise sliding: keeps the 15s');
eq(c.sets, 4, '15 lb raise sliding: keeps its 4 sets (2.0: no trend cut, so no set is taken)');
eq(c.r, 15, '15 lb raise sliding: reps stay free to climb (trap 17b)');
has(c.why, 'Same weight — go for 15', '15 lb raise sliding: holds and climbs reps');

c = await card(state(Object.assign({}, RAISE, { name:'Rear Delt Raise' }),
  [20, 19, 18, 16, 15, 14].map(r => [[5, r], [5, r], [5, r], [5, r]])));
eq(c.w, 5, '5 lb dumbbell sliding: never prescribed 0');

/* The cap must not swallow an ordinary bar back-off: 185 → 165 is ~11%. */
c = await card(state({ name:'Bench Press', reps:8, repTop:12 },
  [12, 11, 11, 10, 9, 8].map(r => [[185, r], [185, r], [185, r]])));
eq(c.w, 185, 'bench sliding: 2.0 holds the 185 (the trend no longer cuts the bar)');
has(c.why, 'Same weight — go for 9', 'bench sliding: holds and climbs reps');

/* ---- 7. closed loop on a light dumbbell (trap 17b) ----
   Feed the prescription back in for 30 sessions with one sick day. The app
   may take sets away while the slide shows, but it must never cut the load
   past MAX_CUT, and an obedient lifter must climb back out of it. */
function capacity(max, load, setIx) { return Math.max(1, Math.floor(30 * (max / load - 1)) - setIx); }
await boot(page, state(RAISE, [ [[15,12],[15,12],[15,12],[15,12]] ]));
const log = [];
for (let i = 0; i < 30; i++) {
  await page.click('[data-act="start"][data-id="r1"]');
  await page.waitForSelector('.card.ex');
  const w = Number(await page.inputValue('.card.ex .set input[data-f="w"]'));
  const r = Number(await page.inputValue('.card.ex .set input[data-f="r"]'));
  const why = (await page.textContent('.card.ex .why')).replace(/\s+/g, ' ').trim();
  const rows = await page.$$('.card.ex .set');
  for (let k = 0; k < rows.length; k++) {
    const reps = i === 10 ? [4, 3, 2, 2][k] : Math.min(r, capacity(23 + i * 0.05, w, k));
    await rows[k].$eval('input[data-f="r"]', (el, v) => {
      el.value = v; el.dispatchEvent(new Event('input', { bubbles:true }));
    }, String(reps));
    await rows[k].$eval('.tick', el => el.click());
  }
  log.push({ w, r, n:rows.length, why });
  if (/back off|drop a set/.test(why)) console.log('  slide at ' + i + ': ' + why);
  await page.click('[data-act="finish"]');
  await page.click('[data-x="save"]');
  await page.click('[data-tab="today"]');
  await page.waitForSelector('[data-act="start"][data-id="r1"]');
}
console.log('  light loop: ' + log.map(x => x.w + 'x' + x.r + (x.n < 4 ? '(' + x.n + ')' : '')).join(' '));
let peak = 0, worst = 1;
log.forEach(x => { peak = Math.max(peak, x.w); worst = Math.min(worst, x.w / peak); });
ok(worst >= 0.8, 'light loop: never cut past 20% of the best load  [' + Math.round(worst * 100) + '%]');
ok(log.every(x => x.n === 4), 'light loop: 2.0 never takes a set away on a slide (no trend cut)');
ok(log[log.length - 1].n === 4, 'light loop: and the set comes back once he recovers');
ok(log[log.length - 1].w >= 15, 'light loop: ends at or above where he started  [' + log[log.length - 1].w + ']');

/* ---- 8. who backed off: a hold after a drop he chose says so ----
   The real log before 6 Nov: four sessions at 65, his own drop to 55, then
   10s, 10/11/9, 8s after a 25-day gap, 9s. The trend since the drop reads
   down (−4.6%) and the guard holds — but it was his decision, not the app's.
   External review (Argon) suggested reading the guard from sinceChosenDrop();
   that turns this hold into a cut to 50, so only the words change. */
const INC = { name:'Incline DB Press', reps:8, repTop:12, mg:'chest' };
const inc = state(INC, [ [[65,9],[65,8],[65,7]], [[65,8],[65,8],[65,6]], [[65,8],[65,8],[65,7]], [[65,9],[65,9],[65,7]],
  [[55,10],[55,10],[55,10]], [[55,10],[55,11],[55,9]], [[55,8],[55,8],[55,8]], [[55,9],[55,9],[55,9]] ]);
inc.sessions.forEach((x, i) => { x.exercises[0].kind = i === 3 ? 'hold' : 'reps'; });   // newest first: index 3 is the 65 → 55 session
c = await card(inc);
has(c.why, 'Same weight — go for 10', '2.0: after his own 65 → 55 drop it is ordinary progression (no "already backed off" hold exists)');
eq(c.w, 55, '...and still at the 55s: no extra cut');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t30 working load');
await browser.close();
