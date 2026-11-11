/* 2.0 package B: one engine. Top set + back-offs (scheme "topback"), no trend load cut,
   stack weights (pins), the presc snapshot, the shadow retired.

   UI-driven wherever there is UI (plan menu, session card, steppers); the engine
   functions are page globals (classic scripts), so a few pure properties are asked
   directly. Seeds are hand-built logs, newest session last in the lists below. */
import { launch, boot, getState, openSettings, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

/* history oldest first: each { sets:[[w, r, role?], ...], kind?, ease?, ago? }.
   Sessions are 3 days apart, the newest 3 days ago, unless `ago` (days) says otherwise. */
function state(planEx, history, settings) {
  const p = Object.assign({ id:'p1', sets:3, mg:'back', scheme:'double', backPct:0.12, pins:[] }, planEx);
  const n = history.length;
  const sessions = history.map((h, i) => {
    const ts = Date.now() - (h.ago != null ? h.ago : (n - i) * 3) * 86400000;
    const e = { id:'e' + i, planId:'p1', name:p.name, reps:p.reps, repTop:p.repTop, bw:p.bw || 0, kind:h.kind || 'reps',
      sets:h.sets.map(([w, r, role]) => Object.assign({ w:String(w), r:String(r), done:true,
        load:p.bw === 2 ? SET.bodyweight - Number(w) : Number(w) }, role ? { role } : {})) };
    return Object.assign({ id:'s' + i, ts, endTs:ts, routineId:'r1', key:'A', name:'Day A', variantId:'v1', exercises:[ e ] },
      h.ease ? { easeBack:true } : {});
  }).reverse();
  return { version:6, settings:Object.assign({}, SET, settings || {}),
    routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[ p ] } ] } ],
    sessions, active:null };
}
const TB = (top, tr, back, br, nb = 2) => ({ sets:[[top, tr, 'top']].concat(Array.from({ length:nb }, () => [back, br, 'back'])) });

const { browser, page, errors } = await launch();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = async sel => { const el = await page.$(sel); return el ? (await el.textContent()).replace(/\s+/g, ' ').trim() : null; };

async function start(st) {
  if (st) await boot(page, st);
  await page.click('[data-act="start"][data-id="r1"]');
  await page.waitForSelector('.card.ex');
  await sleep(250);                                  // let the debounced save land
}
async function discard() { await page.click('[data-act="discard"]'); await page.click('[data-x="ok"]'); }
const setVals = () => page.$$eval('.card.ex .set', rows => rows.map(r => r.querySelector('input[data-f="w"]').value + 'x' + r.querySelector('input[data-f="r"]').value));
const idxLabels = () => page.$$eval('.card.ex .set .idx', b => b.map(x => x.textContent));
const why = () => text('.card.ex .why');
const fn = (name, ...args) => page.evaluate(([n, a]) => window[n](...a), [name, args]);

const RDL = { name:'RDL', reps:6, repTop:10, inc:5, bar:0, scheme:'topback' };

