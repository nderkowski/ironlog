/* 2.0 package E: the Plan balance card, the S1 one-tap additions with undo,
   excluded muscles, and rotation-native muscle volume on Progress.
   UI-driven at 390x844 (Pixel 5, touch) and 320 px. Every expected number is
   worked out by hand in a comment, not computed with the app's formula. */
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import { launch, boot, getState, URL, ok, eq, has, report } from './harness.mjs';

const { browser, ctx, page, errors } = await launch();
const DAY = 864e5, now = Date.now();
const AXE = '/tmp/axe/node_modules/axe-core/axe.min.js';

/* ---------- a known plan ---------- */
let n = 0, rn = 0;
const row = (name, sets, reps, top, mg, mg2, link = false) =>
  ({ id: 'p' + (++rn), name, sets, reps, repTop: top, inc: null, bw: 0, bar: 0, metric: 0, link, mg, mg2, scheme: 'double', backPct: 0.12, pins: [], added: 1 });
const routines = () => (rn = 0, [
  { id: 'rA', key: 'A', name: 'Day A', optional: false, variants: [{ id: 'vA', label: '', exercises: [
    row('Bench Press', 4, 6, 10, 'chest', ['triceps', 'front_delts']),
    row('Face Pull', 3, 12, 15, 'rear_delts', ['back', 'traps']) ] }] },
  { id: 'rB', key: 'B', name: 'Day B', optional: false, variants: [
    { id: 'vB1', label: 'Week 1', exercises: [
      row('Lateral Raise', 3, 12, 20, 'side_delts', []),
      row('Overhead Press', 3, 8, 12, 'front_delts', ['triceps']),
      row('Cable Row', 4, 8, 12, 'back', ['biceps']) ] },
    { id: 'vB2', label: 'Week 2', exercises: [
      row('Lateral Raise', 3, 12, 20, 'side_delts', []),
      row('Pull-up', 3, 6, 10, 'back', ['biceps']) ] }] },
  { id: 'rC', key: 'C', name: 'Day C', optional: false, variants: [{ id: 'vC', label: '', exercises: [
    row('Leg Press', 4, 8, 12, 'quads', ['glutes', 'hams']),
    row('Romanian Deadlift', 3, 6, 10, 'hams', ['glutes', 'back']),
    row('Face Pull', 3, 12, 15, 'rear_delts', ['back', 'traps']) ] }] }
]);
const settings = (extra) => Object.assign({ unit: 'lb', inc: 5, rest: 120, bar: 45, doubleDefault: true, repLow: 8, repHigh: 12,
  rangeFixHidden: true, targetFreq: 3, excludedMuscles: ['calves'], blockRotations: 6 }, extra || {});
const state = (over) => Object.assign({ version: 6, settings: settings(), routines: routines(), sessions: [], active: null,
  block: { num: 1, startSessId: null, startTs: 0, rotation: 0, history: [] }, coach: { proposals: [], history: [], lastCheck: 0 } }, over || {});

const go = async (tab) => { await page.locator('[data-tab="' + tab + '"]').tap(); await page.waitForTimeout(150); };
const rowsText = async (sel) => Object.fromEntries((await page.locator(sel + ' .mrow').evaluateAll(els =>
  els.map(e => [e.querySelector('.mn').textContent.trim(), e.querySelector('.mv').textContent.replace(/\s+(low|high)$/, '').replace(/[↑↓]/g, '').trim()]))));
const noOverflow = async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const cardFits = async (sel) => page.evaluate(s => { const c = document.querySelector(s); return !!c && c.scrollWidth <= c.clientWidth; }, sel);
const axeCritical = async () => {
  await page.addScriptTag({ path: AXE });
  const r = await page.evaluate(() => axe.run(document, { resultTypes: ['violations'] }));
  return r.violations.filter(v => v.impact === 'critical').map(v => v.id + ' x' + v.nodes.length);
};

/* ============ 1. The card for a known plan ============ */
console.log('1 balance card numbers');
await boot(page, state());
await go('plan');
ok(await page.locator('.bal').count() === 1, '1 the balance card is on the Plan tab');
const order = await page.evaluate(() => {
  const t = [...document.querySelectorAll('#view .eyebrow')].map(e => e.textContent.trim());
  const tpl = document.querySelector('[data-act="tpl"]'), bal = document.querySelector('.bal'), prog = [...document.querySelectorAll('#view .eyebrow')].find(e => e.textContent === 'Progression');
  return tpl.compareDocumentPosition(bal) & 4 && bal.compareDocumentPosition(prog) & 4 ? t.join('|') : 'wrong order';
});
has(order, 'Plan balance', '1 card sits after the "+ Training day" row and before Progression  [' + order + ']');
eq((await page.locator('[data-act="freq"]').innerText()).trim(), 'at 3 a week', '1 header button names the frequency');
/* f = 3 and N = 3, so weekly = sets per rotation. Per rotation, worked by hand:
   chest 4. triceps 4 x .5 (Bench) + [3 x .5]/2 (OHP, one of B's two weeks) = 2 + .75 = 2.75 -> 2.8.
   front delts 4 x .5 + 3/2 = 3.5. side delts (3 + 3)/2 = 3. rear delts 3 + 3 = 6.
   back: A face pull .5 x 3 = 1.5; B week 1 Cable Row 4 sets, week 2 Pull-up 3 sets -> (4 + 3)/2 = 3.5;
   C: RDL .5 x 3 + face pull .5 x 3 = 3; back = 1.5 + 3.5 + 3 = 8. biceps (.5 x 4 + .5 x 3)/2 = 1.75 -> 1.8.
   traps .5 x 3 + .5 x 3 = 3. quads 4. glutes .5 x 4 + .5 x 3 = 3.5. hams .5 x 4 + 3 = 5. abs 0, forearms 0. */
