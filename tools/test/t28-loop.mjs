/* The closed loop: prescribe → train → log → prescribe again.

   Every other suite reads ONE verdict off a seeded history. This one feeds the
   app's own prescription back in as the next session, dozens of times, because
   a prescription is an input to the next session and a signal that is right in
   isolation can still be wrong in a loop. See trap 20.

   The lifter model is deliberately ordinary: he does exactly what the card
   says, up to what he is capable of, and his last set lags the first by a rep
   or two — which is what real sets look like. Nothing here is a bad lifter. */
import { launch, boot, getState, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

const NAME = 'Bench Press', LOW = 8, TOP = 12, START = 185;

/* One day, one lift, and one session of history so the engine has a weight to
   start from — prescribe() is deliberately silent with nothing to read. */
function seed(planEx, startW) {
  const ts = Date.now() - 3 * 86400000;
  const p = Object.assign({ id:'p1', name:NAME, sets:3, reps:LOW, repTop:TOP, mg:'chest' }, planEx || {});
  const load = p.bw === 2 ? SET.bodyweight - startW : startW;
  return {
    version:5, settings:Object.assign({}, SET),
    routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[ p ] } ] } ],
    sessions:[ { id:'s0', ts, endTs:ts, routineId:'r1', key:'A', name:'Day A', variantId:'v1',
      exercises:[ { id:'e0', planId:'p1', name:p.name, reps:p.reps, repTop:p.repTop, bw:p.bw || 0,
        sets:[0,1,2].map(() => ({ w:String(startW), r:String(p.reps), done:true, load })) } ] } ],
    active:null
  };
}

/* Reps available against an effective load for a lifter whose true 1RM is
   `max`, inverted from the same Epley the app scores with. Each later set
   loses a rep to fatigue — the "12/12/11 that never quite steps" shape. */
function capacity(max, load, setIx) {
  return Math.max(1, Math.floor(30 * (max / load - 1)) - setIx);
}

const { browser, page, errors } = await launch();

/* Run n sessions through the real UI. `oneRM(i)` is the lifter's true strength
   at session i; `o.sick` is a session index he turns up ill for; `o.load(w)`
   turns what the card asks for into what he is actually lifting, which is not
   the same number on assisted work. */
async function loop(n, oneRM, o) {
  o = o || {};
  const load = o.load || (w => w);
  await boot(page, seed(o.planEx, o.startW === undefined ? START : o.startW));
  const log = [];
  for (let i = 0; i < n; i++) {
    await page.click('[data-act="start"][data-id="r1"]');
    await page.waitForSelector('.card.ex');
    const w = Number(await page.inputValue('.card.ex .set input[data-f="w"]'));
    const r = Number(await page.inputValue('.card.ex .set input[data-f="r"]'));
    const why = (await page.textContent('.card.ex .why')).replace(/\s+/g, ' ').trim();
    const rows = await page.$$('.card.ex .set');
    const did = [];
    for (let k = 0; k < rows.length; k++) {
      const reps = (i === o.sick) ? [4, 3, 2][k] : Math.min(r, capacity(oneRM(i), load(w), k));
      await rows[k].$eval('input[data-f="r"]', (el, v) => {
        el.value = v; el.dispatchEvent(new Event('input', { bubbles:true }));
      }, String(reps));
      await rows[k].$eval('.tick', el => el.click());
      did.push(reps);
    }
    log.push({ i, w, r, why, did });
    await page.click('[data-act="finish"]');
    await page.click('[data-x="save"]');
    await page.click('[data-tab="today"]');
    await page.waitForSelector('[data-act="start"][data-id="r1"]');
  }
  return log;
}

/* The property the engine must have: one cut per genuine decline episode. A
   second cut on top of an un-recovered first one is the spiral. */
function shape(log) {
  let peak = 0, worst = 1, cuts = 0, prev = null;
  for (const s of log) {
    peak = Math.max(peak, s.w);
    worst = Math.min(worst, s.w / peak);
    if (prev !== null && s.w < prev) cuts++;
    prev = s.w;
  }
  const at = log.filter(s => /back off to/.test(s.why)).map(s => s.i);
  let gap = 99;
  for (let k = 1; k < at.length; k++) gap = Math.min(gap, at[k] - at[k - 1]);
  return { peak, worst, cuts, first:log[0].w, last:log[log.length - 1].w,
           backoffs:at.length, gap, at,
           holds:log.filter(s => /Already backed off/.test(s.why)) };
}

