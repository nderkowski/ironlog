/* v26 + v27: the coach — rules every two weeks, and an optional check-in with
   Claude, as ONE suggestion system.

   What has to hold (Nick's requirements, in the order they are checked):
   - it PROMPTS: every suggestion is a card with a reason and choices, and the
     plan changes only when a button on it is tapped;
   - it never sets a weight or a rep (a swapped-in lift's start weight is the
     one number written, and only prescribe()'s "new" branch reads it);
   - an accepted change is one tap to undo, and undo puts back the exact rows;
   - at most two cards are open, and a kept suggestion isn't raised again soon.

   Claude is mocked with page.route; the official SDK is the real one from the
   pinned CDN URL, as in t38. Nothing reaches Anthropic or GitHub. */
import { launch, boot, getState, openSettings, planExercises, ok, eq, has, report } from './harness.mjs';

const NOW = Date.now(), DAY = 864e5;
const KEY = 'sk-ant-TESTONLY-t39-do-not-leak', TOKEN = 'ghp_TESTONLY_t39_do_not_leak_0123456789';
const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:180, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2},{w:10,n:2},{w:5,n:2},{w:2.5,n:2}], lastBackup:0 };

const px = (id, name, reps, top, extra) => Object.assign({ id, name, sets:3, reps, repTop:top, inc:null }, extra || {});
/* One logged session. exs: [name, w, reps (number or list), sets, note]. `minutes` spreads
   the sets' timestamps evenly over that many minutes (gaps of 15 min or less are "active"). Newest-first order is restored by state(). */
function sess(id, rid, key, vid, daysAgo, exs, o = {}) {
  const ts = NOW - daysAgo * DAY;
  const total = exs.reduce((a, e) => a + (e[3] || 3), 0);
  let k = 0;
  const exercises = exs.map(([name, w, r, n = 3, note], i) => ({
    id:id + 'e' + i, planId:null, name, reps:8, repTop:12, kind:'reps', note:note || '',
    sets:Array.from({ length:n }, (_, j) => {
      const s = { w:String(w), r:String(Array.isArray(r) ? r[j] : r), done:true, load:w };
      if (o.minutes) s.ts = ts + Math.round(k * o.minutes * 60e3 / Math.max(1, total - 1));
      k++; return s; }) }));
  return { id, ts, endTs:ts + (o.minutes || 45) * 60e3, routineId:rid, key, name:'Day ' + key, variantId:vid,
    deload:!!o.deload, note:o.note || '', exercises };
}
const planA = () => [px('a1','Leg Press',8,12), px('a2','Incline DB Press',8,12), px('a3','Cable Row',8,12,{ link:true }),
  px('a4','Hamstring Curls',8,12), px('a5','Lateral Raise',12,20,{ link:true }), px('a6','DB Curl',8,12), px('a7','Tricep Pushdown',10,15,{ link:true })];
const faceC = () => px('c4','Face Pull',12,16,{ inc:10, bar:0, mg:'delts', mg2:['back','traps'], link:true });
const planC = () => [px('c1','RDL',6,10), px('c2','Flat DB Press',8,12), px('c3','DB Row',8,12,{ link:true }), faceC(),
  px('c5','Low to high cable fly',12,16,{ inc:10, mg:'chest', link:true })];
function routines(o = {}) {
  return [ { id:'rA', key:'A', name:'Day A', variants:[ { id:'vA', label:'', exercises:o.A || planA() } ] },
           { id:'rC', key:'C', name:'Day C', variants:o.Cv || [ { id:'vC', label:'', exercises:o.C || planC() } ] } ];
}
function state(sessions, o = {}) {
  return { version:5, settings:Object.assign({}, SET, o.settings || {}), active:null,
    routines:o.routines || routines(o), sessions:sessions.sort((a, b) => b.ts - a.ts),
    coach:o.coach || { proposals:[], history:[], lastCheck:0 } };
}
/* Six sessions so the coach will look; Day C's last three skip Face Pull, and it was done long ago. */
const lifts = (extra) => [['RDL',135,8],['Flat DB Press',45,10],['DB Row',50,10],['Low to high cable fly',20,13]].concat(extra || []);
function skipHistory(faceIn) {
  const fp = d => faceIn.includes(d) ? [['Face Pull',10,12]] : [];
  return [
    sess('c1','rC','C','vC',8, lifts(fp(8))), sess('c2','rC','C','vC',15, lifts(fp(15))), sess('c3','rC','C','vC',22, lifts(fp(22))),
    sess('c4','rC','C','vC',60, lifts([['Face Pull',10,12]])),
    sess('a1','rA','A','vA',5, [['Leg Press',190,10],['Lateral Raise',15,14]]),
    sess('a2','rA','A','vA',12, [['Leg Press',190,10],['Lateral Raise',15,14]]) ];
}

const { browser, errors } = await launch();
const ctx = await browser.newContext({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });
const page = await ctx.newPage();
page.on('pageerror', e => errors.push(String(e)));
/* The 401 test and the aborted GitHub backups make the browser log failed loads; those are the point, not bugs. */
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('dialog', d => d.accept());

