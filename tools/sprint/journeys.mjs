/* Gym-journey usability harness for Iron Log. A MEASUREMENT, not a pass/fail test:
   exits non-zero only when the harness itself breaks. Drives the real UI with real
   touch taps at 390x844 and prints: journey | taps | scrolls | wall ms | notes,
   then touch-target audits, axe-core, an offline run, and one JOURNEYS_JSON line.

   Run:  npx http-server -p 8118 -s -c-1 .   (in another shell, from the repo root)
         node tools/sprint/journeys.mjs        (PORT=8118 by default; PORT env overrides)
   All data is synthetic. axe-core is injected into pages as a test-only script and is
   never added to the app; it is resolved from node_modules or installed to /tmp/axe. */
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const PORT = process.env.PORT || '8118';
const URL = `http://127.0.0.1:${PORT}/index.html`;
const KEY = 'ironlog.v1';
function findAxe() {
  for (const base of ['/opt/node22/lib/node_modules', process.cwd(), '/tmp/axe']) {
    try { return createRequire(base + '/x.js').resolve('axe-core/axe.min.js'); } catch {}
  }
  fs.mkdirSync('/tmp/axe', { recursive: true }); // outside the repo; never added to the app
  execSync('npm i --no-save --prefix /tmp/axe axe-core', { stdio: 'ignore' });
  return createRequire('/tmp/axe/x.js').resolve('axe-core/axe.min.js');
}
const AXE = findAxe();
const R = { journeys: [], touch: {}, axe: {}, offline: {}, errors: [], bugs: [] };

/* ---------------- synthetic data ---------------- */
const SET = { unit: 'lb', rest: 120, autoRest: true, buzz: true, sound: false, notify: false, rpe: false,
  keepTone: false, autoBackup: false, shareMode: '', inc: 5, doubleDefault: true, repLow: 8, repHigh: 12,
  rangeFixHidden: true, bodyweight: 0, deloadUntil: 0, deloadSnooze: 0, bar: 45,
  plates: [{ w: 45, n: 4 }, { w: 25, n: 2 }, { w: 10, n: 2 }, { w: 5, n: 2 }, { w: 2.5, n: 2 }], lastBackup: Date.now() };
const DAYS = [
  ['A', 'Day A', [['Bench Press', 135], ['Overhead Press', 85], ['Incline Dumbbell Press', 50], ['Triceps Pushdown', 40]]],
  ['B', 'Day B', [['Barbell Row', 115], ['Lat Pulldown', 100], ['Face Pull', 30], ['Barbell Curl', 60]]],
  ['C', 'Day C', [['Back Squat', 185], ['Romanian Deadlift', 155], ['Leg Press', 270], ['Calf Raise', 120]]],
];
const routines = () => DAYS.map(([key, name, exs], i) => ({ id: 'r' + i, key, name, variants: [{ id: 'v' + i, label: '',
  exercises: exs.map(([n, w], j) => ({ id: `p${i}${j}`, name: n, sets: 3, reps: 8, repTop: 12 })) }] }));
/* flat=true: identical weight x reps every time, so the long trend reads "stalled" (coach card). */
function session(ri, daysAgo, flat, bump = 0) {
  const [key, name, exs] = DAYS[ri], ts = Date.now() - daysAgo * 86400000;
  return { id: `s${ri}_${daysAgo}`, ts, endTs: ts + 3000000, routineId: 'r' + ri, key, name, variantId: 'v' + ri,
    exercises: exs.map(([n, w], j) => ({ id: `e${ri}${j}${daysAgo}`, planId: `p${ri}${j}`, name: n, reps: 8, repTop: 12,
      sets: [0, 1, 2].map(() => { const wt = w + (flat ? 0 : bump * 5); return { w: String(wt), r: '10', done: true, load: wt }; }) })) };
}
const mainState = () => ({ version: 5, settings: { ...SET }, routines: routines(), active: null,
  sessions: [0, 1, 2, 0, 1, 2].map((ri, i) => session(ri, 2 + i * 3, false, 5 - i)) }); // newest first, mild progression
