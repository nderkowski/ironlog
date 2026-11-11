/* v25 §1 "Data safety": eight bugs that lose or corrupt the log, each driven
   through the real UI. api.github.com is mocked with page.route (as in t31),
   and the 30 s backup debounce is skipped with page.clock rather than waited.

   1. Erase everything keeps the GitHub backup: the confirm says so, the gist
      is detached (token kept), and nothing is pushed afterwards. A log with
      fewer sessions than the last push is never pushed without asking; only a
      confirmed "Back up now" replaces the backup.
   2. A second window takes in a write from another one instead of putting its
      stale copy back. Mid-workout on screen it shows a blocking veil, does not
      re-render (trap 1), and refuses to write until reloaded.
   3. Restore from GitHub and file Import refuse while a workout is active.
      "Put back the log from before the restore" brings the kept log back.
   4. Rename and lb→kg reach the plan kept by Settings → Workout plan.
   5. lb→kg mid-workout converts last time's weight, the prescription snapshot and the usual load.
   6. A change made during an upload is not marked backed up.
   7. A 404 navigation does not replace the cached app shell (sw.js).
   8. Skipping the planned last set does not make an ordinary set the rep-out. */
import { launch, boot, getState, openSettings, ok, eq, has, report, URL as APP } from './harness.mjs';

const TOKEN = 'github_pat_TESTONLY_t34';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,content-type,accept,x-github-api-version',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'
};
const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:Date.now() };

const px = (id, name, reps, repTop, extra) => Object.assign({ id, name, sets:3, reps, repTop, inc:null, bar:0 }, extra || {});
/* exs: [name, w, r, {outR, ex}] — outR makes set 3 a rep-out of that many reps. */
function session(id, daysAgo, rid, key, vid, exs) {
  const ts = Date.now() - daysAgo * 86400000;
  return { id, ts, endTs:ts + 3600000, routineId:rid, key, name:'Day ' + key, variantId:vid, exercises: exs.map(([name, w, r, extra], i) => Object.assign({
    id:id + 'e' + i, planId:null, name, reps:8, repTop:12, kind:'reps',
    sets:[1, 2, 3].map(n => Object.assign({ w:String(w), r:String(n === 3 && extra && extra.outR ? extra.outR : r), done:true, load:w },
      n === 3 && extra && extra.outR ? { out:true } : {})) }, (extra && extra.ex) || {})) };
}
const dayA = exs => [{ id:'rA', key:'A', name:'Day A', variants:[{ id:'vA', label:'', exercises:exs }] }];
function curlLog(n) {
  return { version:5, settings:Object.assign({}, SET), active:null, routines:dayA([ px('a1', 'DB Curl', 8, 12) ]),
    sessions:Array.from({ length:n }, (_, i) => session('s' + (i + 1), n - i, 'rA', 'A', 'vA', [['DB Curl', 30, 10]])) };
}

async function until(fn, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const gistRecord = page => page.evaluate(() => JSON.parse(localStorage.getItem('ironlog.gist') || '{}'));
const setGist = (page, rec) => page.evaluate(r => localStorage.setItem('ironlog.gist', JSON.stringify(r)), rec);
const logOf = body => JSON.parse(JSON.parse(body).files['ironlog.json'].content);
const text = (page, sel) => page.textContent(sel).then(t => t.replace(/\s+/g, ' '));

const file = content => ({ 'ironlog.json': { filename:'ironlog.json', truncated:false, content,
  raw_url:'https://gist.githubusercontent.com/mock/raw/ironlog.json' } });
/* One GitHub per browser. `delay` slows PATCH, for the upload race. */
async function mockGitHub(page, gists, opts = {}) {
  const calls = [];
  for (const id of Object.keys(gists)) gists[id] = { id, public:false, updated_at:new Date().toISOString(), files:file(JSON.stringify(gists[id])) };
  await page.route('https://api.github.com/**', async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status:204, headers:CORS, body:'' });
    const call = { method, path:url.pathname, body:req.postData() || '', done:false };
    calls.push(call);
    const json = (status, obj) => { call.done = true; return route.fulfill({ status, headers:CORS, contentType:'application/json', body:JSON.stringify(obj) }); };
    let m;
    if (method === 'GET' && url.pathname === '/gists') return json(200, Object.values(gists));
    if (method === 'GET' && (m = url.pathname.match(/^\/gists\/([^/]+)$/))) return gists[m[1]] ? json(200, gists[m[1]]) : json(404, {});
    if (method === 'PATCH' && (m = url.pathname.match(/^\/gists\/([^/]+)$/))) {
      if (opts.delay) await sleep(opts.delay);
      const g = gists[m[1]]; if (!g) return json(404, {});
      g.files = file(JSON.parse(req.postData()).files['ironlog.json'].content);
      g.updated_at = new Date().toISOString();
      return json(200, g);
    }
    if (method === 'POST' && url.pathname === '/gists') {
      const id = 'gNEW' + calls.length;
      gists[id] = { id, public:false, updated_at:new Date().toISOString(), files:file(JSON.parse(req.postData()).files['ironlog.json'].content) };
      return json(201, gists[id]);
    }
    return json(404, { message:'not mocked' });
  });
  return calls;
}
const writes = calls => calls.filter(c => c.method === 'PATCH' || c.method === 'POST');
const gistSessions = g => JSON.parse(g.files['ironlog.json'].content).sessions.length;

