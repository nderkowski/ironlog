/* 2.0-a2 package A: schema v6.
   A synthetic v5 log (invented numbers, nothing from a real log) goes in through
   localStorage exactly as an installed v5 phone has it, and the app is driven
   through the UI from there.

   1. v5 -> v6 shape: version, settings, routines, plan rows, planBackup, block;
      no "delts" key anywhere; the three heads land where the table says.
   2. Sets are never touched: every session is identical except mg/mg2 on its
      exercises, and the credited sets per session (heads summed) are unchanged.
   3. The raw v5 text is kept once, never overwritten, never written by an import.
   4. Idempotent: reloading changes nothing; a v5-shaped log written back by an
      old tab converges on the same v6 state.
   5. Export -> Import round trip leaves the log identical.
   6. Settings -> Restore pre-2.0 data: visible only with the copy, the confirm
      shows both counts, Cancel changes nothing, Restore re-migrates the copy,
      keeps a before-restore copy and the v5 copy; refused mid-workout.
   7. newPlanEx / planExFromSession carry scheme, backPct, pins; targetFreq,
      excludedMuscles and the block history cap are normalised.
   8. A blocked v5 write is reported with a toast. */
import { launch, boot, getState, openSettings, ok, eq, has, report, URL as APP } from './harness.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(50); } return false; };
const toastText = page => page.textContent('.toast').catch(() => '').then(t => (t || '').replace(/\s+/g, ' '));
const V5 = 'ironlog.v1.v5-backup', BEFORE = 'ironlog.v1.before-restore';
const raw = (page, k) => page.evaluate(k => localStorage.getItem(k), k);
const clone = o => JSON.parse(JSON.stringify(o));

/* ------------------------------------------------------------ the v5 fixture */
const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:true, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0, repOutDefault:false,
  bar:45, plates:[{ w:45, n:4 }, { w:25, n:2 }, { w:10, n:2 }, { w:5, n:2 }, { w:2.5, n:2 }], lastBackup:0 };

const P = (id, name, reps, repTop, extra) => Object.assign({ id, name, sets:3, reps, repTop, inc:null, bar:0, bw:0, metric:0, link:false, mg:'', mg2:[], added:1 }, extra || {});
const bench   = P('pBench', 'Bench Press', 6, 10, { bar:45, mg:'chest', mg2:['triceps', 'delts'] });
const ohp     = P('pOhp', 'Overhead Press', 6, 10, { bar:45, mg:'delts', mg2:['triceps'] });
const lateral = P('pLat', 'Lateral Raise', 12, 20, { sets:4, mg:'delts' });
const incline = P('pInc', 'Incline DB Press', 8, 12, { mg:'chest', mg2:['triceps', 'delts'] });
const landmine= P('pLand', 'Landmine Press', 8, 12, { mg:'chest', mg2:['delts'] });
const yRaise  = P('pY', 'Cable Y-Raise', 12, 20, {});                                 // untagged
const row     = P('pRow', 'Barbell Row', 8, 12, { bar:45, mg:'back', mg2:['biceps'] });
const face    = P('pFace', 'Face Pull', 12, 16, { mg:'delts', mg2:['back', 'traps'], link:true });  // superset with the row
const rearFly = P('pRear', 'Rear Delt Fly', 12, 16, { mg:'delts' });
const curl    = P('pCurl', 'Cable Curl', 10, 14, { mg:'biceps', mg2:['forearms'] });
const squat   = P('pSq', 'Squat', 5, 8, { bar:45, mg:'quads', mg2:['glutes', 'hams'] });
const legcurl = P('pLC', 'Leg Curl', 10, 14, { mg:'hams', link:true });                // superset with the squat
const frontR  = P('pFr', 'Front Raise', 12, 16, { mg:'delts' });
const arnold  = P('pArn', 'Arnold Press', 8, 12, { mg:'delts', mg2:['delts', 'triceps'] });  // both slots held delts
const pullup  = P('pPu', 'Pull-Up', 6, 10, { bw:1, mg:'back', mg2:['biceps'] });
const assist  = P('pAs', 'Assisted Dip', 8, 12, { bw:2, mg:'chest', mg2:['triceps', 'delts'] });
const plank   = P('pPl', 'Plank', 30, 60, { metric:1, mg:'core' });