let bal = await rowsText('.bal');
const want = { 'Chest': '4', 'Traps': '3', 'Front delts': '3.5', 'Side delts': '3', 'Rear delts': '6', 'Back': '8', 'Biceps': '1.8',
  'Triceps': '2.8', 'Forearms': '0', 'Quads': '4', 'Hamstrings': '5', 'Glutes': '3.5', 'Abs': '0' };
for (const [k, v] of Object.entries(want)) eq(bal[k], v, '1 ' + k + ' reads ' + v + ' a week');
eq(Object.keys(bal).length, 13, '1 one row per muscle that is not skipped (14 less calves)');
const offs = await page.locator('.bal .mrow.off .mn').allInnerTexts();
ok(!offs.includes('Rear delts') && offs.includes('Chest') && offs.includes('Abs') && offs.includes('Traps'),
  '1 rear delts at 6 sit in the small-muscle band 6-12; chest, abs and traps are low  [off: ' + offs.join(', ') + ']');
ok(await page.locator('.bal .mrow.off .mv .vh').first().evaluate(e => /low|high/.test(e.textContent)), '1 a low value says so in words too, not only in colour');
has(await page.locator('.bal').innerText(), 'Calves — by choice', '1 skipped calves shown "by choice"');
ok(!Object.keys(bal).includes('Calves'), '1 calves has no bar row');
has(await page.locator('.bal').innerText(), "The pump day isn't counted", '1 footer says the pump day is extra');
/* the band is drawn: a shaded stripe + two ticks on each row */
eq(await page.locator('.bal .mrow:first-of-type .track .band').count() + await page.locator('.bal .track .tick').count() > 0, true, '1 the band is drawn on the tracks');

/* frequency sheet: 3.5 a week -> every number x 3.5/3 */
await page.locator('[data-act="freq"]').tap();
await page.waitForSelector('[data-fq="3.5"]');
const opts = await page.locator('.sheet [data-fq]').evaluateAll(els => els.map(e => e.dataset.fq));
eq(opts.join(','), '2,2.5,3,3.5,4,4.5,5,5.5,6,auto', '1 freq sheet offers 2 to 6 in halves and Auto');
has(await page.locator('.sheet [data-fq="auto"]').innerText(), 'Auto (from your log:', '1 Auto shows what the log says');
await page.locator('.sheet [data-fq="3.5"]').tap();
await page.waitForTimeout(200);
eq((await getState(page)).settings.targetFreq, 3.5, '1 choosing 3.5 writes targetFreq');
bal = await rowsText('.bal');
/* chest 4 x 3.5/3 = 4.67 -> 4.7; rear delts 6 x 3.5/3 = 7; hams 5 x 3.5/3 = 5.83 -> 5.8 */
eq(bal['Chest'] + ' ' + bal['Rear delts'] + ' ' + bal['Hamstrings'], '4.7 7 5.8', '1 the freq sheet changes the numbers (x 3.5/3)');
eq((await page.locator('[data-act="freq"]').innerText()).trim(), 'at 3.5 a week', '1 and the header');
await page.locator('[data-act="freq"]').tap(); await page.waitForSelector('[data-fq="auto"]');
await page.locator('.sheet [data-fq="auto"]').tap(); await page.waitForTimeout(150);
eq((await getState(page)).settings.targetFreq, null, '1 Auto clears targetFreq');
await page.evaluate(() => { S.settings.targetFreq = 3; writeNow(); viewPlan(); });

/* ============ 2. S1 suggestions: rows ============ */
console.log('2 suggestions');
const sugLabels = async () => page.locator('.sug [data-act="plan-suggest"]').allInnerTexts();
let labels = (await sugLabels()).map(s => s.trim());
eq(labels.join(' | '), '+ Cable Crunch on B and C (abs) | + Overhead Cable Tricep Extension on B | Lateral Raise 3 → 4 sets on B | + Leg Extension on C | Run RDL as top set + back-offs | Add the optional Pump day | Face Pull 3 → 4 sets on A and C (optional)',
  '2 the suggested rows, in the spec order (RDL row live since package B, the pump row since package D), face pull last and optional');
ok(!labels.some(l => /calf|calves/i.test(l)), '2 calves is never suggested');
const hidden = await page.evaluate(() => ({ rdl: typeof schemeOf, pump: typeof isOptional }));
if (hidden.rdl !== 'function') ok(!labels.some(l => /RDL/.test(l)), '2 the RDL row stays hidden until the engine package lands');
if (hidden.pump !== 'function') ok(!labels.some(l => /Pump/.test(l)), '2 the pump row stays hidden until the optional-day runtime lands');
const before = JSON.stringify((await getState(page)).routines);
ok(!(await getState(page)).planBackup, '2 no plan backup yet');

