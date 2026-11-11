/* 2.0 package C: the workout screen. Set-1 cascade, the usual-load chip, the ease-back
   chip, generated warm-ups, the hit targets (S4) and "nothing re-renders on the logging
   path" (trap 1).

   Real taps (touch) at 390x844 and 320 px. Every seed is a hand-built log; the engine
   half (usualOf, easeBack outside exWorking, the ramp) is asked through the UI. */
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { launch, boot, getState, ok, eq, has, report, URL } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:Date.now() };
const NOWARM = n => ({ warmups:{ [n.toLowerCase()]:false } });

/* history newest first: { ago (days), sets:[[w, r, role?, extra?]], kind?, ease?, ex?:{} } */
function state(planEx, history, settings) {
  const p = Object.assign({ id:'p1', sets:3, reps:8, repTop:12, bar:0, mg:'chest', scheme:'double', backPct:0.12, pins:[] }, planEx);
  const sessions = history.map((h, i) => {
    const ts = Date.now() - h.ago * 86400000;
    const e = Object.assign({ id:'e' + i, planId:'p1', name:p.name, reps:p.reps, repTop:p.repTop, bw:0, bar:p.bar,
      kind:h.kind === undefined ? 'reps' : h.kind,
      sets:(h.sets || []).map(([w, r, role, extra]) => Object.assign({ w:String(w), r:String(r), done:true, load:Number(w) },
        role ? { role } : {}, extra || {})) }, h.ex || {});
    if (!e.kind) delete e.kind;
    return Object.assign({ id:'s' + i, ts, endTs:ts, routineId:'r1', key:'A', name:'Day A', variantId:'v1', exercises:h.empty ? [] : [ e ] },
      h.ease ? { easeBack:true } : {});
  });
  return { version:6, settings:Object.assign({}, SET, NOWARM(p.name), settings || {}),
    routines:[ { id:'r1', key:'A', name:'Day A', optional:false, variants:[ { id:'v1', label:'', exercises:[ p ] } ] } ],
    sessions, active:null };
}
const X3 = (w, r) => [[w, r], [w, r], [w, r]];

const { browser, page, errors } = await launch();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const text = async (pg, sel) => { const el = await pg.$(sel); return el ? (await el.textContent()).replace(/\s+/g, ' ').trim() : null; };

async function start(pg, st) {
  if (st) await boot(pg, st);
  await pg.tap('[data-act="start"][data-id="r1"]');
  await pg.waitForSelector('.card.ex');
  await sleep(200);
}
const rows = pg => pg.$$eval('.card.ex[data-ei="0"] .set', rs => rs.map(r => ({
  warm:r.classList.contains('warm'), done:r.classList.contains('done'),
  w:r.querySelector('input[data-f="w"]').value, r:r.querySelector('input[data-f="r"]').value })));
const ws = async pg => (await rows(pg)).filter(r => !r.warm).map(r => r.w);
const rs = async pg => (await rows(pg)).filter(r => !r.warm).map(r => r.r);
const W = (si) => `.set[data-ei="0"][data-si="${si}"] input[data-f="w"]`;
const stepBtn = (si, f, d) => `.set[data-ei="0"][data-si="${si}"] [data-act="step"][data-f="${f}"][data-d="${d}"]`;
const tickBtn = si => `.set[data-ei="0"][data-si="${si}"] .tick`;
/* type a finished number and commit it (Enter blurs the field, which is what dismissing the keyboard does) */
async function typeInto(pg, sel, v) {
  await typeRaw(pg, sel, v);
  await pg.keyboard.press('Enter');
}
async function typeRaw(pg, sel, v) {
  await pg.tap(sel);
  await pg.keyboard.press('Control+A');
  await pg.keyboard.type(String(v));
}
async function settleSave(pg) { await sleep(260); return getState(pg); }
/* mark every row, input, button and the callout so we can tell, later, that none of them was replaced */
async function mark(pg) {
  return pg.evaluate(() => {
    window.__orig = [...document.querySelectorAll('.card.ex, .card.ex .callout, .card.ex .set, .card.ex .set input, .card.ex .set button, .card.ex .ex-foot button')];
    return window.__orig.length;
  });
}
const sameDom = pg => pg.evaluate(() => ({
  alive:window.__orig.every(e => e.isConnected),
  now:[...document.querySelectorAll('.card.ex, .card.ex .callout, .card.ex .set, .card.ex .set input, .card.ex .set button, .card.ex .ex-foot button')].length,
  was:window.__orig.length }));
async function finish(pg) {
  await pg.tap('button[data-act="finish"] >> nth=0');
  await pg.waitForSelector('.sheet [data-x="save"]');
  await pg.tap('.sheet [data-x="save"]');
  await pg.waitForFunction(() => !document.querySelector('.backdrop'));
  await sleep(300);
}
async function toToday(pg) { await pg.tap('[data-tab="today"]'); await pg.waitForSelector('[data-act="start"]'); }