const routines = () => clone([
  { id:'rA', key:'A', name:'Day A', variants:[
    { id:'vA1', label:'Week 1', exercises:[bench, ohp, lateral, assist] },
    { id:'vA2', label:'Week 2', exercises:[incline, landmine, yRaise, pullup] } ] },
  { id:'rB', key:'B', name:'Day B', variants:[ { id:'vB', label:'', exercises:[row, face, rearFly, curl] } ] },
  { id:'rC', key:'C', name:'Day C', variants:[ { id:'vC', label:'', exercises:[squat, legcurl, frontR, arnold, plank] } ] }
]);

/* Tags exactly as a v5 session would have copied them from the plan row. */
function sessionOf(i, rid, key, vid, rows, extra) {
  const ts = Date.now() - (i + 1) * 86400000 * 2;
  const exs = rows.map((p, k) => {
    const mode = p.metric === 1 ? 1 : 0;
    const w = p.bw === 1 ? 0 : p.bw === 2 ? 40 : 20 + 5 * ((i + k) % 9);
    const sets = [];
    if (k === 0 && p.bar) sets.push({ w:String(Math.round(w * 0.5)), r:'8', done:true, load:Math.round(w * 0.5), warm:true });
    for (let n = 0; n < p.sets; n++) {
      const r = mode ? 30 + 5 * n : 8 + ((i + n) % 4);
      const s = { w:String(w), r:String(r), done:true, load:w };
      if (n === p.sets - 1 && (i + k) % 5 === 0) { s.out = true; s.r = String(r + 6); }
      if ((i + n + k) % 3 === 0) s.rpe = 7 + ((i + n) % 3);
      sets.push(s);
    }
    return { id:'e' + i + '_' + k, planId:p.id, name:p.name, reps:p.reps, repTop:p.repTop, kind:'reps', bw:p.bw, bar:p.bar, metric:p.metric,
      link:p.link, mg:p.mg, mg2:p.mg2.slice(), shadow:{ w:w + 5, r:8, n:3 }, tgt:{ w, r:p.reps }, sets };
  });
  return Object.assign({ id:'s' + i, ts, endTs:ts + 3600000, routineId:rid, key, variantId:vid, name:'Day ' + key, exercises:exs }, extra || {});
}
function sessions() {
  const out = [];
  const days = [['rA', 'A', 'vA1', [bench, ohp, lateral, assist]], ['rB', 'B', 'vB', [row, face, rearFly, curl]],
    ['rC', 'C', 'vC', [squat, legcurl, frontR, arnold, plank]], ['rA', 'A', 'vA2', [incline, landmine, yRaise, pullup]]];
  for (let i = 0; i < 40; i++) {
    const d = days[i % 4];
    out.push(sessionOf(i, d[0], d[1], d[2], d[3], i === 9 ? { deload:true } : null));   // newest first
  }
  return out;
}
function v5Fixture() {
  return {
    version:5, settings:clone(SET), routines:routines(), sessions:sessions(), active:null,
    planBackup:{ rest:90, savedAt:1, routines:clone([
      { id:'oA', key:'A', name:'Old A', variants:[ { id:'ov1', label:'', exercises:[ohp, lateral, landmine] } ] },
      { id:'oB', key:'B', name:'Old B', variants:[ { id:'ov2', label:'', exercises:[face, rearFly] } ] } ]) },
    coach:{ proposals:[], history:[], lastCheck:0 }
  };
}

/* credited sets per session, every muscle summed (1 main + 0.5 per helper, warm-ups out) */
function credit(sess) {
  let t = 0;
  for (const e of sess.exercises) {
    const n = e.sets.filter(s => !s.warm && s.done !== false).length;
    t += n * ((e.mg ? 1 : 0) + 0.5 * (e.mg2 || []).length);
  }
  return t;
}
const stripTags = s => { const c = clone(s); c.exercises.forEach(e => { delete e.mg; delete e.mg2; }); return c; };
const planRows = st => st.routines.flatMap(r => r.variants.flatMap(v => v.exercises));
const backupRows = st => st.planBackup.routines.flatMap(r => r.variants.flatMap(v => v.exercises));
const rowOf = (st, name) => planRows(st).find(e => e.name === name);
const hasDelts = json => /"delts"/.test(typeof json === 'string' ? json : JSON.stringify(json));