/* ======================= 1. topback: the card, and progression off the top set ======================= */
await start(state(RDL, [ TB(225, 8, 200, 8) ]));
eq((await setVals()).join(), '225x9,200x9,200x9', '1 top 225×8 + two back-offs → top 225 ×9, back-offs 200 ×9');
eq((await idxLabels()).join(), 'T,2,3', '1 the first row says T, the back-offs are numbered');
has(await why(), 'Same weight — go for 9 this time', '1 reads "Same weight — go for 9"');
ok(!/Only \d+ of/.test(await why()), '1 the back-offs are not "dropped sets"');
has(await text('.card.ex .ex-meta'), 'top + 2 back-offs · 6–10', '1 the meta line says top + 2 back-offs');
ok(!(await page.$('.card.ex .outhint')), '1 no rep-out label on a top-set lift (its last set is a back-off)');
{
  /* log it: roles survive the save, and no rep-out flag */
  for (const t of await page.$$('.card.ex .set .tick')) await t.click();
  await page.click('[data-act="finish"] >> nth=0'); await page.waitForSelector('.sheet [data-x="save"]'); await page.click('.sheet [data-x="save"]');
  await sleep(300);
  const st = await getState(page), e = st.sessions[0].exercises[0];
  eq(e.sets.map(s => s.role).join(), 'top,back,back', '1 saved: role top, back, back');
  ok(!e.sets.some(s => s.out), '1 saved: no rep-out flag on a top-set lift');
  eq(e.scheme, 'topback', '1 the session exercise carries its scheme');
  eq(e.presc && e.presc.w, 225, '1 the session exercise carries the prescription snapshot (presc.w)');
  eq(e.presc && e.presc.r, 9, '1 ...and presc.r');
}
await start(state(RDL, [ TB(225, 8, 200, 8), TB(225, 9, 200, 9) ]));
eq((await setVals()).join(), '225x10,200x10,200x10', '1 top 225×9 → ×10');
await discard();
await start(state(RDL, [ TB(225, 10, 200, 10) ]));
eq((await setVals()).join(), '230x6,200x6,200x6', '1 top 225×10 (the top of 6–10) → 230 ×6, back-offs 200');
has(await why(), 'add 5', '1 ...and says why  [' + await why() + ']');
await discard();
/* the top set decides, the back-offs never do: a bad back-off day doesn't hold the lift */
await start(state(RDL, [ TB(225, 10, 200, 4) ]));
eq((await setVals())[0], '230x6', '1 a poor back-off (200×4) doesn\'t hold a top set that reached the top');
await discard();
/* legacy history (no roles, a pyramid down): top = the heaviest set */
await start(state(RDL, [ { sets:[[225, 8], [185, 8], [135, 8]] } ]));
eq((await setVals()).join(), '225x9,200x9,200x9', '1 legacy 225×8, 185×8, 135×8 → top 225 ×9, back-offs 200');
ok(!/Only \d+ of/.test(await why()), '1 legacy fixture: never "Only 1 of 3"');
await discard();
/* step-back worked example (RDL 6–10): top 235×5 after top 230×8 */
await start(state(RDL, [ TB(230, 8, 200, 8), TB(235, 5, 205, 8) ]));
eq((await setVals())[0], '230x6', '1 couldn\'t reach 6 at 235 → back to 230');
has(await why(), 'back to 230 and build up', '1 ...with the words  [' + await why() + ']');
eq((await setVals()).slice(1).join(), '200x6,200x6', '1 ...and back-offs follow the top (200)');
await discard();
/* at an established 230: two tops in a row under 6 → 225 */
await start(state(RDL, [ TB(230, 5, 200, 8), TB(230, 5, 200, 8) ]));
eq((await setVals())[0], '225x6', '1 at an established 230, two tops under 6 → 225');
await discard();
/* failed-jump memory reads top reps only: 235 cost 4 reps → build reps at 230 first */
await start(state(RDL, [ TB(230, 10, 200, 10), TB(235, 4, 205, 8), TB(230, 10, 200, 10) ]));
has(await why(), 'Building reps before 235 again', '1 failed-jump memory on top reps  [' + await why() + ']');
await discard();
/* "+ Set" on a top-set lift is another back-off */
await start(state(RDL, [ TB(225, 8, 200, 8) ]));
await page.click('[data-act="add-set"]');
{
  await page.waitForSelector('.card.ex .set:nth-child(4)');
  eq((await idxLabels()).join(), 'T,2,3,4', '1 + Set adds a numbered row');
  for (const t of await page.$$('.card.ex .set .tick')) await t.click();
  await page.click('[data-act="finish"] >> nth=0'); await page.waitForSelector('.sheet [data-x="save"]'); await page.click('.sheet [data-x="save"]');
  await sleep(300);
  eq((await getState(page)).sessions[0].exercises[0].sets.map(s => s.role).join(), 'top,back,back,back', '1 the added set is saved as a back-off');
}

/* ======================= 2. back-offs are not "dropped"; a legacy drop after a back-off still is (amendment 11) ======================= */
{
  const DBL = Object.assign({}, RDL, { scheme:'double' });
  await start(state(DBL, [ TB(225, 8, 200, 8) ]));
  ok(!/Only \d+ of/.test(await why()), '2 a row switched back to double: role-tagged history never says "Only N of M"  [' + await why() + ']');
  await discard();
  eq(await fn('droppedSets', [{ w:'225', r:'8' }, { w:'200', r:'8', role:'back' }, { w:'185', r:'8' }], 225, 0), 1,
    '2 droppedSets: a legacy dropped set after a role:"back" set is still counted (and the back-off is not)');
  eq(await fn('droppedSets', [{ w:'225', r:'8', role:'top' }, { w:'200', r:'8', role:'back' }, { w:'200', r:'8', role:'back' }], 225, 0), 0,
    '2 droppedSets: planned back-offs are not dropped sets');
}