await page.locator('.sug [data-id="tri"]').tap(); await page.waitForTimeout(200);
await page.locator('.sug [data-id="abs"]').tap(); await page.waitForTimeout(200);
await page.locator('.sug [data-id="side"]').tap(); await page.waitForTimeout(200);
await page.locator('.sug [data-id="quad"]').tap(); await page.waitForTimeout(200);
await page.locator('.sug [data-id="rdl"]').tap(); await page.waitForTimeout(200);
await page.locator('.sug [data-id="face"]').tap(); await page.waitForTimeout(200);
let st = await getState(page);
ok(st.routines.every(r => r.variants.every(v => v.exercises.filter(e => /\brdl\b|romanian/i.test(e.name)).every(e => e.scheme === 'topback'))), '2 RDL rows on every day and week are now top set + back-offs');
const byKey = (s, k) => s.routines.find(r => r.key === k);
const fmtRow = e => `${e.name} ${e.sets}x${e.reps}-${e.repTop}${e.link ? ' +' : ''}`;
for (const [vi, label] of [[0, 'B week 1'], [1, 'B week 2']]) {
  const ex = byKey(st, 'B').variants[vi].exercises;
  const tail = ex.slice(-2).map(fmtRow);
  eq(tail.join(' / '), 'Overhead Cable Tricep Extension 3x10-15 / Cable Crunch 3x10-15 +', '2 ' + label + ': ends triceps extension then crunch, 3 x 10-15, crunch linked to it');
  eq(ex.find(e => e.name === 'Lateral Raise').sets, 4, '2 ' + label + ': Lateral Raise 3 -> 4');
  ok(ex.slice(-2).every(e => e.scheme === 'double' && Array.isArray(e.pins) && e.added > 1 && e.backPct === 0.12), '2 ' + label + ': new rows come from newPlanEx (scheme, pins, added)');
}
const cEx = byKey(st, 'C').variants[0].exercises;
/* quad was tapped after abs, so on C the order is Cable Crunch then Leg Extension, the later linked */
eq(cEx.slice(-2).map(fmtRow).join(' / '), 'Cable Crunch 3x10-15 / Leg Extension 3x10-15 +', '2 C: crunch, then leg extension linked to it (whichever was tapped first stays first)');
eq(cEx.filter(e => e.name === 'Face Pull')[0].sets, 4, '2 C: Face Pull 3 -> 4');
eq(byKey(st, 'A').variants[0].exercises.find(e => e.name === 'Face Pull').sets, 4, '2 A: Face Pull 3 -> 4');
eq(st.planBackup && st.planBackup.kind, 'v2-additions', '2 planBackup taken, kind "v2-additions"');
eq(JSON.stringify(st.planBackup.routines), before, '2 and it holds the plan exactly as it was');
/* package D made the pump row live: nothing here applies it, so it is the one left (its own behaviour is t52's) */
eq((await sugLabels()).join(), 'Add the optional Pump day', '2 every row button vanishes once applied; only the optional Pump day is left');
await page.locator('.sug [data-id="pump"]').tap(); await page.waitForTimeout(200);
ok(await page.locator('.sug').count() === 0, '2 the "Suggested additions" block goes with them (the Pump day was the last one)');
const tags = Object.fromEntries(byKey(st, 'B').variants[0].exercises.slice(-2).map(e => [e.name, e.mg]));
eq(JSON.stringify(tags), '{"Overhead Cable Tricep Extension":"triceps","Cable Crunch":"core"}', '2 new rows carry their muscles (triceps, abs)');
const bal2 = await rowsText('.bal');
/* abs: B 3 + C 3 = 6 per rotation -> 6 a week: inside the small band; calves still never shown */
eq(bal2['Abs'], '6', '2 the card follows: abs 0 -> 6 a week');
/* triceps 2.75 + 3 (B extension, both weeks) = 5.75 -> 5.8 */
eq(bal2['Triceps'], '5.8', '2 triceps 2.8 -> 5.8');
/* side delts 4 x (B, both weeks) = 4; quads 4 + 3 = 7 */
eq(bal2['Side delts'] + ' ' + bal2['Quads'], '4 7', '2 side delts 4, quads 7');
/* the plan-settings text: before the 2.0 additions */
await page.locator('[data-act="settings"]').first().tap(); await page.waitForSelector('[data-set="unit"]');
has(await page.locator('body').innerText(), 'Before the 2.0 additions (', '2 Settings says "Before the 2.0 additions (date)"');
has(await page.locator('body').innerText(), 'Switching back restores that plan; logged sessions are never touched.', '2 and what switching back does');
ok(!(await page.locator('body').innerText()).includes('On the recommended plan'), '2 and not "On the recommended plan"');
await go('plan');