/* ============================ 1. the set-1 cascade ============================ */
async function cascadeSuite(pg, tag) {
  const bench = { name:'Cascade Press', bar:45 };
  await start(pg, state(bench, [ { ago:3, sets:X3(135, 10) } ]));
  eq((await ws(pg)).join(), '135,135,135', tag + ' 1 prefill: three sets at 135');
  const n = await mark(pg);
  const plates2 = await text(pg, '.set[data-si="2"] .plates');

  await pg.tap(stepBtn(0, 'w', -1)); await pg.tap(stepBtn(0, 'w', -1));
  eq((await ws(pg)).join(), '125,125,125', tag + ' 1 two "−" taps on set 1 → all three follow (125)');
  ok((await text(pg, '.set[data-si="2"] .plates')) !== plates2, tag + ' 1 the followers\' plate line was refreshed too');
  let d = await sameDom(pg);
  ok(d.alive && d.now === d.was && d.was === n, tag + ' 1 no row, input or button was replaced by a stepper cascade (Trap 1)');
  let st = await settleSave(pg);
  eq(st.active.exercises[0].sets.map(s => s.w).join(), '125,125,125', tag + ' 1 and the state matches the screen');

  await typeInto(pg, W(0), 140);
  eq((await ws(pg)).join(), '140,140,140', tag + ' 1 typing 140 into set 1 → 140,140,140 (every keystroke followed)');
  d = await sameDom(pg);
  ok(d.alive && d.now === d.was, tag + ' 1 typing into set 1 replaced nothing');

  await typeInto(pg, W(2), 150);
  await typeInto(pg, W(0), 145);
  eq((await ws(pg)).join(), '145,145,150', tag + ' 1 a set edited by hand (set 3 = 150) is left alone');

  await pg.tap(tickBtn(1));                                       // tick set 2 at 145
  await typeInto(pg, W(0), 160);
  eq((await ws(pg)).join(), '160,145,150', tag + ' 1 a done set never changes (set 2 stays 145)');
  const reps = await rs(pg);
  await pg.tap(stepBtn(0, 'r', 1));
  eq((await rs(pg)).slice(1).join(), reps.slice(1).join(), tag + ' 1 reps never cascade');
  st = await settleSave(pg);
  eq(st.active.exercises[0].sets.map(s => s.w).join(), '160,145,150', tag + ' 1 saved the same');
  d = await sameDom(pg);
  ok(d.alive && d.now === d.was, tag + ' 1 after steppers, typing and a tick every original node is still the one on screen');
}
await cascadeSuite(page, '[390]');

/* ---- warm-ups never change under a cascade ---- */
await start(page, state({ name:'Warm Press', bar:45 }, [ { ago:3, sets:X3(135, 10) } ], { warmups:{} }));
{
  const before = (await rows(page)).filter(r => r.warm).map(r => r.w + 'x' + r.r);
  ok(before.length >= 2, '1 a 135 press starts with a generated ramp (' + before.join(' ') + ')');
  const si = (await rows(page)).findIndex(r => !r.warm);
  await page.tap(stepBtn(si, 'w', 1));
  eq((await ws(page)).join(), '140,140,140', '1 the first WORKING set is set 1 (the ramp rows are not): stepping it moves all three');
  eq((await rows(page)).filter(r => r.warm).map(r => r.w + 'x' + r.r).join(), before.join(), '1 the warm-up rows did not move');
}

/* ---- top set + back-offs: the back-offs follow while they are still the planned back-off ---- */
{
  const RDL = { name:'Cascade RDL', reps:6, repTop:10, inc:5, bar:45, scheme:'topback' };
  await start(page, state(RDL, [ { ago:3, sets:[[225, 8, 'top'], [200, 8, 'back'], [200, 8, 'back']] } ]));
  eq((await ws(page)).join(), '225,200,200', '1 top set 225 + back-offs 200');
  await typeInto(page, W(0), 235);
  eq((await ws(page)).join(), '235,205,205', '1 top 225→235: the back-offs follow to 205 (not 235)');
  await typeInto(page, W(2), 210);                                  // a back-off set by hand
  await typeInto(page, W(0), 245);
  eq((await ws(page)).join(), '245,215,210', '1 a back-off edited by hand stays, the planned one follows (215)');
}

/* ============================ 2. "override load on 3 sets" ============================ */
{
  await start(page, state({ name:'Override Press' }, [ { ago:3, sets:X3(135, 10) } ]));
  let taps = 0;
  await page.tap(stepBtn(0, 'w', 1)); taps++;
  await page.tap(tickBtn(0)); taps++;
  const st = await settleSave(page);
  eq(taps, 2, '2 override the load on three sets: 1 "+" and 1 tick on set 1 (was 3 steppers + 3 ticks = 6)');
  eq(st.active.exercises[0].sets.map(s => s.w).join(), '140,140,140', '2 and sets 2 and 3 already carry it');
}