const { browser, page, errors } = await launch();

/* PR flags are derived data: let the app's own recomputePRs() set them on the
   fixture, so the log is internally consistent and an Import (which recomputes)
   has nothing to change. normalize() itself never recomputes. */
const fix = v5Fixture();
await boot(page, fix);
const prs = await page.evaluate(() => { recomputePRs(); return S.sessions.map(s => s.exercises.map(e => e.sets.map(x => x.pr))); });
fix.sessions.forEach((s, i) => s.exercises.forEach((e, k) => e.sets.forEach((x, n) => { x.pr = prs[i][k][n]; })));
const V5TEXT = JSON.stringify(fix);
ok(prs.flat(2).some(x => x === true), 'fixture: some sets are PRs (so the pr flag is exercised)');

/* ================================================== 1-3. migrate and snapshot */
console.log('\n1. v5 -> v6');
await page.evaluate(() => localStorage.clear());
await page.evaluate(t => localStorage.setItem('ironlog.v1', t), V5TEXT);
await page.reload(); await page.waitForSelector('#view');
let st = await getState(page);

eq(st.version, 6, '1 version is 6');
eq(st.sessions.length, 40, '1 40 sessions');
eq(JSON.stringify(st.settings.excludedMuscles), '["calves"]', '1 excludedMuscles from v5 is ["calves"]');
eq(st.settings.targetFreq, null, '1 targetFreq null (auto)');
eq(st.settings.blockRotations, 6, '1 blockRotations 6');
eq(st.settings.repOutDefault, false, '1 repOutDefault is left in the stored data');
ok(!('v2' in st.settings), '1 no settings.v2 flag (commander ruling 4)');
ok(st.routines.every(r => r.optional === false), '1 every routine has optional:false');
ok(planRows(st).every(e => e.scheme === 'double' && e.backPct === 0.12 && Array.isArray(e.pins) && e.pins.length === 0), '1 every plan row has scheme double, backPct 0.12, pins []');
ok(backupRows(st).every(e => e.scheme === 'double' && e.backPct === 0.12 && e.pins.length === 0), '1 the same on S.planBackup rows');
ok(st.planBackup.routines.every(r => r.optional === false), '1 planBackup routines have optional:false');
eq(JSON.stringify(st.block), JSON.stringify({ num:1, startSessId:'s0', startTs:fix.sessions[0].ts, rotation:0, history:[] }), '1 S.block anchored on the newest session');
ok(!hasDelts(st), '1 no "delts" key survives anywhere (plan, backup, history, settings)');
ok(!hasDelts(await raw(page, 'ironlog.v1')), '1 and the stored log on disk is v6 too (written once)');

eq(rowOf(st, 'Lateral Raise').mg, 'side_delts', '1 plan: Lateral Raise -> side_delts');
eq(rowOf(st, 'Overhead Press').mg, 'front_delts', '1 plan: Overhead Press -> front_delts');
eq(rowOf(st, 'Face Pull').mg, 'rear_delts', '1 plan: Face Pull -> rear_delts');
eq(rowOf(st, 'Rear Delt Fly').mg, 'rear_delts', '1 plan: Rear Delt Fly -> rear_delts');
eq(rowOf(st, 'Front Raise').mg, 'front_delts', '1 plan: Front Raise -> front_delts');
eq(JSON.stringify(rowOf(st, 'Bench Press').mg2), '["triceps","front_delts"]', '1 plan: Bench helper delts -> front_delts, order kept');
eq(JSON.stringify(rowOf(st, 'Landmine Press').mg2), '["front_delts"]', '1 plan: Landmine Press (chest, helper delts) -> front_delts helper');
eq(rowOf(st, 'Cable Y-Raise').mg + '|' + rowOf(st, 'Cable Y-Raise').mg2.length, '|0', '1 plan: the untagged Cable Y-Raise stays untagged');
const arn = rowOf(st, 'Arnold Press');
ok(arn.mg === 'front_delts' && arn.mg2.length === 2 && arn.mg2.includes('triceps') && arn.mg2.some(k => /_delts$/.test(k) && k !== arn.mg), '1 plan: Arnold (delts main AND helper) -> the helper takes a different head, never dropped');
eq(backupRows(st).find(e => e.name === 'Face Pull').mg, 'rear_delts', '1 planBackup: Face Pull -> rear_delts');
eq(backupRows(st).find(e => e.name === 'Lateral Raise').mg, 'side_delts', '1 planBackup: Lateral Raise -> side_delts');
ok(st.sessions.every(s => s.exercises.every(e => !('mg' in e) || e.mg !== 'delts')), '1 history: no delts main');
eq(st.sessions[1].exercises.find(e => e.name === 'Face Pull').mg, 'rear_delts', '1 history: Face Pull -> rear_delts');
ok(rowOf(st, 'Face Pull').link === true && rowOf(st, 'Leg Curl').link === true, '1 supersets (link) untouched');
eq(st.routines[0].variants.length, 2, '1 the week variants are still two');