const allErrors = [], open = [];
async function fresh(withClock) {
  const b = await launch();
  b.page.setDefaultTimeout(8000);
  if (withClock) await b.page.clock.install();
  allErrors.push(b.errors);
  open.push(b.browser);
  return b;
}
/* One browser per section. A section that throws (a sheet that never opens,
   on code without the fix) counts as a failure and the rest still run. */
async function section(name, fn) {
  try { await fn(); }
  catch (e) { ok(false, name + ': threw ' + String(e.message || e).split('\n')[0]); }
  finally { while (open.length) await open.pop().close().catch(() => {}); }
}

/* ================= 1a. Erase everything keeps the backup ================= */
await section('1a erase', async () => {
  const { page } = await fresh(true);
  const gists = { g1:curlLog(5) };
  const calls = await mockGitHub(page, gists);
  await boot(page, curlLog(5));
  await setGist(page, { token:TOKEN, gistId:'g1', dirty:false, lastSync:Date.now(), pushedSessions:5 });
  await page.reload(); await page.waitForSelector('#view');
  await openSettings(page);
  await page.click('[data-act="wipe"]');
  await page.waitForSelector('.sheet [data-x="ok"]');
  has(await text(page, '.sheet'), 'Your GitHub backup is kept', '1 Erase: the confirm says the GitHub backup is kept');
  await page.click('.sheet [data-x="ok"]');
  eq((await getState(page)).sessions.length, 0, '1 Erase: the log on the phone is erased');
  const rec = await gistRecord(page);
  eq(rec.token, TOKEN, '1 Erase: the token is kept');
  ok(!rec.gistId, '1 Erase: detached from the gist (no gist id)  [' + rec.gistId + ']');
  eq(rec.dirty, false, '1 Erase: nothing is left waiting to be backed up');
  await page.clock.fastForward(35000);                  // past the 30 s debounce
  await sleep(600);
  eq(writes(calls).length, 0, '1 Erase: nothing is pushed after the debounce');
  eq(gistSessions(gists.g1), 5, '1 Erase: the backup still holds 5 sessions');
  /* Back up now after an erase still can't bury it: gistTarget() finds it. */
  await openSettings(page);
  await page.click('[data-act="gist-now"]');
  ok(await until(async () => /Restore it first/.test(await page.textContent('#gist-status'))),
    '1 Erase: Back up now afterwards refuses and says to restore first');
  eq(writes(calls).length, 0, '1 Erase: ...and still writes nothing');
});

