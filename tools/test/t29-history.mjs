/* The three ways stored history could be rewritten behind your back:
   a rename that silently fuses two lifts, an edit that re-resolves old
   bodyweight loads against today's bodyweight, and a state shape normalize()
   never checked. All three are "the log now says something you didn't do",
   which is the one class of bug this app cannot afford. */
import { launch, boot, getState, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

function sessionOf(id, name, w, r, daysAgo, exOver, sOver, pr) {
  const ts = Date.now() - daysAgo * 86400000;
  return Object.assign({ id, ts, endTs:ts, routineId:'r1', key:'A', name:'Day A', variantId:'v1',
    exercises:[ Object.assign({ id:'e' + id, planId:null, name, reps:8, repTop:12,
      sets:[{ w:String(w), r:String(r), done:true, load:w, pr:pr !== false }] }, exOver || {}) ] }, sOver || {});
}

const { browser, page, errors } = await launch();

/* ---------- §1.2 renaming onto a name that already exists ---------- */
/* Two separate lifts: "Barbell Curl" was 100x10 ten days ago, "Curl" 60x10
   five days ago. Renaming the second onto the first fuses two histories. */
const merge = {
  version:5, settings:Object.assign({}, SET),
  routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[
    { id:'pa', name:'Barbell Curl', sets:3, reps:8, repTop:12, mg:'biceps' },
    { id:'pb', name:'Curl',         sets:3, reps:8, repTop:12, mg:'biceps' } ] } ] } ],
  /* Newest first. The 60x10 carries a pr flag it earned as its own lift's
     best; once merged it is nothing of the sort. The 120x10 carries none and,
     merged, is a genuine record over the 100. */
  sessions:[ sessionOf('s3', 'Curl', 120, 10, 2, null, null, false),
             sessionOf('s2', 'Curl', 60, 10, 5),
             sessionOf('s1', 'Barbell Curl', 100, 10, 10) ],
  active:null
};

async function renameTo(newName) {
  await page.click('[data-tab="plan"]');
  await page.click('[data-act="pex-edit"][data-ri="0"][data-vi="0"][data-ei="1"]');
  await page.waitForSelector('[data-x="name"]');
  await page.fill('[data-x="name"]', newName);
  await page.click('[data-x="done"]');
  await page.waitForTimeout(150);
}

await boot(page, merge);
await renameTo('Barbell Curl');
/* The collision has to be named before it happens — this is the only
   destructive action in the app that had no confirm and no undo. */
const sheetTxt = (await page.textContent('.sheet').catch(() => '')).replace(/\s+/g, ' ');
ok(/already exists/i.test(sheetTxt), 'renaming onto an existing lift asks first  [' +
  sheetTxt.slice(0, 60) + ']');
const confirm = await page.$('[data-x="merge"]');
ok(!!confirm, 'and the confirm names merging as the thing about to happen');
if (confirm) { await confirm.click(); await page.waitForTimeout(200); }

let st = await getState(page);
let names = st.routines[0].variants[0].exercises.map(e => e.name);
eq(names.join(','), 'Barbell Curl', 'the plan does not end up with two identical rows');
eq(st.sessions.filter(s => s.exercises.some(e => e.name === 'Barbell Curl')).length, 3,
  'all three sessions are one lineage now');
const sets = st.sessions.flatMap(s => s.exercises).flatMap(e => e.sets);
/* The bug: the 60 kept a pr flag that was only ever a record of the smaller
   lift, under a lineage whose best five days earlier was 100. */
eq(sets.filter(s => s.pr).map(s => s.w).join(','), '120',
  'PRs are rebuilt over the merged lineage — the 60 lb ghost is gone and the 120 is a real record');

/* Undo puts both lifts back where they were — a merge is not reversible by
   re-renaming, because there is nothing left to say which sets were whose. */
await page.click('.toast.act button');
await page.waitForTimeout(200);
st = await getState(page);
names = st.routines[0].variants[0].exercises.map(e => e.name);
eq(names.join(','), 'Barbell Curl,Curl', 'undo restores both plan rows');
eq(st.sessions.filter(s => s.exercises.some(e => e.name === 'Curl')).length, 2,
  'and the swallowed history is a separate lift again');

/* Cancelling changes nothing at all. */
await boot(page, merge);
await renameTo('Barbell Curl');
const cancel = await page.$('[data-x="cancel"]');
if (cancel) await cancel.click();
await page.waitForTimeout(150);
st = await getState(page);
eq(st.routines[0].variants[0].exercises.map(e => e.name).join(','), 'Barbell Curl,Curl',
  'cancelling the merge leaves both lifts alone');

/* An ordinary rename — no collision — still just renames, with no sheet. */
await boot(page, merge);
await renameTo('Preacher Curl');
st = await getState(page);
eq(st.routines[0].variants[0].exercises.map(e => e.name).join(','), 'Barbell Curl,Preacher Curl',
  'a rename with no collision is unchanged');