console.log('\n2. sets and credit');
let setsSame = true, tagsOnly = true, creditSame = true;
st.sessions.forEach((s, i) => {
  if (JSON.stringify(stripTags(s)) !== JSON.stringify(stripTags(fix.sessions[i]))) tagsOnly = false;
  s.exercises.forEach((e, k) => { if (JSON.stringify(e.sets) !== JSON.stringify(fix.sessions[i].exercises[k].sets)) setsSame = false; });
  if (credit(s) !== credit(fix.sessions[i])) creditSame = false;
});
ok(setsSame, '2 every set of every session is byte-identical (pr included)');
ok(tagsOnly, '2 every session is identical except mg/mg2 on its exercises');
ok(creditSame, '2 sum of credited sets per session is unchanged for all 40 sessions');
ok(st.sessions.every((s, i) => s.id === fix.sessions[i].id && s.ts === fix.sessions[i].ts && s.routineId === fix.sessions[i].routineId && s.variantId === fix.sessions[i].variantId), '2 ids, order, ts, routine and variant unchanged');
ok(st.sessions[9].deload === true, '2 the deload session is still a deload');
/* the same credit, read by the app's own muscle table */
const fam = await page.evaluate(() => { const by = setsByMuscle(0, Infinity).by; let all = 0; Object.keys(by).forEach(k => { all += by[k]; }); return { all, heads: by.front_delts + by.side_delts + by.rear_delts, untagged: setsByMuscle(0, Infinity).untagged }; });
const want = fix.sessions.reduce((t, s) => t + s.exercises.reduce((a, e) => {
  if (!(e.mg || e.mg2.length)) return a;
  return a + e.sets.filter(x => !x.warm && x.done !== false).length * ((e.mg ? 1 : 0) + 0.5 * e.mg2.length);
}, 0), 0);
const wantHeads = fix.sessions.reduce((t, s) => t + s.exercises.reduce((a, e) => a + e.sets.filter(x => !x.warm && x.done !== false).length * ((e.mg === 'delts' ? 1 : 0) + 0.5 * e.mg2.filter(k => k === 'delts').length), 0), 0);
eq(fam.all, want, '2 setsByMuscle: total credited over every muscle equals what the v5 tags credited');
eq(fam.heads, wantHeads, '2 setsByMuscle: the three heads together equal what "delts" credited');

console.log('\n3. the v5 snapshot');
eq(await raw(page, V5), V5TEXT, '3 ironlog.v1.v5-backup holds the exact v5 text');
await page.reload(); await page.waitForSelector('#view');
eq(await raw(page, V5), V5TEXT, '3 a reload leaves it unchanged');
const other = v5Fixture(); other.sessions = other.sessions.slice(0, 5);
const OTHER = JSON.stringify(other);
await page.evaluate(t => localStorage.setItem('ironlog.v1', t), OTHER);
await page.reload(); await page.waitForSelector('#view');
eq(await raw(page, V5), V5TEXT, '3 a different v5 log loaded later never overwrites the first copy');
eq((await getState(page)).sessions.length, 5, '3 (and that log is the one in use)');