/* ============ 3. Undo restores rows and links exactly ============ */
console.log('3 undo');
await boot(page, state()); await go('plan');
const pre = JSON.stringify((await getState(page)).routines);
await page.locator('.sug [data-id="tri"]').tap(); await page.waitForTimeout(150);
const afterTri = JSON.stringify((await getState(page)).routines);
await page.locator('.sug [data-id="abs"]').tap(); await page.waitForTimeout(150);
let mid = await getState(page);
eq(byKey(mid, 'B').variants[0].exercises.slice(-2).map(fmtRow).join(' / '), 'Overhead Cable Tricep Extension 3x10-15 / Cable Crunch 3x10-15 +', '3 tri then abs: B pairs "extension + crunch"');
await page.locator('.toast.act button').tap(); await page.waitForTimeout(200);
eq(JSON.stringify((await getState(page)).routines), afterTri, '3 undo of the second apply: byte-identical to the state before it');
ok(!!(await getState(page)).planBackup, '3 the backup stays (the first apply made it)');
await page.locator('.sug [data-id="side"]').tap(); await page.waitForTimeout(150);
await page.locator('.toast.act button').tap(); await page.waitForTimeout(200);
eq(JSON.stringify((await getState(page)).routines), afterTri, '3 undo of the Lateral Raise bump restores sets');
/* an existing backup is never overwritten; and a first-apply undo removes the backup it made */
await boot(page, state()); await go('plan');
await page.locator('.sug [data-id="quad"]').tap(); await page.waitForTimeout(150);
await page.locator('.sug [data-id="abs"]').tap(); await page.waitForTimeout(150);
await page.locator('.toast.act button').tap(); await page.waitForTimeout(150);
await page.locator('.sug [data-id="face"]').tap(); await page.waitForTimeout(150);
await page.locator('.toast.act button').tap(); await page.waitForTimeout(150);
const all = ['quad', 'abs', 'tri', 'side', 'face'];
await boot(page, state()); await go('plan');
for (const id of all) { await page.locator('.sug [data-id="' + id + '"]').tap(); await page.waitForTimeout(120); }
const applied = JSON.stringify((await getState(page)).routines);
ok(applied !== pre, '3 apply all five changes the plan');
await page.locator('.toast.act button').tap(); await page.waitForTimeout(150);   // only the last apply is undoable from the toast
await boot(page, state()); await go('plan');
await page.locator('.sug [data-id="tri"]').tap(); await page.waitForTimeout(150);
await page.locator('.toast.act button').tap(); await page.waitForTimeout(200);
st = await getState(page);
eq(JSON.stringify(st.routines), pre, '3 apply then undo: the plan is byte-identical, links included');
ok(!st.planBackup, '3 undoing the apply that made the backup removes it');
ok(await page.locator('.sug [data-id="tri"]').count() === 1, '3 and the button is back');
/* an older backup (the recommended-plan switch) is not overwritten */
const old = { ts: 12345, rest: 90, routines: routines().slice(0, 1) };
await boot(page, state({ planBackup: old })); await go('plan');
await page.locator('.sug [data-id="quad"]').tap(); await page.waitForTimeout(150);
st = await getState(page);
eq(JSON.stringify(st.planBackup), JSON.stringify(old), '3 an existing planBackup is not overwritten');
/* refused while a workout is running */
await boot(page, state({ active: { id: 'act', ts: now, routineId: 'rA', key: 'A', name: 'Day A', exercises: [], variantId: 'vA' } }));
await go('plan');
const preAct = JSON.stringify((await getState(page)).routines);
await page.locator('.sug [data-id="abs"]').tap(); await page.waitForTimeout(150);
eq(JSON.stringify((await getState(page)).routines), preAct, '3 refused mid-workout: plan untouched');
has(await page.locator('.toast').innerText(), 'Finish or discard the workout first', '3 and it says why');

/* ============ 4. Excluded muscles ============ */
console.log('4 excluded muscles');
await boot(page, state({ settings: settings({ excludedMuscles: [] }) })); await go('plan');
bal = await rowsText('.bal');
eq(bal['Calves'], '0', '4 with nothing skipped, calves is a row and reads 0 (low)');
ok((await page.locator('.bal .mrow.off .mn').allInnerTexts()).includes('Calves'), '4 and is marked low');
await page.locator('[data-act="excl"]').tap(); await page.waitForSelector('[data-mx="calves"]');
ok(await page.locator('.sheet [data-mx="calves"]').getAttribute('aria-checked') === 'false', '4 the sheet shows calves not skipped');
await page.locator('.sheet [data-mx="calves"]').tap(); await page.waitForTimeout(200);
eq(JSON.stringify((await getState(page)).settings.excludedMuscles), '["calves"]', '4 skipping calves writes excludedMuscles');
await page.locator('.sheet [data-mx="done"]').tap(); await page.waitForTimeout(150);
has(await page.locator('.bal').innerText(), 'Calves — by choice', '4 the card now says by choice');
ok(!Object.keys(await rowsText('.bal')).includes('Calves'), '4 and drops the row');
eq(await page.locator('.sheet').count(), 0, '4 Done closes the sheet');
/* multiple skipped, order follows the muscle list */
await page.evaluate(() => { S.settings.excludedMuscles = ['forearms', 'calves']; writeNow(); viewPlan(); });
has(await page.locator('.bal').innerText(), 'Forearms, Calves — by choice', '4 several skipped are named together');

/* ============ 5. Progress: rotation-native volume ============ */
console.log('5 progress rotation');
const ex = (name, sets, mg, mg2) => ({ id: 'e' + (++n), planId: null, name, mg, mg2: mg2 || [], metric: 0, bw: 0, bar: 0,
  sets: Array.from({ length: sets }, () => ({ w: '50', r: '10', done: true, load: 50 })) });