/* ============================ 3. the usual-load chip ============================ */
const UP = { name:'Usual Press' };
{
  /* 65×10,10,9 then one light day at 55×10×3 */
  await start(page, state(UP, [ { ago:3, sets:X3(55, 10) }, { ago:6, sets:[[65, 10], [65, 10], [65, 9]] } ]));
  eq(await text(page, '.callout .revert.usual'), 'Usual: 65 × 10', '3 one self-chosen light day → "Usual: 65 × 10"');
  ok(!(await page.$('.callout [data-act="revert"]:not(.usual)')), '3 ...and no "Keep" chip beside it');
  const whyBefore = await text(page, '.callout .why');
  const n = await mark(page);
  await page.tap('.callout .revert.usual');
  eq((await ws(page)).join(), '65,65,65', '3 one tap puts every undone working set at 65');
  eq((await rs(page)).join(), '10,10,10', '3 ...and at 10 reps');
  ok(!(await page.$('.callout .revert')), '3 the chip is gone');
  const whyAfter = await text(page, '.callout .why');
  ok(whyBefore !== whyAfter && /go for 10/.test(whyAfter), '3 the why line was rewritten in place (' + whyAfter + ')');
  const d = await sameDom(page);
  ok(d.alive && d.now === d.was && d.was === n, '3 nothing was re-rendered by the chip');
  const st = await settleSave(page);
  eq(st.active.exercises[0].sets.map(s => s.w + 'x' + s.r).join(), '65x10,65x10,65x10', '3 saved');
  has(whyAfter, st.active.exercises[0].why, '3 the saved why is the one on screen');
  ok(!st.active.exercises[0].usual, '3 an applied chip is not offered again');
}
{
  /* it leaves in place on the first tick */
  await start(page, state(UP, [ { ago:3, sets:X3(55, 10) }, { ago:6, sets:[[65, 10], [65, 10], [65, 9]] } ]));
  ok(!!(await page.$('.callout .revert.usual')), '3 chip present before any set is done');
  await page.tap(tickBtn(0));
  ok(!(await page.$('.callout .revert.usual')), '3 once a working set is done the chip leaves the page in place');
}
async function noUsual(label, history) {
  await start(page, state(UP, history));
  ok(!(await page.$('.callout .revert.usual')), '3 no chip: ' + label);
}
await noUsual('two light sessions in a row are the new baseline',
  [ { ago:3, sets:X3(55, 10) }, { ago:6, sets:X3(55, 10) }, { ago:9, sets:X3(65, 10) } ]);
await noUsual('the light session was the app\'s own deload (kind "deload")',
  [ { ago:3, sets:X3(55, 10), kind:'deload' }, { ago:6, sets:[[65, 10], [65, 10], [65, 9]] } ]);
await noUsual('a legacy session with no kind can\'t say who chose it',
  [ { ago:3, sets:X3(55, 10), kind:'' }, { ago:6, sets:[[65, 10], [65, 10], [65, 9]] } ]);
await noUsual('last session heavier than the one before',
  [ { ago:3, sets:X3(65, 10) }, { ago:6, sets:X3(55, 10) } ]);
await noUsual('one session only', [ { ago:3, sets:X3(55, 10) } ]);
await noUsual('the light day was an eased return', [ { ago:3, sets:X3(55, 10), ease:true }, { ago:6, sets:[[65, 10], [65, 10], [65, 9]] } ]);

/* the "Keep" chip fills in place now too */
{
  await start(page, state({ name:'Keep Press' }, [ { ago:3, sets:X3(135, 10) } ]));
  const n = await mark(page);
  eq((await rs(page)).join(), '11,11,11', '3 prefill asks for 11');
  const keep = await page.$('.callout [data-act="revert"]');
  ok(!!keep, '3 "Keep 135×10" is offered when the prefill differs');
  await page.tap('.callout [data-act="revert"]');
  eq((await rs(page)).join(), '10,10,10', '3 Keep puts the sets back at last time');
  ok(!(await page.$('.callout [data-act="revert"]')), '3 and the chip is gone');
  const d = await sameDom(page);
  ok(d.alive && d.was === n, '3 Keep re-rendered nothing');
}

