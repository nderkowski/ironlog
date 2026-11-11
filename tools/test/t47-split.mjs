/* 2.0-a1: the single-file app was split into ordered files and the offline
   update was made safe. This suite is the proof that nothing was lost and that
   the whole upgrade path works for real.

   BASE  The split is built on v26.14 (c5b5a29: one self-contained index.html
         with the new worker and the page-side update block). v26.13 is 4f31e5f.
   PIN   Section 1 (the join proof) reads the split from the repository tag
         `2.0-a1` (the split commit), never from the working tree, so later
         packages can edit js/, css/, sw.js freely without tripping it.
         Everything else runs against the working tree. Move the tag only to
         re-bless a new split.

   1  JOIN PROOF  v26.14 equals v26.13 plus two declared changes (D0); then the
                  split commit's js files, with the DECLARED DEVIATIONS below undone, joined
                  in order, equal v26.14's IIFE body byte for byte; css/app.css
                  equals its <style> block; index.html equals v26.14's with the
                  style and script blocks swapped for tags; js/sw-update.js equals
                  v26.14's inline update block; sw.js equals v26.14's apart from
                  where its file list comes from.
   2  INVENTORY   374 top-level functions, 76 var statements (96 declarators), the
                  same names as v26.14, none colliding with a built-in global.
   3  FILE LIST   js/files.js is the one list: index.html's tags, sw.js and the
                  folders on disk all agree with it; the gate's count matches it.
   Browser, each in its own origin with its own phone:
   4  SELF UPDATE  a new version of this tree waits during a workout, never
                  reloads the page, and takes over only when the app is next
                  opened; then it runs cold with no network.
   5  BAD DEPLOY   a js file that 404s during install keeps the new worker out.
   6  REAL PATH    v26.13 (its real worker) -> v26.14 -> 2.0-a1, idle and
                  mid-workout; a cold offline boot then logs and saves.
   7  PARTIAL      the split lands on a phone controlled by v26.14 with a js file
                  404ing: v26.14 keeps working online and offline; when the file
                  returns the split installs.
   8  HTML + JS    a deploy that changes index.html AND a js file (a marker in
                  both): the page always runs one consistent pair, before and
                  after the HTTP cache's max-age, with and without a BUILD bump.
   9  GATE         one js file fails (syntax error, throws, 404, boot never runs):
                  the "didn't finish updating" screen, localStorage untouched,
                  Retry recovers. Also the failure the reviewers reproduced:
                  v26.13's own worker handed the split page with a js 404.
   11 NOTHING OPEN a session-editor draft is open across leave/return and a
                  pageshow restore with a deploy waiting: no reload, draft intact;
                  closing it and then opening applies the update.
   12 CACHE CHECK  a cache with its marker but a missing core entry is rebuilt by
                  the next install of that version; a complete one is left alone.
   10 NO RELOAD    never while a workout is active, never in the same visible
                  period as a save; a switch that arrives mid-workout (another
                  tab) is not dropped but taken at the next open.

   DECLARED DEVIATIONS (the join proof undoes exactly these):
   D0 v26.13 -> v26.14 (the bridge release): the BUILD line (value and its
      comment) and the update block appended at the end of the IIFE.
   From v26.14's IIFE to the split:
   D1 BUILD "v26.14" -> the split's BUILD (read from its files; it must be "v" + sw.js's BUILD).
   D2 `var S=load();` and the line recording it move to the top of 12-boot.js
      (load() calls helpers from three later files).
   D3 the listeners that read S move from 01-state.js (pagehide, blur,
      visibilitychange -> flush; storage -> otherWrote) and from 05-shell.js (the
      1 s rest/header interval and its visibilitychange handler) to 12-boot.js,
      right after S exists, in their old order, under a short comment. Registered
      across files they could fire before S existed ("S is not defined").
   D4 boot integrity gate: each of the files 01-11 ends with the one extra line
      `self.__ilf=(self.__ilf||0)+1;`; 12-boot.js starts with a prologue (a
      comment, `if((self.__ilf||0)!==11) throw ...`, and the same counting
      line); and index.html ends with one inline script (after every js tag, so
      it runs even when js files do not) that counts the files against a literal
      next to the tags and puts the "didn't finish updating" screen up.
   D5 v26.14's inline update block is js/sw-update.js (same text, a "use strict"
      line on top).
   D6 sw.js: v26.14's, with the split's BUILD and the core list read from
      js/files.js with importScripts instead of written out.

   Needs the history and the tag (4f31e5f = v26.13, c5b5a29 = v26.14, 2.0-a1 = the split). It serves trees
   itself, on its own ports, so it does not use IRONLOG_PORT. */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import vm from 'node:vm';
import { ok, eq, report } from './harness.mjs';
import { ROOT, sleep, until, treeFromGit, deployServer, bumpSw, newApp, seed, cacheKeys, stored, seedAndLoad, waitController,
  regState, background, foreground, oneWorkout, startWorkout, logSet, saveWorkout, pageBuild, swBuild, appBuild, cacheName } from './deploy-lib.mjs';

const ts = createRequire('/opt/node22/lib/node_modules/')('typescript');
const read = f => readFileSync(join(ROOT, f), 'utf8');
const V2613 = '4f31e5f', V2614 = 'c5b5a29';
const T13 = treeFromGit(V2613), T14 = treeFromGit(V2614);
/* The builds and caches of the two earlier releases, read from their own trees. */
const B13 = appBuild(T13), B14 = appBuild(T14);
const C13 = cacheName(readFileSync(join(T13, 'sw.js'), 'utf8')), C14 = cacheName(readFileSync(join(T14, 'sw.js'), 'utf8'));
const ORIG = readFileSync(join(T14, 'index.html'), 'utf8');       // v26.14
const ORIG13 = readFileSync(join(T13, 'index.html'), 'utf8');     // v26.13
const SW14 = readFileSync(join(T14, 'sw.js'), 'utf8');

/* The split commit, by tag. Section 1 reads it through `at`; nothing in it reads the working tree. */
const SPLIT_TAG = '2.0-a1';
let SPLIT = SPLIT_TAG;
try { execFileSync('git', ['rev-parse', '--verify', SPLIT_TAG + '^{commit}'], { cwd: ROOT, stdio: 'pipe' }); }
catch (e) { ok(false, '1 join: the tag ' + SPLIT_TAG + ' (the split commit) exists  [' + String(e.stderr || e).split('\n')[0] + ']'); SPLIT = 'HEAD'; }
const at = f => execFileSync('git', ['show', SPLIT + ':' + f], { cwd: ROOT, maxBuffer: 1 << 28 }).toString('utf8');
const listOf = src => { const sb = { self: {} }; vm.runInNewContext(src, sb); return sb.self.IRONLOG_FILES; };