/* ================================================== 4. idempotency, old tab */
console.log('\n4. idempotency');
await page.evaluate(t => localStorage.setItem('ironlog.v1', t), V5TEXT);
await page.reload(); await page.waitForSelector('#view');
const once = await getState(page);
await page.reload(); await page.waitForSelector('#view');
await page.reload(); await page.waitForSelector('#view');
const thrice = await getState(page);
eq(JSON.stringify(thrice), JSON.stringify(once), '4 reloading twice more leaves the stored log identical');
ok(await page.evaluate(() => MIGRATED === false), '4 MIGRATED stays false on a v6 log');
ok(await page.evaluate(() => { const a = JSON.stringify(S); const b = JSON.stringify(normalize(JSON.parse(a))); return a === b; }), '4 normalize(normalize(x)) equals normalize(x)');
/* what an older tab leaves: version 5 and a delts tag back on a plan row, a history exercise and the backup */
const mixed = clone(once);
mixed.version = 5;
rowOf(mixed, 'Lateral Raise').mg = 'delts';
mixed.sessions[1].exercises.find(e => e.name === 'Face Pull').mg = 'delts';
backupRows(mixed)[0].mg = 'delts';
await page.evaluate(t => localStorage.setItem('ironlog.v1', t), JSON.stringify(mixed));
await page.reload(); await page.waitForSelector('#view');
eq(JSON.stringify(await getState(page)), JSON.stringify(once), '4 a v5-shaped log with delts written back by an old tab converges on the same v6 state');

/* ================================================== 5. export -> import */
console.log('\n5. export -> import');
const strip = s => { const c = clone(s); delete c.settings.lastBackup; return JSON.stringify(c); };
const beforeRT = await getState(page);
await openSettings(page);
await page.click('[data-act="export"]');
await page.waitForSelector('.sheet textarea[readonly]');
const exported = await page.inputValue('.sheet textarea[readonly]');
await page.click('.sheet [data-x="close"]');
eq(JSON.parse(exported).version, 6, '5 the export is v6');
ok(!hasDelts(exported), '5 the export has no delts');
await page.click('[data-act="import"]');
await page.waitForSelector('.sheet textarea[data-x="paste"]');
await page.$eval('.sheet textarea[data-x="paste"]', (el, v) => { el.value = v; }, exported);
await page.click('.sheet [data-x="go"]');
await until(async () => /Log imported/.test(await toastText(page)));
const afterRT = await getState(page);
eq(strip(afterRT), strip(beforeRT), '5 importing the export gives the identical log (sessions, sets, pr, plan, block, settings)');
eq(await raw(page, V5), V5TEXT, '5 the import did not touch the v5 copy');

console.log('\n5b. importing a v5 file does not write the copy');
await page.evaluate(k => localStorage.removeItem(k), V5);
await openSettings(page);
await page.click('[data-act="import"]');
await page.waitForSelector('.sheet textarea[data-x="paste"]');
await page.$eval('.sheet textarea[data-x="paste"]', (el, v) => { el.value = v; }, V5TEXT);
await page.click('.sheet [data-x="go"]');
await until(async () => /Log imported/.test(await toastText(page)));
eq(await raw(page, V5), null, '5b the importer does not create ironlog.v1.v5-backup');
eq((await getState(page)).version, 6, '5b but the imported log is migrated to v6');
ok(!hasDelts(await raw(page, 'ironlog.v1')), '5b with the heads split');

/* ================================================== 6. restore button */
console.log('\n6. Restore pre-2.0 data');
await openSettings(page);
ok((await page.$('[data-act="restore-v5"]')) === null, '6 no button while there is no copy');
await page.evaluate(([k, t]) => localStorage.setItem(k, t), [V5, V5TEXT]);
await page.click('[data-tab="today"]'); await openSettings(page);               // redraw
ok((await page.$('[data-act="restore-v5"]')) !== null, '6 the button appears when the copy exists');
eq((await page.textContent('[data-act="restore-v5"]')).trim(), 'Restore pre-2.0 data', '6 button label');
ok((await page.$('[data-act="put-back"]')) === null, '6 "Put back the log from before the restore" is not offered yet');