/* ============ 1b. never push fewer sessions without asking ============ */
await section('1b fewer', async () => {
  const { page } = await fresh(true);
  const gists = { g1:curlLog(5) };
  const calls = await mockGitHub(page, gists);
  await boot(page, curlLog(3));                          // an older log, e.g. a file imported over this one
  await setGist(page, { token:TOKEN, gistId:'g1', dirty:false, lastSync:Date.now(), pushedSessions:5 });
  await page.reload(); await page.waitForSelector('#view');
  await openSettings(page);
  await page.fill('[data-set="rest"]', '150');
  await page.press('[data-set="rest"]', 'Tab');
  await sleep(300);
  await page.clock.fastForward(35000);
  await sleep(600);
  eq(writes(calls).length, 0, '1 fewer: the debounced push does not put 3 sessions over 5');
  eq(gistSessions(gists.g1), 5, '1 fewer: the backup still holds 5');
  has(await page.textContent('#gist-status'), 'fewer sessions than your GitHub backup (3 vs 5)', '1 fewer: the status line says why');
  eq((await gistRecord(page)).dirty, true, '1 fewer: the change stays waiting');
  /* Paused backups are said on Today too, not only in Settings. */
  await page.click('[data-tab="today"]');
  await page.waitForSelector('#view .view-title');
  has(await text(page, '#view'), 'GitHub backup paused', '1 fewer: Today says the backup is paused');
  await page.click('#view .banner [data-act="settings"]');
  await page.waitForSelector('[data-act="gist-now"]');
  ok(true, '1 fewer: the banner opens Settings');

  await page.click('[data-act="gist-now"]');
  await page.waitForSelector('.sheet [data-x="ok"]');
  const sh = await text(page, '.sheet');
  has(sh, 'Replace your GitHub backup?', '1 fewer: Back up now asks first');
  ok(sh.includes('3 sessions') && sh.includes('5 sessions'), '1 fewer: the question shows both counts  [' + sh.slice(0, 120) + ']');
  await page.click('.sheet [data-x="cancel"]');
  await sleep(400);
  eq(writes(calls).length, 0, '1 fewer: cancelling sends nothing');
  await page.click('[data-act="gist-now"]');
  await page.waitForSelector('.sheet [data-x="ok"]');
  await page.click('.sheet [data-x="ok"]');
  ok(await until(() => writes(calls).length === 1 && writes(calls)[0].done), '1 fewer: confirming replaces the backup');
  eq(logOf(writes(calls)[0].body).sessions.length, 3, '1 fewer: ...with the 3-session log');
  ok(await until(async () => (await gistRecord(page)).dirty === false), '1 fewer: and the change is backed up');
  eq((await gistRecord(page)).pushedSessions, 3, '1 fewer: the push records its session count');
});

/* ================= 1c. a session deleted on purpose ================= */
/* The fewer-sessions guard must not turn a confirmed delete into backups that
   stop for good, with only a Settings line to say so. */
await section('1c delete', async () => {
  const { page } = await fresh(true);
  const gists = { g1:curlLog(5) };
  const calls = await mockGitHub(page, gists);
  await boot(page, curlLog(5));
  await setGist(page, { token:TOKEN, gistId:'g1', dirty:false, lastSync:Date.now(), pushedSessions:5 });
  await page.reload(); await page.waitForSelector('#view');
  await page.click('[data-tab="progress"]');
  await page.click('#view .sess >> nth=0');
  await page.click('.sheet [data-x="del"]');
  await page.waitForSelector('.sheet [data-x="ok"]');
  await page.click('.sheet [data-x="ok"]');
  eq((await getState(page)).sessions.length, 4, '1c delete: the session is gone');
  eq((await gistRecord(page)).pushedSessions, 4, '1c delete: the guard\'s count moves with a confirmed delete');
  await page.clock.fastForward(35000);
  ok(await until(() => writes(calls).length === 1 && writes(calls)[0].done), '1c delete: the automatic backup still goes');
  eq(gistSessions(gists.g1), 4, '1c delete: ...with the 4 sessions he chose to keep');
  await page.click('[data-tab="today"]');
  ok(!(await text(page, '#view')).includes('GitHub backup paused'), '1c delete: no paused banner');
});

/* ================= 6. a change made during an upload ================= */
await section('6 race', async () => {
  const { page } = await fresh(true);
  const gists = { g1:curlLog(1) };
  const calls = await mockGitHub(page, gists, { delay:1500 });
  await boot(page, curlLog(1));
  await setGist(page, { token:TOKEN, gistId:'g1', dirty:false, lastSync:Date.now() - 60000, pushedSessions:1 });
  await page.reload(); await page.waitForSelector('#view');
  await openSettings(page);
  await page.click('[data-act="gist-now"]');
  ok(await until(() => writes(calls).length === 1), '6 race: the upload starts');
  await page.fill('[data-set="rest"]', '150');           // a change while it is in flight
  await page.press('[data-set="rest"]', 'Tab');
  ok(await until(() => writes(calls)[0].done, 4000), '6 race: the upload finishes');
  await sleep(300);
  eq(logOf(writes(calls)[0].body).settings.rest, 120, '6 race: that upload carried the old rest');
  eq((await gistRecord(page)).dirty, true, '6 race: the change made during it is still waiting (dirty)');
  has(await page.textContent('#gist-status'), 'Changes waiting', '6 race: the status line says so');
  await page.clock.fastForward(35000);
  ok(await until(() => writes(calls).length === 2 && writes(calls)[1].done, 5000), '6 race: another push follows');
  eq(logOf(writes(calls)[1].body).settings.rest, 150, '6 race: ...carrying the change');
  ok(await until(async () => (await gistRecord(page)).dirty === false), '6 race: and only then is it marked backed up');
});