/* ---- 1. the steady gainer: nothing but good sessions, ever ----
   True 1RM climbs 250 → 295. He never misses a prescribed rep he is capable
   of, and the only thing that ever "goes down" is the e1RM reset that follows
   his own load step. */
let log = await loop(45, i => 250 + i * 1);
let s = shape(log);
console.log('  steady gainer: ' + log.map(x => x.w).join(' '));
ok(s.cuts <= 1, 'steady gainer: at most one back-off in 45 sessions  [' + s.cuts + ' cuts]');
ok(s.worst >= 0.88, 'steady gainer: never more than one cut below the peak  [' +
  Math.round(s.worst * 100) + '% of ' + s.peak + ']');
ok(s.last >= START, 'steady gainer: ends at or above where he started  [' + s.last + ']');
ok(s.last >= s.peak * 0.95, 'steady gainer: ends at the top of his range, not below it  [' +
  s.last + ' of peak ' + s.peak + ']');

/* ---- 2. one sick day ----
   Same lifter, one session at 4/3/2 because he turned up ill. That is a real
   decline signal and it has earned exactly one back-off — after which an
   obedient lifter must be able to climb back out. */
log = await loop(45, i => 250 + i * 1, { sick:12 });
s = shape(log);
console.log('  one sick day:  ' + log.map(x => x.w).join(' '));
ok(s.backoffs <= 1, 'one sick day: the app backs off once, not repeatedly  [' + s.backoffs + ']');
ok(s.worst >= 0.88, 'one sick day: never more than one cut below the peak  [' +
  Math.round(s.worst * 100) + '% of ' + s.peak + ']');
ok(s.last > s.peak * 0.95, 'one sick day: he recovers to his old weight  [' + s.last +
  ' of peak ' + s.peak + ']');
/* Fix 2: while holding after a back-off the reps must still be allowed to
   climb, or the lifter can never produce the rising e1RM that clears the
   verdict — the hold suppresses exactly the evidence that would end it. */
ok(s.holds.length === 0 || s.holds.some(h => h.r > LOW),
  'one sick day: a hold after a back-off still lets the reps climb  [' +
  s.holds.map(h => h.r).join(',') + ']');

/* ---- 3. a genuine decline ----
   True 1RM falls 250 → 201 across the run, so by the end his true 8RM is about
   150. The app MUST cut here — a fix that never cuts has overshot.

   It cuts twice over these 30 sessions, and that is right rather than a
   relapse into the spiral: he loses a fifth of his strength, so the second
   cut, 15 sessions after the first, is a second genuine decline episode. The
   property that separates the two is the SPACING — the spiral cut every 4
   sessions, faster than the window the verdict is computed from could
   possibly refill. */
log = await loop(30, i => 250 - i * 1.7);
s = shape(log);
console.log('  real decline:  ' + log.map(x => x.w).join(' '));
ok(s.backoffs >= 1, 'genuine decline: the app still backs off  [' + s.backoffs + ']');
ok(s.gap >= 9, 'genuine decline: cuts never come closer than the trend window  [gap ' +
  s.gap + ', at ' + s.at.join(',') + ']');
ok(s.last >= 150, 'genuine decline: tracks the true 8RM rather than burying it  [' + s.last + ']');
ok(s.last <= 190, 'genuine decline: and does not keep prescribing the old weight  [' + s.last + ']');

/* ---- 4. the same loop on assisted work, where every direction inverts ----
   `w` is help, not load: progress means the number falls, and a back-off means
   MORE assistance. So the guard's "peak" is the session with the least help,
   not the largest number — reading it the other way round makes the guard fire
   when it shouldn't and miss when it should. A lifter gaining strength on an
   assisted pull-up must never be walked back up the assistance ladder. */
log = await loop(35, i => 200 + i * 1.2,
  { planEx:{ name:'Assisted Pull-up', bw:2, mg:'back' }, startW:60, sick:12,
    load:w => SET.bodyweight - w });
console.log('  assisted:      ' + log.map(x => x.w).join(' '));
const best = Math.min.apply(null, log.map(x => x.w));
const lastW = log[log.length - 1].w;
ok(lastW <= 60, 'assisted: a strengthening lifter needs no more help than he started with  [' +
  lastW + ']');
ok(lastW <= best + 10, 'assisted: never walked back up the assistance ladder  [ended ' +
  lastW + ', best ' + best + ']');
ok(log.filter(x => /back off to/.test(x.why)).length <= 1,
  'assisted: at most one back-off in 35 sessions  [' +
  log.filter(x => /back off to/.test(x.why)).length + ']');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t28 closed loop');
await browser.close();