/* Coach seed: 4 lifts, 8 identical sessions of Day A (deloadCheck needs >=3 lifts with >=6 sessions, >=60% not climbing). */
const coachState = () => ({ version: 5, settings: { ...SET }, routines: routines().slice(0, 1), active: null,
  sessions: Array.from({ length: 8 }, (_, i) => session(0, 2 + i * 3, true)) });

/* ---------------- driver ---------------- */
const browser = await chromium.launch();
const newCtx = (opts = {}) => browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, serviceWorkers: 'block', ...opts });
async function open(state, ctxOpts) {
  const ctx = await newCtx(ctxOpts), page = await ctx.newPage();
  page.on('pageerror', e => R.errors.push('pageerror: ' + e));
  page.on('console', m => { if (m.type() === 'error') R.errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.evaluate(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, state]);
  return { ctx, page };
}
const st = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const settle = page => page.waitForTimeout(250); // save() is debounced 120 ms

let J = null; // current journey
function begin(name) { J = { journey: name, taps: 0, scrolls: 0, t0: Date.now(), notes: [] }; }
function end(extra) {
  J.ms = Date.now() - J.t0; if (extra) J.notes.push(extra);
  R.journeys.push({ journey: J.journey, taps: J.taps, scrolls: J.scrolls, ms: J.ms, notes: J.notes.join('; ') }); J = null;
}
/* A real touch tap. Counts one tap, plus one scroll if the target wasn't visible and unobscured
   in the viewport beforehand (the user would have had to swipe). */
async function tap(page, sel, label) {
  const loc = page.locator(sel).first();
  await loc.waitFor({ state: 'visible', timeout: 8000 });
  const vis = await loc.evaluate(el => { const r = el.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    const top = document.elementFromPoint(x, y); return y >= 0 && y <= innerHeight && x >= 0 && x <= innerWidth && !!top && (el === top || el.contains(top)); });
  if (!vis) { J.scrolls++; J.notes.push('scroll to ' + (label || sel)); }
  await loc.tap(); J.taps++;
}
const inFirstViewport = (page, sel) => page.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return { bottom: Math.round(r.bottom), inView: r.top >= 0 && r.bottom <= innerHeight }; });

/* ============ 1. Start today's workout from a cold open ============ */
let { ctx, page } = await open(mainState());
begin('1 start workout (cold open)');
const tl = Date.now();
await page.reload();
await page.waitForSelector('[data-act="start"].primary');
const loadMs = Date.now() - tl;
const sv = await inFirstViewport(page, '[data-act="start"].primary');
const tabBar = await page.evaluate(() => Math.round(document.querySelector('#tabs').getBoundingClientRect().top));
await tap(page, '[data-act="start"].primary', 'Start');
await page.waitForSelector('.card.ex');
end(`app ready ${loadMs}ms; Start in first viewport: ${sv.inView} (bottom ${sv.bottom}px of 844, tab bar top ${tabBar}px)`);
R.startInFirstViewport = sv.inView;

/* ============ 2. Log a set; log a set with +5 via steppers ============ */
const w0 = await page.inputValue('.set[data-ei="0"][data-si="0"] input[data-f="w"]');
begin('2a log prefilled set (tick)');
await tap(page, '.set[data-ei="0"][data-si="0"] .tick', 'tick');
await settle(page);
let s = await st(page);
end(`prefill ${w0} x ${await page.inputValue('.set[data-ei="0"][data-si="0"] input[data-f="r"]')}; done=${s.active.exercises[0].sets[0].done}; rest timer: ${await page.evaluate(() => !!document.querySelector('.rest, #rest, [data-act="rest-tap"]'))}`);

const w1 = +(await page.inputValue('.set[data-ei="0"][data-si="1"] input[data-f="w"]'));
begin('2b log set with weight +5 (stepper)');
let guard = 0;
while (+(await page.inputValue('.set[data-ei="0"][data-si="1"] input[data-f="w"]')) < w1 + 5 && guard++ < 6)
  await tap(page, '.set[data-ei="0"][data-si="1"] [data-act="step"][data-f="w"][data-d="1"]', 'weight +');
