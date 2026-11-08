/* Phase 1: replay the real engine over Nick's real log.
   For each session, oldest first: the app's state is set to the sessions
   BEFORE it, Date.now to its start, and prescribe() / shadowPrescribe() are
   asked about each lift with that session's own range/increment/load type
   (the plan row as it was then). Output: prescribed vs done, per lift and
   session, to $REVIEW_OUT/replay.json (outside the repo; private data).
   Usage: node tools/review/replay.mjs  */
import { buildCopy, serve, openApp, loadExport, OUT } from './lib.mjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 8131;
const state = loadExport();
const dir = buildCopy(join(OUT, 'serve-replay'));
const srv = await serve(dir, PORT);
const app = await openApp(PORT, state);
try {
  const rows = await app.page.evaluate(() => {
    const T = window.__t, S = T.S;
    const [eachPlanEx, normName, num, working, workLoad, bwMode, isAt, metricOf, droppedSets, exWorking] =
      T.ev('[eachPlanEx, normName, num, working, workLoad, bwMode, isAt, metricOf, droppedSets, exWorking]');
    const all = S.sessions.slice();                 // newest first, as the app stores them
    const planSets = {};
    eachPlanEx(e => { const k = normName(e.name); if (!(k in planSets)) planSets[k] = num(e.sets) || 3; });
    const out = [];
    for (let i = all.length - 1; i >= 0; i--) {
      const s = all[i];
      S.sessions = all.slice(i + 1);
      window.__now = s.ts;
      s.exercises.forEach((e, ei) => {
        const k = normName(e.name);
        const wk = working(e.sets).filter(x => x.done !== false && num(x.r) > 0);
        const row = { name: e.name, sets: planSets[k] || wk.length || 3, reps: e.reps, repTop: e.repTop,
                      inc: e.inc, bw: e.bw, metric: e.metric, bar: e.bar };
        const p = window.__t.prescribe(e.name, row);
        const sp = window.__t.shadowPrescribe(e.name, row);
        const W = workLoad(wk, bwMode(e));
        const at = wk.filter(x => isAt(x, W, bwMode(e)));
        out.push({
          sid: s.id, ts: s.ts, date: s.date, day: s.name, variant: s.variantName || '', deload: !!s.deload,
          ei, lift: e.name, lo: num(e.reps), top: num(e.repTop), inc: e.inc || null, bw: bwMode(e), metric: metricOf(e),
          plannedSets: row.sets, supplemental: !!e.supplemental,
          // what he saw (older engine versions)
          saw: { why: e.why || '', kind: e.kind || '', targetReps: num(e.targetReps),
                 shadow: e.shadow || null, lastW: e.lastW, lastR: e.lastR },
          // what today's engine says, replayed
          now: { p, sp },
          // what he did
          done: { W, sets: wk.map(x => ({ w: x.w, r: num(x.r), out: !!x.out, ts: x.ts || null })),
                  warm: (e.sets || []).filter(x => x.warm).length,
                  minAt: at.length ? Math.min(...at.map(x => num(x.r))) : null,
                  maxAt: at.length ? Math.max(...at.map(x => num(x.r))) : null,
                  nAt: at.length, dropped: droppedSets(wk, W, bwMode(e)), note: e.note || '' },
          nHist: exWorking(e.name).length
        });
      });
    }
    S.sessions = all;
    return out;
  });
  writeFileSync(join(OUT, 'replay.json'), JSON.stringify(rows, null, 1));
  console.log('rows', rows.length, 'errors', app.errors.length, app.errors.slice(0, 3));
} finally { await app.close(); srv.kill(); }