const ses = (id, daysAgo, rid, key, exs, extra) => Object.assign({ id, ts: now - daysAgo * DAY, endTs: now - daysAgo * DAY + 36e5,
  routineId: rid, key, name: key ? 'Day ' + key : 'Freestyle', exercises: exs }, extra || {});
rn = 100;
const pump = { id: 'rP', key: 'P', name: 'Pump day', optional: true, variants: [{ id: 'vP', label: '', exercises: [row('Cable Curl', 3, 15, 20, 'biceps', [])] }] };
const sessions = [
  ses('s1', 1, 'rB', 'B', [ex('Lateral Raise', 3, 'side_delts')]),
  ses('s2', 2, 'rP', 'P', [ex('Cable Curl', 3, 'biceps')]),                                    // pump: counts
  ses('s3', 2.5, 'rB', 'B', [ex('Bench Press', 10, 'chest', ['triceps'])], { deload: true }),   // deload: ignored
  ses('s4', 3, 'rA', 'A', [], { unlogged: true }),                                              // unlogged: ignored, does not use up one of the 3
  ses('s5', 4, 'rA', 'A', [ex('Bench Press', 4, 'chest', ['triceps'])]),
  ses('s6', 6, 'rC', 'C', [ex('Leg Press', 4, 'quads')]),                                       // the 3rd main logged day: the rotation starts here
  ses('s7', 8, 'rB', 'B', [ex('Lateral Raise', 3, 'side_delts')]),
  ses('s10', 9, null, '', [ex('DB Curl', 5, 'biceps')]),                                        // freestyle inside the previous rotation: counts
  ses('s8', 10, 'rA', 'A', [ex('Bench Press', 3, 'chest', ['triceps'])]),
  ses('s9', 12, 'rC', 'C', [ex('Leg Press', 3, 'quads')]),                                      // the 6th main logged day: previous rotation starts here
  ses('s11', 20, 'rA', 'A', [ex('Bench Press', 9, 'chest', ['triceps'])])                       // before both windows
];
const st5 = state({ sessions, routines: routines().concat([pump]) });
await boot(page, st5); await go('progress');
const eyebrows = await page.locator('#view .eyebrow').evaluateAll(es => es.map(e => e.textContent.trim()));
ok(eyebrows.includes('Sets per rotation'), '5 the card is "Sets per rotation"');
const prog = await rowsText('#view .card:has(.mrow)');
/* This rotation (s6 onward, newest 3 main days = s1, s5, s6; pump s2 counts; deload s3 and unlogged s4 do not):
   side delts 3; biceps 3 (pump); chest 4; triceps 4 x .5 = 2 (the tag has triceps only as a helper); quads 4. */
eq(prog['Side delts'] + ' ' + prog['Biceps'] + ' ' + prog['Chest'] + ' ' + prog['Triceps'] + ' ' + prog['Quads'], '3 3 4 2 4',
  '5 this rotation: deload (10 chest) and unlogged ignored, the pump day counted');
eq(await page.locator('.mrow .prev').count(), 5, '5 five previous-rotation markers (side, chest, triceps, quads, biceps)');
/* previous (s9 up to s6): side 3 (s7), chest 3 (s8), triceps 1.5, quads 3 (s9), biceps 5 (freestyle s10) -- s11 (20 days) not included.
   Marker positions are checked through the bar scale: biceps is the largest previous value (5). */
const markerLeft = await page.locator('.mrow:has(.mn:text-is("Biceps")) .prev').evaluate(e => parseFloat(e.style.left));
const biceps = await page.locator('.mrow:has(.mn:text-is("Biceps")) .now').evaluate(e => parseFloat(e.style.width));
ok(markerLeft > biceps, '5 biceps: last rotation (5) was bigger than this one (3), marker past the bar  [' + markerLeft + ' vs ' + biceps + ']');
const txt = await page.locator('#view').innerText();
has(txt, 'One rotation = your last 3 days (A, B, C).', '5 footer names the rotation');
has(txt, 'at 3 sessions a week', '5 and the frequency');
has(txt, 'Calves: not tracked, by choice.', '5 skipped muscle is one line, not a nag');
const nothing = (txt.match(/Nothing for ([^.]*)\./) || [])[1] || '';
ok(nothing && !/calves/.test(nothing), '5 "Nothing for" never lists calves  [' + nothing + ']');
ok(/abs/.test(nothing) && /front delts/.test(nothing) && !/side delts/.test(nothing), '5 it does name abs and front delts (the heads are separate)  [' + nothing + ']');
/* the new heads are real rows when they have sets */
await page.evaluate(() => { S.sessions[0].exercises.push({ id: 'zz', name: 'Cable Crunch', mg: 'core', mg2: [], metric: 0, bw: 0, bar: 0, sets: [{ w: '40', r: '12', done: true }] }); writeNow(); viewProgress(); });
const prog2 = await rowsText('#view .card:has(.mrow)');
eq(prog2['Abs'], '1', '5 abs is a row on Progress');
/* fewer than N main logged days */
await boot(page, state({ sessions: sessions.slice(0, 2), routines: routines().concat([pump]) })); await go('progress');
has(await page.locator('#view').innerText(), 'Not a full rotation yet', '5 fewer than N main days: says so');
eq((await rowsText('#view .card:has(.mrow)'))['Side delts'], '3', '5 and still shows what exists');
eq(await page.locator('.mrow .prev').count(), 0, '5 with no previous rotation there are no markers');
/* contracts D will call */
const ctr = await page.evaluate(() => {
  const r = setsByMuscleIn(S.sessions.slice(0, 1));
  return { keys: Object.keys(r).sort().join(','), side: r.by.side_delts, f: targetFreqOf() };
});
eq(ctr.keys + ' ' + ctr.side, 'by,untagged 3', '5 setsByMuscleIn(sessions) returns {by, untagged}');
eq(ctr.f, 3, '5 targetFreqOf() returns the setting');