const FILES = listOf(read('js/files.js'));                          // the working tree's list
const APP_JS = FILES.filter(f => /^js\/\d\d-.*\.js$/.test(f));
const FILES_A1 = listOf(at('js/files.js'));                         // the split commit's list
const APP_JS_A1 = FILES_A1.filter(f => /^js\/\d\d-.*\.js$/.test(f));  // the sealed slices of the IIFE
const firstDiff = (a, b) => { const n = Math.min(a.length, b.length); let i = 0; while (i < n && a[i] === b[i]) i++; return i; };
const once = (s, needle) => s.split(needle).length - 1;

/* ================= 1. join proof ================= */
const HEAD = '(function(){\n"use strict";\n';
const origBody = (() => {
  const i0 = ORIG.indexOf(HEAD), i1 = ORIG.lastIndexOf('\n})();');
  return ORIG.slice(i0 + HEAD.length, i1 + 1);
})();

/* D0: v26.14 is v26.13 plus the BUILD line and the update block, nothing else. */
{
  const L13 = 'var BUILD="v26.13";                      // bump with CACHE in sw.js; shown in Plan';
  const L14b = 'var BUILD="v26.14";                      // bump with BUILD in sw.js; shown in Plan';
  const END = '\n})();\n</script>\n<!--ARTIFACT-END-->';
  const blk = ORIG.slice(ORIG.indexOf('/* ============================ updates ===='), ORIG.lastIndexOf(END) + 1).replace(/\n+$/, '\n');
  eq(once(ORIG13, L13), 1, '1 join (D0): v26.13 has its BUILD line once');
  eq(once(ORIG13, END), 1, '1 join (D0): and its script ends once, where the update block is added');
  ok(ORIG === ORIG13.replace(L13, L14b).replace(END, '\n' + blk + END), '1 join (D0): v26.14\'s index.html is v26.13\'s with only the BUILD line and the update block changed  [4f31e5f -> ' + V2614 + ']');
}

/* D5: v26.14's update block is the last thing in its IIFE. */
const UPD_HDR = '/* ============================ updates ====';
eq(once(origBody, UPD_HDR), 1, '1 join: v26.14 has one inline update block');
const iU = origBody.indexOf(UPD_HDR);
const updBlock = origBody.slice(iU).replace(/\n+$/, '\n');
const restBody = origBody.slice(0, iU);
eq(at('js/sw-update.js'), '"use strict";\n' + updBlock, '1 join (D5): js/sw-update.js is v26.14\'s inline update block, byte for byte, under "use strict"');

/* D1, D2, D3 */
const SPLIT_BUILD = (/var BUILD="([^"]+)";/.exec(at('js/01-state.js')) || [])[1];     // read, not written here
const SPLIT_SW_BUILD = swBuild(at('sw.js'));
ok(SPLIT_BUILD && SPLIT_SW_BUILD && SPLIT_BUILD === 'v' + SPLIT_SW_BUILD, '1 join (D1): in the split commit the app\'s BUILD (' + SPLIT_BUILD + ') is "v" + sw.js\'s BUILD (' + SPLIT_SW_BUILD + ')');
const BUILD_OLD = 'var BUILD="v26.14";', BUILD_NEW = 'var BUILD="' + SPLIT_BUILD + '";';
const MOVED = 'var S=load();\nmineJSON=JSON.stringify(S);\n';
const BOOT_HEAD = '/* ============================ render ============================ */\n';
const X1 = 'window.addEventListener("pagehide",flush);\nwindow.addEventListener("blur",flush);\ndocument.addEventListener("visibilitychange",function(){ if(document.hidden) flush(); });\n';
const X2 = 'window.addEventListener("storage",function(e){\n  if(e.storageArea&&e.storageArea!==window.localStorage) return;\n  if(e.key!==KEY&&e.key!==null) return;          // null: the whole store was cleared\n  otherWrote();\n});\n';
const X3 = (() => { const a = restBody.indexOf('setInterval(function(){\n  if(rest.endsAt){'), end = '  } else restLate=0;\n});\n'; return restBody.slice(a, restBody.indexOf(end, a) + end.length); })();
const HDR = '/* The listeners that read S, moved here from 01-state.js and 05-shell.js (2.0-a1).\n   Across files they used to be registered before S existed, so a storage or\n   visibility event between two slow script loads threw "S is not defined". */\n';
for (const [n, s] of [['BUILD', BUILD_OLD], ['S=load() block', MOVED], ['boot section header', BOOT_HEAD], ['flush listeners', X1], ['storage listener', X2], ['rest interval + visibility listener', X3]])
  eq(once(restBody, s), 1, '1 join: the ' + n + ' occurs once in v26.14');
ok(X3.startsWith('setInterval(') && /visibilitychange/.test(X3) && X3.endsWith('});\n'), '1 join: the 05-shell block is the interval and the visibility handler  [' + X3.length + ' bytes]');
const expected = restBody.replace(BUILD_OLD, BUILD_NEW).replace(MOVED, '').replace(X1, '').replace(X2, '').replace(X3, '')
  .replace(BOOT_HEAD, MOVED + HDR + X1 + X2 + X3 + BOOT_HEAD);