/* ============================ 4. the ease-back chip ============================ */
const EP = { name:'Ease Press' };
async function easeState(ago, extra) {
  return state(EP, [ { ago, sets:X3(185, 10) }, { ago:ago + 3, sets:X3(185, 9) } ], extra);
}
{
  await start(page, await easeState(9));
  ok(!(await page.$('[data-act="easeback"]')), '4 9 days since the last session → no ease-back chip');
  await start(page, await easeState(10));
  ok(!!(await page.$('[data-act="easeback"]')), '4 10 days → the chip appears');
  has(await text(page, '.easeback .bt'), '10 days since you last trained', '4 and says how long');
  await start(page, await easeState(12));
  has(await text(page, '.easeback .bt'), '12 days since you last trained', '4 12 days → "12 days since you last trained"');
  const first = await page.$eval('#view .stack', el => el.firstElementChild.className);
  has(first, 'easeback', '4 it is the first thing in the stack, above the first exercise');
  eq((await ws(page)).join(), '185,185,185', '4 prefill 185');
  const n = await mark(page);
  await page.tap('[data-act="easeback"]');
  eq((await ws(page)).join(), '165,165,165', '4 one tap → every working set one notch lighter (185 → 165 on the grid)');
  ok(!(await page.$('[data-act="easeback"]')), '4 the chip is gone');
  has(await text(page, '.callout .why'), 'Easing back after 12 days', '4 the why line says so');
  const d = await sameDom(page);
  ok(d.alive && d.was === n, '4 applying it replaced no set row or input');
  let st = await settleSave(page);
  eq(st.active.easeBack, true, '4 session.easeBack is saved');
  /* an eased day is not what the next prescription reads */
  await page.tap(tickBtn(0));
  await finish(page);
  st = await getState(page);
  eq(st.sessions[0].easeBack, true, '4 the finished session keeps easeBack:true');
  await toToday(page);
  await page.tap('[data-act="start"][data-id="r1"]'); await page.waitForSelector('.card.ex');
  eq((await ws(page)).join(), '185,185,185', '4 next time reads the session before the gap (185), not the eased 165');
  ok(!(await page.$('[data-act="easeback"]')), '4 and no chip: you trained today');
}
{
  /* it hides in place at the first tick, and then never applies */
  await start(page, await easeState(12));
  ok(!!(await page.$('[data-act="easeback"]')), '4 chip up at the start');
  await page.tap(tickBtn(0));
  ok(!(await page.$('[data-act="easeback"]')), '4 the first working set done → the chip hides in place');
  const st = await settleSave(page);
  ok(!st.active.easeBack, '4 and nothing was eased');
  eq((await ws(page)).join(), '185,185,185', '4 loads untouched');
}
{
  /* undo puts it all back */
  await start(page, await easeState(14));
  await page.tap('[data-act="easeback"]');
  eq((await ws(page)).join(), '165,165,165', '4 eased');
  await page.tap('.toast.act button');
  await page.waitForSelector('[data-act="easeback"]');
  eq((await ws(page)).join(), '185,185,185', '4 Undo restores the loads');
  const st = await settleSave(page);
  ok(!st.active.easeBack, '4 ...and clears easeBack');
}
{
  /* a stack: the nearest pin */
  const pins = [100, 120, 140, 160, 180];
  await start(page, state({ name:'Stack Press', pins }, [ { ago:12, sets:X3(160, 10) }, { ago:15, sets:X3(160, 9) } ]));
  eq((await ws(page)).join(), '160,160,160', '4 stack prefill 160');
  await page.tap('[data-act="easeback"]');
  eq((await ws(page)).join(), '140,140,140', '4 on a stack it lands on the nearest pin (144 → 140)');
}
{
  /* a lift so light that one notch down is over 15% of it keeps its load and loses reps instead */
  const FP = { name:'Face Pull', mg:'rear_delts', bar:0 };
  await start(page, state(FP, [ { ago:12, sets:[[10, 10], [10, 10], [10, 9]] }, { ago:15, sets:X3(10, 9) } ]));
  const w0 = await ws(page), r0 = await rs(page);
  eq(w0.join(), '10,10,10', '4b face pull prefill 10');
  const n = await mark(page);
  await page.tap('[data-act="easeback"]');
  eq((await ws(page)).join(), '10,10,10', '4b one notch down is 5 of 10 (50%): the load stays 10');
  eq((await rs(page)).join(), r0.map(x => Math.max(1, Number(x) - 2)).join(), '4b ...and each working set target reps drop by 2  [' + r0.join() + ' → ' + (await rs(page)).join() + ']');
  has(await text(page, '.toast.act'), 'Kept 10 lb — 2 fewer reps', '4b the chip result says so');
  has(await text(page, '.callout .why'), '2 fewer reps', '4b and so does the why line');
  const d = await sameDom(page);
  ok(d.alive && d.was === n, '4b applying it replaced no set row or input');
  const st = await settleSave(page);
  eq(st.active.exercises[0].sets.map(s => s.r).join(), (await rs(page)).join(), '4b saved reps match the screen');
  await page.tap('.toast.act button');
  await page.waitForSelector('[data-act="easeback"]');
  eq((await rs(page)).join(), r0.join(), '4b Undo puts the reps back');
  /* reps never go below 1 */
  await page.evaluate(() => { S.active.exercises[0].sets.forEach(s => { s.r = '2'; }); });
  await page.tap('[data-act="easeback"]');
  eq((await page.evaluate(() => S.active.exercises[0].sets.map(s => s.r).join())), '1,1,1', '4b reps never go below 1');
}
{
  /* a heavy lift is still eased by weight: 190 → 170 on the 5 lb grid, no rep cut */
  await start(page, state({ name:'Leg Press', mg:'quads', bar:0 }, [ { ago:12, sets:X3(190, 10) }, { ago:15, sets:X3(190, 9) } ]));
  const r0 = await rs(page);
  await page.tap('[data-act="easeback"]');
  eq((await ws(page)).join(), '170,170,170', '4b leg press 190: one notch is 20 (10.5%), so the load drops');
  eq((await rs(page)).join(), r0.join(), '4b and the reps stay');
  eq(await text(page, '.toast.act'), 'Eased back for todayUndo', '4b the chip says plain "Eased back for today"');
}
{
  /* top set + back-offs: back-offs follow the eased top */
  const RDL = { name:'Ease RDL', reps:6, repTop:10, inc:5, bar:45, scheme:'topback' };
  await start(page, state(RDL, [ { ago:12, sets:[[225, 8, 'top'], [200, 8, 'back'], [200, 8, 'back']] }, { ago:15, sets:[[225, 7, 'top'], [200, 8, 'back'], [200, 8, 'back']] } ]));
  await page.tap('[data-act="easeback"]');
  const w = await ws(page);
  eq(w[0], '205', '4 topback: the top eased (225 → 205)');
  eq(w.slice(1).join(), '180,180', '4 topback: back-offs from the eased top (205 → 180)');
}
{
  /* off-book / other kinds of session count as "trained" for the gap */
  await start(page, state(EP, [ { ago:5, empty:true }, { ago:20, sets:X3(185, 10) } ]));
  ok(!(await page.$('[data-act="easeback"]')), '4 any session newer than 10 days counts, even an empty one');
}