/* ---- Claude, mocked ---- */
const calls = [];
let reply = null, mode = 'ok';
const CORS = { 'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'POST' };
await page.route('https://api.anthropic.com/**', async route => {
  const r = route.request();
  if (r.method() === 'OPTIONS') return route.fulfill({ status:204, headers:CORS });
  const body = JSON.parse(r.postData() || '{}');
  calls.push({ url:r.url(), headers:r.headers(), body, raw:r.postData() || '' });
  if (mode === '401') return route.fulfill({ status:401, headers:Object.assign({ 'content-type':'application/json' }, CORS),
    body:JSON.stringify({ type:'error', error:{ type:'authentication_error', message:'invalid x-api-key' } }) });
  return route.fulfill({ status:200, headers:Object.assign({ 'content-type':'application/json' }, CORS), body:JSON.stringify({
    id:'msg_t39', type:'message', role:'assistant', model:body.model, stop_reason:'end_turn',
    content:[{ type:'text', text:JSON.stringify(reply) }], usage:{ input_tokens:4321, output_tokens:456 } }) });
});
await page.route('https://api.github.com/**', route => route.abort('failed'));

const text = async () => (await page.textContent('#view')).replace(/\s+/g, ' ');
const coachOf = async () => (await getState(page)).coach;
const open = async () => (await coachOf()).proposals.filter(p => p.status === 'open');
const ofKind = async (k) => (await coachOf()).proposals.filter(p => p.kind === k);
async function toProgress() { await page.click('[data-tab="progress"]'); await page.waitForSelector('#view .view-title'); }
/* Do (part of) a day and save it: the coach looks at the log after a save. */
async function finishDay(rid, tick) {
  await page.click('[data-tab="today"]');
  await page.waitForSelector('[data-act="start"][data-id="' + rid + '"]');
  await page.click('[data-act="start"][data-id="' + rid + '"]');
  await page.waitForSelector('.card.ex');
  for (const ex of await page.$$('.card.ex')) {
    const name = (await (await ex.$('.ex-name')).textContent()).trim().replace(/^[^A-Za-z0-9]*/, '');
    const yes = typeof tick === 'function' ? tick(name) : tick.some(t => name.endsWith(t));
    if (yes) await ex.$eval('.set .tick', el => el.click());
  }
  await page.click('[data-act="finish"] >> nth=0');
  await page.click('[data-x="save"]');
  await page.waitForSelector('#view .view-title');
}
const notFace = name => !/Face Pull/.test(name);      // a normal day: everything but the lift being skipped
function same(a, b, msg) { ok(a === b, msg + (a === b ? '' : '\n      got  ' + String(a).slice(0, 300) + '\n      want ' + String(b).slice(0, 300))); }
const boots = async (s, extra) => {
  await boot(page, s);
  if (extra) { await page.evaluate(e => { Object.keys(e).forEach(k => localStorage.setItem(k, JSON.stringify(e[k]))); }, extra); await page.reload(); await page.waitForSelector('#view'); }
};

/* ================= 1. skipped lift ================= */
await boots(state(skipHistory([22])));                      // Face Pull done in 1 of the last 4 Day C sessions
await finishDay('rC', ['RDL']);
let sk = (await ofKind('skipped'))[0];
ok(sk && sk.status === 'open' && sk.lift === 'Face Pull' && sk.source === 'rules', 'skipped: Face Pull raised by the rules after a save');
has(sk.reason, 'Skipped in 3 of the last 4 Day C sessions', 'skipped: the reason counts the skips (3 of 4 is enough)');
eq(sk.options.map(o => o.act).join(), 'remove,swap,swap,swap', 'skipped: remove, then three similar lifts');
eq(sk.options.filter(o => o.act === 'swap').map(o => o.to).join(), 'Rear Delt Fly,Reverse Pec Deck,Band Pull-apart', 'skipped: similar lifts come from the curated family, minus none already in the plan');
ok(/convention/i.test(sk.evidence), 'skipped: labelled as coaching convention');
let tx = await text();
has(tx, 'Face Pull keeps getting skipped', 'Progress shows the Coach card');
has(tx, 'Swap for Rear Delt Fly', 'Progress card offers the swap');
ok(await page.$('[data-co="keep"]') !== null, 'Progress card offers Keep it');
await page.click('[data-tab="today"]');
await page.waitForSelector('.card.co');
tx = await text();
has(tx, 'Coach', 'Today shows the Coach card when there is something open');
has(tx, 'Skipped in 3 of the last 4 Day C sessions', 'Today card shows the reason');
has(tx, 'Take it out of Day C', 'Today card shows the options');

/* 3 of 4 is enough; 2 of 4 is not; a young row isn't judged; two weeks haven't passed */
await boots(state(skipHistory([22, 15])));
await finishDay('rC', ['RDL']);
eq((await ofKind('skipped')).length, 0, 'skipped: done in 2 of the last 4 -> silent');
await boots(state(skipHistory([22]), { routines:routines({ C:[px('c1','RDL',6,10), px('c2','Flat DB Press',8,12), px('c3','DB Row',8,12,{ link:true }), Object.assign(faceC(), { added:NOW - 3 * DAY })] }) }));
await finishDay('rC', ['RDL']);
eq((await ofKind('skipped')).length, 0, 'skipped: a row added 3 days ago is not judged on the sessions before it');
await boots(state(skipHistory([22]), { coach:{ proposals:[], history:[], lastCheck:NOW - 3 * DAY } }));
await finishDay('rC', ['RDL']);
eq((await ofKind('skipped')).length, 0, 'skipped: the rules look at most every 14 days');
await boots(state(skipHistory([22]), { coach:{ proposals:[], history:[], lastCheck:NOW - 15 * DAY } }));
await finishDay('rC', ['RDL']);
eq((await ofKind('skipped')).length, 1, 'skipped: 15 days after the last look, it looks again');
await boots(state(skipHistory([22]).slice(0, 3).concat([skipHistory([22])[4]])));
await finishDay('rC', ['RDL']);
eq((await coachOf()).lastCheck, 0, 'too little log (under 6 sessions): the rules do not even start');

/* a lift that was never done isn't "skipped" on the day it was added (rows from before rows were dated) */
await boots(state(skipHistory([]).filter(s => s.id !== 'c4')));
await finishDay('rC', ['RDL']);
eq((await ofKind('skipped')).length, 0, 'skipped: an old row that has never once been done is not called skipped');

/* ================= 2. accepting, carrying fields, every week, undo ================= */
const faceTwoWeeks = [ { id:'vC1', label:'Week 1', exercises:planC() },
  { id:'vC2', label:'Week 2', exercises:[px('d1','RDL',6,10), Object.assign(faceC(), { id:'d2', link:false, sets:4, reps:10, repTop:15 })] } ];
await boots(state(skipHistory([22]).map(s => s.routineId === 'rC' ? Object.assign(s, { variantId:'vC1' }) : s),
  { routines:routines({ Cv:faceTwoWeeks }) }));
await finishDay('rC', ['RDL']);
const before = await getState(page);
const planBefore = JSON.stringify(before.routines.map(r => r.variants.map(v => v.exercises)));
sk = (await open())[0];
await toProgress();
await page.click('[data-co="opt"][data-id="' + sk.id + '"][data-oi="1"]');            // Swap for Rear Delt Fly
await page.waitForSelector('.toast.act');
has(await page.textContent('.toast'), 'Swapped Face Pull for Rear Delt Fly', 'accept: the toast says what was done');
let st = await getState(page);
let weeks = st.routines[1].variants.map(v => v.exercises);
ok(weeks.every(w => !w.some(e => e.name === 'Face Pull') && w.some(e => e.name === 'Rear Delt Fly')), 'accept: swapped in every week variant');
const nw = weeks[0].find(e => e.name === 'Rear Delt Fly'), nw2 = weeks[1].find(e => e.name === 'Rear Delt Fly');
eq(weeks[0].indexOf(nw), 3, 'accept: same position in the day');
ok(nw.link === true && nw.inc === 10 && nw.sets === 3 && nw.reps === 12 && nw.repTop === 16, 'accept: carries superset, increment, sets and range (week 1)');
ok(nw.mg === 'delts' && nw.mg2.join() === 'back,traps' && nw.bar === 0 && nw.bw === 0 && nw.metric === 0, 'accept: carries muscles, bar, load type, metric');
ok(nw2.sets === 4 && nw2.reps === 10 && nw2.repTop === 15 && nw2.link === false, 'accept: week 2 keeps its own shape');
ok(nw.id !== 'c4' && nw2.id !== 'd2' && nw.id !== nw2.id && typeof nw.added === 'number', 'accept: new rows with new ids (newPlanEx), dated');
ok(!('startW' in nw), 'accept: no start weight when the old lift gives nothing to scale from');
eq((await getState(page)).coach.proposals.find(p => p.id === sk.id).status, 'accepted', 'accept: recorded as accepted');
same(JSON.stringify(st.sessions), JSON.stringify(before.sessions), 'accept: the log itself is untouched');
await page.click('.toast.act button');                                              // the toast's Undo
await page.waitForFunction(() => !document.querySelector('.toast.act'));
st = await getState(page);
same(JSON.stringify(st.routines.map(r => r.variants.map(v => v.exercises))), planBefore, 'undo: the exact previous rows, in both weeks');
let pr = st.coach.proposals.find(p => p.id === sk.id);
ok(pr.status === 'skipped' && pr.undone === true && !pr.undo, 'undo: recorded as undone (and then treated as kept)');

/* remove, and Undo from the Coach section; superset repair */
await boots(state(skipHistory([22])));
await finishDay('rC', ['RDL']);
sk = (await open())[0];
const planB2 = JSON.stringify((await getState(page)).routines);
await toProgress();
await page.click('[data-co="opt"][data-id="' + sk.id + '"][data-oi="0"]');            // Take it out
await page.waitForSelector('.toast.act');
st = await getState(page);
let dayC = st.routines[1].variants[0].exercises;
eq(dayC.map(e => e.name).join(), 'RDL,Flat DB Press,DB Row,Low to high cable fly', 'remove: the lift is gone');
ok(dayC[3].link === true, 'remove: the cable fly, which sat below Face Pull, keeps pairing with the row above it (adjacency)');
await page.click('[data-co="undo"]');
await page.waitForFunction(() => !document.querySelector('[data-co="undo"]'));
same(JSON.stringify((await getState(page)).routines), planB2, 'remove -> Undo in the Coach section: exact rows back');

/* head of a pair removed: its partner must not pair with whatever is above now */
{
  const C = [px('c1','RDL',6,10), px('c2','Flat DB Press',8,12), px('c3','DB Row',8,12,{ link:true }), Object.assign(faceC(), { link:false }),
    px('c5','Low to high cable fly',12,16,{ inc:10, mg:'chest', link:true })];
  await boots(state(skipHistory([22]), { routines:routines({ C }) }));
  await finishDay('rC', ['RDL']);
  sk = (await open())[0];
  await toProgress();
  await page.click('[data-co="opt"][data-id="' + sk.id + '"][data-oi="0"]');
  dayC = (await getState(page)).routines[1].variants[0].exercises;
  eq(dayC.map(e => e.name + ':' + !!e.link).join(), 'RDL:false,Flat DB Press:false,DB Row:true,Low to high cable fly:false', 'remove: removing the head of a pair unlinks its partner');
}

/* ================= 3. Keep it: recorded, and not raised again ================= */
await boots(state(skipHistory([22])));
await finishDay('rC', ['RDL']);
sk = (await open())[0];
const planB3 = JSON.stringify((await getState(page)).routines);
await toProgress();
await page.click('[data-co="keep"][data-id="' + sk.id + '"]');
await page.waitForFunction(() => !document.querySelector('[data-co="keep"]'));
pr = (await coachOf()).proposals.find(p => p.id === sk.id);
ok(pr.status === 'skipped' && pr.decided > 0, 'keep: recorded as skipped, with when');
same(JSON.stringify((await getState(page)).routines), planB3, 'keep: the plan is unchanged');
has(await text(), 'Kept: Face Pull keeps getting skipped', 'keep: shows under recent decisions');
// two weeks later another workout is saved: still cooling (6 weeks), not raised again
const age = async (days) => page.evaluate(d => {
  const s = JSON.parse(localStorage.getItem('ironlog.v1'));
  s.coach.lastCheck -= d * 864e5; s.coach.proposals.forEach(p => { p.decided = (p.decided || p.ts) - d * 864e5; p.ts -= d * 864e5; });
  localStorage.setItem('ironlog.v1', JSON.stringify(s));
}, days);
await age(15); await page.reload(); await page.waitForSelector('#view');
await finishDay('rC', notFace);
eq((await ofKind('skipped')).length, 1, 'keep: 15 days later it is not raised again');
await age(30); await page.reload(); await page.waitForSelector('#view');          // 45 days since kept, 30 since last look
await finishDay('rC', notFace);
eq((await ofKind('skipped')).length, 2, 'keep: after six weeks the same lift and reason may come back');
eq((await open()).length, 1, 'keep: ...as one open card');
// kept a second time: a longer wait
sk = (await open())[0];
await toProgress();
await page.click('[data-co="keep"][data-id="' + sk.id + '"]');
await page.waitForFunction(() => !document.querySelector('[data-co="keep"]'));
await age(60); await page.reload(); await page.waitForSelector('#view');          // 60 days: past 6 weeks, inside 18
await finishDay('rC', notFace);
eq((await ofKind('skipped')).length, 2, 'keep: kept twice, the wait stretches to 18 weeks');

/* ================= 4. long sessions ================= */
const longHist = (mins, extra) => [
  sess('c1','rC','C','vC',8, lifts([['Face Pull',10,12]]), { minutes:mins[0] }), sess('c2','rC','C','vC',15, lifts([['Face Pull',10,12]]), { minutes:mins[1] }),
  sess('c3','rC','C','vC',22, lifts([['Face Pull',10,12]]), { minutes:mins[2] }), sess('c4','rC','C','vC',29, lifts([['Face Pull',10,12]]), { minutes:mins[3] }),
  sess('a1','rA','A','vA',5, [['Leg Press',190,10],['Lateral Raise',15,14]]), sess('a2','rA','A','vA',12, [['Leg Press',190,10],['Lateral Raise',15,14]]) ].concat(extra || []);
// Day C: RDL | Flat DB Press + DB Row | Face Pull + Cable fly -> everything paired, so the trim is the offer
await boots(state(longHist([95, 90, 88, 84])));
await finishDay('rC', ['RDL']);                          // the saved one is untimed; 3 timed of 4 is enough
let lg = (await ofKind('long'))[0];
ok(lg && lg.status === 'open' && lg.rid === 'rC', 'long: Day C raised when its last sessions ran over an hour');
has(lg.reason, 'median of 90 active minutes', 'long: the reason gives the ACTIVE minutes (median of 95, 90, 88)');
eq(lg.options.map(o => o.act).join(), 'trim', 'long: all accessories paired already -> trim is the only choice');
eq(lg.options[0].lift, 'Low to high cable fly', 'long: trims the last accessory (lowest priority), never the main lift');
ok(/convention/i.test(lg.evidence), 'long: labelled as convention');
await boots(state(longHist([55, 52, 50, 48])));
await finishDay('rC', ['RDL']);
eq((await ofKind('long')).length, 0, 'long: median 53 minutes -> silent');
await boots(state(longHist([74, 72, 70, 68])));
await finishDay('rC', ['RDL']);
eq((await ofKind('long')).length, 0, 'long: median 71 minutes is inside the 45-75 he said is fine -> silent');
await boots(state(longHist([80, 78, 76, 74])));
await finishDay('rC', ['RDL']);
eq((await ofKind('long')).length, 1, 'long: median 77 minutes -> raised (threshold 75)');
/* the real log: last sets ticked hours or days later. First-to-last would read 10 hours; active time reads next to nothing. */
await boots(state(longHist([600, 700, 900, 2000])));
await finishDay('rC', ['RDL']);
eq((await ofKind('long')).length, 0, 'long: sets ticked hours apart are not a long session (breaks over 15 min do not count)');
await boots(state(longHist([95, 90, 88, 84]).map(s => s.id === 'c1' || s.id === 'c2' ? Object.assign(s, { exercises:s.exercises.map(e => Object.assign(e, { sets:e.sets.map(x => { const y = Object.assign({}, x); delete y.ts; return y; }) })) }) : s)));
await finishDay('rC', ['RDL']);
eq((await ofKind('long')).length, 0, 'long: only 2 of the last 4 can be timed -> silent');
// unpaired accessories: pair them
{
  const C = [px('c1','RDL',6,10), px('c2','Flat DB Press',8,12), px('c3','DB Row',8,12), faceC(), px('c5','Low to high cable fly',12,16,{ inc:10, mg:'chest' })]
    .map(e => Object.assign(e, { link:false }));
  const hist = longHist([95, 90, 88, 84]);
  await boots(state(hist, { routines:routines({ C }) }));
  await finishDay('rC', ['RDL']);
  lg = (await ofKind('long'))[0];
  eq(lg.options.map(o => o.act).join(), 'trim,pair', 'long: unpaired accessories -> trim a set, or pair two');
  eq(lg.options[1].label, 'Superset Face Pull + Low to high cable fly', 'long: pairs the last two unpaired accessories');
  const planBefore2 = JSON.stringify((await getState(page)).routines);
  await toProgress();
  await page.click('[data-co="opt"][data-id="' + lg.id + '"][data-oi="1"]');
  dayC = (await getState(page)).routines[1].variants[0].exercises;
  eq(dayC.map(e => e.link).join(), 'false,false,false,false,true', 'long: accepting the pair sets link on the second');
  await page.click('[data-co="undo"]');
  await page.waitForFunction(() => !document.querySelector('[data-co="undo"]'));
  same(JSON.stringify((await getState(page)).routines), planBefore2, 'long: pair undone exactly');
}
// trim a set
await boots(state(longHist([95, 90, 88, 84])));
await finishDay('rC', ['RDL']);
lg = (await ofKind('long'))[0];
const planB4 = JSON.stringify((await getState(page)).routines);
await toProgress();
await page.click('[data-co="opt"][data-id="' + lg.id + '"][data-oi="0"]');
dayC = (await getState(page)).routines[1].variants[0].exercises;
eq(dayC.map(e => e.sets).join(), '3,3,3,3,2', 'long: accepting the trim takes one set off the last accessory');
await page.click('.toast.act button');
same(JSON.stringify((await getState(page)).routines), planB4, 'long: trim undone exactly');

/* ================= 5. too few weekly sets ================= */
const wkStart = (off) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * off); return d.getTime(); };
function weekSessions(chestSets, o = {}) {
  const out = [];
  [1, 2, 3].forEach(w => [1, 3].forEach((d, j) => {                    // Tuesday and Thursday of each of the last 3 weeks
    const ts = wkStart(w) + d * DAY + 18 * 36e5, id = 'w' + w + j;
    const s = sess(id, 'rC', 'C', 'vC', (NOW - ts) / DAY, [['Flat DB Press', 45, 10, chestSets], ['DB Row', 50, 10, 3], ['Face Pull', 10, 12, 3]], { minutes:o.minutes });
    s.deload = !!(o.deload && w === 2 && j === 0);
    out.push(s);
  }));
  return out;
}
const chestRows = () => routines({ C:[px('c1','RDL',6,10), px('c2','Flat DB Press',8,12,{ mg:'chest', mg2:[] }), px('c3','DB Row',8,12,{ mg:'back' }),
  px('c4','Face Pull',12,16,{ mg:'delts' }), px('c5','Low to high cable fly',12,16,{ mg:'chest', link:true })] });
