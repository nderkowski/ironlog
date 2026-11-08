/* v24: the last set is a rep-out, and a shadow prescription is computed from it.

   Nick's log echoes the target back (half of all exercises are logged exactly
   on it), so double progression never sees the reserve that made his 20–33%
   jumps work. The rep-out measures it; shadowPrescribe() turns it into the
   next session; the card shows it beside today's answer and applies it only
   on a tap. See ROADMAP v24 and RESEARCH.md. */
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
ok(st.sessions[0].exercises[0].shadow === null, 'saved: no shadow when last time had no rep-out');

/* ---- 3. the decision table, range 8–12, step 5, at 100 ---- */
const T = [
  [6,  '95 × 8',  'one step down'],
  [7,  '100 × 8', 'repeat it'],
  [8,  '100 × 8', 'same weight'],
  [10, '100 × 10','same weight'],
  [11, '100 × 11','same weight'],
  [12, '105 × 8', 'one step up'],
  [15, '105 × 8', 'one step up'],
  [16, '110 × 8', 'two steps up'],
];
for (const [A, want, words] of T) {
  await start(state(ROW, [ RO(100, [10, 10, A]) ]));
  const sh = await text('.card.ex .shadow');
  has(sh, 'Rep-out method: ' + want, 'rep-out ' + A + ' on 8–12 at 100 → ' + want);
  has(sh, words, 'rep-out ' + A + ': says "' + words + '"');
  await discard();
}
/* No rep-out in the history: nothing to say, so nothing shown — the replay of
   the real log, which has none, must look exactly like v23. */
await start(state(ROW, [ { sets:[[100,10],[100,10],[100,10]] } ]));
eq(await page.$('.card.ex .shadow'), null, 'history without rep-outs: no shadow line');
await discard();
/* Assisted: up means LESS help, two steps from 40 is 30. */
await start(state({ name:'Assisted Pull-up', reps:8, repTop:12, bw:2 }, [ RO(40, [10, 10, 17]) ]));
has(await text('.card.ex .shadow'), '−30 × 8', 'assisted: two steps up is two steps less help');
await discard();
/* The rep-out drives it even when the working sets fell short. */
await start(state(ROW, [ RO(100, [12, 9, 15]) ]));
has(await text('.card.ex .shadow'), '105 × 8', 'rep-out 15 drives the shadow even with a 9 earlier');
await discard();

/* ---- 4. Use applies it, and the session records whether it was used ---- */
await start(state(ROW, [ RO(100, [10, 10, 17]) ]));
await page.click('[data-act="use-shadow"]');
const ws = await page.$$eval('.card.ex .set input[data-f="w"]', els => els.map(e => e.value));
const rs = await page.$$eval('.card.ex .set input[data-f="r"]', els => els.map(e => e.value));
eq(ws.join(), '110,110,110', 'Use: every set takes the shadow weight');
eq(rs.join(), '8,8,8', 'Use: and the shadow reps');
has(await text('.card.ex .shadow'), 'using it', 'Use: the line says it is in use');
for (const t of await page.$$('.card.ex .set .tick')) await t.click();
await page.click('[data-act="finish"]'); await page.click('[data-x="save"]');
st = await getState(page);
eq(JSON.stringify(st.sessions[0].exercises[0].shadow), JSON.stringify({ w:110, r:8, why:'last set 17, well past 12 — two steps up', stall:false, used:true, auto:false }),
  'saved: the shadow and used:true are kept for judging it later');
await page.click('[data-tab="today"]');
await start();
await discard();
await start(state(ROW, [ RO(100, [10, 10, 14]) ]));
for (const t of await page.$$('.card.ex .set .tick')) await t.click();
await page.click('[data-act="finish"]'); await page.click('[data-x="save"]');
st = await getState(page);
eq(st.sessions[0].exercises[0].shadow.used, false, 'not tapped: saved with used:false');
eq(st.sessions[0].exercises[0].sets.map(s => s.w).join(), '100,100,100', 'not tapped: today\'s prescription was lifted');

/* ---- 5. no stall flag (v25) ----
   Simulated over a year, the v24 rule fired on ~35% of exposures while the
   lifter was getting stronger. It returns with v26's coach, with a rule that
   can tell slow progress from none. */