/* D4: undo the gate's lines. */
const MARK = 'self.__ilf=(self.__ilf||0)+1;\n';
const PRO_RE = /^\/\*[\s\S]*?\*\/\nif\(\(self\.__ilf\|\|0\)!==\d+\) throw new Error\([^\n]*\);\nself\.__ilf=\(self\.__ilf\|\|0\)\+1;\n/;
const headerOK = [], markOK = [], parts = [];
for (const f of APP_JS_A1) {
  let t = at(f);
  headerOK.push(t.startsWith('"use strict";\n'));
  t = t.slice('"use strict";\n'.length);
  if (f === 'js/12-boot.js') { const m = PRO_RE.exec(t); markOK.push(!!m && t.startsWith(m[0] + MOVED)); if (m) t = t.slice(m[0].length); }
  else { markOK.push(t.endsWith(MARK) && once(t, MARK) === 1); if (t.endsWith(MARK)) t = t.slice(0, -MARK.length); }
  parts.push(t);
}
ok(headerOK.length > 0 && headerOK.every(Boolean), '1 join: every js file is line 1 "use strict"; plus a slice  [' + APP_JS_A1.length + ' files]');
ok(markOK.every(Boolean), '1 join (D4): files 01-11 end with the one counting line, and 12-boot.js starts with the gate prologue then `var S=load();`');
const joined = parts.join('');
{
  const same = joined === expected;
  ok(same, '1 join: the js files joined (D1-D4 undone) equal the v26.14 IIFE body byte for byte  [' + joined.length + ' vs ' + expected.length + ' bytes' +
    (same ? '' : '; first difference at offset ' + firstDiff(joined, expected) + ': ' + JSON.stringify(joined.slice(firstDiff(joined, expected), firstDiff(joined, expected) + 60)) + ' vs ' + JSON.stringify(expected.slice(firstDiff(joined, expected), firstDiff(joined, expected) + 60))) + ']');

  const styleOpen = ORIG.indexOf('<style>\n'), styleClose = ORIG.indexOf('</style>');
  const origCss = ORIG.slice(styleOpen + 8, styleClose);
  const css = at('css/app.css');
  ok(css === origCss, '1 join: css/app.css equals the v26.14 <style> block byte for byte  [' + css.length + ' vs ' + origCss.length + ' bytes' + (css === origCss ? '' : '; first difference at offset ' + firstDiff(css, origCss)) + ']');

  /* The page itself: v26.14's index.html with the style block and the script
     block swapped for tags, and nothing else touched. */
  const scriptOpen = ORIG.indexOf('<script>\n'), scriptClose = ORIG.indexOf('</script>', scriptOpen) + '</script>'.length;
  const cssTags = FILES_A1.filter(f => /^css\//.test(f)).map(f => '<link rel="stylesheet" href="' + f + '">').join('\n');
  const jsTags = FILES_A1.filter(f => /^js\//.test(f) && f !== 'js/files.js').map(f => '<script src="' + f + '"></script>').join('\n');
  const html = at('index.html');
  /* D4: the one inline gate script, right after the js tags. */
  const gm = /\n(<script>\n\/\* Boot integrity gate[\s\S]*?\n<\/script>)(?=\n<!--ARTIFACT-END-->)/.exec(html);
  const expHtml = ORIG.slice(0, styleOpen) + cssTags + ORIG.slice(styleClose + '</style>'.length, scriptOpen) + jsTags + (gm ? '\n' + gm[1] : '') + ORIG.slice(scriptClose);
  ok(!!gm && html === expHtml, '1 join (D4): index.html is v26.14 with the <style> and <script> blocks replaced by tags and the one inline gate script after them, nothing else  [' + (html === expHtml ? 'identical' : 'first difference at offset ' + firstDiff(html, expHtml)) + ']');

  /* D6: the worker. Comments aside, v26.14's with BUILD and the list changed. */
  const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\n{2,}/g, '\n');
  const L14 = 'const BUILD = "v26.14";\nconst CACHE = "ironlog-" + BUILD;\nconst CORE = ["./", "./index.html", "./manifest.webmanifest"];\nconst ICONS = ["./icon-192.png", "./icon-512.png", "./icon-maskable-512.png", "./icon-180.png"];\n';
  const L20 = 'const BUILD = "' + SPLIT_SW_BUILD + '";\nconst CACHE = "ironlog-" + BUILD;\nimportScripts("js/files.js?v=" + BUILD);\nconst FILES = self.IRONLOG_FILES;\nconst ICONS = FILES.filter((u) => /^icon-/.test(u));\nconst CORE = ["./"].concat(FILES.filter((u) => !/^icon-/.test(u)));\n';
  eq(once(SW14, L14), 1, '1 join: v26.14\'s sw.js has the four list lines');
  const sw = at('sw.js');
  ok(noComments(sw) === noComments(SW14.replace(L14, L20)), '1 join (D6): sw.js is v26.14\'s sw.js with only BUILD and the list lines changed (comments aside)');
}

/* ================= 2. inventory ================= */
function inventory(src) {
  const sf = ts.createSourceFile('x.js', src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
  const fns = [], vars = []; let varStmts = 0, other = 0;
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st)) fns.push(st.name.text);
    else if (ts.isVariableStatement(st)) { varStmts++; st.declarationList.declarations.forEach(d => vars.push(d.name.getText(sf))); }
    else other++;
  }
  return { fns, vars, varStmts, other };
}
const inv = inventory(joined);
eq(inv.fns.length, 374, '2 inventory: 374 top-level functions');
eq(inv.varStmts, 76, '2 inventory: 76 top-level var statements');
eq(inv.vars.length, 96, '2 inventory: 96 top-level var declarators');
{
  const o = inventory(restBody);
  eq(inv.fns.length, o.fns.length, '2 inventory: the same number of functions as v26.14');
  eq(inv.varStmts, o.varStmts, '2 inventory: the same number of var statements as v26.14');
  eq(inv.other, o.other, '2 inventory: the same number of other top-level statements as v26.14');
  eq(JSON.stringify([...inv.fns].sort()), JSON.stringify([...o.fns].sort()), '2 inventory: exactly the same function names');
  eq(JSON.stringify([...inv.vars].sort()), JSON.stringify([...o.vars].sort()), '2 inventory: exactly the same var names');
}
const all = [...inv.fns, ...inv.vars];
eq(new Set(all).size, all.length, '2 inventory: no top-level name is declared twice  [' + all.length + ' names]');
/* Each file is its own script, so none may declare a name another one does. A
   `let`/`const`/`class` at top level would also be fatal across files. */
ok(!APP_JS.some(f => /^(let|const|class)\s/m.test(read(f))), '2 inventory: no top-level let/const/class (they would not be window properties)');