await tap(page, '.set[data-ei="0"][data-si="1"] .tick', 'tick');
await settle(page); s = await st(page);
end(`${w1} -> ${s.active.exercises[0].sets[1].w}; one + tap = ${(+s.active.exercises[0].sets[1].w) - w1} lb (settings.inc=5); typing instead = tap input + keyboard + dismiss`);

/* active-workout touch targets + axe while mid-workout (before finish) */
R.touch.active = await audit(page, 'body');
R.axe.active = await runAxe(page);

/* ============ 3. Finish ============ */
begin('3 finish workout (2 sets logged)');
const before = (await st(page)).sessions.length;
const fb = await inFirstViewport(page, 'button[data-act="finish"]');
await tap(page, 'button[data-act="finish"]', 'Finish (header)');
await page.waitForSelector('.sheet [data-x="save"]');
R.touch.finishSheet = await audit(page, '.sheet');
const saveVis = await inFirstViewport(page, '.sheet [data-x="save"]');
await tap(page, '.sheet [data-x="save"]', 'Save workout');
await page.waitForFunction(() => !document.querySelector('.backdrop'));
await settle(page); s = await st(page);
end(`sessions ${before}->${s.sessions.length}, active=${s.active}; lands on Progress tab; header Finish in first viewport: ${fb.inView}; Save in first viewport: ${saveVis.inView}`);
await ctx.close();

/* ============ 3b. Full workout: tick every set ============ */
({ ctx, page } = await open(mainState())); await page.reload(); await page.waitForSelector('[data-act="start"].primary');
begin('3b full workout (tick all sets + finish)');
await tap(page, '[data-act="start"].primary', 'Start'); await page.waitForSelector('.card.ex');
const nSets = await page.locator('.set .tick').count();
for (let i = 0; i < nSets; i++) {
  const ok = await page.locator('.set .tick').nth(i).evaluate(el => el.closest('.set').classList.contains('done'));
  if (ok) continue;
  const loc = page.locator('.set .tick').nth(i);
  const vis = await loc.evaluate(el => { const r = el.getBoundingClientRect(), t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.top >= 0 && r.bottom <= innerHeight && (el === t || el.contains(t)); });
  if (!vis) J.scrolls++;
  await loc.tap(); J.taps++;
}
await tap(page, 'button[data-act="finish"]', 'Finish'); await tap(page, '.sheet [data-x="save"]', 'Save');
await page.waitForFunction(() => !document.querySelector('.backdrop')); await settle(page);
s = await st(page);
end(`${nSets} sets ticked; saved sessions=${s.sessions.length}; scrolls counted when a tick was off-screen/obscured (1 per set, an under-estimate of swipes)`);
await ctx.close();

/* ============ 4. Coach card: accept and undo ============ */
({ ctx, page } = await open(coachState())); await page.reload(); await page.waitForSelector('#view .card');
const cardSel = '[data-act="start-deload"]';
const hasCard = await page.locator(cardSel).count();
if (!hasCard) { R.journeys.push({ journey: '4 coach card accept/undo', taps: 0, scrolls: 0, ms: 0, notes: 'COULD NOT make a coach card appear: seeded 8 flat sessions x4 lifts (deloadCheck needs >=3 lifts, >=6 sessions, >=60% pct<=0)' }); }
else {
  const cv = await inFirstViewport(page, cardSel);
  begin('4a coach card: accept (Start deload week)');
  await tap(page, cardSel, 'Start deload week'); await settle(page);
  let c = await st(page); const toastUndo = await page.locator('.toast.act button').count();
  end(`deloadUntil set: ${c.settings.deloadUntil > Date.now()}; card in first viewport: ${cv.inView} (bottom ${cv.bottom}px); toast has Undo pill: ${toastUndo > 0}`);
  begin('4b coach card: undo (End it now)');
  await tap(page, '[data-act="end-deload"]', 'End it now'); await settle(page); c = await st(page);
  end(`deloadUntil=${c.settings.deloadUntil} (reverted: ${c.settings.deloadUntil === 0}); no Undo on the accept toast - the only reversal is the banner's "End it now" ("Not now" snoozes 14 days, no undo)`);
  R.coachCardMechanism = 'deload banner (todayIdle: "Deload worth considering"); there is no tools/test/t39-coach.mjs in this repo';
}
await ctx.close();

