/* Settings → Workout plan: switch to the recommended plan and back.

   The plan is Nick's own lifts repacked to fit ~45 min (ROADMAP v24). The
   switch must keep every logged session, join the plan's lifts to history
   logged under old spellings, keep the rotation going, keep per-lift
   settings like a 10 lb cable increment, and be exactly reversible. */
import { launch, boot, getState, openSettings, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:180, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:205, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

const px = (id, name, reps, repTop, extra) => Object.assign({ id, name, sets:3, reps, repTop, inc:null }, extra || {});
function session(id, daysAgo, rid, key, vid, exs) {
  const ts = Date.now() - daysAgo * 86400000;
  return { id, ts, endTs:ts, routineId:rid, key, name:'Day ' + key, variantId:vid, exercises: exs.map(([name, w, r], i) => ({
    id:id + 'e' + i, planId:null, name, reps:8, repTop:12, kind:'reps',
    sets:[1, 2, 3].map(() => ({ w:String(w), r:String(r), done:true, load:w })) })) };
}
/* Shaped like the real log: a typo, two face-pull spellings, two-week
   variants on B and C, a cable fly on a 10 lb increment, rest at 180. */
function seed() {
  return { version:5, settings:Object.assign({}, SET), active:null,
    routines:[
      { id:'rA', key:'A', name:'Day A', variants:[ { id:'vA', label:'', exercises:[
        px('a1','Leg Press',8,12), px('a2','Incline DB Press',8,12), px('a3','Cable Row',8,12),
        px('a4','Facepull',8,12), px('a5','Reverse Curl',8,12), px('a6','Hamstring Curls',8,12),
        px('a7','Lateral Riase',12,20,{ sets:4 }) ] } ] },
      { id:'rB', key:'B', name:'Day B', variants:[
        { id:'vB1', label:'Week 1', exercises:[ px('b1','Bulgarian Split Squat',8,11), px('b2','DB Overhead Press',8,12),
          px('b3','Lat Pulldown',8,12), px('b4','Lateral Riase',8,12), px('b5','Tricep Pushdown',8,12), px('b6','DB Curl',8,12) ] },
        { id:'vB2', label:'Week 2', exercises:[ px('b7','Bulgarian Split Squat',8,11), px('b8','Cross-body Tricep Extensions',12,16) ] } ] },
      { id:'rC', key:'C', name:'Day C', variants:[
        { id:'vC1', label:'Week 1', exercises:[ px('c1','RDL',8,11), px('c2','Incline DB Press',8,12), px('c3','DB Row',8,12),
          px('c4','Face pull',8,12), px('c5','Hamstring Curls',8,12), px('c6','Low to high cable fly',12,16,{ inc:10, mg:'chest' }) ] },
        { id:'vC2', label:'Week 2', exercises:[ px('c7','RDL',8,11) ] } ] } ],
    sessions:[
      session('s3', 1, 'rC', 'C', 'vC1', [['RDL',225,8],['Low to high cable fly',20,13],['Face pull',10,9]]),
      session('s2', 3, 'rB', 'B', 'vB1', [['Lateral Riase',15,16],['DB Curl',30,8]]),
      session('s1', 6, 'rA', 'A', 'vA',  [['Leg Press',190,11],['Facepull',10,8],['Lateral Riase',15,12]]),
    ] };
}

const { browser, page, errors } = await launch();
page.on('dialog', d => d.accept());

/* ---- 1. the card describes the plan before anything changes ---- */
await boot(page, seed());
const original = await getState(page);
await openSettings(page);
const card = (await page.textContent('#view')).replace(/\s+/g, ' ');
has(card, 'Recommended: 3-day full body, about 45 min', 'Settings has the recommended plan card');
has(card, 'A Leg Press · Incline DB Press + Cable Row · Hamstring Curls + Lateral Raise · DB Curl + Tricep Pushdown',
  'Day A is listed with its supersets');
has(card, 'Hamstring Curls + Lateral Raise · Low to high cable fly + Rear Delt Fly', 'Day C pairs hams with side delts and the fly with rear delts');
const dayLines = await page.$$eval('#view .tiny', els => els.map(e => e.textContent).filter(t => /^[ABC] /.test(t)));
eq(dayLines.length, 3, 'three day lines');
ok(!dayLines.some(t => /face/i.test(t)), 'face pulls are not in any day of the recommended plan');

await page.click('[data-act="plan-rec"]');
await page.waitForSelector('.sheet [data-x="ok"]');
has(await page.textContent('.sheet'), 'now 180 s', 'the confirm says rest changes from 180');
await page.click('.sheet [data-x="cancel"]');
eq(JSON.stringify(await getState(page)), JSON.stringify(original), 'cancel changes nothing');

/* ---- 2. switching ---- */
await page.click('[data-act="plan-rec"]');
await page.waitForSelector('.sheet [data-x="ok"]');
await page.click('.sheet [data-x="ok"]');
await page.waitForSelector('[data-act="plan-back"]');
let st = await getState(page);
eq(st.routines.map(r => r.id).join(), 'rA,rB,rC', 'the same three days, same ids');
eq(st.routines.map(r => r.variants.length).join(), '1,1,1', 'one week per day');
eq(st.routines.map(r => r.variants[0].id).join(), 'vA,vB1,vC1', 'each day keeps its first week\'s id');
const day = k => st.routines.find(r => r.key === k).variants[0].exercises;
eq(day('A').map(e => (e.link ? '+' : '') + e.name).join('|'),
  'Leg Press|Incline DB Press|+Cable Row|Hamstring Curls|+Lateral Raise|DB Curl|+Tricep Pushdown', 'Day A: lifts and supersets');
eq(day('C').map(e => (e.link ? '+' : '') + e.name).join('|'),
  'RDL|Flat DB Press|+DB Row|Hamstring Curls|+Lateral Raise|Low to high cable fly|+Rear Delt Fly', 'Day C: lifts and supersets, no shoulder-to-shoulder pair');
eq(day('C').map(e => e.reps + '-' + e.repTop).join(), '6-10,8-12,8-12,8-12,12-20,12-16,12-20', 'Day C ranges');
ok(st.routines.every(r => r.variants[0].exercises.every(e => e.sets === 3)), 'every lift is 3 sets');
eq(day('C').find(e => e.name === 'Low to high cable fly').inc, 10, 'the cable fly keeps its 10 lb increment');
eq(st.settings.rest, 120, 'rest becomes 120 s');
eq(st.sessions.length, 3, 'every session kept');
const logged = st.sessions.flatMap(s => s.exercises.map(e => e.name));
ok(!logged.includes('Lateral Riase'), 'the typo is fixed in the history');
eq(logged.filter(n => /face/i.test(n)).join(), 'Face Pull,Face Pull', 'both face-pull spellings merged');
ok(!!st.planBackup && st.planBackup.routines.length === 3, 'the old plan is kept in the state (so it rides in backups)');

/* ---- 2b. a plan switched before the Day C fix is offered the re-pairing ----
   Put Day C back in the old order (Lateral Raise superset into Rear Delt Fly)
   and check the card offers the fix, applies it to his own rows, and goes. */
await page.evaluate(() => {
  const st = JSON.parse(localStorage.getItem('ironlog.v1'));
  const v = st.routines.find(r => r.key === 'C').variants[0];
  const by = n => v.exercises.find(e => e.name === n);
  const old = [['RDL',0],['Flat DB Press',0],['DB Row',1],['Hamstring Curls',0],['Low to high cable fly',1],['Lateral Raise',0],['Rear Delt Fly',1]];
  v.exercises = old.map(([n, l]) => Object.assign(by(n), { link: !!l }));
  localStorage.setItem('ironlog.v1', JSON.stringify(st));
});
await page.reload(); await page.waitForSelector('#view');
await openSettings(page);
const beforeFix = JSON.parse(await page.evaluate(() => localStorage.getItem('ironlog.v1'))).routines.find(r => r.key === 'C').variants[0].exercises;
has(await page.textContent('#view'), 'two shoulder lifts back to back', 'old Day C pairing: the card explains the fix');
await page.click('[data-act="plan-fixc"]');
await page.waitForSelector('[data-act="plan-back"]');
const afterFix = JSON.parse(await page.evaluate(() => localStorage.getItem('ironlog.v1'))).routines.find(r => r.key === 'C').variants[0].exercises;
eq(afterFix.map(e => (e.link ? '+' : '') + e.name).join('|'),
  'RDL|Flat DB Press|+DB Row|Hamstring Curls|+Lateral Raise|Low to high cable fly|+Rear Delt Fly', 'Re-pair Day C: the new order and links');
eq(afterFix.map(e => e.id).sort().join(), beforeFix.map(e => e.id).sort().join(), 'Re-pair Day C: the same rows, ids kept');
eq(afterFix.find(e => e.name === 'Low to high cable fly').inc, 10, 'Re-pair Day C: per-lift settings kept (10 lb fly increment)');
ok(!(await page.textContent('#view')).includes('two shoulder lifts back to back'), 'Re-pair Day C: the offer goes away once applied');
st = await getState(page);

/* ---- 3. Today: the rotation carries on, and history joins the new rows ---- */
await page.click('[data-tab="today"]');
await page.waitForSelector('[data-act="start"][data-id="rA"]');
has(await page.textContent('#view'), 'Day A', 'last session was C, so A is next');
await page.click('[data-act="start"][data-id="rA"]');
await page.waitForSelector('.card.ex');
const names = await page.$$eval('.card.ex .ex-name', els => els.map(e => e.textContent.trim()));
eq(names.join('|'), 'Leg Press|B1Incline DB Press|B2Cable Row|C1Hamstring Curls|C2Lateral Raise|D1DB Curl|D2Tricep Pushdown',
  'Day A shows the superset tags');
const allW = await page.$$eval('.card.ex', cs => cs.map(c => [c.querySelector('.ex-name').textContent.trim(), c.querySelector('.set input[data-f="w"]').value]));
eq(allW.find(x => /Lateral Raise/.test(x[0]))[1], '15', 'Lateral Raise prefills from the history logged as "Lateral Riase"');
eq(allW.find(x => /Leg Press/.test(x[0]))[1], '190', 'Leg Press prefills from its history');
/* Switching is refused mid-workout. */
await openSettings(page);
await page.click('[data-act="plan-back"]');
await page.waitForTimeout(200);
eq(await page.$('.sheet [data-x="ok"]'), null, 'mid-workout: no switch offered');
eq(JSON.stringify((await getState(page)).routines), JSON.stringify(st.routines), 'mid-workout: plan unchanged');
await page.click('[data-tab="today"]');
await page.click('[data-act="discard"]'); await page.click('[data-x="ok"]');

/* ---- 4. fits a 320 px phone ---- */
await page.setViewportSize({ width:320, height:740 });
await openSettings(page);
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Settings with the plan card: no sideways scroll at 320 px');
await page.setViewportSize({ width:390, height:844 });

/* ---- 5. switching back is exact ---- */
await page.click('[data-act="plan-back"]');
await page.waitForSelector('.sheet [data-x="ok"]');
has(await page.textContent('.sheet'), 'back to 180 s', 'switch-back confirm names the old rest');
await page.click('.sheet [data-x="ok"]');
await page.waitForSelector('[data-act="plan-rec"]');
st = await getState(page);
const fixNames = rs => JSON.parse(JSON.stringify(rs).replace(/"Lateral Riase"/g, '"Lateral Raise"')
  .replace(/"Facepull"|"Face pull"/g, '"Face Pull"'));
eq(JSON.stringify(st.routines), JSON.stringify(fixNames(original.routines)), 'the previous plan comes back exactly (names fixed)');
eq(st.settings.rest, 180, 'rest goes back to 180');
ok(st.planBackup === undefined, 'no backup left behind');
eq(st.sessions.length, 3, 'sessions untouched');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t33 plan switch');
await browser.close();