eq(st.sessions.filter(s => s.exercises.some(e => e.name === 'Preacher Curl')).length, 2,
  'and its history follows it');

/* Trap 12: a sheet built from template strings has no compiler, so any new one
   gets measured at the narrow width rather than eyeballed at the wide one. */
for (const width of [320, 390]) {
  await page.setViewportSize({ width, height:844 });
  await boot(page, merge);
  await renameTo('Barbell Curl');
  const m = await page.evaluate(() => {
    const s = document.querySelector('.sheet');
    return { sw:s.scrollWidth, cw:s.clientWidth,
             nested:document.querySelectorAll('.field-row .field-row').length };
  });
  ok(m.sw <= m.cw, 'the merge sheet does not scroll sideways at ' + width + 'px  [' +
    m.sw + ' in ' + m.cw + ']');
  eq(m.nested, 0, 'and has no nested .field-row at ' + width + 'px');
}
await page.setViewportSize({ width:390, height:844 });

/* ---------- §1.3 editing an old session must not re-resolve its loads ------ */
/* A weighted pull-up logged at bodyweight 180: +25 lb, stored load 205. The
   setting says 200 today. Editing the note must not make that 225. */
const old = {
  version:5, settings:Object.assign({}, SET, { bodyweight:200 }),
  routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[
    { id:'p1', name:'Weighted Pull-up', sets:3, reps:8, repTop:12, bw:1, mg:'back' } ] } ] } ],
  sessions:[ sessionOf('s1', 'Weighted Pull-up', 25, 8, 30, { bw:1,
    sets:[{ w:'25', r:'8', done:true, load:205 }, { w:'25', r:'8', done:true, load:205 }] }) ],
  active:null
};
await boot(page, old);
await page.click('[data-tab="progress"]');
await page.click('[data-sess="s1"]');
await page.waitForSelector('[data-x="edit"]');
await page.click('[data-x="edit"]');
await page.waitForSelector('[data-x="save"]');
await page.fill('[data-x="note"]', 'felt strong');
await page.click('[data-x="save"]');
await page.waitForTimeout(200);
st = await getState(page);
let loads = st.sessions[0].exercises[0].sets.map(s => s.load);
eq(loads.join(','), '205,205',
  'editing the note leaves a pre-snapshot bodyweight load exactly as logged');
eq(st.sessions[0].bw, 180,
  'and the session is backfilled with the bodyweight its loads imply, so it stops being ambiguous');

/* Changing a weight in the editor still re-resolves that set — against the
   session's own bodyweight, not today's. 25 -> 35 at bw 180 is 215. */
await boot(page, old);
await page.click('[data-tab="progress"]');
await page.click('[data-sess="s1"]');
await page.waitForSelector('[data-x="edit"]');
await page.click('[data-x="edit"]');
await page.waitForSelector('[data-x="save"]');
await page.fill('input[data-f="w"][data-k="0.0"]', '35');
await page.click('[data-x="save"]');
await page.waitForTimeout(200);
st = await getState(page);
loads = st.sessions[0].exercises[0].sets.map(s => s.load);
eq(loads.join(','), '215,205', 'an edited weight re-resolves against the session, not today');

/* ---------- §1.4 a state missing keys must not brick the app ---------- */
await boot(page, { version:5, settings:Object.assign({}, SET),
  routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[] } ] } ] });
let body = await page.textContent('#view');
ok(body.trim().length > 0, 'a state with no sessions key still renders  [' +
  body.trim().slice(0, 40) + ']');
st = await getState(page);
ok(Array.isArray(st.sessions), 'and normalize() repairs it to an array, written back on boot');

await boot(page, { version:5, settings:Object.assign({}, SET), sessions:{}, routines:'nope',
  active:{ id:'a', exercises:null } });
body = await page.textContent('#view');
ok(body.trim().length > 0, 'so does a state whose sessions/routines are the wrong type');
st = await getState(page);
ok(Array.isArray(st.sessions) && Array.isArray(st.routines), 'both are arrays afterwards');

/* A session with no exercises array, and an exercise with no sets array —
   the same class of hole, one level down. */
await boot(page, { version:5, settings:Object.assign({}, SET), routines:[],
  sessions:[ { id:'b1', ts:Date.now(), key:'A', name:'Day A' },
             { id:'b2', ts:Date.now(), key:'A', name:'Day A', exercises:[ { id:'x', name:'Bench Press' } ] } ],
  active:null });
body = await page.textContent('#view');
ok(body.trim().length > 0, 'and a session missing its exercises, or an exercise missing its sets');
await page.click('[data-tab="progress"]');
await page.waitForTimeout(150);
ok((await page.textContent('#view')).trim().length > 0, 'Progress survives it too');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t29 history integrity');
await browser.close();