/* ============ 5b. targetFreqOf from the log ============ */
console.log('5b targetFreqOf auto');
const mon = (w) => { const d = new Date(); d.setHours(10, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * w); return d.getTime(); };
const fs2 = (counts, extra) => { const out = []; counts.forEach((c, w) => { for (let i = 0; i < c; i++) out.push(ses('f' + w + '_' + i, 0, i % 3 === 0 ? 'rA' : i % 3 === 1 ? 'rB' : 'rC', 'A', [ex('Bench Press', 3, 'chest')], { ts: mon(w + 1) + i * DAY, endTs: mon(w + 1) + i * DAY + 36e5 })); }); return out.concat(extra || []); };
// weeks back 1..8 have 4,3,4,3,4,3,4,3 main sessions = 3.5 a week; a pump session and a freestyle one in week 1 do not count
const log = fs2([4, 3, 4, 3, 4, 3, 4, 3], [ses('pp', 0, 'rP', 'P', [ex('Cable Curl', 3, 'biceps')], { ts: mon(1) + 5 * DAY }), ses('fr', 0, null, '', [ex('DB Curl', 3, 'biceps')], { ts: mon(1) + 6 * DAY })]);
await boot(page, state({ settings: settings({ targetFreq: null }), sessions: log.sort((a, b) => b.ts - a.ts), routines: routines().concat([pump]) }));
eq(await page.evaluate(() => targetFreqOf()), 3.5, '5b mean of the last 8 full weeks (3.5), main days only');
await go('plan');
ok(await page.locator('[data-act="freq"]').count() === 0 && await page.locator('.fq-ask').count() === 1, '5b targetFreq unset: the Plan asks instead of using the log guess (see 7)');
await page.evaluate(() => { S.sessions = S.sessions.filter(s => s.ts >= mon7()); function mon7() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * 3); return d.getTime(); } });
const fewer = await page.evaluate(() => targetFreqOf());
ok(fewer >= 1 && fewer <= 7 && fewer * 2 === Math.round(fewer * 2), '5b a shorter log still gives a half-step in 1..7  [' + fewer + ']');
await boot(page, state({ settings: settings({ targetFreq: null }), sessions: [ses('one', 0, 'rA', 'A', [ex('Bench Press', 3, 'chest')])] }));
eq(await page.evaluate(() => targetFreqOf()), 3, '5b no full week in the log: 3');

/* ============ 7. No guessing the frequency ============ */
console.log('7 frequency prompt');
/* A real-shaped log: v5, gappy (a few sessions, long breaks), no targetFreq in the settings. The log would
   average to about one a week, which made every muscle look under-trained. */
const gappy = [ses('g1', 3, 'rA', 'A', [ex('Bench Press', 4, 'chest')]), ses('g2', 31, 'rB', 'B', [ex('Lateral Raise', 3, 'side_delts')]),
  ses('g3', 60, 'rC', 'C', [ex('Leg Press', 4, 'quads')]), ses('g4', 95, 'rA', 'A', [ex('Bench Press', 4, 'chest')])];
const v5 = state({ version: 5, sessions: gappy, settings: { unit: 'lb', inc: 5, rest: 120, bar: 45, doubleDefault: true, repLow: 8, repHigh: 12, rangeFixHidden: true } });
delete v5.block; delete v5.coach;
for (const w of [390, 320]) {
  await page.setViewportSize({ width: w, height: w === 320 ? 640 : 844 });
  await boot(page, v5); await go('plan');
  eq((await getState(page)).settings.targetFreq, null, '7 ' + w + ': the migrated log has no targetFreq');
  has(await page.locator('.bal').innerText(), 'How often do you train?', '7 ' + w + ': the card asks how often');
  eq(await page.locator('.bal .mrow').count(), 0, '7 ' + w + ': no bars or numbers until it is set');
  eq(await page.locator('[data-act="freq"]').count(), 0, '7 ' + w + ': no "at 1 a week" header');
  const chips = await page.locator('.bal [data-act="freq-set"]').allInnerTexts();
  eq(chips.map(s => s.trim()).join(' '), '2 3 3.5 4 5', '7 ' + w + ': one-tap chips 2 3 3.5 4 5');
  ok((await page.locator('.bal [data-act="freq-set"]').evaluateAll(es => es.map(e => e.getBoundingClientRect().height))).every(h => h >= 44), '7 ' + w + ': the chips are at least 44 px tall');
  eq((await sugLabels()).length >= 4, true, '7 ' + w + ': the suggestions stay visible');
  ok(await noOverflow() && await cardFits('.bal'), '7 ' + w + ': no overflow');
}
await page.setViewportSize({ width: 390, height: 844 });
await page.locator('.bal [data-act="freq-set"]', { hasText: /^3\.5$/ }).tap(); await page.waitForTimeout(200);
eq((await getState(page)).settings.targetFreq, 3.5, '7 tapping 3.5 sets targetFreq 3.5');
ok(await page.locator('.bal .mrow').count() > 0 && await page.locator('.fq-ask').count() === 0, '7 the numbers appear and the prompt goes');
eq((await page.locator('[data-act="freq"]').innerText()).trim(), 'at 3.5 a week', '7 the header now offers the sheet for changing it');
/* chest 4 a rotation x 3.5/3 days (N = 3) */
eq((await rowsText('.bal'))['Chest'], '4.7', '7 numbers use 3.5 a week (chest 4 x 3.5/3)');

