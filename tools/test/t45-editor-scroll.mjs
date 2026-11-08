/* The session editor keeps its place: + Set, a warm-up flip or removing a set
   redraws the sheet, and used to throw a long session back to the top. */
import { launch, URL, ok, report } from './harness.mjs';
const { browser: b, page, errors: errs } = await launch();
const names = ['Bench Press', 'Squat', 'Row', 'Curl', 'Leg Press', 'Calf Raise'];
const ex = names.map(n => ({ name: n, reps: 8, repTop: 12, sets: [1, 2, 3].map(() => ({ w: '100', r: '10', done: true })) }));
const st = { version: 5, settings: { unit: 'lb', inc: 5 }, routines: [{ id: 'rA', key: 'A', name: 'Day A', variants: [{ id: 'vA', label: '', exercises: names.map((n, i) => ({ id: 'e' + i, name: n, sets: 3, reps: 8, repTop: 12 })) }] }],
  sessions: [{ id: 's1', ts: Date.now() - 864e5, endTs: Date.now() - 864e5 + 3600e3, routineId: 'rA', key: 'A', name: 'Day A', variantId: 'vA', deload: false, note: '', exercises: ex }], active: null };
await page.goto(URL); await page.evaluate(s => localStorage.setItem('ironlog.v1', JSON.stringify(s)), st); await page.reload();
await page.locator('.lastsess').tap(); await page.waitForTimeout(300);
const sh = page.locator('.sheet');
await sh.evaluate(e => e.scrollTop = 900); await page.waitForTimeout(100);
const before = await sh.evaluate(e => e.scrollTop);
const add = page.locator('[data-addset]').nth(4); await add.scrollIntoViewIfNeeded(); const bt = await sh.evaluate(e => e.scrollTop);
await add.tap(); await page.waitForTimeout(250);
const after = await page.locator('.sheet').evaluate(e => e.scrollTop);
const sets5 = await page.locator('.sheet .card').nth(4).locator('input[data-k]').count();
ok(bt > 300 && Math.abs(after - bt) <= 2, 'editor keeps its scroll position after + Set  [' + bt + ' -> ' + after + ']');
ok(sets5 === 8, 'and the set was added (4 sets x 2 inputs)  [' + sets5 + ']');
// first open still animates from top: close and reopen
await page.locator('[data-x="cancel"]').tap(); await page.waitForTimeout(200);
await page.locator('.lastsess').tap(); await page.waitForTimeout(300);
ok(await page.locator('.sheet').evaluate(e => e.scrollTop) === 0, 'a fresh open starts at the top');
ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
report('t45 editor scroll');
await b.close();