/* ============ 5. Edit a past session ============ */
({ ctx, page } = await open(mainState())); await page.reload(); await page.waitForSelector('#view .card');
begin('5 edit past session (change reps, save)');
const r0 = (await st(page)).sessions[0].exercises[0].sets[0].r;
await tap(page, '[data-tab="progress"]', 'Progress tab'); await page.waitForSelector('.sess');
const sessY = await page.locator('.sess').first().evaluate(el => Math.round(el.getBoundingClientRect().top));
await tap(page, '.sess', 'History row'); await page.waitForSelector('.sheet [data-x="edit"]');
await tap(page, '.sheet [data-x="edit"]', 'Edit'); await page.waitForSelector('.sheet input[data-k="0.0"][data-f="r"]');
await tap(page, '.sheet input[data-k="0.0"][data-f="r"]', 'reps input'); await page.fill('.sheet input[data-k="0.0"][data-f="r"]', '9');
await tap(page, '.sheet [data-x="save"]', 'Save changes');
await page.waitForFunction(() => !document.querySelector('.backdrop')); await settle(page);
s = await st(page);
end(`reps ${r0} -> ${s.sessions[0].exercises[0].sets[0].r}; first History row sits at y=${sessY}px (fold 844): ${sessY > 844 ? 'below the fold' : 'visible'}; plus keyboard entry (not counted as taps)`);
await ctx.close();

/* ============ 6/7. Touch targets + axe on Today, History, Progress, Plan ============ */
({ ctx, page } = await open(mainState())); await page.reload(); await page.waitForSelector('[data-act="start"].primary');
R.touch.today = await audit(page, 'body');
R.axe.today = await runAxe(page);
await page.locator('[data-tab="progress"]').tap(); await page.waitForSelector('.sess');
R.axe.progress = await runAxe(page);
await page.locator('.sess').first().tap(); await page.waitForSelector('.sheet [data-x="edit"]');
R.axe.history = await runAxe(page); // the session detail sheet: the History row opened
await page.keyboard.press('Escape');
await page.locator('[data-tab="plan"]').tap(); await page.waitForSelector('.pex');
R.axe.plan = await runAxe(page);
await ctx.close();

/* ============ 8. Offline ============ */
{
  const o = R.offline; const c2 = await newCtx({ serviceWorkers: 'allow' }); const p = await c2.newPage();
  p.on('pageerror', e => R.errors.push('offline pageerror: ' + e));
  await p.goto(URL);
  await p.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, mainState()]);
  o.swReady = await p.evaluate(() => navigator.serviceWorker.ready.then(() => true)).catch(() => false);
  await p.reload();
  o.controller = await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 }).then(() => true).catch(() => false);
  await c2.setOffline(true);
  try { await p.reload({ timeout: 10000 }); await p.waitForSelector('#view', { timeout: 5000 });
    o.bootsOffline = true; o.todayRenders = (await p.locator('[data-act="start"].primary').count()) > 0;
  } catch (e) { o.bootsOffline = false; o.todayRenders = false; o.bootError = String(e).split('\n')[0]; }
  if (o.todayRenders) {
    await p.locator('[data-act="start"].primary').tap(); await p.waitForSelector('.card.ex');
    await p.locator('.set[data-ei="0"][data-si="0"] .tick').tap(); await p.waitForTimeout(300);
    await p.locator('button[data-act="finish"]').first().tap(); await p.locator('.sheet [data-x="save"]').tap();
    await p.waitForTimeout(400);
    const f = await st(p); o.sessionsBefore = 6; o.sessionsAfter = f.sessions.length; o.persisted = f.sessions.length === 7 && !f.active;
  }
  await c2.close();
}