/* ============ 8. Suggestions find rows by muscle and role, not by spelling ============ */
console.log('8 typo names');
n = 0; rn = 0;
const typo = () => (rn = 0, [
  { id: 'rA', key: 'A', name: 'Day A', optional: false, variants: [{ id: 'vA', label: '', exercises: [
    row('Bench Press', 4, 6, 10, 'chest', ['triceps', 'front_delts']), row('Facepull', 3, 12, 15, 'rear_delts', ['back', 'traps']) ] }] },
  { id: 'rB', key: 'B', name: 'Day B', optional: false, variants: [
    { id: 'vB1', label: 'Week 1', exercises: [row('Arnold Press', 5, 8, 12, 'side_delts', ['triceps']), row('Lateral Riase', 3, 12, 20, 'side_delts', []), row('Cable Row', 4, 8, 12, 'back', ['biceps'])] },
    { id: 'vB2', label: 'Week 2', exercises: [row('Lateral Riase', 3, 12, 20, 'side_delts', []), row('Pull-up', 3, 6, 10, 'back', ['biceps'])] }] },
  { id: 'rC', key: 'C', name: 'Day C', optional: false, variants: [{ id: 'vC', label: '', exercises: [
    row('Leg Press', 4, 8, 12, 'quads', ['glutes', 'hams']), row('Face pull', 3, 12, 15, 'rear_delts', ['back', 'traps']) ] }] }
]);
await boot(page, state({ routines: typo() })); await go('plan');
labels = (await sugLabels()).map(s => s.trim());
eq(labels.join(' | '), '+ Cable Crunch on B and C (abs) | + Overhead Cable Tricep Extension on B | Lateral Riase 3 → 4 sets on B | + Leg Extension on C | Add the optional Pump day | Facepull / Face pull 3 → 4 sets on A and C (optional)',
  '8 all five row suggestions appear (and the pump day), titled with the rows\' own spellings');
for (const id of ['side', 'face', 'tri', 'abs', 'quad', 'pump']) { await page.locator('.sug [data-id="' + id + '"]').tap(); await page.waitForTimeout(150); }
st = await getState(page);
const setsOf = (r, vi, name) => byKey(st, r).variants[vi].exercises.find(e => e.name === name).sets;
eq(setsOf('B', 0, 'Lateral Riase') + ' ' + setsOf('B', 1, 'Lateral Riase'), '4 4', '8 the misspelt raise goes 3 -> 4 in both week variants');
eq(setsOf('B', 0, 'Arnold Press'), 5, '8 a compound side-delt row with more sets is not mistaken for it');
eq(setsOf('A', 0, 'Facepull') + ' ' + setsOf('C', 0, 'Face pull'), '4 4', '8 "Facepull" on A and "Face pull" on C both go to 4');
eq(byKey(st, 'B').variants[1].exercises.slice(-2).map(fmtRow).join(' / '), 'Overhead Cable Tricep Extension 3x10-15 / Cable Crunch 3x10-15 +', '8 the added rows are in B week 2 too');
eq((await sugLabels()).length, 0, '8 nothing is left to suggest');