/* make the phone differ from the copy: 3 sessions fewer */
await page.evaluate(() => { S.sessions.splice(0, 3); writeNow(); });
eq((await getState(page)).sessions.length, 37, '6 the phone now has 37 sessions');
await page.click('[data-act="restore-v5"]');
await page.waitForSelector('.sheet');
const sheetText = (await page.textContent('.sheet')).replace(/\s+/g, ' ');
has(sheetText, 'Restore pre-2.0 data?', '6 confirm title');
has(sheetText, 'has 40 sessions', '6 confirm shows the copy\'s session count');
has(sheetText, 'This phone has 37 sessions', '6 confirm shows the phone\'s session count');
has(sheetText, 'anything logged since is lost', '6 confirm says what is lost');
await page.click('.sheet [data-x="cancel"]');
await sleep(200);
eq((await getState(page)).sessions.length, 37, '6 Cancel changes nothing');
ok((await raw(page, BEFORE)) === null, '6 and keeps no before-restore copy');

await page.click('[data-act="restore-v5"]');
await page.waitForSelector('.sheet [data-x="ok"]');
await page.click('.sheet [data-x="ok"]');
ok(await until(async () => /Pre-2\.0 data restored/.test(await toastText(page))), '6 restore: toast');
st = await getState(page);
eq(st.sessions.length, 40, '6 restore: the 40 sessions are back');
eq(st.version, 6, '6 restore: re-migrated to v6');
ok(!hasDelts(st), '6 restore: heads split again');
eq(JSON.stringify(st.sessions.map(s => stripTags(s))), JSON.stringify(fix.sessions.map(s => stripTags(s))), '6 restore: sessions equal the copy (tags aside)');
eq(await raw(page, V5), V5TEXT, '6 restore: the v5 copy is still there');
eq(JSON.parse(await raw(page, BEFORE)).sessions.length, 37, '6 restore: a before-restore copy of the 37-session log was kept');
ok(await page.evaluate(() => TAB === 'today'), '6 restore: lands on Today');
await page.click('[data-tab="progress"]'); await page.waitForSelector('#view .card');
await page.click('[data-tab="plan"]'); await page.waitForSelector('#view .card');
await page.click('[data-tab="today"]');
await openSettings(page);
ok((await page.$('[data-act="put-back"]')) !== null, '6 restore: "Put back the log from before the restore" is now shown');
ok((await page.$('[data-act="restore-v5"]')) !== null, '6 restore: and the pre-2.0 button stays');

/* mid-workout: refused */
await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="rB"]');
await page.waitForSelector('.card.ex .set .tick');
await (await page.$$('.card.ex .set .tick'))[0].click();
await sleep(300);
const midLen = (await getState(page)).sessions.length;
await openSettings(page);
await page.click('[data-act="restore-v5"]');
ok(await until(async () => /Finish or discard the workout first/.test(await toastText(page)), 2500), '6 mid-workout: refused with the usual toast');
await sleep(500);
ok((await page.$('.sheet')) === null, '6 mid-workout: no confirm sheet');
st = await getState(page);
ok(!!st.active && st.sessions.length === midLen, '6 mid-workout: the workout and the log are untouched');
ok(errors.length === 0, '6 no page errors so far  ' + JSON.stringify(errors.slice(0, 2)));

/* ================================================== 7. constructors and normalisation */
console.log('\n7. constructors and normalize');
const ctor = await page.evaluate(() => {
  const a = newPlanEx('Bench Press');
  const b = planExFromSession({ name:'Cable Row', sets:[{ w:'100', r:'10', done:true }], reps:10, scheme:'topback', backPct:0.2, pins:[100, 70, 85, 85, 0] });
  const c = planExFromSession({ name:'Curl', sets:[{ w:'20', r:'10' }], reps:10, scheme:'bogus', backPct:0.9, pins:[50] });
  const d = planExFromSession({ name:'Old', sets:[{ w:'20', r:'10' }], reps:10 });
  return { a, b, c, d };
});
eq(ctor.a.scheme + '|' + ctor.a.backPct + '|' + JSON.stringify(ctor.a.pins), 'double|0.12|[]', '7 newPlanEx: scheme double, backPct 0.12, pins []');
eq(ctor.b.scheme + '|' + ctor.b.backPct + '|' + JSON.stringify(ctor.b.pins), 'topback|0.2|[70,85,100]', '7 planExFromSession keeps a topback extra\'s scheme, backPct and pins (cleaned)');
eq(ctor.c.scheme + '|' + ctor.c.backPct + '|' + JSON.stringify(ctor.c.pins), 'double|0.12|[]', '7 planExFromSession: bad scheme, backPct and a one-pin stack fall back to the defaults');
eq(ctor.d.scheme + '|' + ctor.d.backPct + '|' + JSON.stringify(ctor.d.pins), 'double|0.12|[]', '7 planExFromSession: a session row with none gets the defaults');