/* ============================ 5. warm-ups ============================ */
const RDL = { name:'Romanian Deadlift', reps:6, repTop:10, inc:5, bar:45, scheme:'topback' };
const hist225 = [ { ago:3, sets:[[225, 8, 'top'], [200, 8, 'back'], [200, 8, 'back']] } ];
await start(page, state(RDL, hist225, { warmups:{} }));
{
  const r = await rows(page);
  eq(r.filter(x => x.warm).map(x => x.w + 'x' + x.r).join(), '90x8,135x5,180x3', '5 RDL 225 on a 45 bar → 90×8, 135×5, 180×3 (each snapped down to a load the plates make)');
  eq(r.map(x => x.warm ? 'W' : 'w').join(''), 'WWWwww', '5 the ramp sits before the working sets');
  const sum = () => page.$$eval('#sess-summary .num', e => e.map(x => x.textContent).join(' | '));
  eq(await sum(), '0 sets | 0 lb volume', '5 nothing counted yet');
  await page.tap(tickBtn(0));
  eq(await sum(), '0 sets | 0 lb volume', '5 ticking a warm-up adds no set and no volume');
  await page.tap(tickBtn(3));
  has(await sum(), '1 set |', '5 the first working set is the first set');
  await finish(page);
  const st = await getState(page), e = st.sessions[0].exercises[0];
  eq(e.sets.filter(s => s.warm).length, 1, '5 only the ticked warm-up is saved');
  const pr = await page.evaluate(() => ({ vol:exVolume(S.sessions[0].exercises[0]), best:bestScore('Romanian Deadlift'),
    want:setScore(S.sessions[0].exercises[0].sets.filter(s => !s.warm)[0], 0), warmPr:S.sessions[0].exercises[0].sets.filter(s => s.warm).some(s => s.pr) }));
  eq(pr.vol, 225 * 9, '5 volume counts the working set only');
  eq(pr.best, pr.want, '5 the best score is the working set\'s, not the ramp\'s');
  ok(!pr.warmPr, '5 a warm-up is never a PR');
}
{
  /* generated warm-ups are rebuilt from the next session's load, not copied */
  const h = [ { ago:3, sets:[[235, 8, 'top'], [205, 8, 'back'], [205, 8, 'back']] } ];
  h[0].sets.unshift([60, 8, '', { warm:true, gen:true }], [100, 5, '', { warm:true, gen:true }], [150, 3, '', { warm:true, gen:true }]);
  await start(page, state(RDL, h, { warmups:{} }));
  const w = (await rows(page)).filter(x => x.warm).map(x => x.w);
  eq(w.length, 3, '5 a ramp is generated again');
  ok(w[0] !== '60' && w[2] !== '150', '5 ...from today\'s load (' + w.join(',') + '), not copied from last time\'s');
}
{
  /* a hand-built warm-up still carries over */
  const h = [ { ago:3, sets:[[60, 5, '', { warm:true }], [225, 8, 'top'], [200, 8, 'back'], [200, 8, 'back']] } ];
  await start(page, state(RDL, h, { warmups:{} }));
  eq((await rows(page)).filter(x => x.warm).map(x => x.w + 'x' + x.r).join(), '60x5', '5 a warm-up you built yourself is carried, not replaced');
}
{
  await start(page, state({ name:'Dumbbell Curl', bar:0 }, [ { ago:3, sets:X3(30, 10) } ], { warmups:{} }));
  eq((await rows(page)).filter(x => x.warm).length, 0, '5 an isolation lift (curl) gets none by default');
  await start(page, state({ name:'Light Press', bar:0 }, [ { ago:3, sets:X3(20, 10) } ], { warmups:{} }));
  eq((await rows(page)).filter(x => x.warm).length, 0, '5 a 20 lb working load gets none');
  await start(page, state({ name:'Light RDL', bar:0, reps:6, repTop:10, scheme:'topback' }, [ { ago:3, sets:[[30, 8, 'top'], [25, 8, 'back']] } ], { warmups:{} }));
  eq((await rows(page)).filter(x => x.warm).length, 1, '5 a top-set lift always gets one');
  await start(page, state({ name:'Machine Press', bar:0, pins:[40, 60, 80, 100, 120, 140, 160] }, [ { ago:3, sets:X3(120, 10) } ], { warmups:{} }));
  ok((await rows(page)).filter(x => x.warm).every(x => [40, 60, 80, 100, 120, 140, 160].includes(Number(x.w))), '5 on a stack every ramp load is a real pin');
}
{
  /* the per-lift switch in the exercise menu */
  await start(page, state(RDL, hist225, { warmups:{} }));
  await page.tap('.kebab[data-ei="0"]');
  await page.waitForSelector('[data-x="warmgen"]');
  eq(await page.getAttribute('[data-x="warmgen"]', 'aria-checked'), 'true', '5 the menu shows the switch ON for a deadlift');
  await page.tap('[data-x="warmgen"]');
  await page.waitForSelector('[data-x="warmgen"][aria-checked="false"]');
  let st = await settleSave(page);
  eq(st.settings.warmups['romanian deadlift'], false, '5 turning it off is remembered for the lift');
  await page.tap('.sheet [data-x="done"]');
  eq((await rows(page)).filter(x => x.warm).length, 0, '5 and the undone ramp is gone from today');
  await page.tap('[data-act="discard"]'); await page.tap('[data-x="ok"]');
  await start(page);
  eq((await rows(page)).filter(x => x.warm).length, 0, '5 the next session has no ramp for it');
  await page.tap('.kebab[data-ei="0"]');
  await page.waitForSelector('[data-x="warmgen"]');
  await page.tap('[data-x="warmgen"]');
  await page.waitForSelector('[data-x="warmgen"][aria-checked="true"]');
  await page.tap('.sheet [data-x="done"]');
  eq((await rows(page)).filter(x => x.warm).length, 3, '5 switching it back on builds the ramp again');
}
{
  /* a ticked set's number is not a warm-up toggle */
  await start(page, state({ name:'Flip Press' }, [ { ago:3, sets:X3(135, 10) } ]));
  await page.tap(tickBtn(0));
  const before = (await rows(page)).map(r => r.warm).join();
  const n = await mark(page);
  await page.tap('.set[data-ei="0"][data-si="0"] .idx');
  eq((await rows(page)).map(r => r.warm).join(), before, '5 tapping the number of a ticked set does nothing');
  const d = await sameDom(page);
  ok(d.alive && d.was === n, '5 ...and re-renders nothing');
  const st = await settleSave(page);
  ok(!st.active.exercises[0].sets[0].warm, '5 the set is still a working set in the state');
  await page.tap('.set[data-ei="0"][data-si="1"] .idx');
  ok((await rows(page))[1].warm, '5 an unticked set still flips');
}

