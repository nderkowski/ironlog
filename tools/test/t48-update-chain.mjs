/* v26.14: the offline-update design, against the real v26.13 service worker.

   A  UPGRADE       v26.13 is installed from its own tree (git 4f31e5f), a workout
                    is logged, then the served tree becomes this one. Its worker
                    waits; it takes over only when the app is opened (a hidden ->
                    visible change here) and the page then reloads exactly once;
                    the old cache is gone, the data is there, and a cold offline
                    boot logs and saves.
   A2 MID-WORKOUT   the same upgrade with a workout active: nothing switches, not
                    on a reload, not on leaving and returning, not when the
                    workout is saved. It applies at the first open after that.
   C  NOTHING OPEN  a session-editor draft is open when the app is left; a deploy
                    lands; coming back to the foreground, and a pageshow from the
                    back/forward cache, change nothing (no reload, draft intact).
                    Closing the editor and then opening applies it (via pageshow).
   D  CACHE CHECK   a cache that has the install marker but lost a core entry is
                    rebuilt by the next install of that version; a complete one
                    is left alone.
   B  BAD DEPLOYS   on a phone running this tree: a deploy whose icon 404s
                    installs (icons are cosmetic); a truncated sw.js and a deploy
                    whose core file 404s install nothing, leave no partial cache,
                    and the running version keeps working, online and offline.

   Serves its own trees on its own ports, so it does not use IRONLOG_PORT.
   Needs git history (4f31e5f = v26.13). */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ok, eq, report } from './harness.mjs';
import { ROOT, cacheName, sleep, until, treeFromGit, deployServer, bumpSw, swBuild, appBuild, newApp, seed, cacheKeys, stored,
  seedAndLoad, waitController, regState, background, foreground, oneWorkout, startWorkout, logSet, saveWorkout, pageBuild } from './deploy-lib.mjs';

const V2613 = treeFromGit('4f31e5f');
const swSrc = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const BUILD = appBuild(ROOT);                 // v26.14
const CACHE = cacheName(swSrc);
const B13 = appBuild(V2613), C13 = cacheName(readFileSync(join(V2613, 'sw.js'), 'utf8'));
ok(!!BUILD && !existsSync(join(ROOT, 'js', 'files.js')), '0 this suite is for the single-file release  [' + BUILD + ']');
const browser = await chromium.launch();

/* The cold offline boot every scenario ends with: server gone, radio off. */
async function offlineCold(app, dep, label, before) {
  await Promise.all(app.pages.map(p => p.close().catch(() => {})));
  await app.ctx.setOffline(true);
  await dep.close();
  const p = await app.open(null, label + ': ');
  await p.goto(dep.url, { timeout: 10000 });
  await p.waitForSelector('#view', { timeout: 8000 });
  ok(await p.evaluate(() => !!navigator.serviceWorker.controller), label + ': the cold page is controlled by the worker');
  ok(await p.locator('[data-act="start"].primary').count() > 0, label + ': Today renders with no network');
  await oneWorkout(p);
  eq((await stored(p)).sessions.length, before + 1, label + ': a workout started, logged and saved offline is in the log');
  ok(!(await stored(p)).active, label + ': and none is left active');
  eq(app.errors.join(' | '), '', label + ': no page errors');
  return p;
}