const norm = await page.evaluate(() => {
  const mk = o => normalize(Object.assign({ version:6, settings:{}, routines:[], sessions:[] }, o));
  const f = v => mk({ settings:{ targetFreq:v, excludedMuscles:[] } }).settings.targetFreq;
  const hist = Array.from({ length:45 }, (_, i) => ({ num:i + 1 }));
  return {
    tf:[3.3, 3.2, 2.75, 1, 7, 0.9, 7.2, 0, -2, 'abc', null, 3].map(f),
    exFresh:mk({}).settings.excludedMuscles,
    exKeep:mk({ settings:{ excludedMuscles:['calves', 'delts', 'nope', 'calves', 'core'] } }).settings.excludedMuscles,
    exV5:normalize({ version:5, settings:{}, routines:[], sessions:[] }).settings.excludedMuscles,
    exV5own:normalize({ version:5, settings:{ excludedMuscles:[] }, routines:[], sessions:[] }).settings.excludedMuscles,
    br:[mk({ settings:{ blockRotations:4.4 } }).settings.blockRotations, mk({ settings:{ blockRotations:0 } }).settings.blockRotations, mk({}).settings.blockRotations],
    cap:(() => { const b = mk({ block:{ num:3, startSessId:'x', startTs:5, rotation:2, history:hist } }).block; return [b.history.length, b.history[0].num, b.history[39].num]; })(),
    capEdge:mk({ block:{ num:3, startSessId:'x', startTs:5, rotation:2, history:hist.slice(0, 40) } }).block.history.length,
    blkBad:mk({ block:{ num:'x', startSessId:7, startTs:'y', history:'z' } }).block,
    pins:(() => { const r = { id:'r', key:'A', name:'A', variants:[{ id:'v', label:'', exercises:[{ id:'e', name:'Row', scheme:'topback', backPct:0.3, pins:[30, 10, 10.004, -5] }, { id:'f', name:'Pull', scheme:'x', backPct:0.5, pins:[10] }] }] };
      const out = mk({ routines:[r] }).routines[0].variants[0].exercises; return out.map(e => e.scheme + '|' + e.backPct + '|' + JSON.stringify(e.pins)); })(),
    fresh:(() => { const d = defaultState(); return { v:d.version, s:Object.assign({}, d.settings), b:d.block, o:d.routines.map(r => r.optional) }; })()
  };
});
eq(JSON.stringify(norm.tf), JSON.stringify([3.5, 3, 3, 1, 7, null, null, null, null, null, null, 3]), '7 targetFreq: clamped to 1-7, rounded to 0.5, junk -> null (auto)');
eq(JSON.stringify(norm.exFresh), '[]', '7 excludedMuscles on a v6 log without the field is []');
eq(JSON.stringify(norm.exKeep), '["calves","core"]', '7 excludedMuscles: delts, unknown keys and duplicates are dropped');
eq(JSON.stringify(norm.exV5), '["calves"]', '7 excludedMuscles migrating from v5 is ["calves"]');
eq(JSON.stringify(norm.exV5own), '[]', '7 a v5 log that already holds an excludedMuscles list keeps it');
eq(JSON.stringify(norm.br), '[4,6,6]', '7 blockRotations rounded, floor 1 -> default 6');
eq(JSON.stringify(norm.cap), '[40,6,45]', '7 block.history capped at the newest 40 (newest last)');
eq(norm.capEdge, 40, '7 exactly 40 is left alone');
const bb = norm.blkBad;
eq([bb.num, bb.startSessId, bb.startTs, bb.rotation, JSON.stringify(bb.history)].join('|'), '1||0|0|[]', '7 a damaged block is repaired');
eq(JSON.stringify(norm.pins), JSON.stringify(['topback|0.3|[10,30]', 'double|0.12|[]']), '7 plan rows: pins cleaned, bad scheme and backPct defaulted');
eq(norm.fresh.v, 6, '7 defaultState is v6');
ok(!('repOutDefault' in norm.fresh.s) && !('v2' in norm.fresh.s) && norm.fresh.s.targetFreq === null && norm.fresh.s.excludedMuscles.length === 0 && norm.fresh.s.blockRotations === 6, '7 defaultState settings: no repOutDefault, no v2, targetFreq null, excludedMuscles [], blockRotations 6');
ok(norm.fresh.b.history.length === 0 && norm.fresh.o.every(o => o === false), '7 defaultState: empty block, routines not optional');