/* ========== 3. restore / import mid-workout; put back the kept log ========== */
await section('3 restore', async () => {
  const { page } = await fresh(false);
  const gists = { g1:Object.assign(curlLog(0), { sessions:[ session('x1', 9, 'rA', 'A', 'vA', [['DB Curl', 25, 9]]) ] }) };
  await mockGitHub(page, gists);
  await boot(page, curlLog(2));
  await setGist(page, { token:TOKEN, gistId:'g1', dirty:false, lastSync:Date.now(), pushedSessions:1 });
  await page.reload(); await page.waitForSelector('#view');
  await page.click('[data-act="start"][data-id="rA"]');
  await page.waitForSelector('.card.ex .set .tick');
  const ticks = await page.$$('.card.ex .set .tick');
  await ticks[0].click(); await ticks[1].click();
  await sleep(300);

  await openSettings(page);
  ok((await page.$('[data-act="put-back"]')) === null, '3 put back: no button while nothing is kept');
  await page.click('[data-act="gist-restore"]');
  ok(await until(async () => /Finish or discard the workout first/.test((await page.textContent('.toast').catch(() => '')) || ''), 2000),
    '3 restore mid-workout: refused with the plan-switch toast');
  await sleep(600);
  ok((await page.$('.sheet')) === null, '3 restore mid-workout: no restore sheet is offered');
  let st = await getState(page);
  ok(!!st.active && st.active.exercises[0].sets.filter(s => s.done).length === 2, '3 restore mid-workout: the workout and its 2 sets are kept');
  eq(st.sessions.length, 2, '3 restore mid-workout: the log is unchanged');

  await page.click('[data-act="import"]');
  ok(await until(async () => /Finish or discard the workout first/.test((await page.textContent('.toast').catch(() => '')) || ''), 2000),
    '3 import mid-workout: refused with the same toast');
  ok((await page.$('.sheet [data-x="go"]')) === null, '3 import mid-workout: no import sheet is offered');

  /* Finish it, then restore for real and put the old log back. */
  await page.click('[data-tab="today"]');
  await page.click('[data-act="finish"] >> nth=0');
  await page.waitForSelector('.sheet [data-x="save"]');
  await page.click('.sheet [data-x="save"]');
  await sleep(300);
  const phone = await getState(page);
  eq(phone.sessions.length, 3, '3 put back: 3 sessions on the phone before the restore');
  /* Saving the workout backed it up at once; put another phone's 1-session
     log in the gist so the restore actually changes something. */
  await until(async () => (await gistRecord(page)).dirty === false);
  gists.g1.files = file(JSON.stringify(Object.assign(curlLog(0), { sessions:[ session('x1', 9, 'rA', 'A', 'vA', [['DB Curl', 25, 9]]) ] })));
  await openSettings(page);
  await page.click('[data-act="gist-restore"]');
  await page.waitForSelector('.sheet [data-x="ok"]');
  await page.click('.sheet [data-x="ok"]');
  ok(await until(async () => (await getState(page)).sessions.length === 1), '3 put back: the restore replaced the log');
  eq((await gistRecord(page)).pushedSessions, 1, '3 put back: a restore records what the backup holds');
  await openSettings(page);
  ok(!!(await page.$('[data-act="put-back"]')), '3 put back: Settings offers the log from before the restore');
  await page.click('[data-act="put-back"]');
  await page.waitForSelector('.sheet [data-x="ok"]');
  const sh = await text(page, '.sheet');
  ok(sh.includes('has 3 sessions') && sh.includes('This phone has 1 session'), '3 put back: the confirm shows both counts  [' + sh.slice(0, 160) + ']');
  await page.click('.sheet [data-x="ok"]');
  ok(await until(async () => (await getState(page)).sessions.length === 3), '3 put back: confirming brings the 3 sessions back');
  eq((await getState(page)).sessions.map(s => s.id).join(), phone.sessions.map(s => s.id).join(), '3 put back: ...the same sessions');
  eq(await page.evaluate(() => localStorage.getItem('ironlog.v1.before-restore')), null, '3 put back: the kept copy is removed');
  await openSettings(page);
  ok((await page.$('[data-act="put-back"]')) === null, '3 put back: and the button is gone');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '3 put back: Settings has no sideways scroll');
});

