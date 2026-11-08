/* v26.4: "Last · Day A · Tue · 12 sets — Edit" on Today opens the newest session in
   the editor directly, and the editor's Save/Cancel row is sticky so it never needs a scroll.
   Fixing a typo in the session you just finished used to be Progress -> scroll ~2200px ->
   row -> Edit -> scroll to Save. UI-driven: real taps, real localStorage. */
import { launch, boot, getState, ok, eq, has, report } from './harness.mjs';

const SET = { unit:'lb', rest:120, autoRest:false, buzz:false, inc:5, sound:false, notify:false,
  rpe:false, keepTone:false, autoBackup:false, shareMode:'', doubleDefault:true,
  repLow:8, repHigh:12, rangeFixHidden:true, bodyweight:0, deloadUntil:0, deloadSnooze:0,
  bar:45, plates:[{w:45,n:4},{w:25,n:2}], lastBackup:Date.now() };
const DAY = 864e5;
const plan = () => [{ id:'r1', key:'A', name:'Day A', variants:[{ id:'v1', label:'', exercises:[
  { id:'pa', name:'Bench Press', sets:3, reps:8, repTop:12 } ] }] }];
/* two sessions of Bench: older 100x10 (PR at the time), newer 120x10 with the PR flag */
function ses(id, daysAgo, w, r, n, pr) {
  const ts = Date.now() - daysAgo * DAY;
  return { id, ts, endTs: ts + 3e6, routineId:'r1', key:'A', name:'Day A', variantId:'v1',
    exercises:[{ id:'e' + id, planId:'pa', name:'Bench Press', reps:8, repTop:12,
      sets:Array.from({ length:n }, () => ({ w:String(w), r:String(r), done:true, load:w, pr:!!pr })) }] };
}
/* pad a session out to 6 lifts so the editor sheet genuinely scrolls */
function big(sx) {
  for (let i = 1; i < 6; i++) sx.exercises.push({ id:'x' + i, planId:null, name:'Accessory ' + i, reps:8, repTop:12,
    sets:[1, 2, 3].map(() => ({ w:'40', r:'10', done:true, load:40 })) });
  return sx;
}
const withSessions = ss => ({ version:5, settings:{ ...SET }, routines:plan(), sessions:ss, active:null });

const { browser, page, errors } = await launch();
const vis = sel => page.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.width > 0; });
const noOverflow = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

/* ---- 1. no sessions: row hidden ---- */
await boot(page, withSessions([]));
eq(await page.locator('[data-act="edit-last"]').count(), 0, 'no sessions: no Last row');

/* ---- 2. shows the newest session ---- */
await boot(page, withSessions([big(ses('new', 1, 120, 10, 4, true)), ses('old', 8, 100, 10, 3, true), ses('oldest', 15, 80, 10, 3)]));
const row = page.locator('[data-act="edit-last"]');
eq(await row.count(), 1, 'one Last row');
has(await row.innerText(), '19 sets', 'row shows the newest session (19 sets, not the older 3)');
has(await row.innerText(), 'Day A', 'row names the day');
eq(await row.getAttribute('data-id'), 'new', 'row points at the newest session');

/* ---- 3. Start stays first on screen; row sits below the day card ---- */
ok(await vis('[data-act="start"].primary'), 'Start button is in the first viewport');
const order = await page.evaluate(() => {
  const s = document.querySelector('[data-act="start"].primary').getBoundingClientRect().top,
        l = document.querySelector('[data-act="edit-last"]').getBoundingClientRect().top;
  return { s, l };
});
ok(order.s < order.l, 'Start is above the Last row  [' + JSON.stringify(order) + ']');
ok(await vis('[data-act="edit-last"]'), 'Last row is visible without scrolling');
const h = await row.evaluate(el => el.getBoundingClientRect().height);
ok(h >= 44 && h <= 64, 'Last row is compact but a 44px+ target  [h=' + Math.round(h) + ']');

/* ---- 4. tap -> editor for that session (Trap 18: click works on Today) ---- */
await row.tap();
await page.waitForSelector('.sheet [data-x="save"]');
has(await page.locator('.sheet h3').innerText(), 'Edit session', 'tap opens the editor, not the read-only sheet');
eq(await page.locator('.sheet input[data-k="0.0"][data-f="r"]').inputValue(), '10', 'editor holds the newest session (reps 10)');
eq(await page.locator('.sheet input[data-k="0.0"][data-f="w"]').inputValue(), '120', 'editor holds the newest session (120 lb)');