/* ======================= 3. the back-off floor (amendment 10) ======================= */
{
  eq(await fn('backOffW', 45, { bar:45, inc:5, backPct:0.12 }), 45, '3 top = the bar: back-off = the top (nothing lighter)');
  eq(await fn('backOffW', 50, { bar:45, inc:5, backPct:0.12 }), 45, '3 top 50 on a 45 bar: back-off 45, never below the bar');
  eq(await fn('backOffW', 225, { bar:0, inc:5, backPct:0.12 }), 200, '3 225 → 200 on the grid');
  eq(await fn('backOffW', 5, { bar:0, inc:5, backPct:0.12 }), 5, '3 a 5 lb top has nothing lighter: back-off = the top');
  eq(await fn('backOffW', 20, { pins:[20, 27.5, 35], inc:5, backPct:0.12 }), 20, '3 top at the lowest pin: back-off = the top');
  eq(await fn('backOffW', 35, { pins:[20, 27.5, 35], inc:5, backPct:0.12 }), 27.5, '3 top 35 on a stack: nearest pin below 30.8 is 27.5');
  eq(await fn('backOffW', 27.5, { pins:[20, 27.5, 35], inc:5, backPct:0.12 }), 20, '3 top 27.5: 20');
  await start(state(Object.assign({}, RDL, { bar:45 }), [ TB(45, 7, 45, 7) ]));
  eq((await setVals()).join(), '45x8,45x8,45x8', '3 on the card: back-offs equal the top');
  has(await text('.card.ex .callout'), 'No lighter back-off here', '3 ...and the card says so');
  await discard();
  await start(state(RDL, [ TB(225, 8, 200, 8) ]));
  ok(!(await text('.card.ex .callout')).includes('No lighter back-off'), '3 a normal top-set card has no such line');
  await discard();
}

/* ======================= 4. the menu: top set + back-offs switch, stack weights field ======================= */
{
  const DBL = Object.assign({}, RDL, { scheme:'double' });
  await boot(page, state(DBL, [ { sets:[[225, 8], [225, 8], [225, 8]] } ]));
  await page.click('[data-tab="plan"]');
  await page.click('[data-act="pex-edit"]');
  await page.waitForSelector('[data-x="topback"]');
  eq(await page.getAttribute('[data-x="topback"]', 'aria-checked'), 'false', '4 the switch starts off');
  await page.click('[data-x="topback"]');
  await page.waitForSelector('[data-x="topback"]');
  eq(await page.getAttribute('[data-x="topback"]', 'aria-checked'), 'true', '4 tapping it turns it on (the menu re-opens)');
  await sleep(300);
  eq((await getState(page)).routines[0].variants[0].exercises[0].scheme, 'topback', '4 ...and the plan row stores it');
  await page.click('[data-x="done"]');
  await page.click('[data-act="pex-edit"]'); await page.waitForSelector('[data-x="topback"]');
  eq(await page.getAttribute('[data-x="topback"]', 'aria-checked'), 'true', '4 it persists across the menu');
  /* stack weights: typed once, stored sorted and de-duplicated, re-read tidy */
  await page.fill('[data-x="pins"]', '35, 20, 27.5, 27.5');
  await sleep(300);
  eq(JSON.stringify((await getState(page)).routines[0].variants[0].exercises[0].pins), '[20,27.5,35]', '4 "35, 20, 27.5, 27.5" is stored as [20,27.5,35]');
  await page.press('[data-x="pins"]', 'Tab');
  eq(await page.inputValue('[data-x="pins"]'), '20, 27.5, 35', '4 the field re-reads "20, 27.5, 35"');
  await page.fill('[data-x="pins"]', '35');
  await sleep(300);
  eq(JSON.stringify((await getState(page)).routines[0].variants[0].exercises[0].pins), '[]', '4 fewer than two numbers is no stack');
  await page.fill('[data-x="pins"]', '20 27.5;35');
  await sleep(300);
  eq(JSON.stringify((await getState(page)).routines[0].variants[0].exercises[0].pins), '[20,27.5,35]', '4 spaces and semicolons separate too');
  await page.click('[data-x="done"]');
  await page.click('[data-act="pex-edit"]'); await page.waitForSelector('[data-x="pins"]');
  eq(await page.inputValue('[data-x="pins"]'), '20, 27.5, 35', '4 reopened: the pins are there');
  await page.click('[data-x="done"]');
  /* a bodyweight lift has no top-set switch */
  const BW = { name:'Pull-up', reps:5, repTop:8, bw:1 };
  await boot(page, state(BW, [ { sets:[[0, 6], [0, 6], [0, 6]] } ]));
  await page.click('[data-tab="plan"]'); await page.click('[data-act="pex-edit"]'); await page.waitForSelector('[data-x="pins"]');
  ok(!(await page.$('[data-x="topback"]')), '4 no top-set switch on bodyweight work');
  await page.click('[data-x="done"]');
}