await boots(state(weekSessions(2).concat([sess('a1','rA','A','vA',40,[['Leg Press',190,10]])]), { routines:chestRows() }));
await finishDay('rC', ['RDL']);
let vol = (await ofKind('volume'))[0];
ok(vol && vol.status === 'open' && /Chest/.test(vol.title), 'volume: chest at 4 sets a week (under 6) is raised');
has(vol.reason, 'sets a week over the last 3 weeks', 'volume: the reason gives the average'); has(vol.reason, '1 for the main muscle, ½ for a helper', 'volume: ...and how a set is counted');
eq(vol.options.length, 1, 'volume: one offer'); eq(vol.options[0].lift, 'Low to high cable fly', 'volume: the isolation lift gets the set');
ok(/Schoenfeld 2017/.test(vol.evidence) && /Pelland 2026/.test(vol.evidence), 'volume: cites the volume dose-response work');
const planB5 = JSON.stringify((await getState(page)).routines);
await toProgress();
await page.click('[data-co="opt"][data-id="' + vol.id + '"][data-oi="0"]');
eq((await getState(page)).routines[1].variants[0].exercises.map(e => e.sets).join(), '3,3,3,3,4', 'volume: accepting adds one set to that lift');
await page.click('.toast.act button');
same(JSON.stringify((await getState(page)).routines), planB5, 'volume: undone exactly');
await boots(state(weekSessions(3).concat([sess('a1','rA','A','vA',40,[['Leg Press',190,10]])]), { routines:chestRows() }));
await finishDay('rC', ['RDL']);
eq((await ofKind('volume')).filter(p => /Chest/.test(p.title)).length, 0, 'volume: 6 chest sets a week is not under 6 (10 would have fired; this is rare on purpose)');
{
  const C = [px('c1','RDL',6,10,{ sets:4 }), px('c2','Flat DB Press',8,12,{ mg:'chest', mg2:[], sets:4 }), px('c3','DB Row',8,12,{ mg:'back', sets:4 }),
    px('c4','Face Pull',12,16,{ mg:'delts', sets:4 }), px('c5','Low to high cable fly',12,16,{ mg:'chest', link:true, sets:4 }), px('c6','Cable Curl',12,16,{ mg:'biceps', sets:1 })];
  await boots(state(weekSessions(2).concat([sess('a1','rA','A','vA',40,[['Leg Press',190,10]])]), { routines:routines({ C }) }));
  await finishDay('rC', ['RDL']);
  eq((await ofKind('volume')).filter(p => /Chest/.test(p.title)).length, 0, 'volume: never on a day already planned at 21 working sets');
}
await boots(state(weekSessions(2, { minutes:60 }).concat([sess('a1','rA','A','vA',40,[['Leg Press',190,10]])]), { routines:chestRows() }));
await finishDay('rC', ['RDL']);
eq((await ofKind('volume')).filter(p => /Chest/.test(p.title)).length, 0, 'volume: never on a day already running 60 active minutes (over 55)');
await boots(state(weekSessions(8).concat([sess('a1','rA','A','vA',40,[['Leg Press',190,10]])]), { routines:chestRows() }));
await finishDay('rC', ['RDL']);
eq((await ofKind('volume')).filter(p => /Chest/.test(p.title)).length, 0, 'volume: 16 chest sets a week is plenty -> silent for chest');
await boots(state(weekSessions(2, { deload:true }).concat([sess('a1','rA','A','vA',40,[['Leg Press',190,10]])]), { routines:chestRows() }));
await finishDay('rC', ['RDL']);
eq((await ofKind('volume')).length, 0, 'volume: a deload inside the three weeks -> silent (low on purpose)');
await boots(state(weekSessions(2).filter(s => !/^w2/.test(s.id)).concat([sess('a1','rA','A','vA',40,[['Leg Press',190,10]])]), { routines:chestRows() }));
await finishDay('rC', ['RDL']);
eq((await ofKind('volume')).length, 0, 'volume: a week with no training in the three -> silent');
await boots(state(weekSessions(2).filter(s => /1$/.test(s.id) === false).concat([sess('a1','rA','A','vA',40,[['Leg Press',190,10]])]), { routines:chestRows() }));
await finishDay('rC', ['RDL']);
eq((await ofKind('volume')).length, 0, 'volume: one session a week is not "training 2x a week" -> silent');