/* ================= A. the real upgrade ================= */
{
  const dep = await deployServer({ tree: V2613 });
  const app = await newApp(browser);
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  eq((await cacheKeys(page)).join(','), C13, 'A v26.13 is installed from its own tree: one cache, ironlog-v26.13');
  eq(await pageBuild(page), B13, 'A and the page is v26.13');
  await oneWorkout(page);
  eq((await stored(page)).sessions.length, 7, 'A a workout is logged on v26.13');

  /* Deploy v26.14. Its core manifest is slow, so the new worker installs a second
     or two after the app is open. */
  dep.tree = ROOT;
  dep.delay['manifest.webmanifest'] = 1800;
  await page.close();
  page = await app.open(dep.url);
  await page.waitForSelector('#view');
  eq(await pageBuild(page), BUILD, 'A the first open after the deploy runs ' + BUILD + ' (v26.13\'s worker fetched it network-first)');
  eq((await stored(page)).sessions.length, 7, 'A the log is intact');
  await page.locator('[data-tab="progress"]').tap();            // in use from the first second: not "just opened" any more
  await page.evaluate(() => { window.__marker = 'same page'; });
  ok(await until(async () => (await regState(page)).waiting, 12000), 'A ' + BUILD + '\'s worker installs in the background and is WAITING (no skipWaiting)');
  eq((await cacheKeys(page)).join(','), C13 + ',' + CACHE, 'A the new cache sits beside v26.13\'s, which is untouched');
  const loads0 = app.nav.loads;
  await sleep(3000);
  eq(await page.evaluate(() => window.__marker), 'same page', 'A it stays waiting while the app is in use: the page was not reloaded');
  eq(app.nav.loads, loads0, 'A (no load events)');
  ok((await regState(page)).waiting, 'A still waiting 3 s later');

  /* Leave the app and come back: that is an open. */
  await background(page);
  await sleep(600);
  eq(await page.evaluate(() => window.__marker), 'same page', 'A leaving the app does not switch it');
  await foreground(page);
  ok(await until(async () => (await page.evaluate(() => window.__marker).catch(() => 'gone')) !== 'same page', 12000), 'A coming back to the foreground takes the update: the page reloads');
  await page.waitForSelector('#view');
  ok(await until(async () => (await cacheKeys(page)).join(',') === CACHE), 'A the new worker activated and v26.13\'s cache was deleted');
  const loads1 = app.nav.loads;
  await sleep(2500);
  eq(app.nav.loads, loads1, 'A it reloaded once, not in a loop');
  eq(loads1, loads0 + 1, 'A exactly one reload');
  ok(!(await regState(page)).waiting, 'A nothing is left waiting');
  eq(await pageBuild(page), BUILD, 'A the page runs ' + BUILD);
  eq((await stored(page)).sessions.length, 7, 'A the log is intact after the switch');
  await oneWorkout(page);
  eq((await stored(page)).sessions.length, 8, 'A a workout is logged on the new version');
  await offlineCold(app, dep, 'A offline', 8);
  await app.ctx.close();
}

/* ================= A2. the same upgrade, mid-workout ================= */
{
  const dep = await deployServer({ tree: V2613 });
  const app = await newApp(browser);
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  await startWorkout(page);
  await logSet(page);
  await page.waitForTimeout(400);
  ok(!!(await stored(page)).active, 'A2 a workout is active on v26.13 with a set logged');

  dep.tree = ROOT;
  await page.close();
  page = await app.open(dep.url);                 // the app opened on a workout in progress
  await page.waitForSelector('.card.ex');
  eq(await pageBuild(page), BUILD, 'A2 the page is ' + BUILD);
  ok(await page.evaluate(() => !!document.querySelector('.card.ex .set.done')), 'A2 and the logged set is on screen');
  await page.evaluate(() => { window.__marker = 'same page'; });
  ok(await until(async () => (await regState(page)).waiting, 12000), 'A2 the new worker is installed and waiting');
  await sleep(2500);
  await background(page); await sleep(300); await foreground(page);
  await sleep(2500);
  eq(await page.evaluate(() => window.__marker), 'same page', 'A2 leaving and returning mid-workout does not reload');
  ok((await regState(page)).waiting, 'A2 it is still waiting');
  const loads0 = app.nav.loads;
  await page.locator('.set[data-ei="0"][data-si="1"] .tick').tap();
  await page.waitForTimeout(400);
  await saveWorkout(page);
  await sleep(3000);
  eq(await page.evaluate(() => window.__marker), 'same page', 'A2 saving the workout does not reload the page either');
  eq(app.nav.loads, loads0, 'A2 (no load events)');
  eq((await stored(page)).sessions.length, 7, 'A2 the workout is saved');
  await background(page); await foreground(page);
  ok(await until(async () => (await page.evaluate(() => window.__marker).catch(() => 'gone')) !== 'same page', 12000), 'A2 it applies at the first open after the workout is saved');
  await page.waitForSelector('#view');
  ok(await until(async () => (await cacheKeys(page)).join(',') === CACHE), 'A2 and v26.13\'s cache is gone');
  eq((await stored(page)).sessions.length, 7, 'A2 the log is intact');
  await offlineCold(app, dep, 'A2 offline', 7);
  await app.ctx.close();
}