/* ======================= 5. stack weights: every notch snaps ======================= */
const PINS = { name:'Cable Row', reps:8, repTop:12, pins:[20, 27.5, 35] };
await start(state(PINS, [ { sets:[[27.5, 9], [27.5, 9], [27.5, 9]] } ]));
eq((await setVals()).join(), '27.5x10,27.5x10,27.5x10', '5 mid-range at 27.5: same weight, one more rep');
await page.click('.card.ex .set:nth-child(1) [data-act="step"][data-f="w"][data-d="1"]');
eq((await setVals())[0], '35x10', '5 the card\'s + goes to the next pin (35)');
await page.click('.card.ex .set:nth-child(1) [data-act="step"][data-f="w"][data-d="1"]');
eq((await setVals())[0], '35x10', '5 + at the top of the stack stays');
await page.click('.card.ex .set:nth-child(1) [data-act="step"][data-f="w"][data-d="-1"]');
await page.click('.card.ex .set:nth-child(1) [data-act="step"][data-f="w"][data-d="-1"]');
eq((await setVals())[0], '20x10', '5 − goes down a pin at a time (35 → 27.5 → 20)');
await page.click('.card.ex .set:nth-child(1) [data-act="step"][data-f="w"][data-d="-1"]');
eq((await setVals())[0], '20x10', '5 − at the bottom of the stack stays');
await discard();
await start(state(PINS, [ { sets:[[27.5, 12], [27.5, 12], [27.5, 12]] } ]));
eq((await setVals()).join(), '35x8,35x8,35x8', '5 topping out at 27.5 → the next pin, 35, reps back to 8');
has(await why(), 'up to 35', '5 ...and says "up to 35"  [' + await why() + ']');
await discard();
await start(state(PINS, [ { sets:[[35, 12], [35, 12], [35, 12]] } ]));
eq((await setVals()).join(), '35x13,35x13,35x13', '5 topping out at 35, the end of the stack: reps are the only way up');
has(await why(), 'Top of the stack — go for 13', '5 ...and says so  [' + await why() + ']');
await discard();
await start(state(PINS, [ { sets:[[27.5, 12], [27.5, 12], [27.5, 12]] }, { sets:[[35, 6], [35, 6], [35, 6]] } ]));
eq((await setVals())[0], '27.5x8', '5 couldn\'t reach 8 at 35 right after a jump → back to the pin it came from, 27.5');
await discard();
{
  const P2 = Object.assign({}, PINS, { pins:[20, 22.5, 27.5, 35] });
  await start(state(P2, [ { sets:[[27.5, 6], [27.5, 6], [27.5, 6]] }, { sets:[[27.5, 6], [27.5, 6], [27.5, 6]] } ]));
  eq((await setVals())[0], '22.5x8', '5 two misses in a row at an established 27.5 → the pin below (22.5)');
  await discard();
}
await start(state(PINS, [ { sets:[[35, 10], [35, 10], [35, 10]] } ], { deloadUntil:Date.now() + 5 * 864e5 }));
eq((await setVals())[0], '27.5x8', '5 deload week at 35: the nearest pin to 90% (31.5) below is 27.5');
has(await why(), 'Deload', '5 ...kind deload');
await discard();
/* assisted work: harder = the next pin DOWN */
{
  const AS = { name:'Assisted Pull-up', reps:6, repTop:10, bw:2, pins:[20, 30, 40] };
  await start(state(AS, [ { sets:[[40, 10], [40, 10], [40, 10]] } ]));
  eq((await setVals())[0], '30x6', '5 assisted at 40, topped out: the next pin DOWN, 30');
  has(await why(), 'assist down to 30', '5 ...says "assist down to 30"  [' + await why() + ']');
  await page.click('.card.ex .set:nth-child(1) [data-act="step"][data-f="w"][data-d="1"]');
  eq((await setVals())[0], '40x6', '5 on assisted work the + stepper is the bigger number: 30 → 40');
  await discard();
}
/* no pins: exactly as before */
await start(state({ name:'Cable Row', reps:8, repTop:12 }, [ { sets:[[27.5, 12], [27.5, 12], [27.5, 12]] } ]));
eq((await setVals())[0], '32.5x8', '5 no pins: +5 exactly as before');
has(await why(), 'add 5 lb', '5 ...with the old words  [' + await why() + ']');
await page.click('.card.ex .set:nth-child(1) [data-act="step"][data-f="w"][data-d="1"]');
eq((await setVals())[0], '37.5x8', '5 no pins: the stepper adds 5');
await discard();
/* one pin is not a stack */
await start(state({ name:'Cable Row', reps:8, repTop:12, pins:[27.5] }, [ { sets:[[27.5, 12], [27.5, 12], [27.5, 12]] } ]));
eq((await setVals())[0], '32.5x8', '5 a single pin is ignored');
await discard();
/* pure helpers on a stack */
{
  const ex = { pins:[20, 27.5, 35], inc:5 }, ax = { pins:[20, 30, 40], bw:2, inc:5 };
  eq(await fn('harderEx', 27.5, ex), 35, '5 harderEx 27.5 → 35');
  eq(await fn('harderEx', 35, ex), 35, '5 harderEx at the end of the stack returns w');
  eq(await fn('lighterEx', 27.5, ex), 20, '5 lighterEx 27.5 → 20');
  eq(await fn('lighterEx', 20, ex), 20, '5 lighterEx at the bottom returns w');
  eq(await fn('easierEx', 35, ex), 27.5, '5 easierEx 35 → nearest pin to 31.5 below = 27.5');
  eq(await fn('easierEx', 27.5, ex), 20, '5 easierEx 27.5 → 20');
  eq(await fn('harderEx', 40, ax), 30, '5 assisted harderEx 40 → 30');
  eq(await fn('lighterEx', 30, ax), 40, '5 assisted lighterEx 30 → 40');
  eq(await fn('stepWeight', '27.5', 1, ex), 35, '5 stepWeight + → 35');
  eq(await fn('stepWeight', '27.5', -1, ex), 20, '5 stepWeight − → 20');
  eq(await fn('stepWeight', '30', 1, { inc:5 }), 35, '5 stepWeight without pins adds the step');
  eq(await fn('nearestPin', 30, [20, 40]), 40, '5 nearestPin: a tie goes to the heavier');
}
/* a changed unit converts the stack */
{
  await boot(page, state(PINS, [ { sets:[[27.5, 9], [27.5, 9], [27.5, 9]] } ]));
  await openSettings(page);
  await page.selectOption('[data-set="unit"]', 'kg');
  await page.waitForSelector('.sheet [data-x="conv"]');
  await page.click('.sheet [data-x="conv"]');
  await sleep(300);
  eq(JSON.stringify((await getState(page)).routines[0].variants[0].exercises[0].pins), '[9.1,12.5,15.9]', '5 lb → kg converts the stack weights');
}

