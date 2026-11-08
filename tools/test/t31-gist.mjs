/* GitHub gist backup (index.html "GitHub backup"), driven through the real UI.
   api.github.com is mocked with page.route, so nothing leaves the machine.

   What is asserted:
   1. Save a token, Back up now: POST makes a private gist; the next backup PATCHes it.
   2. The token never reaches a request body, the page, the log, or the export file.
   3. Finishing a workout backs up at once, not after the 30 s debounce.
   4. A network failure shows an error and leaves the gist dirty; coming back online clears it.
   5. A 401 says the token is invalid or lacks gist permission.
   6. Restore: the confirm sheet shows both session counts; cancel changes nothing;
      confirm replaces the log and keeps the old one under ironlog.v1.before-restore.
      With no gist id stored, Restore finds the most recently updated backup.
   7. A PATCH that 404s starts again with one create.
   8. Storage line and no page errors. */
import { launch, boot, getState, openSettings, ok, eq, has, report } from './harness.mjs';

const TOKEN = 'github_pat_TESTONLY_do_not_leak_7f3a9c';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,content-type,accept,x-github-api-version',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'
};

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:0, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

function session(id, daysAgo, w) {
  const ts = Date.now() - daysAgo * 86400000;
  return { id, ts, endTs:ts, routineId:'r1', key:'A', name:'Day A', variantId:'v1', bw:0, deload:false,
    exercises:[ { id:'e' + id, planId:'p1', name:'Bench Press', reps:8, repTop:12, bw:0,
      sets:[1, 2, 3].map(() => ({ w:String(w), r:'8', done:true, load:w })) } ] };
}
function seed() {
  return { version:5, settings:Object.assign({}, SET),
    routines:[ { id:'r1', key:'A', name:'Day A', variants:[ { id:'v1', label:'', exercises:[
      { id:'p1', name:'Bench Press', sets:3, reps:8, repTop:12, mg:'chest' } ] } ] } ],
    sessions:[ session('s1', 2, 100), session('s2', 5, 95) ], active:null };
}

/* ---- the GitHub mock ---- */
const gists = {};                 // id -> gist as GitHub returns it
const calls = [];                 // every request the page made, in order
const mock = { fail:null };       // null | 'network' | 'unauthorized'
let seq = 0;
const gistFile = content => ({ 'ironlog.json': { filename:'ironlog.json', type:'application/json',
  language:'JSON', raw_url:'https://gist.githubusercontent.com/mock/raw/ironlog.json',
  size:content.length, truncated:false, content } });
const gistObj = (id, content, updated) => ({ id, description:'Iron Log backup', public:false,
  updated_at:updated, files:gistFile(content) });

const { browser, page, errors } = await launch();

await page.route('https://api.github.com/**', async route => {
  const req = route.request();
  const url = new URL(req.url());
  const method = req.method();
  if (method === 'OPTIONS') return route.fulfill({ status:204, headers:CORS, body:'' });
  calls.push({ method, path:url.pathname, body:req.postData() || '', auth:req.headers()['authorization'] || '' });
  const json = (status, obj) => route.fulfill({ status, headers:CORS, contentType:'application/json', body:JSON.stringify(obj) });
  if (mock.fail === 'network') return route.abort('failed');
  if (mock.fail === 'unauthorized') return json(401, { message:'Bad credentials' });
  let m;
  if (method === 'POST' && url.pathname === '/gists') {
    const data = JSON.parse(req.postData());
    const id = 'g' + (++seq);
    gists[id] = gistObj(id, data.files['ironlog.json'].content, new Date().toISOString());
    gists[id].public = data.public;
    return json(201, gists[id]);
  }
  if (method === 'PATCH' && (m = url.pathname.match(/^\/gists\/([^/]+)$/))) {
    const g = gists[m[1]];
    if (!g) return json(404, { message:'Not Found' });
    g.files = gistFile(JSON.parse(req.postData()).files['ironlog.json'].content);
    g.updated_at = new Date().toISOString();
    return json(200, g);
  }
  if (method === 'GET' && (m = url.pathname.match(/^\/gists\/([^/]+)$/))) {
    const g = gists[m[1]];
    return g ? json(200, g) : json(404, { message:'Not Found' });
  }
  if (method === 'GET' && url.pathname === '/gists') return json(200, Object.values(gists));
  return json(404, { message:'not mocked' });
});

/* Polls a condition; the app's network work is async, so assertions wait for it. */
async function until(fn, ms = 5000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}
async function gistRecord() {
  return JSON.parse(await page.evaluate(() => localStorage.getItem('ironlog.gist') || '{}'));
}
const statusText = () => page.textContent('#gist-status');
const logOf = body => JSON.parse(JSON.parse(body).files['ironlog.json'].content);