/* ---- 5. Save/Cancel reachable with no scroll; not covering the last input at the end ---- */
ok(await vis('.sheet [data-x="save"]'), 'Save is in the viewport without scrolling');
ok(await vis('.sheet [data-x="cancel"]'), 'Cancel is in the viewport without scrolling');
await page.waitForTimeout(400); // let the sheet's slide-in animation finish before measuring
const scrolls = await page.evaluate(() => { const sh = document.querySelector('.sheet'); return sh.scrollHeight > sh.clientHeight + 50; });
ok(scrolls, 'editor sheet really scrolls for this session');
const overlap = await page.evaluate(() => {
  const sh = document.querySelector('.sheet'); sh.scrollTop = sh.scrollHeight;
  const foot = document.querySelector('.sheet-foot').getBoundingClientRect(), note = document.querySelector('.sheet [data-x="note"]').getBoundingClientRect();
  return { footTop: Math.round(foot.top), noteBottom: Math.round(note.bottom), footBottom: Math.round(foot.bottom), vh: innerHeight };
});
ok(overlap.noteBottom <= overlap.footTop, 'at scroll end the note field is not covered by the sticky row  [' + JSON.stringify(overlap) + ']');
ok(Math.abs(overlap.footBottom - overlap.vh) <= 1, 'sticky row sits flush with the bottom of the screen  [' + JSON.stringify(overlap) + ']');

/* ---- 6. lower the top set, Save -> persisted, PR recomputed, still on Today ---- */
await page.locator('.sheet input[data-k="0.0"][data-f="w"]').fill('90');
await page.locator('.sheet [data-x="save"]').tap();
await page.waitForFunction(() => !document.querySelector('.backdrop'));
await page.waitForTimeout(300);
let st = await getState(page);
const nw = st.sessions.find(s => s.id === 'new'), od = st.sessions.find(s => s.id === 'old');
eq(nw.exercises[0].sets[0].w, '90', 'weight change persisted to localStorage');
ok(!nw.exercises[0].sets[0].pr && nw.exercises[0].sets[1].pr, 'the PR flag moved off the lowered set onto the next one (recomputePRs ran)');
ok(od.exercises[0].sets.some(x => x.pr), 'the older 100x10 stays the PR');
ok(await page.locator('[data-act="start"].primary').count() > 0, 'stayed on Today after Save');

/* ---- 7. Cancel leaves data alone ---- */
await page.locator('[data-act="edit-last"]').tap();
await page.waitForSelector('.sheet [data-x="cancel"]');
await page.locator('.sheet input[data-k="0.0"][data-f="r"]').fill('1');
await page.locator('.sheet [data-x="cancel"]').tap();
await page.waitForFunction(() => !document.querySelector('.backdrop'));
st = await getState(page);
eq(st.sessions.find(s => s.id === 'new').exercises[0].sets[0].r, '10', 'Cancel discards edits');

/* ---- 8. hidden during an active workout ---- */
await page.locator('[data-act="start"].primary').tap();
await page.waitForSelector('.card.ex');
eq(await page.locator('[data-act="edit-last"]').count(), 0, 'no Last row during an active workout');

/* ---- 9. no horizontal overflow at 390 and 320, with a long day name ---- */
const long = withSessions([ses('new', 0, 120, 10, 4, true)]);
long.sessions[0].name = 'Upper Body Hypertrophy Volume Day With A Very Long Name';
for (const w of [390, 320]) {
  await page.setViewportSize({ width:w, height:844 });
  await boot(page, long);
  ok(await noOverflow(), 'Today: no horizontal overflow at ' + w + 'px');
  ok(await vis('[data-act="start"].primary'), 'Start in first viewport at ' + w + 'px');
  await page.locator('[data-act="edit-last"]').tap();
  await page.waitForSelector('.sheet [data-x="save"]');
  ok(await noOverflow(), 'editor: no horizontal overflow at ' + w + 'px');
  ok(await page.evaluate(() => { const s = document.querySelector('.sheet'); return s.scrollWidth <= s.clientWidth; }), 'sheet itself does not scroll sideways at ' + w + 'px');
  ok(await vis('.sheet [data-x="save"]'), 'Save in viewport at ' + w + 'px');
}

eq(errors.length, 0, 'no page errors  ' + JSON.stringify(errors));
await browser.close();
report('t44-last-session');