/* ============================ 6. S4 hit targets ============================ */
async function targets(pg, tag, expectOuter) {
  await start(pg, state({ name:'Target Press' }, [ { ago:3, sets:X3(135, 10) } ]));
  const b = async sel => (await (await pg.$(sel)).boundingBox());
  ok((await b('.exnote-add')).height >= 43.9, tag + ' 6 "+ Note on this lift" is 44 px tall');
  ok((await b('.callout [data-act="revert"]')).height >= 43.9, tag + ' 6 the "Keep" chip is 44 px tall');
  await start(pg, state(UP, [ { ago:3, sets:X3(55, 10) }, { ago:6, sets:[[65, 10], [65, 10], [65, 9]] } ]));
  ok((await b('.callout .revert.usual')).height >= 43.9, tag + ' 6 the "Usual" chip is 44 px tall');
  const m = await pg.evaluate(() => {
    const r = document.querySelector('.set'), grps = r.querySelectorAll('.grp');
    const wi = r.querySelector('input[data-f="w"]').getBoundingClientRect(), ri = r.querySelector('input[data-f="r"]').getBoundingClientRect();
    const outerW = grps[0].querySelector('button:first-child').getBoundingClientRect().width;
    const outerR = grps[1].querySelector('button:last-child').getBoundingClientRect().width;
    const times = r.querySelector('.times').getBoundingClientRect();
    const t2 = document.elementFromPoint(times.left + times.width / 2, times.top + times.height / 2);
    let dead = 0; for (let dx = -10; dx <= 10; dx++) { const e = document.elementFromPoint(times.left + times.width / 2 + dx, times.top + times.height / 2); if (!(e && e.closest('button,input'))) dead++; }
    const rowRect = r.getBoundingClientRect();
    return { outerW:Math.round(outerW), outerR:Math.round(outerR), wi:Math.round(wi.width), ri:Math.round(ri.width), dead,
      docOver:document.documentElement.scrollWidth > document.documentElement.clientWidth, rowOver:r.scrollWidth > r.clientWidth + 0.5, rowH:Math.round(rowRect.height) };
  });
  ok(!m.docOver && !m.rowOver, tag + ' 6 no horizontal overflow (' + JSON.stringify(m) + ')');
  ok(m.dead >= 4 && m.dead <= 6, tag + ' 6 the 5 px dead strip on "×" is still there (' + m.dead + ' dead px)');
  if (expectOuter) eq(m.outerW, 44, tag + ' 6 the outer steppers are 44 px');
  else ok(m.outerW < 44, tag + ' 6 the outer steppers keep the narrow width where it would crowd the box (' + m.outerW + ')');
  ok(m.wi >= (expectOuter ? 52 : 44) && m.ri >= (expectOuter ? 52 : 44), tag + ' 6 inputs stay wide enough (' + m.wi + '/' + m.ri + ')');
  eq(m.rowH, 53, tag + ' 6 the set row is still 53 px');
}
await targets(page, '[390]', false);

/* ============================ 7. no render on any logging tap ============================ */
{
  await start(page, state({ name:'Identity Press', bar:45 }, [ { ago:3, sets:X3(135, 10) } ], { warmups:{} }));
  await page.tap('[data-act="ex-note"]');                          // swapped in place, never a render
  const n = await mark(page);
  await page.tap(stepBtn(1, 'w', 1)); await page.tap(stepBtn(1, 'r', -1)); await page.tap(tickBtn(1));
  await page.tap(tickBtn(0)); await page.tap(tickBtn(0));         // tick and untick
  await typeInto(page, W(2), 150); await page.tap(tickBtn(2));
  await page.tap('.callout [data-act="revert"]').catch(() => {});
  const d = await sameDom(page);
  ok(d.alive && d.was === n, '7 steppers, typing, ticks, untick and Keep: every original set row, input and button is the same node');
}