/* ---- 1. token, then the first and second backups ---- */
await boot(page, seed());
await openSettings(page);
eq(await page.getAttribute('[data-gist="token"]', 'type'), 'password', 'token box is a password field');
await page.fill('[data-gist="token"]', TOKEN);
await page.click('[data-act="gist-save"]');
await page.waitForSelector('[data-act="gist-remove"]');
ok((await page.$('[data-gist="token"]')) === null, 'after saving, the token box is replaced, not kept');
has(await page.textContent('#view'), 'Token saved', 'after saving, the screen says the token is saved');

await page.click('[data-act="gist-now"]');
ok(await until(() => calls.some(c => c.method === 'POST')), 'Back up now creates a gist');
/* With no gist id it must look for an existing backup before creating one —
   see section 9 for why. */
eq(calls[0].method + ' ' + calls[0].path, 'GET /gists', 'it first looks for an existing backup');
const post = calls.find(c => c.method === 'POST');
eq(post.path, '/gists', '...then creates one at the gists endpoint');
eq(post.auth, 'Bearer ' + TOKEN, 'it authenticates with the bearer token');
const created = JSON.parse(post.body);
eq(created.public, false, 'the gist is private (public:false)');
eq(Object.keys(created.files).join(), 'ironlog.json', 'the gist holds one file, ironlog.json');
eq(logOf(post.body).sessions.length, 2, 'the file is the whole log');
ok(await until(async () => !!(await gistRecord()).gistId), 'the new gist id is stored');
const gid = (await gistRecord()).gistId;
eq(gid, Object.keys(gists)[0], 'the stored id is the one GitHub returned');
ok(await until(async () => (await gistRecord()).dirty === false), 'a successful backup clears dirty');

const n1 = calls.length;
await page.click('[data-act="gist-now"]');
ok(await until(() => calls.length > n1), 'a second Back up now sends another request');
eq(calls[n1].method, 'PATCH', 'the second backup updates the same gist');
eq(calls[n1].path, '/gists/' + gid, '...at that gist id');
ok(await until(async () => /^Last backed up /.test(await statusText())), 'status line reports the last backup');

/* ---- 2. the token stays out of everything but its own record ---- */
const html = await page.content();
ok(!html.includes(TOKEN), 'token is not in the page HTML');
ok(!calls.some(c => c.body.includes(TOKEN) || c.path.includes(TOKEN)), 'token is not in any request body or URL');
ok(calls.every(c => c.auth === 'Bearer ' + TOKEN), 'every request carries the token only in Authorization');
const stored = await page.evaluate(() => {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); out[k] = localStorage.getItem(k); }
  return out;
});
ok(!stored['ironlog.v1'].includes(TOKEN), 'token is not in the log (ironlog.v1)');
ok(Object.keys(stored).filter(k => k !== 'ironlog.gist').every(k => !stored[k].includes(TOKEN)),
  'token is in no storage key except ironlog.gist');
ok(stored['ironlog.gist'].includes(TOKEN), 'the token is kept in its own record, ironlog.gist');
await page.click('[data-act="export"]');
await page.waitForSelector('.sheet textarea');
const exported = await page.inputValue('.sheet textarea');
ok(exported.includes('"sessions"') && !exported.includes(TOKEN), 'the exported file is the log and has no token');
await page.click('[data-x="close"]');

/* ---- 3. finishing a workout backs up without another tap ---- */
await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
const rows = await page.$$('.card.ex .set');
for (let k = 0; k < rows.length; k++) {
  await rows[k].$eval('input[data-f="r"]', (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles:true })); }, '8');
  await rows[k].$eval('.tick', el => el.click());
}
const n3 = calls.length;
await page.click('[data-act="finish"]');
await page.click('[data-x="save"]');
ok(await until(() => calls.length > n3, 2000), 'finishing a workout sends a backup within 2 s (the debounce is 30 s)');
eq(calls[n3] && calls[n3].method, 'PATCH', 'the workout backup updates the gist');
eq(logOf(calls[n3].body).sessions.length, 3, 'and it holds the workout just saved');