/* =============== 4. the kept plan follows rename and lb→kg =============== */
function planSeed() {
  return { version:5, settings:Object.assign({}, SET, { rest:180 }), active:null,
    routines:[
      { id:'rA', key:'A', name:'Day A', variants:[{ id:'vA', label:'', exercises:[ px('a1','Leg Press',8,12), px('a2','DB Curl',8,12),
        px('a3','Low to high cable fly',12,16,{ inc:10 }), px('a4','RDL',8,11,{ bar:45 }) ] }] },
      { id:'rB', key:'B', name:'Day B', variants:[{ id:'vB', label:'', exercises:[ px('b1','Lat Pulldown',8,12) ] }] },
      { id:'rC', key:'C', name:'Day C', variants:[{ id:'vC', label:'', exercises:[ px('c1','DB Row',8,12) ] }] } ],
    sessions:[ session('s1', 2, 'rA', 'A', 'vA', [['DB Curl', 30, 10], ['RDL', 225, 8, { ex:{ bar:45 } }], ['Low to high cable fly', 20, 13, { ex:{ inc:10 } }]]) ] };
}
/* The gear isn't on the Settings screen itself, so start from a tab. */
async function settingsFresh(page) {
  await page.click('[data-tab="today"]');
  await openSettings(page);
}
async function switchPlan(page, back) {
  await settingsFresh(page);
  await page.click(back ? '[data-act="plan-back"]' : '[data-act="plan-rec"]');
  await page.waitForSelector('.sheet [data-x="ok"]');
  await page.click('.sheet [data-x="ok"]');
  await sleep(300);
}
const backupEx = st => st.planBackup.routines.flatMap(r => r.variants.flatMap(v => v.exercises));
const liveEx = st => st.routines.flatMap(r => r.variants.flatMap(v => v.exercises));
await section('4 rename', async () => {
  const { page } = await fresh(false);
  await boot(page, planSeed());
  await switchPlan(page, false);
  await page.click('[data-tab="plan"]');
  await sleep(200);
  const rows = await page.$$('.pex');
  let row = null;
  for (const r of rows) if ((await r.textContent()).includes('DB Curl')) { row = r; break; }
  await (await row.$('[data-act="pex-edit"]')).click();
  await page.waitForSelector('.sheet [data-x="name"]');
  await page.fill('.sheet [data-x="name"]', 'Dumbbell Curl');
  await page.click('.sheet [data-x="done"]');
  await sleep(300);
  let st = await getState(page);
  eq(st.sessions[0].exercises[0].name, 'Dumbbell Curl', '4 rename: the history is renamed');
  ok(backupEx(st).some(e => e.name === 'Dumbbell Curl') && !backupEx(st).some(e => e.name === 'DB Curl'),
    '4 rename: the kept plan is renamed too  [' + backupEx(st).map(e => e.name).join(', ') + ']');
  await switchPlan(page, true);
  await page.click('[data-tab="today"]');
  await page.click('[data-act="start"][data-id="rA"]');
  await sleep(300);
  st = await getState(page);
  const curl = st.active.exercises.find(e => /curl/i.test(e.name));
  eq(curl && curl.name, 'Dumbbell Curl', '4 rename: after Switch back the day has the renamed lift');
  eq(curl && curl.lastW, 30, '4 rename: ...joined to its history (last time 30)');
});
await section('4 kg', async () => {
  const { page } = await fresh(false);
  await boot(page, planSeed());
  await switchPlan(page, false);
  await settingsFresh(page);
  await page.selectOption('[data-set="unit"]', 'kg');
  await page.waitForSelector('.sheet [data-x="conv"]');
  await page.click('.sheet [data-x="conv"]');
  await sleep(300);
  let st = await getState(page);
  const fly = backupEx(st).find(e => e.name === 'Low to high cable fly'), rdl = backupEx(st).find(e => e.name === 'RDL');
  eq(fly.inc, 4.5, '4 kg: the kept plan\'s 10 lb increment becomes 4.5 kg');
  eq(rdl.bar, 20, '4 kg: the kept plan\'s 45 lb bar becomes the 20 kg bar');
  await switchPlan(page, true);
  st = await getState(page);
  eq(liveEx(st).find(e => e.name === 'RDL').bar, 20, '4 kg: after Switch back, RDL has a 20 kg bar, not "45 kg"');
});

