/* Shared Playwright harness for Iron Log UI tests.
   Drives the real app in a 390x844 mobile context — see PROJECT_STATE trap 14:
   the bugs that mattered here were all invisible to function-level tests. */
import { chromium, devices } from '/opt/node22/lib/node_modules/playwright/index.mjs';

export const URL = 'http://127.0.0.1:8117/index.html';

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
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return { browser, ctx, page, errors };
}

/* Seed localStorage then load the app, so the app boots against the state. */
export async function boot(page, state) {
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