/* ---- 4. network failure, then recovery when back online ---- */
await openSettings(page);
mock.fail = 'network';
const n4 = calls.length;
await page.click('[data-act="gist-now"]');
ok(await until(() => calls.length > n4), 'a backup is attempted while the network is down');
ok(await until(async () => /Couldn't reach GitHub/.test(await statusText())), 'a network failure shows an error on the status line');
let rec = await gistRecord();
eq(rec.dirty, true, 'a failed backup leaves dirty:true');
ok(!!rec.lastError && !rec.lastError.includes(TOKEN), 'the error is stored and holds no token');
mock.fail = null;
await page.evaluate(() => window.dispatchEvent(new Event('online')));
ok(await until(async () => (await gistRecord()).dirty === false), 'coming back online retries and clears dirty');
eq((await gistRecord()).lastError, '', 'and the error is cleared');

/* ---- 5. 401 ---- */
mock.fail = 'unauthorized';
await page.click('[data-act="gist-now"]');
ok(await until(async () => /invalid or lacks gist permission/.test(await statusText())),
  'a 401 says the token is invalid or lacks gist permission');
ok(!(await page.textContent('#view')).includes(TOKEN), 'the 401 message does not show the token');
mock.fail = null;
await page.click('[data-act="gist-now"]');
ok(await until(async () => (await gistRecord()).dirty === false), 'a good token backs up again after the 401');

/* ---- 6. restore ---- */
/* Another phone's older backup sits in the same gist. */
const other = seed(); other.sessions = [ session('x1', 9, 80) ];
gists[gid].files = gistFile(JSON.stringify(other));
gists[gid].updated_at = new Date().toISOString();

const phoneBefore = await getState(page);
const phoneText = JSON.stringify(phoneBefore);
await page.click('[data-act="gist-restore"]');
await page.waitForSelector('.sheet [data-x="ok"]');
const sheet = await page.textContent('.sheet');
has(sheet, 'has 1 session', 'restore sheet: the backup\'s session count');
has(sheet, 'This phone has ' + phoneBefore.sessions.length + ' sessions', 'restore sheet: this phone\'s session count');
has(sheet, 'replaces everything on this phone', 'restore sheet: says it replaces the phone');
await page.click('.sheet [data-x="cancel"]');
ok(JSON.stringify(await getState(page)) === phoneText, 'cancelling a restore changes nothing');
eq(await page.evaluate(() => localStorage.getItem('ironlog.v1.before-restore')), null, 'cancelling keeps no snapshot');

await page.click('[data-act="gist-restore"]');
await page.waitForSelector('.sheet [data-x="ok"]');
await page.click('.sheet [data-x="ok"]');
ok(await until(async () => (await getState(page)).sessions.length === 1), 'confirming replaces the sessions with the backup\'s');
eq((await getState(page)).sessions[0].id, 'x1', '...and they are the backup\'s sessions');
const snap = JSON.parse(await page.evaluate(() => localStorage.getItem('ironlog.v1.before-restore')));
eq(snap.sessions.map(s => s.id).join(), phoneBefore.sessions.map(s => s.id).join(), 'before-restore holds the log that was on the phone');

/* Fresh install: token only, no gist id. Restore has to find the newest backup.
   A confirmed restore lands on Today, so reopen Settings first. */
await openSettings(page);
gists.gNEW = gistObj('gNEW', JSON.stringify(Object.assign(seed(), { sessions:[ session('n1', 1, 90), session('n2', 1, 91) ] })),
  new Date(Date.now() + 60000).toISOString());
await page.evaluate(() => {
  const g = JSON.parse(localStorage.getItem('ironlog.gist')); delete g.gistId;
  localStorage.setItem('ironlog.gist', JSON.stringify(g));
});
const n6 = calls.length;
await page.click('[data-act="gist-restore"]');
await page.waitForSelector('.sheet [data-x="ok"]');
ok(calls.slice(n6).some(c => c.method === 'GET' && c.path === '/gists'), 'with no gist id, Restore lists the account\'s gists');
has(await page.textContent('.sheet'), 'has 2 sessions', 'with no gist id, the most recently updated backup is the one offered');
await page.click('.sheet [data-x="cancel"]');
eq((await gistRecord()).gistId, 'gNEW', 'the id it found is stored for the next backup');

/* ---- 7. a gist deleted on GitHub starts again, once ---- */
delete gists.gNEW;
const n7 = calls.length;
await page.click('[data-act="gist-now"]');
ok(await until(() => calls.length >= n7 + 2), 'an update to a deleted gist is followed by a create');
ok(await until(async () => { const r = await gistRecord(); return r.dirty === false && r.gistId && r.gistId !== 'gNEW'; }),
  'the new gist id replaces the deleted one and the backup clears');
eq(calls[n7].method, 'PATCH', '...after a PATCH that got 404');
eq(calls[n7 + 1].method, 'POST', '...and one POST');
await new Promise(r => setTimeout(r, 300));
eq(calls.length, n7 + 2, 'it creates only once, not in a loop');

/* ---- 8. storage line; removing the token ---- */
ok(await until(async () => /^Storage: (kept by the browser|the browser may clear this if space runs low)$/
  .test(await page.textContent('#storage-status'))), 'Settings shows one storage line from the browser');
await page.click('[data-act="gist-remove"]');
await page.waitForSelector('[data-gist="token"]');
ok(!(await gistRecord()).token, 'Remove deletes the token from this browser');
eq(JSON.stringify(calls.filter(c => c.body.includes(TOKEN)).length), '0', 'no request carried the token in its body');

/* ---- 9. a new phone must not bury the real backup ----
   Token pasted into a browser with no gist id, on a phone holding less than
   GitHub does. Creating a gist here would make the near-empty log the newest
   backup, and Restore picks the newest. It must refuse and ask for a restore. */
for (const k of Object.keys(gists)) delete gists[k];
gists.gREAL = gistObj('gREAL', JSON.stringify(Object.assign(seed(), {
  sessions:[ session('r1', 1, 100), session('r2', 4, 100), session('r3', 8, 95), session('r4', 12, 95) ] })),
  new Date().toISOString());
await boot(page, Object.assign(seed(), { sessions:[ session('p1', 0, 80) ] }));
await page.evaluate(() => localStorage.setItem('ironlog.gist', '{}'));
await page.reload(); await page.waitForSelector('#view');
await openSettings(page);
await page.fill('[data-gist="token"]', TOKEN);
await page.click('[data-act="gist-save"]');
await page.waitForSelector('[data-act="gist-remove"]');
const n9 = calls.length;
await page.click('[data-act="gist-now"]');
ok(await until(async () => /Restore it first/.test(await statusText())),
  'new phone, smaller log: backup refuses and says to restore first  [' + await statusText() + ']');
await new Promise(r => setTimeout(r, 300));
ok(!calls.slice(n9).some(c => c.method === 'POST' || c.method === 'PATCH'),
  'new phone, smaller log: nothing is created or overwritten');
eq(Object.keys(gists).join(), 'gREAL', 'new phone, smaller log: still exactly one backup on GitHub');
ok((await gistRecord()).dirty === true, 'new phone, smaller log: the change stays waiting');

/* Finishing a workout must hit the same guard, not slip past it. */
await page.click('[data-tab="today"]');
await page.click('[data-act="start"][data-id="r1"]');
await page.waitForSelector('.card.ex');
for (const t of await page.$$('.card.ex .set .tick')) await t.click();
await page.click('[data-act="finish"]');
await page.click('[data-x="save"]');
await new Promise(r => setTimeout(r, 800));
ok(!calls.slice(n9).some(c => c.method === 'POST' || c.method === 'PATCH'),
  'new phone, smaller log: finishing a workout does not create one either');

/* Restoring adopts the real backup; after that, backups update it. */
await openSettings(page);
await page.click('[data-act="gist-restore"]');
await page.waitForSelector('.sheet [data-x="ok"]');
has(await page.textContent('.sheet'), 'has 4 sessions', 'restore offers the real backup');
await page.click('.sheet [data-x="ok"]');
ok(await until(async () => (await getState(page)).sessions.length === 4), 'restore brings the 4 sessions back');
await openSettings(page);
const n9b = calls.length;
await page.click('[data-act="gist-now"]');
ok(await until(() => calls.slice(n9b).some(c => c.method === 'PATCH')), 'after restoring, backups update the real gist');
eq(calls.slice(n9b).find(c => c.method === 'PATCH').path, '/gists/gREAL', '...by id gREAL');
eq(Object.keys(gists).join(), 'gREAL', '...and still only one backup exists');

/* A phone holding MORE than GitHub (the gist id was lost, the log wasn't)
   adopts the existing gist rather than starting a second one. */
await page.evaluate(() => {
  const g = JSON.parse(localStorage.getItem('ironlog.gist')); g.gistId = '';
  localStorage.setItem('ironlog.gist', JSON.stringify(g));
});
gists.gREAL.files = gistFile(JSON.stringify(Object.assign(seed(), { sessions:[ session('r1', 1, 100) ] })));
const n9c = calls.length;
await page.click('[data-act="gist-now"]');
ok(await until(() => calls.slice(n9c).some(c => c.method === 'PATCH')), 'lost id, bigger log: updates the existing backup');
ok(!calls.slice(n9c).some(c => c.method === 'POST'), 'lost id, bigger log: does not create a second gist');
eq((await gistRecord()).gistId, 'gREAL', 'lost id, bigger log: adopts its id');

/* The Settings card must fit a 320 px phone (trap 12). */
await page.setViewportSize({ width:320, height:740 });          // already on Settings
await page.waitForSelector('[data-act="gist-now"]');
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  'Settings with the GitHub card has no sideways scroll at 320 px');
await page.setViewportSize({ width:390, height:844 });

/* Failures we caused on purpose show up in the console as resource errors. */
const unexpected = errors.filter(e => !/Failed to load resource: (the server responded with a status of (401|404) |net::ERR_FAILED)/.test(e));
ok(unexpected.length === 0, 'no page errors  ' + unexpected.join(' | '));

report('t31 gist backup');
await browser.close();