/* ================= 6. stalled lift: a ladder ================= */
const stall = (rowsFor) => Array.from({ length:7 }, (_, i) => sess('r' + i, 'rA', 'A', 'vA', 4 + 7 * i, rowsFor(i)));
const cRows = [sess('c1','rC','C','vC',9,lifts()), sess('c2','rC','C','vC',16,lifts())];
const flat = () => [['Cable Row', 65, 8], ['Leg Press', 190, 10]];
const cableOf = async () => (await ofKind('stall')).filter(p => p.lift === 'Cable Row');
await boots(state(stall(flat).concat(cRows)));
await finishDay('rA', ['Leg Press']);
let stl = (await cableOf())[0];
ok(stl && stl.status === 'open' && stl.stage === 1, 'stall: 7 sessions at 65 x 8 with nothing gained -> raised, as step one');
has(stl.reason, 'sessions in a row at 65', 'stall: the reason counts sessions at the load');
ok(/rule of thumb/i.test(stl.evidence) && /validated/i.test(stl.evidence), 'stall: labelled a rule of thumb, no validated test');
eq(stl.options.map(o => o.act).join(), 'add,shift_range,unpair', 'stall: step one keeps the lift (and its history): a set, a lower range, out of its superset - no swap');
eq(stl.options[1].label, "Lower Cable Row's range by 2 reps (8–12 → 6–10)", 'stall: ...and says what the range becomes');
eq(coachSwaps(stl), '', 'stall: no swap offered yet');
function coachSwaps(p) { return p.options.filter(o => o.act === 'swap').map(o => o.to).join(); }
{
  const planB = JSON.stringify((await getState(page)).routines);
  await toProgress();
  await page.click('[data-co="opt"][data-id="' + stl.id + '"][data-oi="1"]');
  await page.waitForSelector('.toast.act');
  const cr = planExercises(await getState(page)).find(e => e.name === 'Cable Row');
  ok(cr.reps === 6 && cr.repTop === 10 && cr.sets === 3 && cr.id === 'a3', 'stall: lowering the range is 8-12 -> 6-10 on the same row (history kept: same name, same id)');
  has(await text(), '1 suggestion accepted · 0 led to progress within 4 sessions (1 still being measured)', 'measure: the Coach section keeps a tally');
  const h = (await coachOf()).history.find(x => x.type === 'accepted');
  ok(h && h.kind === 'stall' && h.lift === 'Cable Row' && h.baseline.score > 0 && h.baseline.skip === 0.25 && h.result === '', 'measure: the accepted suggestion is recorded with its baseline');
  // four more Day A sessions with every lift done: the range is 6-10, last time 8, so the card asks for 9
  for (let k = 0; k < 4; k++) await finishDay('rA', () => true);
  has(await text(), '1 suggestion accepted · 1 led to progress within 4 sessions', 'measure: after 4 more exposures, progress is counted');
  eq((await coachOf()).history.find(x => x.type === 'accepted').result, 'helped', 'measure: ...as helped');
  void planB;
}
// undo takes the measurement away with it
await boots(state(stall(flat).concat(cRows)));
await finishDay('rA', ['Leg Press']);
stl = (await cableOf())[0];
await toProgress();
await page.click('[data-co="opt"][data-id="' + stl.id + '"][data-oi="0"]');
await page.waitForSelector('.toast.act');
eq(planExercises(await getState(page)).find(e => e.name === 'Cable Row').sets, 4, 'stall: +1 set is on the same row');
await page.click('.toast.act button');
ok(!(await coachOf()).history.some(x => x.type === 'accepted'), 'measure: an undone change is not counted');
// rung two: a pain note in a recent session, at once
await boots(state(stall(i => [['Cable Row', 65, 8, 3, i === 1 ? 'left elbow pinch on the last set' : ''], ['Leg Press', 190, 10]]).concat(cRows)));
await finishDay('rA', ['Leg Press']);
stl = (await cableOf())[0];
eq(stl.stage, 2, 'stall: a recent note about a pinch skips the ladder');
eq(stl.options.map(o => o.to).join(), 'Chest-supported Row,Machine Row,T-Bar Row', 'stall: ...to swaps from the family, minus DB Row, which Day C already has');
has(stl.reason, 'left elbow pinch', 'stall: ...and quotes the note');
// rung two: it stalled again after a change was accepted
const prior = (daysAgo) => ({ coach:{ lastCheck:0, history:[], proposals:[ { id:'pr1', ts:NOW - (daysAgo + 1) * DAY, decided:NOW - daysAgo * DAY, source:'rules', kind:'stall', key:'stall|cable row', stage:1,
  lift:'Cable Row', rid:'', title:'x', reason:'x', evidence:'', status:'accepted', chosen:'Add a set to Cable Row', options:[{ act:'add', lift:'Cable Row', n:1, label:'Add a set to Cable Row' }] } ] } });
