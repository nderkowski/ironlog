/* coachRun(true) and deloadStatus() on Nick's real log, as of the day after
   his last session. Prints card titles/reasons (no set-level data).
   Usage: node tools/review/coach-reallog.mjs */
import { buildCopy, serve, openApp, loadExport, OUT } from './lib.mjs';
import { join } from 'node:path';
const state = loadExport();
const dir = buildCopy(join(OUT, 'serve-coach')); const srv = await serve(dir, 8180);
const app = await openApp(8180, state);
const out = await app.page.evaluate(() => {
  const T = window.__t; T.ev('writeNow=function(){}; save=function(){}; render=function(){}; coachRefresh=function(){}');
  const S = T.S, A = T.ev('({coachState, deloadStatus, deloadCheck, trend, trendLong, trackedLifts, cycleOf})');
  window.__now = S.sessions[0].ts + 864e5;
  const n = T.coachRun(true);
  const ds = A.deloadStatus();
  return { raised: n, cards: A.coachState().proposals.map(p => ({ kind: p.kind, title: p.title, reason: p.reason, options: p.options.map(o => o.label) })),
    deload: { judged: ds.judged, stalled: ds.stalled.map(s => s.name + ' ' + s.t.pct.toFixed(2)), waiting: ds.waiting, wide: ds.wide, check: A.deloadCheck() },
    trends: A.trackedLifts().map(n => { const t = A.trend(n), l = A.trendLong(n); return n + ': ' + t.state + ' ' + t.pct.toFixed(1) + '% (n=' + t.n + '), long ' + l.pct.toFixed(2) + '%'; }) };
});
console.log(JSON.stringify(out, null, 1));
await app.close(); srv.kill();