/* ---------------- audits ---------------- */
/* Every visible interactive element inside `root`, measured as rendered. */
async function audit(pg, root) {
  return pg.evaluate(rootSel => {
    const root = document.querySelector(rootSel), out = [], seen = new Set();
    root.querySelectorAll('button, a[href], input, select, textarea, [role=button], [data-x], [data-act], [data-tab]').forEach(el => {
      if (seen.has(el)) return; seen.add(el);
      const cs = getComputedStyle(el), r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none') return;
      if (el.closest('.backdrop') && rootSel === 'body') return; // sheet is audited on its own
      out.push({ id: el.dataset.x || el.dataset.act || el.dataset.tab || el.getAttribute('aria-label') || el.type || el.tagName.toLowerCase(),
        text: (el.innerText || el.value || el.getAttribute('aria-label') || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) });
    });
    const lt44 = out.filter(e => e.w < 44 || e.h < 44), lt24 = out.filter(e => e.w < 24 || e.h < 24);
    /* group identical id+size so 36 identical warm-up buttons read as one line with a count */
    const g = {}; lt44.forEach(e => { const k = `${e.id} "${e.text}" ${e.w}x${e.h}`; g[k] = (g[k] || 0) + 1; });
    const worst = Object.entries(g).map(([k, n]) => ({ k: k.replace(/\s+/g, ' ').replace(/ "\d+"/, ' "n"'), n, m: Math.min(...k.match(/(\d+)x(\d+)$/).slice(1).map(Number)) }));
    const merged = {}; worst.forEach(w => { merged[w.k] = merged[w.k] || { ...w, n: 0 }; merged[w.k].n += w.n; });
    return { total: out.length, lt44: lt44.length, lt24: lt24.length,
      worst: Object.values(merged).sort((a, b) => a.m - b.m || b.n - a.n).slice(0, 10).map(w => `${w.k}  x${w.n}`) };
  }, root);
}
async function runAxe(pg) {
  await pg.addScriptTag({ path: AXE });
  const r = await pg.evaluate(() => axe.run(document, { resultTypes: ['violations'] }));
  return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map(n => n.target.join(' ')) }));
}

/* ---------------- report ---------------- */
await browser.close();
const pad = (v, n) => String(v).padEnd(n);
console.log('\nJOURNEY'.padEnd(40) + pad('taps', 6) + pad('scrolls', 9) + pad('wall ms', 9) + 'notes');
for (const j of R.journeys) console.log(pad(j.journey, 45) + pad(j.taps, 6) + pad(j.scrolls, 9) + pad(j.ms, 9) + j.notes);
console.log('\nTOUCH TARGETS (interactive elements smaller than 44x44 / 24x24 CSS px, as rendered)');
for (const [k, t] of Object.entries(R.touch)) {
  console.log(`  ${k}: ${t.total} interactive, ${t.lt44} < 44px, ${t.lt24} < 24px`);
  t.worst.forEach(w => console.log('      ' + w));
}
console.log('\nAXE-CORE (violations: id [impact] nodes)');
for (const [k, v] of Object.entries(R.axe)) { console.log(`  ${k}: ` + (v.length ? v.map(x => `${x.id} [${x.impact}] ${x.nodes}`).join(', ') : 'none'));
  v.filter(x => x.impact === 'critical' || x.id !== 'color-contrast').forEach(x => console.log(`      ${x.id}: ${x.sample.join(' | ')}`)); }
console.log('\nOFFLINE ' + JSON.stringify(R.offline));
if (R.errors.length) console.log('\nPAGE ERRORS (' + R.errors.length + '): ' + [...new Set(R.errors)].slice(0, 5).join(' | '));
console.log('\nJOURNEYS_JSON ' + JSON.stringify(R));