await boots(state(stall(flat).concat(cRows), prior(45)));
await finishDay('rA', ['Leg Press']);
stl = (await cableOf()).find(p => p.status === 'open');
ok(stl && stl.stage === 2 && coachSwaps(stl).startsWith('Chest-supported Row'), 'stall: stalled again 45 days after step one was accepted (6 exposures since) -> swaps');
has(stl.reason, 'stalled again after the change', 'stall: ...and says why');
await boots(state(stall(flat).concat(cRows), prior(10)));
await finishDay('rA', ['Leg Press']);
eq((await cableOf()).filter(p => p.status === 'open').length, 0, 'stall: step one accepted only 10 days ago -> no second rung yet');
await boots(state(stall(i => [['Cable Row', 65, i < 4 ? 10 : 8], ['Leg Press', 190, 10]]).concat(cRows)));
await finishDay('rA', ['Leg Press']);
eq((await cableOf()).length, 0, 'stall: reps still climbing at the same load -> silent');
await boots(state(stall(i => [['Cable Row', i < 3 ? 70 : 65, 8], ['Leg Press', 190, 10]])));
await finishDay('rA', ['Leg Press']);
eq((await cableOf()).length, 0, 'stall: load went up recently -> not 6 at one load -> silent');
await boots(state(Array.from({ length:5 }, (_, i) => sess('r' + i, 'rA', 'A', 'vA', 4 + 7 * i, flat()))));
await finishDay('rA', ['Leg Press']);
eq((await cableOf()).length, 0, 'stall: only 5 exposures -> silent');
await boots(state(Array.from({ length:7 }, (_, i) => sess('r' + i, 'rA', 'A', 'vA', 2 + 2 * i, flat()))));
await finishDay('rA', ['Leg Press']);
eq((await cableOf()).length, 0, 'stall: six sessions inside two weeks is not a plateau -> silent');