/* ======================= 6. no trend load cut on a sliding history ======================= */
{
  const DB = { name:'DB Row', reps:8, repTop:12 };
  const slide = [[10, 10, 10], [10, 10, 9], [10, 9, 9], [9, 9, 8], [9, 8, 8], [8, 8, 8], [8, 8, 8], [8, 8, 8]].map(rs => ({ sets:rs.map(r => [100, r]) }));
  await start(state(DB, slide));
  has(await text('.card.ex .ex-meta'), 'SLIPPING', '6 the badge still reads the slide');
  eq((await setVals())[0].split('x')[0], '100', '6 ...but the prescription does not cut the load');
  ok(!/Sliding|Already backed off|You dropped to|back off/.test(await why()), '6 ...and does not say it did  [' + await why() + ']');
  await discard();
  /* a chosen drop is a reset only if he stayed there: one light day then back at 65 is not a new baseline */
  const hs = (ws) => ws.map(w => ({ sets:[[w, 10], [w, 10], [w, 10]] }));
  const sk = await page.evaluate(() => {
    const mk = w => ({ sets:[{ w:String(w), r:'10' }], bw:0, kind:'reps', ts:0 });
    const stay = window.sinceChosenDrop([mk(55), mk(65), mk(65)]), back = window.sinceChosenDrop([mk(65), mk(55), mk(65), mk(65)]);
    return [stay.length, back.length];
  });
  eq(sk.join(), '1,4', '6 sinceChosenDrop: staying at the lower load resets the trend (1); one light day then back does not (4)');
}