await start(state(ROW, [ RO(100, [10, 10, 11]), RO(100, [10, 10, 11]), RO(100, [10, 10, 10]) ]));
eq(await page.$('.card.ex .shadow.stall'), null, 'three flat rep-outs: no stall line any more');
await discard();

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

/* ---- 7. closed loop: a lifter with reserve (trap 17b) ----
   True 1RM 290 rising 0.5 a session. Working sets stop at the target — that
   is the reserve the log never shows — and the rep-out goes to one short of
   capacity. Run it twice from 185: never tapping Use (v23's engine) and
   always tapping it. */
function capacity(max, load, k) { return Math.max(1, Math.floor(30 * (max / load - 1)) - k); }
async function loop(n, useShadow) {
  await boot(page, state(ROW, [ { sets:[[185,8],[185,8],[185,8]] } ]));
  const log = [];
  for (let i = 0; i < n; i++) {
    const max = 290 + i * 0.5;
    await start();
    if (useShadow && await page.$('[data-act="use-shadow"]')) await page.click('[data-act="use-shadow"]');
    const w = Number(await page.inputValue('.card.ex .set input[data-f="w"]'));
    const r = Number(await page.inputValue('.card.ex .set input[data-f="r"]'));
    const rows = await page.$$('.card.ex .set');
    const did = [];
    for (let k = 0; k < rows.length; k++) {
      const last = k === rows.length - 1;
      const reps = last ? Math.max(1, capacity(max, w, k) - 1) : Math.min(r, capacity(max, w, k));
      await rows[k].$eval('input[data-f="r"]', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles:true })); }, String(reps));
      await rows[k].$eval('.tick', el => el.click());
      did.push(reps);
    }
    log.push({ w, r, did, cap: capacity(max, w, 0) });
    await page.click('[data-act="finish"]'); await page.click('[data-x="save"]');
    await page.click('[data-tab="today"]'); await page.waitForSelector('[data-act="start"][data-id="r1"]');
  }
  return log;
}
const v23 = await loop(18, false), v24 = await loop(18, true);
console.log('  v23 engine: ' + v23.map(x => x.w + 'x' + x.did.join('/')).join(' '));
console.log('  rep-out:    ' + v24.map(x => x.w + 'x' + x.did.join('/')).join(' '));
/* Both end at the same weight, and should: that is where his true strength
   is, and no rule can beat it. What the rep-out removes is the lag of
   climbing one rep a session toward a load he could already lift. */
const endA = v23[v23.length - 1].w, endB = v24[v24.length - 1].w;
const reach = log => log.findIndex(x => x.w >= endA);
const mean = log => log.reduce((a, x) => a + x.w, 0) / log.length;
ok(endB >= endA, 'reserve lifter: ends no lighter than v23  [' + endB + ' vs ' + endA + ']');
ok(reach(v24) >= 0 && reach(v24) < reach(v23), 'reserve lifter: reaches ' + endA + ' sooner  [session ' +
  reach(v24) + ' vs ' + reach(v23) + ']');
ok(mean(v24) > mean(v23), 'reserve lifter: lifts more on average  [' + mean(v24).toFixed(1) + ' vs ' + mean(v23).toFixed(1) + ']');
ok(v24.every(x => x.cap >= 8 - 1), 'reserve lifter: never prescribes a load he can\'t do 7 reps with  [' +
  v24.map(x => x.cap).join(',') + ']');
let down = 0; for (let i = 1; i < v24.length; i++) if (v24[i].w < v24[i - 1].w) down++;
ok(down === 0, 'reserve lifter: never steps down while getting stronger (no oscillation)  [' + down + ' drops]');
ok(v24.slice(-4).every(x => x.did[x.did.length - 1] >= 8), 'reserve lifter: settles with rep-outs inside the range');

/* ---- 8. fits a 320 px phone with every line showing ---- */
await page.setViewportSize({ width:320, height:740 });
await start(state(ROW, [ RO(100, [10, 10, 11]), RO(100, [10, 10, 11]), RO(100, [10, 10, 10]) ]));
ok(await page.$('.card.ex .shadow') !== null && await page.$('.card.ex .outhint') !== null, '320 px: shadow and rep-out lines present');
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 px: no sideways scroll');
await discard();
await page.setViewportSize({ width:390, height:844 });

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t32 rep-out');
await browser.close();