/* ================= 7. never more than two open ================= */
{
  // Skipped (Face Pull), skipped (DB Row, not done lately) and long would all qualify.
  const hist = longHist([95, 90, 88, 84]).map(s => s.routineId === 'rC' ? Object.assign(s, { exercises:s.exercises.filter(e => e.name !== 'Face Pull' && e.name !== 'DB Row') }) : s)
    .concat([sess('c0','rC','C','vC',70,lifts([['Face Pull',10,12]]))]);
  await boots(state(hist));
  await finishDay('rC', ['RDL']);
  const c = await coachOf();
  eq(c.proposals.filter(p => p.status === 'open').length, 2, 'cap: three rules qualified (two skipped lifts, a long day), two cards are open');
  ok(c.proposals.length === 2, 'cap: the rest were not stored either');
  eq(c.proposals.map(p => p.kind).sort().join(), 'skipped,skipped', 'cap: the strongest evidence (skipped lifts) goes first');
}

/* ================= 8. refused while a workout is active ================= */
await boots(state(skipHistory([22])));
await finishDay('rC', ['RDL']);
sk = (await open())[0];
const planB8 = JSON.stringify((await getState(page)).routines);
await page.click('[data-tab="today"]'); await page.click('[data-act="start"][data-id="rA"]'); await page.waitForSelector('.card.ex');
await toProgress();
has(await text(), 'Face Pull keeps getting skipped', 'active: the card is still visible on Progress');
await page.click('[data-co="opt"][data-id="' + sk.id + '"][data-oi="1"]');
has(await page.textContent('.toast'), 'Finish or discard the workout first', 'active: Accept is refused with the plan-switch message');
same(JSON.stringify((await getState(page)).routines), planB8, 'active: the plan is untouched');
eq((await open()).length, 1, 'active: the card stays open');
await page.click('[data-tab="today"]');
ok(await page.$('.card.co') === null, 'active: no Coach card on Today mid-workout');
await page.click('[data-act="discard"]'); await page.click('[data-x="ok"]');
await page.waitForSelector('[data-act="start"]');

