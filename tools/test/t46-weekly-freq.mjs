/* Sessions per week on Progress (v26.12): calendar weeks from Monday, the
   current week drawn last, the average over the last 4 FULL weeks, nothing
   shown with no sessions, and no overflow at 320 px. Driven through the UI. */
import { launch, URL, ok, eq, report } from './harness.mjs';
const { browser, page, errors } = await launch();
const DAY = 864e5;
const d = new Date(); d.setHours(12, 0, 0, 0);
const dow = (d.getDay() + 6) % 7;                         // Monday = 0
const mon = (w) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow - 7 * w, 10).getTime(); // Monday 10:00, w weeks back
const sess = (ts, i) => ({ id: 's' + i, ts, endTs: ts + 3600e3, routineId: 'rA', key: 'A', name: 'Day A', variantId: 'vA', deload: false, note: '',
  exercises: [{ name: 'Bench Press', reps: 8, repTop: 12, sets: [{ w: '100', r: '10', done: true }] }] });
const plan = [{ id: 'rA', key: 'A', name: 'Day A', variants: [{ id: 'vA', label: '', exercises: [{ id: 'e0', name: 'Bench Press', sets: 3, reps: 8, repTop: 12 }] }] }];
// weeks back: 0 (this week) x1, 1 x3, 2 x2, 3 x1, 4 x2 (Sunday 23:00 of week 4 must count in week 4, not week 3), 7 x1
const ts = [mon(0), mon(1), mon(1) + DAY, mon(1) + 2 * DAY, mon(2), mon(2) + DAY, mon(3), mon(4), mon(4) + 6 * DAY + 13 * 3600e3, mon(7)];
async function open(state, width) {
  if (width) await page.setViewportSize({ width, height: 640 });
  await page.goto(URL); await page.evaluate(s => localStorage.setItem('ironlog.v1', JSON.stringify(s)), state); await page.reload();
  await page.locator('[data-tab="progress"]').tap(); await page.waitForTimeout(200);
}
await open({ version: 5, settings: { unit: 'lb', inc: 5 }, routines: plan, sessions: ts.map(sess).sort((a, b) => b.ts - a.ts), active: null });
const bars = await page.locator('.wkbars .n').allInnerTexts();
eq(bars.join(','), '1,0,0,2,1,2,3,1', 'eight weekly counts, oldest first, this week last');
const head = (await page.locator('.wkhead').innerText()).replace(/\s+/g, ' ');
ok(/^2 sessions a week last 4 full weeks/.test(head), 'average over the last 4 full weeks: (3+2+1+2)/4 = 2  [' + head + ']');
ok(await page.locator('.wkbars .wb').last().evaluate(e => e.classList.contains('now')), 'this week is marked as in progress');
ok((await page.locator('.wkbars').getAttribute('aria-label')).includes('1, 0, 0, 2, 1, 2, 3, 1'), 'the chart has a text alternative');
await open({ version: 5, settings: { unit: 'lb', inc: 5 }, routines: plan, sessions: ts.map(sess).sort((a, b) => b.ts - a.ts), active: null }, 320);
ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow at 320 px');
// a new lifter: the average covers only weeks since the first session
await open({ version: 5, settings: { unit: 'lb', inc: 5 }, routines: plan, sessions: [mon(2), mon(2) + DAY, mon(2) + 2 * DAY, mon(1), mon(1) + DAY, mon(1) + 2 * DAY].map(sess).sort((a, b) => b.ts - a.ts), active: null }, 390);
let h2 = (await page.locator('.wkhead').innerText()).replace(/\s+/g, ' ');
ok(/^3 sessions a week last 2 full weeks/.test(h2), 'two weeks in at 3 a week reads 3, not 1.5  [' + h2 + ']');
await open({ version: 5, settings: { unit: 'lb', inc: 5 }, routines: plan, sessions: [sess(mon(0), 0)], active: null }, 390);
h2 = (await page.locator('.wkhead').innerText()).replace(/\s+/g, ' ');
ok(/^1 session this week no full week yet/.test(h2), 'first week: says so instead of averaging zeros  [' + h2 + ']');
await open({ version: 5, settings: { unit: 'lb', inc: 5 }, routines: plan, sessions: [], active: null }, 390);
eq(await page.locator('.wkbars').count(), 0, 'nothing shown with no sessions');
ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
report('t46 weekly frequency');
await browser.close();