/* ======================= 7. presc: set after every prefill adjustment, the step-back included (amendment 5) ======================= */
{
  await start(state({ name:'DB Row', reps:8, repTop:12, stepBack:true }, [ { sets:[[100, 10], [100, 10], [100, 10]], ago:40 } ]));
  const e = (await getState(page)).active.exercises[0];
  eq(JSON.stringify(e.presc), '{"w":95,"r":11}', '7 a step-back session: presc is the lighter load the card shows, not the engine\'s first answer');
  eq(e.sets.map(s => s.w).join(), '95,95,95', '7 ...and the sets carry it');
  ok(e.sets.every(s => String(s.w) === String(e.presc.w) && String(s.r) === String(e.presc.r)), '7 an untouched step-back session matches presc exactly (not overridden)');
  has(e.why, 'one step lighter', '7 ...with its reason');
  await discard();
  /* step-back on a stack goes to the pin below */
  await start(state({ name:'Cable Row', reps:8, repTop:12, stepBack:true, pins:[20, 27.5, 35] }, [ { sets:[[35, 10], [35, 10], [35, 10]], ago:40 } ]));
  eq(JSON.stringify((await getState(page)).active.exercises[0].presc), '{"w":27.5,"r":11}', '7 step-back on a stack: the pin below');
  await discard();
  /* a top-set lift's step-back drags the back-offs down with it */
  await start(state(Object.assign({}, RDL, { stepBack:true }), [ Object.assign(TB(225, 8, 200, 8), { ago:40 }) ]));
  const t = (await getState(page)).active.exercises[0];
  eq(t.sets.map(s => s.w).join(), '220,195,195', '7 step-back on a top-set lift: top 225 → 220, back-offs recomputed (195)');
  eq(t.presc.w, 220, '7 ...presc is the lighter top');
  await discard();
  /* an ordinary session: presc = the prefill */
  await start(state({ name:'DB Row', reps:8, repTop:12 }, [ { sets:[[100, 12], [100, 12], [100, 12]] } ]));
  eq(JSON.stringify((await getState(page)).active.exercises[0].presc), '{"w":105,"r":8}', '7 an ordinary session: presc is the prefill');
  await discard();
  /* a lift with no history: no weight to snapshot */
  await start(state({ name:'DB Row', reps:8, repTop:12 }, []));
  eq(JSON.stringify((await getState(page)).active.exercises[0].presc), '{"w":"","r":8}', '7 a new lift: presc.w is blank');
  await discard();
}