const tbl = await page.evaluate(() => ({
  keys:MUSCLES.map(m => m.k).join(','), core:muscleName('core'), fd:muscleName('front_delts'), has:isMuscle('delts'),
  g:['Lateral Raise', 'Front Raise', 'Upright Row', 'Face Pull', 'Reverse Fly', 'Rear Delt Fly', 'Overhead Press', 'Arnold Press', 'Cable Fly', 'Bench Press', 'Incline DB Press', 'Cable Wrist Curl', 'Barbell Curl', 'Cable Y-Raise']
    .map(n => { const t = guessMuscles(n); return n + '=' + t.mg + '+' + t.mg2.join('/'); })
}));
eq(tbl.keys, 'chest,back,traps,front_delts,side_delts,rear_delts,biceps,triceps,forearms,quads,hams,glutes,calves,core', '7 MUSCLES: three delt heads in place of delts');
eq(tbl.core + '|' + tbl.fd + '|' + tbl.has, 'Abs|Front delts|false', '7 labels: core reads Abs; delts is no longer a muscle');
eq(tbl.g.join(' ; '), 'Lateral Raise=side_delts+ ; Front Raise=front_delts+ ; Upright Row=side_delts+ ; Face Pull=rear_delts+back/traps ; Reverse Fly=rear_delts+back/traps ; Rear Delt Fly=rear_delts+back/traps ; Overhead Press=front_delts+triceps ; Arnold Press=front_delts+triceps ; Cable Fly=chest+front_delts ; Bench Press=chest+triceps/front_delts ; Incline DB Press=chest+triceps/front_delts ; Cable Wrist Curl=forearms+ ; Barbell Curl=biceps+forearms ; Cable Y-Raise=+', '7 MG_GUESS: precedence (face pull / reverse fly / lateral raise before press / fly; wrist curl before curl)');

/* ================================================== fresh install and a blocked write */
console.log('\n8. fresh install, blocked write');
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForSelector('#view');
eq(await raw(page, V5), null, '8 a fresh install writes no v5 copy');
await openSettings(page);
ok((await page.$('[data-act="restore-v5"]')) === null, '8 and offers no restore');
eq(await page.evaluate(() => BUILD), 'v2.0-a2', '8 BUILD is v2.0-a2');

const blocked = await browser.newContext({ viewport:{ width:390, height:844 } });
const bp = await blocked.newPage();
await bp.addInitScript(k => {
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, v) { if (key === k) throw new Error('QuotaExceededError'); return set.call(this, key, v); };
}, V5);
await bp.goto(APP);
await bp.evaluate(t => localStorage.setItem('ironlog.v1', t), V5TEXT);
await bp.reload(); await bp.waitForSelector('#view');
ok(await until(async () => /Couldn't keep a pre-2\.0 copy/.test(await bp.textContent('.toast').catch(() => '')), 3000), '8 a blocked v5 copy is reported with a toast');
eq((await bp.evaluate(() => JSON.parse(localStorage.getItem('ironlog.v1')).version)), 6, '8 the log still migrates');
await blocked.close();

ok(errors.length === 0, 'no page errors  ' + JSON.stringify(errors.slice(0, 3)));
await browser.close();
report('t48 schema v6');