/* ============ 9. Review fixes ============ */
console.log('9 review fixes');
/* 9.1 untagged counts working sets, not exercises: one untagged lift of 4 sets says 4 */
const mystery = ses('m1', 1, 'rA', 'A', [Object.assign(ex('Zzz Mystery Lift', 4, '', []), { mg: '', mg2: [] })]);
mystery.exercises[0].sets.push({ w: '50', r: '10', done: false });         // an undone set never counts
await boot(page, state({ sessions: [mystery] }));
eq(await page.evaluate(() => { const r = setsByMuscleIn(S.sessions); return r.untagged; }), 4, '9.1 setsByMuscleIn: one untagged exercise with 4 sets says 4');
/* 9.3 the empty state still carries the by-choice line and the untagged warning */
await go('progress');
let t9 = await page.locator('#view').innerText();
has(t9, 'Nothing is tagged yet', '9.3 empty state: nothing is tagged yet');
has(t9, 'Calves: not tracked, by choice.', '9.3 empty state still says calves are skipped by choice');
has(t9, '4 sets in this rotation aren\'t counted', '9.3 empty state still warns about the 4 untagged sets');
eq(await page.locator('.mrow').count(), 0, '9.3 and draws no bars');
/* 9.2 only pump and freestyle logged: no rotation, empty windows */
const extras = [ses('x1', 1, 'rP', 'P', [ex('Cable Curl', 3, 'biceps')]), ses('x2', 2, null, '', [ex('DB Curl', 5, 'biceps')])];
await boot(page, state({ sessions: extras, routines: routines().concat([pump]) }));
const win = await page.evaluate(() => { const w = rotationWindows(); return { cur: w.cur.length, prev: w.prev.length, full: w.full, havePrev: w.havePrev }; });
eq(JSON.stringify(win), '{"cur":0,"prev":0,"full":false,"havePrev":false}', '9.2 no logged main day: empty windows');
await go('progress');
t9 = await page.locator('#view').innerText();
has(t9, 'No sets logged in your last rotation.', '9.2 Progress shows the empty state, not pump and freestyle sets as a rotation');
eq(await page.locator('.mrow').count(), 0, '9.2 and no bars');
/* 9.4 the pair is found again after a reload, and with a non-S1 backup around */
for (const [label, extra] of [['no backup', {}], ['an older planBackup', { planBackup: { ts: 12345, rest: 90, routines: routines().slice(0, 1) } }]]) {
  await boot(page, state(extra)); await go('plan');
  await page.locator('.sug [data-id="tri"]').tap(); await page.waitForTimeout(200);
  await page.reload(); await page.waitForSelector('#view'); await go('plan');
  ok((await getState(page)).routines.find(r => r.key === 'B').variants[0].exercises.slice(-1)[0].s1 === true, '9.4 (' + label + ') the row S1 made is marked on the row and survives a reload');
  await page.locator('.sug [data-id="abs"]').tap(); await page.waitForTimeout(200);
  st = await getState(page);
  for (const vi of [0, 1]) eq(byKey(st, 'B').variants[vi].exercises.slice(-2).map(fmtRow).join(' / '), 'Overhead Cable Tricep Extension 3x10-15 / Cable Crunch 3x10-15 +',
    '9.4 (' + label + ') tri, reload, abs: superset-linked on B week ' + (vi + 1));
}
/* an added row the owner typed in by hand with the same name is not paired */
await boot(page, state()); await go('plan');
await page.evaluate(() => { const r = S.routines.find(x => x.key === 'B'); r.variants.forEach(v => v.exercises.push(newPlanEx('Overhead Cable Tricep Extension'))); writeNow(); viewPlan(); });
await page.locator('.sug [data-id="abs"]').tap(); await page.waitForTimeout(200);
st = await getState(page);
ok(!byKey(st, 'B').variants[0].exercises.slice(-1)[0].link, '9.4 a hand-added extension is not mistaken for an S1 row: no link');

/* ============ 6. Layout: 320 px, screenshot, axe ============ */
console.log('6 layout');
const full = state({ sessions, routines: routines().concat([pump]) });
for (const w of [390, 320]) {
  await page.setViewportSize({ width: w, height: w === 320 ? 640 : 844 });
  await boot(page, full); await go('plan');
  ok(await noOverflow(), '6 Plan has no horizontal overflow at ' + w + ' px');
  ok(await cardFits('.bal'), '6 the balance card fits at ' + w + ' px');
  await page.locator('.sug [data-id="abs"]').first().tap().catch(() => {});
  await page.waitForTimeout(150);
  ok(await noOverflow() && await cardFits('.bal'), '6 still fits with the suggestions applied at ' + w + ' px');
  await page.locator('[data-act="freq"]').tap(); await page.waitForSelector('.sheet');
  ok(await cardFits('.sheet'), '6 the frequency sheet fits at ' + w + ' px');
  await page.keyboard.press('Escape');
  await page.locator('[data-act="excl"]').tap(); await page.waitForSelector('.sheet');
  ok(await cardFits('.sheet') && await noOverflow(), '6 the muscles sheet fits at ' + w + ' px');
  await page.keyboard.press('Escape');
  await boot(page, full); await go('progress');
  ok(await noOverflow() && await cardFits('.mrow'), '6 Progress has no horizontal overflow at ' + w + ' px');
}
await page.setViewportSize({ width: 390, height: 844 });
await boot(page, full); await go('plan');
const crit = await axeCritical();
eq(crit.join(','), '', '6 axe: 0 critical on Plan  [' + crit.join(', ') + ']');
await go('progress');
const crit2 = await axeCritical();
eq(crit2.join(','), '', '6 axe: 0 critical on Progress  [' + crit2.join(', ') + ']');

/* screenshot at device scale 1, scrolled to the card */
const shotCtx = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const shot = await shotCtx.newPage();
await shot.goto(URL);
await shot.evaluate(s => localStorage.setItem('ironlog.v1', JSON.stringify(s)), state({ sessions, routines: routines().concat([pump]) }));
await shot.reload(); await shot.waitForSelector('#view');
await shot.locator('[data-tab="plan"]').tap(); await shot.waitForTimeout(250);
await shot.locator('.bal-head').evaluate(e => e.scrollIntoView({ block: 'start' }));
await shot.evaluate(() => window.scrollBy(0, -64));
await shot.waitForTimeout(150);
fs.mkdirSync('/tmp/claude-0', { recursive: true });
await shot.screenshot({ path: '/tmp/claude-0/pkgE-plan.png' });
await shotCtx.close();

ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
report('t50 balance');
await browser.close();