/* ======================= 8. the shadow is gone; old shadow data is inert ======================= */
{
  const legacy = state({ name:'DB Row', reps:8, repTop:12 }, [ { sets:[[100, 10], [100, 10], [100, 13]] } ], { repOutDefault:true });
  legacy.sessions[0].exercises[0].shadow = { w:105, r:8, why:'last set 13 — one step up', steps:1, stall:false, used:true };
  legacy.sessions[0].exercises[0].tgt = { w:100, r:10 };
  await start(legacy);
  ok(!(await page.$('.card.ex .shadow')), '8 no shadow strip on the card');
  ok(!(await page.$('[data-act="use-shadow"]')), '8 no "Use" button');
  ok(!(await text('.card.ex .callout')).includes('Rep-out method'), '8 no "Rep-out method" text');
  eq((await setVals())[0], '100x11', '8 an old session with a shadow and repOutDefault:true prescribes by double progression (100 ×11)');
  for (const t of await page.$$('.card.ex .set .tick')) await t.click();
  await page.click('[data-act="finish"] >> nth=0'); await page.waitForSelector('.sheet [data-x="save"]'); await page.click('.sheet [data-x="save"]');
  await sleep(300);
  const st = await getState(page);
  eq(st.sessions[1].exercises[0].shadow && st.sessions[1].exercises[0].shadow.w, 105, '8 the old record keeps its shadow data');
  eq(st.settings.repOutDefault, true, '8 repOutDefault is left in the stored data');
  ok(!('shadow' in st.sessions[0].exercises[0]), '8 a new session carries no shadow');
  ok(!(await text('#view')).includes('Rep-out method'), '8 Progress has no rep-out method card');
  /* the functions are gone */
  const gone = await page.evaluate(() => [typeof shadowPrescribe, typeof repOutScore, typeof repOutCard, typeof repOutOf, typeof OUT_JUMP2]);
  eq(gone.join(), 'undefined,undefined,undefined,undefined,undefined', '8 shadowPrescribe, repOutScore, repOutCard, repOutOf and OUT_JUMP2 are gone');
}

/* ======================= 9. eased sessions: out of the engine's history, back in for the scorecard (amendment 3) ======================= */
{
  await boot(page, state({ name:'DB Row', reps:8, repTop:12 }, [ { sets:[[100, 10], [100, 10], [100, 10]] }, { sets:[[90, 10], [90, 10], [90, 10]], ease:true } ]));
  const r = await page.evaluate(() => [exWorking('DB Row').length, exWorking('DB Row', true).length, exSessions('DB Row')[0].easeBack,
    exWorkingP('DB Row', {}).length, exWorkingP('DB Row', {}, true).length]);
  eq(r.join(), '1,2,true,1,2', '9 exWorking drops easeBack sessions; withEased puts them back (also on exWorkingP)');
  await start();
  eq((await setVals())[0], '100x11', '9 the next prescription reads the session before the eased day');
  await discard();
  /* exWorkingP projects a top-set lift's history to its top set */
  await boot(page, state(RDL, [ TB(225, 8, 200, 8) ]));
  const pj = await page.evaluate(() => { const h = exWorkingP('RDL', planExByName('RDL'))[0]; return [h.sets.length, h.sets[0].w, h.sets[0].role]; });
  eq(pj.join(), '1,225,top', '9 exWorkingP on a topback row: one set, the top');
  const plain = await page.evaluate(() => exWorkingP('RDL', {})[0].sets.length);
  eq(plain, 1, '9 ...a plain row reads a role-tagged session by its top set too (back-offs are not working sets of it)');
}