/* ================= C. nothing open, nothing applied ================= */
{
  const dep = await deployServer({ tree: ROOT });
  const app = await newApp(browser);
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  await page.locator('[data-act="edit-last"]').tap();                    // the session editor
  await page.waitForSelector('.sheet [data-x="save"]');
  await page.locator('.sheet input[data-k="0.0"][data-f="r"]').fill('9');   // a draft
  await page.evaluate(() => { window.__marker = 'same page'; });
  await background(page);                                                // he leaves the app...
  dep.over['sw.js'] = bumpSw(swSrc, '-e1');                              // ...a deploy lands...
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  ok(await until(async () => (await regState(page)).waiting, 12000), 'C the new version installs and waits while the editor is open');
  await foreground(page);                                                // ...and he comes back: an "open", with touched reset
  await sleep(3000);
  eq(await page.evaluate(() => window.__marker), 'same page', 'C coming back with the editor open does not reload the page');
  eq(await page.locator('.sheet input[data-k="0.0"][data-f="r"]').inputValue(), '9', 'C and the draft (reps 9) is intact');
  ok((await regState(page)).waiting, 'C the version is still waiting');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await sleep(2500);
  eq(await page.evaluate(() => window.__marker), 'same page', 'C a pageshow from the back/forward cache with the editor open does not reload it either');
  await page.locator('.sheet [data-x="cancel"]').tap();                  // close the editor
  await sleep(1500);
  eq(await page.evaluate(() => window.__marker), 'same page', 'C closing the editor is not an open: still no reload');
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  ok(await until(async () => (await page.evaluate(() => window.__marker).catch(() => 'gone')) !== 'same page', 12000), 'C a pageshow restore (an open) with nothing open takes the update');
  await page.waitForSelector('#view');
  ok(await until(async () => (await cacheKeys(page)).join(',') === CACHE + '-e1'), 'C and the old cache is gone');
  eq((await stored(page)).sessions.length, 6, 'C the log is intact (the abandoned draft was never saved)');
  eq(app.errors.join(' | '), '', 'C no page errors');
  await app.ctx.close(); await dep.close();
}

/* ================= D. a cache is complete only with its marker AND every core entry ================= */
{
  const dep = await deployServer({ tree: ROOT });
  const app = await newApp(browser);
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  const has = (u) => page.evaluate(async ([k, u]) => !!(await (await caches.open(k)).match(u)), [CACHE, u]);
  ok(await has('./manifest.webmanifest') && await has('./.installed'), 'D the installed cache has the manifest and the marker');
  /* The marker survives, a core entry does not (a trimmed cache, a half-evicted store). */
  await page.evaluate(async k => { await (await caches.open(k)).delete('./manifest.webmanifest'); }, CACHE);
  ok(!(await has('./manifest.webmanifest')) && await has('./.installed'), 'D the cache now has the marker but lost the manifest');
  dep.over['sw.js'] = swSrc + '\n// redeployed, same BUILD\n';                // different bytes, same cache name
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  ok(await until(async () => await has('./manifest.webmanifest'), 12000), 'D the next install of that version notices and rebuilds it (the manifest is back)');
  eq((await cacheKeys(page)).join(','), CACHE, 'D still one cache');
  /* A complete cache is not rewritten. */
  await page.evaluate(async k => { await (await caches.open(k)).put('./sentinel', new Response('x')); }, CACHE);
  dep.over['sw.js'] = swSrc + '\n// redeployed again, same BUILD\n';
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  await sleep(2500);
  ok(await has('./sentinel'), 'D a complete cache of the same version is left alone (the sentinel survives the next install)');
  await app.ctx.close(); await dep.close();
}