/* ================= 9. a swapped-in lift's first card ================= */
{
  const stalled = Array.from({ length:7 }, (_, i) => sess('r' + i, 'rA', 'A', 'vA', 4 + 7 * i, [['Cable Row', 65, 8, 3, i === 0 ? 'elbow pain on rows' : ''], ['Lateral Raise', 15, 14], ['Leg Press', 190, 10]]));
  await boots(state(stalled.concat(cRows),
    { routines:routines({ A:[px('a1','Leg Press',8,12), px('a3','Cable Row',8,12,{ inc:5 }), px('a5','Lateral Raise',12,20,{ link:true })] }) }));
  await finishDay('rA', ['Leg Press']);
  stl = (await ofKind('stall')).find(p => p.lift === 'Cable Row');
  await toProgress();
  await page.click('[data-co="opt"][data-id="' + stl.id + '"][data-oi="0"]');          // Chest-supported Row
  await page.waitForSelector('.toast.act');
  const row = planExercises(await getState(page)).find(e => e.name === 'Chest-supported Row');
  eq(row.startW, 45, 'swap-in: never-done lift: start weight = 65 x 0.9 x 0.85, rounded down to the 5 lb step, erring light');
  ok(row.reps === 8 && row.repTop === 12 && row.inc === 5, 'swap-in: ...with the old slot\'s range and increment');
  await page.click('[data-tab="today"]'); await page.click('[data-act="start"][data-id="rA"]'); await page.waitForSelector('.card.ex');
  const card = page.locator('.card.ex', { hasText: 'Chest-supported Row' });
  has((await card.locator('.why').textContent()).replace(/\s+/g, ' '), 'First time — start around 45 and find your 8', 'swap-in: the first card says where to start');
  eq(await card.locator('.set input[data-f="w"]').first().inputValue(), '45', 'swap-in: ...and the weight box is filled with it');
  const old = page.locator('.card.ex', { hasText: 'Lateral Raise' });
  ok(!/First time/.test(await old.textContent()), 'swap-in: lifts with history are unaffected');
  await page.click('[data-act="discard"]'); await page.click('[data-x="ok"]');
  await page.waitForSelector('[data-act="start"]');
}
/* a swap-in that HAS history keeps it: no guessed weight; after 4 weeks away it starts a step lighter */
for (const [daysAgo, lighter] of [[60, true], [10, false]]) {
  const open1 = { id:'px', ts:NOW - DAY, source:'rules', kind:'skipped', key:'skipped|lateral raise|rA', lift:'Lateral Raise', rid:'rA', title:'Lateral Raise keeps getting skipped',
    reason:'x', evidence:'', status:'open', options:[{ act:'swap', lift:'Lateral Raise', to:'Cable Lateral Raise', label:'Swap for Cable Lateral Raise' }] };
  await boots(state(skipHistory([22]).concat([sess('old','rA','A','vA',daysAgo,[['Cable Lateral Raise',10,14]]), sess('lr','rA','A','vA',40,[['Lateral Raise',15,14]])]),
    { coach:{ lastCheck:NOW - DAY, history:[], proposals:[open1] }, routines:routines({ A:[px('a1','Leg Press',8,12), px('a5','Lateral Raise',12,20)] }) }));
  await toProgress();
  await page.click('[data-co="opt"][data-id="px"][data-oi="0"]');
  await page.waitForSelector('.toast.act');
  const r2 = planExercises(await getState(page)).find(e => e.name === 'Cable Lateral Raise');
  ok(!('startW' in r2) && r2.stepBack === true, 'swap-in with history (' + daysAgo + ' d ago): no guessed start weight');
  await page.click('[data-tab="today"]'); await page.click('[data-act="start"][data-id="rA"]'); await page.waitForSelector('.card.ex');
  const c2 = page.locator('.card.ex', { hasText: 'Cable Lateral Raise' });
  const w0 = await c2.locator('.set input[data-f="w"]').first().inputValue();
  eq(w0, lighter ? '5' : '10', 'swap-in with history (' + daysAgo + ' d ago): the engine\'s own answer' + (lighter ? ', one step lighter' : ''));
  eq(/one step lighter/.test(await c2.textContent()), lighter, 'swap-in with history (' + daysAgo + ' d ago): ' + (lighter ? 'the card says why' : 'no note when it was recent'));
  await page.click('[data-act="discard"]'); await page.click('[data-x="ok"]');
  await page.waitForSelector('[data-act="start"]');
}

/* ================= 10. the check-in with Claude ================= */
const aiState = () => state(skipHistory([22]).concat([sess('n1','rC','C','vC',2,lifts([['Face Pull',10,12,3,'Shoulder twinged on the last rep']]),{ note:'Slept badly', minutes:50 })]),
  { coach:{ lastCheck:NOW - 1 * DAY, history:[], proposals:[ { id:'p0', ts:NOW - 12 * DAY, decided:NOW - 10 * DAY, source:'rules', kind:'volume',
    key:'volume|chest', lift:'Low to high cable fly', rid:'rC', title:'Chest is under 10 sets a week', reason:'Chest averaged 8 sets a week.',
    evidence:'', options:[{ act:'add', lift:'Low to high cable fly', n:1, label:'Add a set' }], status:'skipped' } ] } });
const AIK = { 'ironlog.ai':{ key:KEY, base:'', model:'' }, 'ironlog.gist':{ token:TOKEN } };
await boots(aiState());                                // no key: no button
await toProgress();
ok(await page.$('[data-co="ask"]') === null, 'ai: no key saved -> no "Ask Claude" button');
await boots(aiState(), AIK);
await toProgress();
has(await text(), 'Ask Claude for a check-in', 'ai: key saved -> the button');
has(await text(), 'Claude reads your plan', 'ai: ...with what it does and does not do');
ok(await page.$('[data-co="ask"].primary') !== null, 'ai: with no check-in yet, it is offered up front');

reply = { summary:'Training looks steady at about two sessions a week. Day C runs long and the face pulls keep getting skipped.',
  proposals:[
    { kind:'swap', lift:'Face Pull', replacement:'Rear Delt Fly', sets:0, reason:'Face Pull was skipped in the last three Day C sessions and your note on 2 days ago mentions a twinge.' },
    { kind:'trim_sets', lift:'Lateral Raise', replacement:'', sets:1, reason:'Lateral Raise has 3 sets on every day; one set is surplus.' },
    { kind:'swap', lift:'Cable Bench Fly', replacement:'Pec Deck', sets:0, reason:'not in the plan' },
    { kind:'swap', lift:'RDL', replacement:'', sets:0, reason:'empty replacement' },
    { kind:'remove', lift:'Leg Press', replacement:'Hack Squat', sets:0, reason:'valid but over the cap' },
    { kind:'add_set', lift:'Flat DB Press', replacement:'', sets:9, reason:'absurd number of sets' },
    { kind:'delete_everything', lift:'RDL', replacement:'', sets:0, reason:'not an allowed kind' },
    { kind:'pair', lift:'Flat DB Press', replacement:'Low to high cable fly', sets:0, reason:'not adjacent' },
    { kind:'swap', lift:'DB Row', replacement:'Flat DB Press', sets:0, reason:'already in the plan' },
    { kind:'shift_range', lift:'Leg Press', replacement:'', sets:9, reason:'shifting a range by nine reps' },
    { kind:'unpair', lift:'Leg Press', replacement:'', sets:0, reason:'it is not in a superset' } ],
  questions:['Is the shoulder twinge from the face pulls, or from pressing?', 'Do you want to keep training 3 days?', 'A third question that should be cut'] };