/* ======================= 10. review fixes ======================= */
{
  /* 10.1 straight-set rows step back too (the trend cut was the only thing that ever took a straight lift down) */
  const SQ = { name:'Back Squat', reps:8, repTop:0 };
  await start(state(SQ, [ { sets:[[100, 6], [100, 6], [100, 5]] }, { sets:[[100, 7], [100, 7], [100, 6]] } ]));
  eq((await setVals())[0], '95x8', '10.1 straight 3×8: 100×7,7,6 after 100×6,6,5 → one step lighter (95), not "run it back" for ever');
  has(await why(), 'back to 95', '10.1 ...with the words  [' + await why() + ']');
  await discard();
  await start(state(SQ, [ { sets:[[100, 7], [100, 7], [100, 6]] } ]));
  eq((await setVals())[0], '100x8', '10.1 one miss alone holds');
  has(await why(), 'run it back', '10.1 ...and says so');
  await discard();
  await start(state(SQ, [ { sets:[[95, 8], [95, 8], [95, 8]] }, { sets:[[100, 6], [100, 6], [100, 5]] } ]));
  eq((await setVals())[0], '95x8', '10.1 straight: right after a jump that failed, back to the load it came from');
  await discard();
  await start(state(Object.assign({}, SQ, { pins:[80, 90, 100, 110] }), [ { sets:[[100, 6], [100, 6], [100, 5]] }, { sets:[[100, 7], [100, 7], [100, 6]] } ]));
  eq((await setVals())[0], '90x8', '10.1 straight on a stack: the pin below (10% is the MAX_CUT edge)');
  await discard();
  await start(state(Object.assign({}, SQ, { pins:[50, 100] }), [ { sets:[[100, 6], [100, 6], [100, 5]] }, { sets:[[100, 7], [100, 7], [100, 6]] } ]));
  eq((await setVals())[0], '100x8', '10.1 a step bigger than MAX_CUT (50%) holds instead');
  await discard();
  /* 10.2 a row switched to double reads only the top of top + back-off sessions */
  const DBL = Object.assign({}, RDL, { scheme:'double' });
  await start(state(DBL, [ TB(225, 8, 200, 10) ]));
  eq((await setVals()).join(), '225x6,225x6,225x6', '10.2 topback → double: 225×8 top + 200×10,10 back-offs → every set at the top load, bottom of the range (not 205×6)');
  eq(await why(), '+1Switched to straight sets — all sets at 225, aim for 6s', '10.2 ...with the switch words  [' + await why() + ']');
  await discard();
  await start(state(DBL, [ TB(225, 10, 200, 6) ]));
  eq((await setVals()).join(), '225x6,225x6,225x6', '10.2 ...however the top set went, the first double prescription is 225 ×6 (the back-offs never hold or cut it)');
  await discard();
  await start(state(DBL, [ TB(225, 8, 200, 10), { sets:[[225, 6], [225, 6], [225, 6]] } ]));
  eq((await setVals()).join(), '225x7,225x7,225x7', '10.2 the next session is ordinary double progression (225×6 → ×7)');
  await discard();
  /* the reverse: double → topback starts from the top set, one rep more capped at the top of the range */
  await start(state(RDL, [ { sets:[[225, 8], [225, 8], [225, 8]] } ]));
  eq((await setVals()).join(), '225x9,200x9,200x9', '10.2 double → topback: from the top set (225×8) one more rep (9), back-offs 200');
  await discard();
  await start(state(RDL, [ { sets:[[225, 10], [225, 10], [225, 10]] } ]));
  eq((await setVals())[0], '230x6', '10.2 ...and a top set at the top of the range steps up');
  await discard();
  /* 10.3 back-offs on a stack never go below the bar */
  eq(await fn('backOffW', 50, { bar:45, pins:[42.5, 47.5, 50], inc:5, backPct:0.12 }), 47.5, '10.3 top 50, bar 45, pins [42.5,47.5,50]: 47.5, not 42.5');
  eq(await fn('backOffW', 50, { bar:45, pins:[42.5, 50], inc:5, backPct:0.12 }), 50, '10.3 nothing at or above the bar below the top: back-off = the top');
  eq(await fn('backOffW', 50, { bar:0, pins:[42.5, 47.5, 50], inc:5, backPct:0.12 }), 42.5, '10.3 no bar: nearest pin to 44 (42.5)');
  await start(state({ name:'Leg Extension', reps:6, repTop:10, bar:45, scheme:'topback', pins:[42.5, 47.5, 50] }, [ TB(50, 7, 47.5, 7) ]));
  eq((await setVals()).join(), '50x8,47.5x8,47.5x8', '10.3 on the card: back-offs 47.5');
  await discard();
  /* 10.4 the end of a stack: a near-miss or a top-reached target never drops below the top */
  const ST = { name:'Cable Row', reps:8, repTop:10, pins:[20, 27.5, 35] };
  await start(state(ST, [ { sets:[[35, 10], [35, 10], [35, 8]] } ]));
  eq((await setVals())[0], '35x10', '10.4 8–10 at the top pin, 35×10,10,8: the target is 10, not 9');
  await discard();
  await start(state(Object.assign({}, ST, { reps:8, repTop:12 }), [ { sets:[[35, 12], [35, 12], [35, 11]] } ]));
  eq((await setVals())[0], '35x12', '10.4 near-miss at the end of the stack (12,12,11): go for 12');
  has(await why(), 'Top of the stack — go for 12', '10.4 ...says so  [' + await why() + ']');
  await discard();
  await start(state(ST, [ { sets:[[35, 9], [35, 9], [35, 8]] } ]));
  eq((await setVals())[0], '35x9', '10.4 an ordinary 9,9,8 at the end of the stack: one more rep');
  await discard();
}

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t49 engine 2.0');
await browser.close();