/* ============== 5. lb→kg mid-workout: lastW, presc.w and usual.w ============== */
await section('5 kg mid-workout', async () => {
  const { page } = await fresh(false);
  await boot(page, { version:5, settings:Object.assign({}, SET), active:null,
    routines:dayA([ px('a1', 'Incline DB Press', 8, 12) ]),
    sessions:[ session('s1', 2, 'rA', 'A', 'vA', [['Incline DB Press', 60, 10, { outR:13 }]]) ] });
  await page.click('[data-act="start"]');
  await page.waitForSelector('[data-act="revert"]');
  await sleep(300);
  /* Seed the "usual load" the session screen will offer (the chip itself lands with the session-screen
     package; its stored weight has to convert already). */
  await page.evaluate(() => {
    const k = 'ironlog.v1', s = JSON.parse(localStorage.getItem(k));
    s.active.exercises[0].usual = { w:65, r:10, why:'Same weight — go for 10', kind:'reps' };
    localStorage.setItem(k, JSON.stringify(s));
  });
  await page.reload(); await page.waitForSelector('[data-act="revert"]');
  let st = await getState(page);
  eq(st.active.exercises[0].lastW, 60, '5 setup: last time was 60 lb');
  eq(st.active.exercises[0].presc.w, 60, '5 setup: the prescription snapshot says 60 lb');
  has(await text(page, '.callout'), 'Keep 60×10', '5 setup: the Keep chip reads 60 lb');
  await openSettings(page);
  await page.selectOption('[data-set="unit"]', 'kg');
  await page.waitForSelector('.sheet [data-x="conv"]');
  await page.click('.sheet [data-x="conv"]');
  await sleep(300);
  st = await getState(page);
  eq(st.active.exercises[0].lastW, 27.2, '5 kg: last time\'s weight is converted (60 lb → 27.2 kg)');
  eq(st.active.exercises[0].presc.w, 27.2, '5 kg: the prescription snapshot is converted too (60 lb → 27.2 kg)');
  eq(st.active.exercises[0].usual.w, 29.5, '5 kg: the usual load is converted (65 lb → 29.5 kg)');
  await page.click('[data-tab="today"]');
  await page.waitForSelector('[data-act="revert"]');
  has(await text(page, '.callout'), 'Keep 27.2×10', '5 kg: the Keep chip reads kg');
  await page.click('[data-act="revert"]');
  await sleep(200);
  eq((await getState(page)).active.exercises[0].sets.map(s => s.w).join(), '27.2,27.2,27.2', '5 kg: Keep fills 27.2 kg, not 60');
});

/* =============== 8. the rep-out is the last set, or nothing =============== */
async function saveWith(page, which) {
  await page.click('[data-tab="today"]');               // saving lands on Progress
  await page.click('[data-act="start"]');
  await page.waitForSelector('.card.ex .set .tick');
  const t = await page.$$('.card.ex .set .tick');
  for (const i of which) await t[i].click();
  await page.click('[data-act="finish"] >> nth=0');
  await page.waitForSelector('.sheet [data-x="save"]');
  await page.click('.sheet [data-x="save"]');
  await sleep(300);
  return (await getState(page)).sessions[0].exercises[0].sets;
}
await section('8 rep-out', async () => {
  const { page } = await fresh(false);
  await boot(page, curlLog(1));
  let sets = await saveWith(page, [0, 1]);
  eq(sets.length, 2, '8 skipped: two sets saved');
  ok(!sets.some(s => s.out), '8 skipped: with the last set skipped, no set is flagged the rep-out');
  sets = await saveWith(page, [0, 1, 2]);
  eq(sets.map(s => !!s.out).join(), 'false,false,true', '8 control: all three done, set 3 is the rep-out');
});