const before10 = await getState(page);
const callsBefore = calls.length;
await page.click('[data-co="ask"]');
await page.waitForFunction(() => /Claude asks/.test(document.querySelector('#view').textContent), null, { timeout:30000 });
eq(calls.length, callsBefore + 1, 'ai: one request');
const c0 = calls[calls.length - 1];
eq(c0.body.output_config.effort, 'high', 'ai: effort high');
eq(c0.body.max_tokens, 16000, 'ai: generous maxTokens');
ok(c0.body.output_config.format && c0.body.output_config.format.type === 'json_schema', 'ai: reply constrained to a JSON schema');
const sch = c0.body.output_config.format.schema;
ok(sch.additionalProperties === false && sch.required.join() === 'summary,proposals,questions', 'ai: schema is closed, every field required');
ok(sch.properties.proposals.items.additionalProperties === false && sch.properties.proposals.items.required.join() === 'kind,lift,replacement,sets,reason', 'ai: ...proposals too');
eq(sch.properties.proposals.items.properties.kind.enum.join(), 'swap,trim_sets,remove,add_set,pair,shift_range,unpair', 'ai: kinds are the fixed action list');
ok(/never set|never.*weights/i.test(c0.body.system) && /at most 3/i.test(c0.body.system) && /similar exercise/i.test(c0.body.system), 'ai: the system prompt forbids weights, caps at 3, asks for a similar exercise');
const sent = c0.body.messages[0].content;
ok(typeof sent === 'string' && sent.length < 24000, 'ai: the summary is compact  [' + sent.length + ' chars]');
for (const frag of ['PLAN', 'SUPERSETS NOW: ', 'Incline DB Press + Cable Row', 'every ~', 'GAP over 14 d', 'min active', 'min first-to-last-set', 'Face Pull', 'SKIPPED in last 4 sessions of the day: Day C 2/4', 'Shoulder twinged on the last rep', 'WEEKLY SETS PER MUSCLE', 'SESSIONS', 'Slept badly', 'THE APP\'S OWN RULE SUGGESTIONS'])
  has(sent, frag, 'ai: the summary includes ' + frag);
ok(!c0.raw.includes(KEY) && !JSON.stringify(c0.headers).includes(TOKEN) && !c0.raw.includes(TOKEN), 'ai: neither the AI key nor the GitHub token is in the request body');
ok(!sent.includes('sk-ant') && !sent.includes('ghp_'), 'ai: ...nor anything shaped like one in the summary');
const q = await text();
has(q, 'Training looks steady', 'ai: the summary is shown');
has(q, 'Is the shoulder twinge from the face pulls', 'ai: the questions are shown'); ok(!q.includes('A third question'), 'ai: at most two questions');
const ai = await coachOf();
const mine = ai.proposals.filter(p => p.source === 'claude' && p.status === 'open');
eq(mine.map(p => p.lift).join(), 'Face Pull,Lateral Raise', 'ai: valid proposals kept, in order, capped at two open');
ok(ai.proposals.filter(p => p.status === 'open').length <= 2, 'ai: never more than two open');
eq(mine[0].options.map(o => o.to || o.act).join(), 'Rear Delt Fly,Reverse Pec Deck,Band Pull-apart', 'ai: swap offers Claude\'s pick, then similar lifts');
eq(mine[1].options.map(o => o.act).join(), 'trim,swap,swap', 'ai: trimming also offers similar exercises');
const hist0 = ai.history[0];
ok(hist0.type === 'claude' && hist0.model === 'claude-opus-5-5' && hist0.usage.input === 4321 && hist0.usage.output === 456 && hist0.ts > 0, 'ai: the check-in is recorded with model and token usage');
ok(!JSON.stringify(ai.history).includes('PLAN (sets') && !JSON.stringify(ai.history).includes(KEY), 'ai: ...but not the prompt');
eq(hist0.raised, 2, 'ai: records how many were raised'); ok(hist0.dropped >= 5, 'ai: ...and how many were dropped  [' + hist0.dropped + ']');
has(q, 'suggested 3 changes; the coach shows 2 at a time', 'ai: says when it showed fewer than Claude gave');
same(JSON.stringify((await getState(page)).routines), JSON.stringify(before10.routines), 'ai: nothing was applied by itself — the plan is exactly as it was');
same(JSON.stringify((await getState(page)).sessions), JSON.stringify(before10.sessions), 'ai: ...and the log too');
await page.click('[data-co="opt"][data-id="' + mine[0].id + '"][data-oi="0"]');
await page.waitForSelector('.toast.act');
ok(planExercises(await getState(page)).some(e => e.name === 'Rear Delt Fly') && !planExercises(await getState(page)).some(e => e.name === 'Face Pull'), 'ai: accepting a Claude card applies it like any other');
await page.click('.toast.act button');
ok(planExercises(await getState(page)).some(e => e.name === 'Face Pull'), 'ai: ...and Undo works');
ok(!/a check-in is due/.test(await text()), 'ai: a check-in made today is not "due"');

/* offered, not run, after 14 days; errors show their message */
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ironlog.v1')); s.coach.history.find(h => h.type === 'claude').ts -= 20 * 864e5; localStorage.setItem('ironlog.v1', JSON.stringify(s)); });
const nCalls = calls.length;
await page.reload(); await page.waitForSelector('#view'); await toProgress();
has(await text(), 'a check-in is due', 'ai: 20 days on, a check-in is offered');
await page.waitForTimeout(500);
eq(calls.length, nCalls, 'ai: ...but never run by itself');
mode = '401';
await page.click('[data-co="ask"]');
await page.waitForFunction(() => /rejected/.test(document.querySelector('#view').textContent), null, { timeout:30000 });
has(await text(), 'The key was rejected', 'ai: a rejected key shows err.userMsg');
mode = 'ok';
reply = { summary:'Nothing needs changing right now.', proposals:[], questions:[] };
await page.click('[data-co="ask"]');
await page.waitForFunction(() => /Nothing needs changing/.test(document.querySelector('#view').textContent), null, { timeout:30000 });
has(await text(), 'Nothing to change.', 'ai: "nothing worth changing" is said plainly');
eq((await open()).filter(p => p.source === 'claude').length, 0, 'ai: ...and raises no cards');

/* ================= 11. normalize, 320 px ================= */
{
  const bare = state(skipHistory([22])); delete bare.coach;
  await boot(page, bare);
  await toProgress();
  ok((await text()).includes('Coach'), 'normalize: a log with no coach key loads, and Progress has a Coach section');
  await finishDay('rC', ['RDL']);
  ok(Array.isArray((await coachOf()).proposals), 'normalize: ...and gets one');
  const broken = state(skipHistory([22])); broken.coach = { proposals:'nope', history:{ a:1 }, lastCheck:'x' };
  await boot(page, broken); await toProgress();
  ok((await text()).includes('Coach'), 'normalize: a mangled coach key is repaired, not fatal');
}
await boots(state(skipHistory([22])), AIK);
await finishDay('rC', ['RDL']);
await page.setViewportSize({ width:320, height:740 });
await toProgress();
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 px: Progress with a Coach card has no sideways scroll');
await page.click('[data-tab="today"]'); await page.waitForSelector('.card.co');
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 px: Today with a Coach card has no sideways scroll');
ok(await page.evaluate(() => [...document.querySelectorAll('.co-o .btn')].every(b => b.scrollWidth <= b.clientWidth + 1)), '320 px: no option button overflows its box');

ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t39 coach');
await browser.close();
