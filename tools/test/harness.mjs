/* Shared Playwright harness for Iron Log UI tests.
   Drives the real app in a 390x844 mobile context — see PROJECT_STATE trap 14:
   the bugs that mattered here were all invisible to function-level tests. */
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';

export const URL = 'http://127.0.0.1:' + (process.env.IRONLOG_PORT || 8117) + '/index.html';

let pass = 0, fail = 0;
const failures = [];

export function ok(cond, msg) {
  if (cond) { pass++; console.log('  ok   ' + msg); }
  else { fail++; failures.push(msg); console.log('  FAIL ' + msg); }
}
export function eq(actual, expected, msg) {
  ok(actual === expected, msg + '  [got: ' + JSON.stringify(actual) + ']');
}
export function has(hay, needle, msg) {
  ok(String(hay).includes(needle), msg + '  [got: ' + JSON.stringify(String(hay).slice(0, 200)) + ']');
}
export function report(name) {
  console.log('\n' + name + ': ' + pass + ' passed, ' + fail + ' failed');
  if (failures.length) { failures.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
}

export async function launch() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e) + (process.env.IRONLOG_DEBUG ? ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' / ') : '')));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { browser, ctx, page, errors };
}

/* Seed localStorage then load the app, so the app boots against the state. */
/* 2.0 S3: compounds start with a generated warm-up ramp, and every suite written before
   it reads "the first set" as the first working set. A state that says nothing about
   warm-ups gets them switched off per lift (the same `settings.warmups` the exercise menu
   writes); a state that sets `settings.warmups` itself (t51) is left exactly as written. */
export function noWarmups(state) {
  const s = state && state.settings;
  if (!s || s.warmups !== undefined) return state;
  const names = new Set();
  const add = e => { if (e && e.name) names.add(String(e.name).trim().toLowerCase()); };
  (Array.isArray(state.routines) ? state.routines : []).forEach(r => (r.variants || [{ exercises:r.exercises }]).forEach(v => (v.exercises || []).forEach(add)));
  (Array.isArray(state.sessions) ? state.sessions : []).forEach(x => (Array.isArray(x.exercises) ? x.exercises : []).forEach(add));
  if (state.active) (state.active.exercises || []).forEach(add);
  s.warmups = Object.fromEntries([...names].map(n => [n, false]));
  return state;
}
export async function boot(page, state) {
  noWarmups(state);
  await page.goto(URL);
  await page.evaluate(s => localStorage.setItem('ironlog.v1', JSON.stringify(s)), state);
  await page.reload();
  await page.waitForSelector('#view');
}

export async function getState(page) {
  return JSON.parse(await page.evaluate(() => localStorage.getItem('ironlog.v1')));
}

/* Settings moved off the Plan tab into their own screen behind the header
   gear. Anything driving a setting has to go there first. */
export async function openSettings(page) {
  await page.click('[data-act="settings"] >> nth=0');
  await page.waitForSelector('[data-set="unit"]');
}

/* Every plan exercise across every day and every week variant. */
export function planExercises(state) {
  return (state.routines || []).flatMap(r => (r.variants || []).flatMap(v => v.exercises));
}
/* The exercises of one day's week, by day index and variant index. */
export function planWeek(state, ri = 0, vi = 0) {
  return state.routines[ri].variants[vi].exercises;
}

/* A session of `name`, `n` sets at weight w x reps r, `daysAgo` back. */
export function sess(key, name, w, r, n, daysAgo, extra) {
  const ts = Date.now() - daysAgo * 86400000;
  const sets = [];
  for (let i = 0; i < n; i++) sets.push({ w: String(w), r: String(r), done: true, load: w });
  return Object.assign({
    id: 'sx' + key + daysAgo, ts, endTs: ts + 3600000, routineId: null, key, name: 'Day ' + key,
    exercises: [Object.assign({ id: 'ex' + daysAgo, planId: null, name, sets }, (extra && extra.ex) || {})]
  }, (extra && extra.s) || {});
}