/* ======================= 2. a second window ======================= */
await section('2 second window', async () => {
  const { ctx, page: A, errors } = await fresh(false);
  await boot(A, curlLog(1));
  const B = await ctx.newPage();
  B.on('pageerror', e => errors.push(String(e)));
  await B.goto(APP); await B.waitForSelector('#view');
  const setHidden = (p, v) => p.evaluate(h => Object.defineProperty(document, 'hidden', { configurable:true, get:() => h }), v);
  await setHidden(B, true);                               // B is a tab in the background

  await A.bringToFront();
  const sets = await saveWith(A, [0, 1, 2]);
  eq(sets.length, 3, '2 setup: window A saves a workout');
  eq((await getState(A)).sessions.length, 2, '2 setup: 2 sessions in storage');
  await sleep(300);
  ok((await B.$('.stale-veil')) === null, '2 background: window B, in the background, needs no reload prompt');
  await setHidden(B, false);
  await B.bringToFront();
  await openSettings(B);
  has(await text(B, '#view'), '2 sessions', '2 background: B already shows the workout A saved');
  await B.fill('[data-set="rest"]', '150');
  await B.press('[data-set="rest"]', 'Tab');
  await sleep(400);
  const s2 = await getState(B);
  eq(s2.sessions.length, 2, '2 background: B\'s next change keeps A\'s workout (was 1 session)');
  eq(s2.settings.rest, 150, '2 background: ...and B\'s change is saved');

  /* Both on a workout's screen: A logs a set while B shows it. B must not
     re-render (trap 1) and must not write its stale copy. */
  await A.bringToFront();
  await A.click('[data-tab="today"]');
  await A.click('[data-act="start"]');
  await A.waitForSelector('.card.ex .set .tick');
  await (await A.$$('.card.ex .set .tick'))[0].click();
  await sleep(300);
  await B.click('[data-tab="today"]');
  await B.waitForSelector('.card.ex .set .tick');
  eq(await B.$$eval('.card.ex .set.done', els => els.length), 1, '2 on screen: B shows A\'s workout with set 1 done');
  await B.evaluate(() => { document.querySelector('.card.ex').__mark = 1; });
  await (await A.$$('.card.ex .set .tick'))[1].click();   // A logs set 2
  ok(await until(async () => !!(await B.$('.stale-veil')), 2000), '2 on screen: B shows the reload veil');
  has(await text(B, '.stale-veil'), 'This log changed in another window — reload', '2 on screen: ...saying why');
  eq(await B.evaluate(() => document.querySelector('.card.ex').__mark), 1, '2 on screen: B did not re-render under the user (trap 1)');
  /* A tap that slips through to B's stale screen must not be saved over A's. */
  await B.evaluate(() => { const t = document.querySelectorAll('.card.ex .set .tick')[2]; if (t) t.click(); });
  await sleep(400);
  let act = (await getState(A)).active.exercises[0].sets.map(s => !!s.done).join();
  eq(act, 'true,true,false', '2 on screen: B\'s stale write is refused; storage keeps A\'s sets 1 and 2');
  await B.click('.stale-veil [data-act="stale-reload"]');
  await sleep(200);
  ok((await B.$('.stale-veil')) === null, '2 reload: the veil goes');
  eq(await B.$$eval('.card.ex .set.done', els => els.length), 2, '2 reload: B shows A\'s two sets');
  await (await B.$$('.card.ex .set .tick'))[2].click();
  await sleep(400);
  act = (await getState(B)).active.exercises[0].sets.map(s => !!s.done).join();
  eq(act, 'true,true,true', '2 reload: after reloading, B saves again on top of A\'s sets');
});

/* ============ 7. sw.js: an error page never becomes the app shell ============ */
await section('7 sw', async () => {
  const { ctx, page } = await fresh(false);
  const base = APP.replace(/index\.html$/, '');
  await page.goto(APP);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), '7 sw: the page is controlled by the service worker');
  const shell = () => page.evaluate(async () => {
    for (const k of await caches.keys()) {
      const r = await (await caches.open(k)).match('./index.html');
      if (r) return r.status;
    }
    return 0;
  });
  eq(await shell(), 200, '7 sw: the cached shell is a 200');
  const res = await page.goto(base + 'no-such-page.html');
  await sleep(500);
  eq(await shell(), 200, '7 sw: a 404 navigation does not replace the cached shell');
  eq(res.status(), 200, '7 sw: a 404 navigation shows the cached app instead');
  await ctx.setOffline(true);
  await page.goto(APP).catch(() => {});
  ok(!!(await page.$('#view')), '7 sw: offline launch afterwards still opens the app');
});

const unexpected = allErrors.flat().filter(e => !/Failed to load resource: the server responded with a status of 404/.test(e));
ok(unexpected.length === 0, 'no page errors  ' + unexpected.join(' | '));
report('t34 data safety');