/* ============================ 8. review follow-ups ============================ */
/* a. the warm-up flip rewrites the card in place */
{
  await start(page, state({ name:'Flip Identity', bar:45, reps:6, repTop:0 }, [ { ago:3, sets:X3(135, 10) } ]));
  const meta0 = await text(page, '.ex-meta span');
  const n = await mark(page);
  await page.tap('.set[data-ei="0"][data-si="1"] .idx');
  let d = await sameDom(page);
  ok(d.alive && d.was === n && d.now === n, '8a flipping a set to a warm-up replaces no row, input or button (Trap 1)');
  const r = await rows(page);
  eq(r.map(x => x.warm ? 'W' : 'w').join(''), 'wWw', '8a row 2 is a warm-up on screen');
  eq(await page.$$eval('.card.ex .set .idx', b => b.map(x => x.textContent).join()), '1,W,2', '8a the numbers were rewritten in place (1, W, 2)');
  eq(await page.getAttribute('.set[data-si="1"] .idx', 'aria-label'), 'Warm-up: make it a working set', '8a and its aria-label');
  ok((await text(page, '.ex-meta span')) !== meta0 && /^2 ×/.test(await text(page, '.ex-meta span')), '8a the meta line counts two working sets (' + await text(page, '.ex-meta span') + ')');
  has(await text(page, '#sess-summary'), '0 sets', '8a the summary was refreshed');
  await page.tap('.set[data-ei="0"][data-si="1"] .idx');
  d = await sameDom(page);
  ok(d.alive && d.now === n, '8a and back again, still nothing replaced');
  eq(await page.$$eval('.card.ex .set .idx', b => b.map(x => x.textContent).join()), '1,2,3', '8a numbers restored');
  const st = await settleSave(page);
  ok(!st.active.exercises[0].sets[1].warm, '8a state matches');
}
/* b. the cascade runs on commit, not per keystroke */
{
  await start(page, state({ name:'Commit Press' }, [ { ago:3, sets:X3(135, 10) } ]));
  await typeRaw(page, W(0), '1');
  eq((await ws(page)).join(), '1,135,135', '8b typing "1": only set 1 shows it, the followers stay 135');
  await page.keyboard.type('3');
  eq((await ws(page)).join(), '13,135,135', '8b "13": followers still 135');
  await page.keyboard.type('5');
  eq((await ws(page)).join(), '135,135,135', '8b "135": followers still 135');
  await page.keyboard.press('Enter');
  eq((await ws(page)).join(), '135,135,135', '8b committed: all 135');
  await typeRaw(page, W(0), '145');
  eq((await ws(page)).join(), '145,135,135', '8b a finished 145 not yet committed: followers wait');
  await page.keyboard.press('Enter');
  eq((await ws(page)).join(), '145,145,145', '8b on commit they follow once');
}
/* b2. a typed value that can't be a working load stays in set 1 */
{
  await start(page, state({ name:'Plausible Press' }, [ { ago:3, sets:X3(135, 10) } ]));
  await typeInto(page, W(0), 1);
  eq((await ws(page)).join(), '1,135,135', '8b2 type "1" and blur: set 1 keeps it, the followers stay 135');
  await typeInto(page, W(0), 95);
  eq((await ws(page)).join(), '95,95,95', '8b2 "95" after "1": judged against what the followers hold (135 → 95 is fine), not against the typo, so all three follow');
  await typeInto(page, W(0), 135);
  eq((await ws(page)).join(), '135,135,135', '8b2 back to 135');
  await typeInto(page, W(0), 95);
  eq((await ws(page)).join(), '95,95,95', '8b2 "95" and blur from 135 → the followers become 95');
  await typeInto(page, W(0), 200);
  eq((await ws(page)).join(), '200,95,95', '8b2 200 is over 1.5 × 95: set 1 only');
  await typeInto(page, W(0), 0);
  eq((await ws(page)).join(), '0,95,95', '8b2 zero never cascades');
}
/* b3 (2.0-b1). The guard compares with each untouched FOLLOWER, not with set 1's previous (possibly typo'd) number */
{
  await start(page, state({ name:'Cable Row' }, [ { ago:3, sets:X3(65, 10) } ]));
  eq((await ws(page)).join(), '65,65,65', '8b3 Cable Row prefill 65');
  await mark(page);
  await typeInto(page, W(0), 650);
  eq((await ws(page)).join(), '650,65,65', '8b3 650 is over 1.5 × 65: set 1 only, the followers stay 65');
  await typeInto(page, W(0), 70);
  eq((await ws(page)).join(), '70,70,70', '8b3 then 70: judged against the 65s (not against the typo 650), so the followers become 70');
  const d = await sameDom(page);
  ok(d.alive && d.now === d.was, '8b3 nothing was replaced on the way (Trap 1)');
}
{
  /* top set + back-offs: the top commits against the top the back-offs imply (back-off ÷ (1 − backPct) = 200 ÷ 0.88 = 227) */
  const RDL = { name:'Guard RDL', reps:6, repTop:10, inc:5, bar:45, scheme:'topback' };
  await start(page, state(RDL, [ { ago:3, sets:[[225, 8, 'top'], [200, 8, 'back'], [200, 8, 'back']] } ]));
  await typeInto(page, W(0), 100);
  eq((await ws(page)).join(), '100,200,200', '8b3 RDL top typed 100 (under half of the implied 227): the back-offs stay 200');
  await typeInto(page, W(0), 250);
  eq((await ws(page)).join(), '250,220,220', '8b3 then 250: the untouched back-offs recompute from the new top (250 × 0.88 → 220)');
  await typeInto(page, W(2), 215);
  await typeInto(page, W(0), 100);
  await typeInto(page, W(0), 260);
  eq((await ws(page)).join(), '260,230,215', '8b3 a back-off set by hand stays; the other recomputes (260 × 0.88 → 230)');
}
/* c. a set you edited yourself is not a follower, even when it matches */
{
  await start(page, state({ name:'Touched Press' }, [ { ago:3, sets:X3(135, 10) } ]));
  await typeInto(page, W(2), 140);
  await typeInto(page, W(2), 135);                                   // back to 135 by hand
  eq((await ws(page)).join(), '135,135,135', '8c setup: 135/135/135, set 3 typed by hand');
  await typeInto(page, W(0), 145);
  eq((await ws(page)).join(), '145,145,135', '8c set 1 → 145: set 2 follows, the hand-edited set 3 stays 135');
  let st = await settleSave(page);
  eq(st.active.exercises[0].sets[2].touched, true, '8c the in-progress set carries the flag');
  await page.tap(stepBtn(1, 'w', 1)); await page.tap(stepBtn(1, 'w', -1));     // stepper edits count too
  await typeInto(page, W(0), 150);
  eq((await ws(page)).join(), '150,145,135', '8c a stepped set is yours as well (set 2 stays)');
  for (const i of [0, 1, 2]) await page.tap(tickBtn(i));
  await finish(page);
  st = await getState(page);
  ok(!st.sessions[0].exercises[0].sets.some(x => 'touched' in x), '8c the flag is stripped on save: history is unchanged');
}
/* d. warm-up loads snap down */
{
  const w = await page.evaluate(() => c2WarmUps('Floor Press', { bar:45, inc:5, bw:0, metric:0 }, 190).map(s => s.w + 'x' + s.r).join(' '));
  eq(w, '75x8 110x5 155x3', '8d 190 → 75, 110, 155: never above 42% / 60% / 82% of the load');
}
/* e. no "usual" for bodyweight and assisted lifts, or for a drop the app prescribed */
{
  await start(page, state({ name:'BW Press', bw:1 }, [ { ago:3, sets:X3(10, 10), ex:{ bw:1 } }, { ago:6, sets:X3(25, 10), ex:{ bw:1 } } ]));
  ok(!(await page.$('.callout .revert.usual')), '8e no usual-load chip on a bodyweight lift');
  await start(page, state({ name:'Assist Pull', bw:2 }, [ { ago:3, sets:X3(60, 10), ex:{ bw:2 } }, { ago:6, sets:X3(40, 10), ex:{ bw:2 } } ]));
  ok(!(await page.$('.callout .revert.usual')), '8e no usual-load chip on an assisted lift');
  await start(page, state(UP, [ { ago:3, sets:X3(55, 10), ex:{ presc:{ w:55, r:10 } } }, { ago:6, sets:[[65, 10], [65, 10], [65, 9]] } ]));
  ok(!(await page.$('.callout .revert.usual')), '8e no chip when the light day is what the app prescribed (a step-back)');
  await start(page, state(UP, [ { ago:3, sets:X3(55, 10), ex:{ presc:{ w:65, r:10 } } }, { ago:6, sets:[[65, 10], [65, 10], [65, 9]] } ]));
  ok(!!(await page.$('.callout .revert.usual')), '8e ...but a drop below what was prescribed still is a choice');
}

/* ============================ 320 px ============================ */
{
  const ctx = await browser.newContext({ ...devices['Pixel 5'], viewport:{ width:320, height:700 } });
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => errors.push(String(e)));
  await cascadeSuite(p2, '[320]');
  await targets(p2, '[320]', false);
  await start(p2, await easeState(12));
  await p2.tap('[data-act="easeback"]');
  eq((await ws(p2)).join(), '165,165,165', '[320] 4 ease-back works at 320');
  await start(p2, state(UP, [ { ago:3, sets:X3(55, 10) }, { ago:6, sets:[[65, 10], [65, 10], [65, 9]] } ]));
  await p2.tap('.callout .revert.usual');
  eq((await ws(p2)).join(), '65,65,65', '[320] 3 the usual chip works at 320');
  await ctx.close();
}
/* wide phones: the outer steppers reach 44 */
{
  const ctx = await browser.newContext({ ...devices['Pixel 5'], viewport:{ width:430, height:844 } });
  const p3 = await ctx.newPage();
  p3.on('pageerror', e => errors.push(String(e)));
  await targets(p3, '[430]', true);
  await ctx.close();
}

eq(errors.length, 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close();
report('t51 session screen');