/* ================= B. bad deploys on top of this version ================= */
{
  const dep = await deployServer({ tree: ROOT });
  const app = await newApp(browser);
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  eq((await cacheKeys(page)).join(','), CACHE, 'B ' + BUILD + ' is installed from its own tree');
  await oneWorkout(page);
  const info = async () => page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { waiting: !!(r && r.waiting), installing: !!(r && r.installing) };
  });
  const checkApp = async (label, n) => {
    await page.reload();
    await page.waitForSelector('#view');
    eq(await pageBuild(page), BUILD, label + ': the page still runs ' + BUILD);
    ok(await page.locator('[data-act="start"].primary').count() > 0, label + ': Today renders');
    await page.locator('[data-tab="plan"]').tap();
    ok(await page.locator('.pex').count() > 0, label + ': Plan renders');
    await page.locator('[data-tab="today"]').tap();
    eq((await stored(page)).sessions.length, n, label + ': the log is intact');
  };

  /* B1: truncated sw.js (a deploy caught half-copied). */
  dep.over['sw.js'] = bumpSw(swSrc, '-t').slice(0, 2100);
  const sw0 = dep.hits['sw.js'] || 0;
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()).catch(() => 'rejected'));
  ok(await until(async () => (dep.hits['sw.js'] || 0) > sw0, 8000), 'B1 the browser fetched the truncated sw.js');
  await sleep(1500);
  let rs = await info();
  ok(!rs.waiting && !rs.installing, 'B1 a truncated sw.js installs nothing');
  eq((await cacheKeys(page)).join(','), CACHE, 'B1 and no cache appears beside the running one');
  await checkApp('B1', 7);

  /* B2: a core file 404s during install. */
  dep.over['sw.js'] = bumpSw(swSrc, '-m');
  dep.gone.add('manifest.webmanifest');
  const m0 = dep.hits['manifest.webmanifest'] || 0;
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()).catch(() => 'rejected'));
  ok(await until(async () => (dep.hits['manifest.webmanifest'] || 0) > m0, 8000), 'B2 the new worker tried to download the file that 404s');
  await sleep(1500);
  rs = await info();
  ok(!rs.waiting && !rs.installing, 'B2 it did not install');
  eq((await cacheKeys(page)).join(','), CACHE, 'B2 no half-built cache is left and the running one is intact');
  await checkApp('B2', 7);

  /* B3: an icon 404s. Icons are cosmetic, so the version installs and applies. */
  dep.gone.clear(); dep.gone.add('icon-512.png');
  dep.over['sw.js'] = bumpSw(swSrc, '-i');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()).catch(() => 'rejected'));
  ok(await until(async () => (await info()).waiting, 8000), 'B3 a missing icon does not stop the version installing');
  const iKey = (await cacheKeys(page)).find(k => /-i$/.test(k));
  const icons = await page.evaluate(async k => (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname), iKey);
  ok(!icons.some(p => /icon-512/.test(p)) && icons.some(p => /icon-192/.test(p)), 'B3 its cache lacks that icon and has the others');
  await page.reload();                                  // an open
  await page.waitForSelector('#view');
  ok(await until(async () => (await cacheKeys(page)).join(',') === CACHE + '-i', 10000), 'B3 the app was opened: the new version took over and the old cache went');
  await checkApp('B3', 7);
  await oneWorkout(page);
  eq((await stored(page)).sessions.length, 8, 'B3 a workout logs on it');
  await offlineCold(app, dep, 'B offline', 8);
  await app.ctx.close();
}

await browser.close();
report('t48 update chain');