/* ================= 3. the file list ================= */
ok(Array.isArray(FILES) && FILES.length > 0 && new Set(FILES).size === FILES.length, '3 list: js/files.js defines a list of unique entries  [' + FILES.length + ']');
const missing = FILES.filter(f => !existsSync(join(ROOT, f)));
eq(missing.join(','), '', '3 list: every listed file exists');
const tags = [...read('index.html').matchAll(/<link rel="stylesheet" href="([^"]+)">|<script src="([^"]+)"><\/script>/g)].map(m => m[1] || m[2]);
const wanted = FILES.filter(f => /^(css|js)\//.test(f) && f !== 'js/files.js');
eq(JSON.stringify(tags), JSON.stringify(wanted), '3 list: index.html <link>/<script> tags equal the list\'s css and js entries, in order  [' + wanted.length + ']');
ok(!tags.includes('js/files.js'), '3 list: the page does not load js/files.js (only the service worker reads it)');
for (const dir of ['css', 'js']) {
  const onDisk = readdirSync(join(ROOT, dir)).map(f => dir + '/' + f);
  eq(onDisk.filter(f => !FILES.includes(f)).join(','), '', '3 list: every file in ' + dir + '/ is listed');
}
for (const need of ['index.html', 'manifest.webmanifest']) ok(FILES.includes(need), '3 list: lists ' + need);
ok(FILES.filter(f => /^icon-/.test(f)).length >= 4 && FILES.filter(f => /^icon-/.test(f)).every(f => existsSync(join(ROOT, f))), '3 list: lists the icons');
const manifest = JSON.parse(read('manifest.webmanifest'));
eq((manifest.icons || []).map(i => i.src).filter(s => !FILES.includes(s.replace(/^\.\//, ''))).join(','), '', '3 list: every icon the manifest names is listed');
const swSrc = read('sw.js');
ok(/importScripts\(\s*"js\/files\.js/.test(swSrc), '3 list: sw.js reads the list with importScripts (it keeps no copy)');
const installFn = swSrc.slice(swSrc.indexOf('addEventListener("install"'), swSrc.indexOf('addEventListener("message"')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
ok(installFn.includes('addAll') && !/skipWaiting/.test(installFn), '3 list: sw.js does not skipWaiting on install');
ok(/"message"[\s\S]{0,120}skip-waiting[\s\S]{0,60}self\.skipWaiting\(\)/.test(swSrc), '3 list: sw.js skips waiting only when the page sends {type:"skip-waiting"}');
ok(/c2?\.addAll\(/.test(swSrc), '3 list: sw.js installs with cache.addAll');
const X = swBuild(swSrc), APPB = (/var BUILD="([^"]+)";/.exec(read('js/01-state.js')) || [])[1];
const CACHE20 = 'ironlog-' + X;
ok(!!X && APPB === 'v' + X && /const CACHE = "ironlog-" \+ BUILD;/.test(swSrc), '3 list: BUILD is consistent: sw.js "' + X + '", the app "' + APPB + '", cache ' + CACHE20);
ok(/importScripts\(\s*"js\/files\.js\?v=" \+ BUILD/.test(swSrc), '3 list: and sw.js re-reads the list with the BUILD as its query string');
const NAPP = APP_JS.length;
{
  const names = FILES.filter(f => /^js\//.test(f) && f !== 'js/files.js');
  const html = read('index.html');
  const gi = html.lastIndexOf('<script>\n/* Boot integrity gate'), lastTag = html.lastIndexOf('<script src="');
  ok(gi > lastTag && lastTag > 0, '3 list: the boot gate is an inline script, the last one in index.html, after every js tag (it does not depend on any file)');
  ok(!FILES.includes('js/boot-check.js') && !existsSync(join(ROOT, 'js', 'boot-check.js')), '3 list: and no js file carries it');
  const n = Number((/var FILES=(\d+);/.exec(html.slice(gi)) || [])[1]);
  eq(n, APP_JS.length, '3 list: the gate\'s literal file count (' + n + ') is the number of numbered app files in the list  [' + names.length + ' js files in all]');
  const m = /\(self\.__ilf\|\|0\)!==(\d+)\) throw/.exec(read('js/12-boot.js'));
  eq(Number(m && m[1]), n - 1, '3 list: 12-boot.js refuses to start unless the ' + (n - 1) + ' files before it ran');
  ok(read('js/12-boot.js').includes('of ' + (n - 1) + ' before boot'), '3 list: 12-boot.js\'s message agrees with that count');
}

/* ================= the engine loads in Node ================= */
try {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('node', [join(ROOT, 'tools/sim/load-engine.mjs')], { cwd: ROOT }).toString();
  ok(/ok: engine loaded in Node/.test(out), '2 inventory: the engine files load in plain Node and prescribe() answers  [' + out.trim().split('\n').pop().slice(0, 70) + ']');
} catch (e) { ok(false, '2 inventory: tools/sim/load-engine.mjs failed: ' + String(e.stderr || e).slice(0, 200)); }

/* ================= classic scripts share the window ================= */
const browser = await chromium.launch();
{
  const pg = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  await pg.goto('about:blank');
  const hits = await pg.evaluate(names => names.filter(n => n in window), all);
  eq(hits.join(','), '', '2 inventory: none of the ' + all.length + ' top-level names collides with a built-in window property');
  await pg.close();
}

/* ================= WORKING TREE: no name declared twice, none shadowing a built-in ================= */
/* Not commit-pinned: this guards every later package. The js files are classic scripts in one
   global scope, so a later `function muscleRow(` or `var BUILD` silently replaces an earlier one.
   Every top-level function, var/let/const and class name, across every js file the list names,
   must be unique and must not already exist on a blank page's window. */
{
  const declared = new Map(), dup = [];
  const where = [];
  for (const f of FILES.filter(f => /^js\/.*\.js$/.test(f))) {
    const sf = ts.createSourceFile(f, read(f), ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
    const add = n => { if (declared.has(n)) dup.push(n + ' (' + declared.get(n) + ' and ' + f + ')'); else declared.set(n, f); };
    for (const st of sf.statements) {
      if (ts.isFunctionDeclaration(st) && st.name) add(st.name.text);
      else if (ts.isClassDeclaration(st) && st.name) add(st.name.text);
      else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach(d => { if (ts.isIdentifier(d.name)) add(d.name.text); });
    }
    where.push(f.replace(/^js\//, ''));
  }
  eq(dup.join('; '), '', 'W names: no top-level function/var/let/const/class name is declared twice across ' + where.length + ' js files (' + declared.size + ' names)');
  const wb = await chromium.launch();
  const pg = await (await wb.newContext({ serviceWorkers: 'block' })).newPage();
  await pg.goto('about:blank');
  const hits = await pg.evaluate(names => names.filter(n => n in window), [...declared.keys()]);
  eq(hits.join(','), '', 'W names: none of them collides with a built-in window property');
  await wb.close();
}

/* ================= the browser sections ================= */
const SW20 = swSrc;
const unloads = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('__unl') || '[]'));
/* Every unload of a page, with whether a workout was active in it (S is a global once split). */
const TRACK = () => { addEventListener('pagehide', () => { try { const a = JSON.parse(sessionStorage.getItem('__unl') || '[]'); a.push({ active: !!(self.S && self.S.active), t: Date.now() }); sessionStorage.setItem('__unl', JSON.stringify(a)); } catch (e) {} }); };
async function phone(dep, label) {
  const app = await newApp(browser);
  await app.ctx.addInitScript(TRACK);
  app.label = label;
  return app;
}
/* Open the app again (a reload) until `pred(page)` holds; a worker that installs inside the
   open window switches by itself, one that lands later switches at the next open. */
async function openUntil(page, pred, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const got = await until(async () => { try { return await pred(page); } catch (e) { return false; } }, 6000);
    if (got) return true;
    await page.reload().catch(() => {}); await page.waitForSelector('#view').catch(() => {});
  }
  return false;
}
const keysIs = (...k) => async page => (await cacheKeys(page)).join(',') === k.join(',') && !(await regState(page)).waiting;
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
const gateShown = page => page.locator('[data-ilf-gate]').count();
const booted = page => page.evaluate(n => typeof S !== 'undefined' && typeof render === 'function' && self.__ilf === n, NAPP);

/* ---- 4. a self update of this tree ---- */
{
  const dep = await deployServer({ tree: ROOT });
  const app = await phone(dep, '4');
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  const core = FILES.filter(f => !/^icon-/.test(f));
  eq((await cacheKeys(page)).join(','), CACHE20, '4 update: first install builds one cache, ironlog-2.0-a1');
  const cached = await page.evaluate(async k => (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname.replace(/^\//, '')), CACHE20);
  eq(core.filter(f => !cached.includes(f)).join(','), '', '4 update: every core file is in the cache  [' + core.length + ' files + the shell]');
  ok(cached.filter(f => /^icon-/.test(f)).length === 4, '4 update: and the four icons');
  ok(await booted(page), '4 update: the app booted with every file counted (__ilf = 12)');
  eq(await gateShown(page), 0, '4 update: and no gate screen');

  /* Mid-workout, a deploy lands. */
  await startWorkout(page);
  await logSet(page);
  await page.evaluate(() => { window.__marker = 'same page'; });
  dep.over['sw.js'] = bumpSw(SW20, '-a2');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  ok(await until(async () => (await cacheKeys(page)).includes(CACHE20 + '-a2')), '4 update: the new version downloads its own cache beside the old one');
  ok(await until(async () => (await regState(page)).waiting), '4 update: the new worker is installed and WAITING');
  await sleep(2500);
  ok((await regState(page)).waiting, '4 update: it is still waiting 2.5 s later, because a workout is active');
  eq(await page.evaluate(() => window.__marker), 'same page', '4 update: and the page was not reloaded under the workout');
  eq((await cacheKeys(page)).join(','), CACHE20 + ',' + CACHE20 + '-a2', '4 update: the old cache is untouched until the switch');
  ok(await page.evaluate(() => !!document.querySelector('.card.ex .set.done')), '4 update: the logged set is still on screen');
  await background(page); await sleep(300); await foreground(page); await sleep(2500);
  eq(await page.evaluate(() => window.__marker), 'same page', '4 update: leaving and returning mid-workout does not reload it either');

  /* Save it: still the same visible period, so still no reload. */
  await saveWorkout(page);
  await sleep(4000);
  eq(await page.evaluate(() => window.__marker), 'same page', '4 update: saving the workout does not reload the page, not 4 s later either');
  ok((await regState(page)).waiting, '4 update: the new version is still waiting');
  eq((await stored(page)).sessions.length, 7, '4 update: the saved workout is in the log');
  ok(!(await unloads(page)).some(u => u.active), '4 update: no page unload ever happened with a workout active');

  /* The next time the app is opened, it switches. */
  await background(page); await foreground(page);
  ok(await until(async () => (await page.evaluate(() => window.__marker).catch(() => 'gone')) !== 'same page', 12000), '4 update: the next open takes the update: the page reloads once');
  await page.waitForSelector('#view');
  ok(await until(async () => (await cacheKeys(page)).join(',') === CACHE20 + '-a2'), '4 update: the new worker activated and the old cache was deleted');
  ok(!(await regState(page)).waiting, '4 update: nothing is left waiting');
  const loadsAfter = app.nav.loads;
  await sleep(2500);
  eq(app.nav.loads, loadsAfter, '4 update: it reloaded once, not in a loop');
  eq((await stored(page)).sessions.length, 7, '4 update: the log is intact after the switch');
  await offlineCold(app, dep, '4 offline', 7);
  await app.ctx.close();
}

/* ---- 5. a broken deploy ---- */
{
  const dep = await deployServer({ tree: ROOT });
  const app = await phone(dep, '5');
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  eq((await cacheKeys(page)).join(','), CACHE20, '5 broken: the working version is installed');
  dep.over['sw.js'] = bumpSw(SW20, '-b1');
  dep.gone.add('js/09-plan.js');
  const before = dep.hits['js/09-plan.js'] || 0;
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()).catch(() => {}));
  ok(await until(async () => (dep.hits['js/09-plan.js'] || 0) > before, 8000), '5 broken: the new worker tried to download the file that now 404s');
  await sleep(1500);
  const rs = await regState(page);
  ok(!rs.waiting && !rs.installing, '5 broken: the new worker did not install (nothing waiting, nothing installing)');
  eq((await cacheKeys(page)).join(','), CACHE20, '5 broken: no half-built cache is left, and the old one is intact');
  /* Online reload still serves the old, complete version from its own cache. */
  await page.reload();
  await page.waitForSelector('#view');
  eq(await pageBuild(page), APPB, '5 broken: the page still runs the old version');
  ok(await page.evaluate(() => typeof viewPlan === 'function'), '5 broken: with every file, including the one that 404s');
  await page.locator('[data-tab="plan"]').tap();
  ok(await page.locator('.pex').count() > 0, '5 broken: the Plan screen (the file that 404s) works');
  await page.locator('[data-tab="today"]').tap();
  const p2 = await offlineCold(app, dep, '5 offline', 6);
  await p2.locator('[data-tab="plan"]').tap();
  ok(await p2.locator('.pex').count() > 0, '5 offline: the Plan screen works offline from the old cache');
  await app.ctx.close();
}

/* ---- 6. the real path: v26.13 -> v26.14 -> 2.0-a1 ---- */
async function chain(label, mid) {
  const dep = await deployServer({ tree: T13 });
  const app = await phone(dep, label);
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  eq((await cacheKeys(page)).join(','), C13, label + ' v26.13 is installed from its own tree (git ' + V2613 + ')');
  await oneWorkout(page);
  let n = (await stored(page)).sessions.length;
  eq(n, 7, label + ' a workout is logged on v26.13');

  dep.tree = T14;                                              // deploy v26.14
  await page.close(); page = await app.open(dep.url); await page.waitForSelector('#view');
  eq(await pageBuild(page), B14, label + ' the first open after the v26.14 deploy runs v26.14 (v26.13\'s worker fetched it network-first)');
  ok(await openUntil(page, keysIs(C14)), label + ' v26.14 installed in the background and took over at an open; v26.13\'s cache is gone');
  eq(await pageBuild(page), B14, label + ' the page runs v26.14');
  eq((await stored(page)).sessions.length, n, label + ' the log is intact');

  if (mid) { await startWorkout(page); await logSet(page); await page.waitForTimeout(400); }
  dep.tree = ROOT;                                             // deploy 2.0-a1
  await page.reload(); await page.waitForSelector(mid ? '.card.ex' : '#view');
  if (mid) eq(await pageBuild(page), B14, label + ' the open after the 2.0-a1 deploy shows v26.14 (served from its own cache, one consistent version)');
  ok(await until(async () => (await cacheKeys(page)).includes(CACHE20), 10000), label + ' 2.0-a1 downloads its own cache in the background');
  if (mid) {
    ok(await until(async () => (await regState(page)).waiting, 8000), label + ' it is WAITING');
    await page.evaluate(() => { window.__marker = 'same page'; });
    await sleep(2500); await background(page); await sleep(300); await foreground(page); await sleep(2500);
    eq(await page.evaluate(() => window.__marker), 'same page', label + ' a workout is active: not reloaded, not on leaving and returning either');
    ok((await regState(page)).waiting, label + ' still waiting');
    await page.locator('.set[data-ei="0"][data-si="1"] .tick').tap();
    await saveWorkout(page); n++;
    await sleep(3000);
    eq(await page.evaluate(() => window.__marker), 'same page', label + ' saving does not reload it');
    await background(page); await foreground(page);            // the next open
  }
  ok(await openUntil(page, async p => (await keysIs(CACHE20)(p)) && (await pageBuild(p)) === APPB), label + ' 2.0-a1 took over at an open; the old cache is gone');
  await page.waitForSelector('#view');
  ok(await booted(page), label + ' it booted with every file counted');
  eq(await gateShown(page), 0, label + ' no gate screen');
  eq((await stored(page)).sessions.length, n, label + ' the log is intact');
  ok(await page.locator('[data-act="start"].primary').count() > 0, label + ' Today renders');
  await page.locator('[data-tab="plan"]').tap();
  ok(await page.locator('.pex').count() > 0, label + ' Plan renders');
  await page.locator('[data-tab="today"]').tap();
  const loads = app.nav.loads; await sleep(2500);
  eq(app.nav.loads, loads, label + ' no reload loop');
  await offlineCold(app, dep, label + ' offline', n);
  await app.ctx.close();
}
await chain('6a idle:', false);
await chain('6b mid-workout:', true);

/* ---- 7. the split lands on a v26.14 phone with a js file missing ---- */
{
  const dep = await deployServer({ tree: T14 });
  const app = await phone(dep, '7');
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  await oneWorkout(page);
  eq((await cacheKeys(page)).join(','), C14, '7 partial: the phone is on v26.14');
  dep.tree = ROOT; dep.gone.add('js/09-plan.js');             // the deploy is caught half-copied
  const h0 = dep.hits['js/09-plan.js'] || 0;
  await page.reload(); await page.waitForSelector('#view');
  ok(await until(async () => (dep.hits['js/09-plan.js'] || 0) > h0, 10000), '7 partial: the 2.0-a1 worker tried to install and hit the 404');
  await sleep(1500);
  const rs = await regState(page);
  ok(!rs.waiting && !rs.installing, '7 partial: it did not install');
  eq((await cacheKeys(page)).join(','), C14, '7 partial: no partial cache; v26.14\'s is intact');
  for (let i = 0; i < 2; i++) { await page.reload(); await page.waitForSelector('#view'); await sleep(800); }
  eq(await pageBuild(page), B14, '7 partial: the app on the phone is still v26.14, open after open');
  ok(await page.locator('[data-act="start"].primary').count() > 0, '7 partial: Today renders online');
  await page.locator('[data-tab="plan"]').tap();
  ok(await page.locator('.pex').count() > 0, '7 partial: Plan renders online');
  await page.locator('[data-tab="today"]').tap();
  eq(await gateShown(page), 0, '7 partial: no gate screen (it is the v26.14 page)');
  eq((await stored(page)).sessions.length, 7, '7 partial: the log is intact');
  /* The files arrive. */
  dep.gone.clear();
  await page.reload(); await page.waitForSelector('#view');
  ok(await openUntil(page, async p => (await keysIs(CACHE20)(p)) && (await pageBuild(p)) === APPB), '7 partial: when the missing file arrives, 2.0-a1 installs and takes over at an open');
  ok(await booted(page), '7 partial: and boots complete');
  await offlineCold(app, dep, '7 offline', 7);
  await app.ctx.close();
}
{
  /* Offline, with the same partial deploy never healed: cold boot is v26.14 still. */
  const dep = await deployServer({ tree: T14 });
  const app = await phone(dep, '7b');
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  dep.tree = ROOT; dep.gone.add('js/09-plan.js');
  await page.reload(); await page.waitForSelector('#view'); await sleep(2000);
  const p = await offlineCold(app, dep, '7b offline', 6);
  eq(await pageBuild(p), B14, '7b partial: the cold offline app is v26.14, complete');
  await p.locator('[data-tab="plan"]').tap();
  ok(await p.locator('.pex').count() > 0, '7b partial: Plan renders offline');
  await app.ctx.close();
}

/* ---- 8. a deploy that changes index.html AND a js file ---- */
const HTML0 = read('index.html'), HELP0 = read('js/02-helpers.js');
const deploy = (dep, m, withSw) => {
  dep.over['index.html'] = HTML0.replace('<title>', '<meta name="ilf-marker" content="' + m + '">\n<title>');
  dep.over['js/02-helpers.js'] = HELP0 + 'self.__marker="' + m + '";\n';
  if (withSw) dep.over['sw.js'] = bumpSw(SW20, '-' + m);
};
const marks = page => page.evaluate(() => ({ html: (document.querySelector('meta[name="ilf-marker"]') || {}).content, js: self.__marker }));
async function htmlJs(label, cc, expireMs) {
  const dep = await deployServer({ tree: ROOT, cc });
  const app = await phone(dep, label);
  let page = app.page;
  deploy(dep, 'M0', true);
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  await oneWorkout(page);
  const seen = new Set(), pairs = [];
  const look = async tag => {
    for (let i = 0; i < 6; i++) {
      try { await page.waitForSelector('#view'); const m = await marks(page); pairs.push(tag + ':' + m.html + '/' + m.js); seen.add(m.html + '/' + m.js); return m; }
      catch (e) { await sleep(400); }
    }
    throw new Error('could not read the markers');
  };
  await look('start');

  /* M1: html, js and sw all change. The install is slow, so opens happen mid-download. */
  deploy(dep, 'M1', true);
  dep.delay['js/02-helpers.js'] = 1200;
  if (expireMs) await sleep(expireMs);
  for (let i = 0; i < 4; i++) { await page.reload(); await look('m1-open' + i); await sleep(500); }
  dep.delay = {};
  ok(await openUntil(page, async p => { const m = await marks(p); return m.html === 'M1' && m.js === 'M1' && (await keysIs(CACHE20 + '-M1')(p)); }, 6), label + ' the new pair (M1/M1) takes over at an open and the old cache goes');

  /* M2: html and js change, the deployer forgot to bump BUILD: the worker is byte-identical, so nothing updates. */
  deploy(dep, 'M2', false);
  dep.over['sw.js'] = bumpSw(SW20, '-M1');
  if (expireMs) await sleep(expireMs);
  for (let i = 0; i < 3; i++) { await page.reload(); await look('m2-open' + i); await sleep(400); }
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()).catch(() => {}));
  await sleep(1500);
  await page.reload(); await look('m2-final');
  ok(![...seen].some(s => { const [h, j] = s.split('/'); return h !== j; }), label + ' every open ran one consistent pair, never html from one deploy and js from another  [' + pairs.join(' ') + ']');
  ok([...seen].every(s => /^(M0\/M0|M1\/M1)$/.test(s)), label + ' and only ever a deployed pair whose worker had installed (M2 never leaks in without its BUILD bump)  [' + [...seen].join(',') + ']');
  eq((await stored(page)).sessions.length, 7, label + ' the log is intact');
  eq(app.errors.join(' | '), '', label + ' no page errors');
  await app.ctx.close();
  await dep.close();
}
await htmlJs('8a max-age=600:', 'public, max-age=600', 0);
await htmlJs('8b after max-age expiry:', 'public, max-age=1', 1500);

/* ---- 9. the boot integrity gate ---- */
const MESSAGE = 'Iron Log didn\'t finish updating. Reconnect and reopen the app — your data is safe.';
async function gatePhone(dep, label, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: opts.sw ? 'allow' : 'block' });
  await ctx.addInitScript(() => {
    window.__ls = [];
    for (const m of ['setItem', 'removeItem', 'clear']) { const o = Storage.prototype[m]; Storage.prototype[m] = function (k) { window.__ls.push(m + ':' + (m === 'clear' ? '' : k)); return o.apply(this, arguments); }; }
  });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  return { ctx, page, errors };
}
const GATE_STATE = JSON.stringify(seed());
{
  const cases = [
    ['a js file with a syntax error (cut short)', d => { d.over['js/06-today.js'] = read('js/06-today.js').slice(0, 5000); }],
    ['a js file that throws before its last line', d => { d.over['js/08-progress.js'] = read('js/08-progress.js').replace(MARK, 'throw new Error("boom");\n' + MARK); }],
    ['a js file that 404s', d => { d.gone.add('js/09-plan.js'); }],
    ['12-boot.js itself 404s (boot never runs)', d => { d.gone.add('js/12-boot.js'); }],
  ];
  for (const [name, breakIt] of cases) {
    const dep = await deployServer({ tree: ROOT });
    const { ctx, page, errors } = await gatePhone(dep, '9');
    await page.goto(dep.url);                                             // a healthy first visit seeds the log
    await page.evaluate(s => localStorage.setItem('ironlog.v1', s), GATE_STATE);
    breakIt(dep);
    await page.reload();
    await page.waitForSelector('[data-ilf-gate]', { timeout: 8000 });
    const L = '9 gate [' + name + ']';
    eq((await page.locator('[data-ilf-gate] p').innerText()).replace(/\s+/g, ' '), MESSAGE, L + ': the plain message is up');
    ok(await page.locator('[data-ilf-gate] button', { hasText: 'Retry' }).count() === 1, L + ': with a Retry button');
    const box = await page.locator('[data-ilf-gate]').boundingBox();
    ok(box && box.width >= 389 && box.height >= 843, L + ': full screen');
    ok(await page.evaluate(() => typeof S === 'undefined'), L + ': the app did not boot (no S)');
    eq(await page.evaluate(() => localStorage.getItem('ironlog.v1')), GATE_STATE, L + ': the log in localStorage is byte for byte what it was');
    /* The one thing that does touch it is 01-state.js's storage probe (writes and removes the key "__t"),
       which runs before any gate can know. It never touches the log's key. */
    eq((await page.evaluate(() => window.__ls)).join(','), 'setItem:__t,removeItem:__t', L + ': and on this page nothing but 01-state\'s "__t" storage probe touched localStorage (no write, removal or clear of the log)');
    /* Reconnect; Retry. */
    dep.over = {}; dep.gone.clear();
    const l0 = await page.evaluate(() => performance.timeOrigin);
    await page.locator('[data-ilf-gate] button').tap();
    ok(await until(async () => (await page.evaluate(() => performance.timeOrigin).catch(() => l0)) !== l0, 10000), L + ': Retry reloads the page');
    await page.waitForSelector('#view');
    ok(await booted(page) && await gateShown(page) === 0, L + ': and the full app boots');
    eq((await stored(page)).sessions.length, 6, L + ': with the log intact');
    await ctx.close(); await dep.close();
  }
}
async function realGate(L, goneList) {
  /* The failure both reviewers reproduced: v26.13's worker is network-first and caches the split index.html,
     then a js file fails. It used to leave split HTML and missing scripts ("PLANVAR is not defined", empty Plan). */
  const dep = await deployServer({ tree: T13 });
  const app = await phone(dep, L);
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  await oneWorkout(page);
  const raw = await page.evaluate(() => localStorage.getItem('ironlog.v1'));
  await page.evaluate(() => { window.__ls = []; });
  dep.tree = ROOT; for (const g of goneList) dep.gone.add(g);                  // the split, straight onto v26.13, caught half-copied
  await page.close();
  page = await app.open(dep.url);
  await page.waitForSelector('[data-ilf-gate]', { timeout: 10000 });
  eq((await page.locator('[data-ilf-gate] p').innerText()).replace(/\s+/g, ' '), MESSAGE, L + ' v26.13 -> split with a 404: the message, not a half-built app');
  eq(await page.evaluate(() => localStorage.getItem('ironlog.v1')), raw, L + ': the log is untouched');
  await app.ctx.setOffline(true);                                   // and offline the same
  await page.close(); page = await app.open(null, L + ' offline: '); await page.goto(dep.url);
  await page.waitForSelector('[data-ilf-gate]', { timeout: 10000 });
  ok(true, L + ': offline, v26.13\'s cached split page shows the message too, not an empty Plan');
  eq(await page.evaluate(() => localStorage.getItem('ironlog.v1')), raw, L + ': the log is untouched offline');
  await app.ctx.setOffline(false); dep.gone.clear();
  await page.locator('[data-ilf-gate] button').tap();
  ok(await until(async () => (await page.evaluate(n => typeof S !== 'undefined' && self.__ilf === n, NAPP).catch(() => false)), 15000), L + ': online again, Retry brings the complete app up');
  eq((await stored(page)).sessions.length, 7, L + ': with the log intact');
  await oneWorkout(page);
  eq((await stored(page)).sessions.length, 8, L + ': and a workout logs');
  await app.ctx.close();
}

await realGate('9 real [js/09-plan.js 404]', ['js/09-plan.js']);
/* The gate must not depend on any file: here 12-boot.js and sw-update.js are missing as well. */
await realGate('9 real [12-boot.js, sw-update.js and 09-plan.js all 404]', ['js/12-boot.js', 'js/09-plan.js', 'js/sw-update.js']);

/* ---- 10. no reload at the wrong moment ---- */
{
  const dep = await deployServer({ tree: ROOT });
  const app = await phone(dep, '10');
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  /* (a) a switch someone else asked for arrives while a workout is active. */
  await startWorkout(page); await logSet(page);               // in use, and a workout, before the version lands
  await page.evaluate(() => { window.__marker = 'same page'; });
  dep.over['sw.js'] = bumpSw(SW20, '-c1');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  ok(await until(async () => (await regState(page)).waiting), '10 a: a new version is waiting');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.waiting.postMessage({ type: 'skip-waiting' })));   // another tab's request
  ok(await until(async () => (await cacheKeys(page)).join(',') === CACHE20 + '-c1', 8000), '10 a: the new worker took control mid-workout (controllerchange fired)');
  await sleep(3000);
  eq(await page.evaluate(() => window.__marker), 'same page', '10 a: the page was not reloaded under the workout');
  ok(await page.evaluate(() => !!document.querySelector('.card.ex .set.done')), '10 a: the logged set is still on screen');
  await saveWorkout(page);
  await sleep(3500);
  eq(await page.evaluate(() => window.__marker), 'same page', '10 a: saving does not reload it, not in the same visible period');
  eq((await stored(page)).sessions.length, 7, '10 a: the workout is saved');
  await background(page); await foreground(page);
  ok(await until(async () => (await page.evaluate(() => window.__marker).catch(() => 'gone')) !== 'same page', 10000), '10 a: the switch is not dropped: the page reloads at the next open');
  await page.waitForSelector('#view');
  const l = app.nav.loads; await sleep(2500);
  eq(app.nav.loads, l, '10 a: once');
  ok(!(await unloads(page)).some(u => u.active), '10 a: no page unload ever happened with a workout active');
  eq((await stored(page)).sessions.length, 7, '10 a: the log is intact');

  /* (b) the app is in use from the first second; the worker finishes installing after that. */
  dep.over['sw.js'] = bumpSw(SW20, '-c2');
  dep.delay['manifest.webmanifest'] = 1800;
  await page.reload(); await page.waitForSelector('#view');
  await page.evaluate(() => { window.__marker = 'same page'; });
  await startWorkout(page); await logSet(page);               // touched, and a workout
  ok(await until(async () => (await regState(page)).waiting, 12000), '10 b: the version installs while the workout is on');
  await saveWorkout(page);
  await sleep(4000);
  eq(await page.evaluate(() => window.__marker), 'same page', '10 b: a save in the same visible period as the install does not reload');
  ok(!(await unloads(page)).some(u => u.active), '10 b: and no unload with a workout active');
  /* (c) installing a moment after an untouched open: that is still the moment of opening. */
  dep.over['sw.js'] = bumpSw(SW20, '-c3');
  dep.delay = {};
  await background(page); await foreground(page);              // an open: -c2 is waiting, takes over
  ok(await until(async () => (await page.evaluate(() => window.__marker).catch(() => 'gone')) !== 'same page', 10000), '10 c: an untouched open takes the waiting version');
  await page.waitForSelector('#view');
  ok(await openUntil(page, keysIs(CACHE20 + '-c3')), '10 c: and the next one arrives the same way');
  await app.ctx.close();
}

/* ---- 11. nothing open, nothing applied (the session editor, a pageshow restore) ---- */
{
  const dep = await deployServer({ tree: ROOT });
  const app = await phone(dep, '11');
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  await page.locator('[data-act="edit-last"]').tap();                    // the session editor
  await page.waitForSelector('.sheet [data-x="save"]');
  await page.locator('.sheet input[data-k="0.0"][data-f="r"]').fill('9');   // a draft
  await page.evaluate(() => { window.__marker = 'same page'; });
  await background(page);                                                // he leaves the app...
  dep.over['sw.js'] = bumpSw(SW20, '-e1');                               // ...a deploy lands...
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  ok(await until(async () => (await regState(page)).waiting, 12000), '11 the new version installs and waits while the editor is open');
  await foreground(page);                                                // ...and he comes back: an "open", with touched reset
  await sleep(3000);
  eq(await page.evaluate(() => window.__marker), 'same page', '11 coming back with the editor open does not reload the page');
  eq(await page.locator('.sheet input[data-k="0.0"][data-f="r"]').inputValue(), '9', '11 and the draft (reps 9) is intact');
  ok((await regState(page)).waiting, '11 the version is still waiting');
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await sleep(2500);
  eq(await page.evaluate(() => window.__marker), 'same page', '11 a pageshow from the back/forward cache with the editor open does not reload it either');
  await page.locator('.sheet [data-x="cancel"]').tap();                  // close the editor
  await sleep(1500);
  eq(await page.evaluate(() => window.__marker), 'same page', '11 closing the editor is not an open: still no reload');
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  ok(await until(async () => (await page.evaluate(() => window.__marker).catch(() => 'gone')) !== 'same page', 12000), '11 a pageshow restore (an open) with nothing open takes the update');
  await page.waitForSelector('#view');
  ok(await until(async () => (await cacheKeys(page)).join(',') === CACHE20 + '-e1'), '11 and the old cache is gone');
  ok(await booted(page) && await gateShown(page) === 0, '11 the app on the new version is fully booted');
  eq((await stored(page)).sessions.length, 6, '11 the log is intact (the abandoned draft was never saved)');
  eq(app.errors.join(' | '), '', '11 no page errors');
  await app.ctx.close(); await dep.close();
}

/* ---- 12. a cache is complete only with its marker AND every core entry ---- */
{
  const dep = await deployServer({ tree: ROOT });
  const app = await phone(dep, '12');
  let page = app.page;
  await seedAndLoad(page, seed(), dep.url);
  await waitController(page);
  const has = (u) => page.evaluate(async ([k, u]) => !!(await (await caches.open(k)).match(u)), [CACHE20, u]);
  ok(await has('./js/09-plan.js') && await has('./.installed'), '12 the installed cache has js/09-plan.js and the marker');
  await page.evaluate(async k => { await (await caches.open(k)).delete('./js/09-plan.js'); }, CACHE20);   // the marker survives, a core entry does not
  ok(!(await has('./js/09-plan.js')) && await has('./.installed'), '12 the cache now has the marker but lost js/09-plan.js');
  dep.over['sw.js'] = SW20 + '\n// redeployed, same BUILD\n';             // different bytes, same cache name
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  ok(await until(async () => await has('./js/09-plan.js'), 12000), '12 the next install of that version notices and rebuilds it (the file is back)');
  eq((await cacheKeys(page)).join(','), CACHE20, '12 still one cache');
  await page.evaluate(async k => { await (await caches.open(k)).put('./sentinel', new Response('x')); }, CACHE20);
  dep.over['sw.js'] = SW20 + '\n// redeployed again, same BUILD\n';
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  await sleep(2500);
  ok(await has('./sentinel'), '12 a complete cache of the same version is left alone (the sentinel survives the next install)');
  await app.ctx.close(); await dep.close();
}

await browser.close();
report('t47 split');
/* The deploy servers of the sections that end on a still-open page are left listening; end the run. */
process.exit(process.exitCode || 0);
