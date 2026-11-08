/* PREDICTIONS.md: from Nick's real log as it stands (last session 6 Nov 2026),
   run the closed loop forward 9 weeks for a population calibrated to him and
   read, per main lift, the load x reps at the exposure nearest 2027-01-03.
   Prints medians and 80% intervals (10th-90th percentile over lifters).
   Usage: node tools/review/predict.mjs [nLifters=400] [copy=base] [engine=classic] */
import { buildCopy, serve, openApp, loadExport, OUT } from './lib.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIN } from './metrics.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const NL = +(process.argv[2] || 400), COPY = process.argv[3] || 'base', ENGINE = process.argv[4] || 'classic';
const PATCHES = JSON.parse(process.env.REVIEW_PATCHES || '[]');
const PORT = 8170, T0 = Date.UTC(2026, 10, 9), TARGET = Math.round((Date.UTC(2027, 0, 3) - T0) / 864e5);
const dir = buildCopy(join(OUT, 'serve-predict-' + COPY), PATCHES);
const srv = await serve(dir, PORT);
const app = await openApp(PORT, loadExport());
await app.page.addScriptTag({ content: readFileSync(join(HERE, 'sim-page.js'), 'utf8') });
const V = { gMed: 0.10, gSd: 0.6, dayNoise: 0.02, tick: 0.25, Emul: 1 };
const res = await app.page.evaluate(({ NL, V, T0, ENGINE }) => {
  const out = [];
  for (let li = 0; li < NL; li++) out.push(window.SIM.run({ engine: ENGINE, variant: V, weeks: 9, t0: T0, popSeed: 0 }, li).recs);
  return out;
}, { NL, V, T0, ENGINE });
await app.close(); srv.kill();
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(`engine=${ENGINE} copy=${COPY} lifters=${NL}; exposure nearest day ${TARGET} (2027-01-03), within ±14 days`);
console.log('| lift | load (median, 80% int.) | min reps at load (median, 80% int.) | most common load × reps | n |');
console.log('|---|---|---|---|---|');
for (const k of MAIN) {
  const pts = [];
  res.forEach(recs => {
    const ex = recs.filter(r => r[1] === k && !r[6]);
    if (!ex.length) return;
    const best = ex.reduce((a, b) => Math.abs(b[0] - TARGET) < Math.abs(a[0] - TARGET) ? b : a);
    if (Math.abs(best[0] - TARGET) > 14) return;
    pts.push([best[7], best[8].length ? Math.min(...best[8]) : 0]);
  });
  if (!pts.length) { console.log(`| ${k} | — | — | — | 0 |`); continue; }
  const W = pts.map(p => p[0]), R = pts.map(p => p[1]);
  const mode = Object.entries(pts.reduce((m, p) => { const key = p[0] + ' × ' + p[1]; m[key] = (m[key] || 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1])[0];
  console.log(`| ${k} | ${q(W, .5)} (${q(W, .1)}–${q(W, .9)}) | ${q(R, .5)} (${q(R, .1)}–${q(R, .9)}) | ${mode[0]} (${(mode[1] / pts.length * 100).toFixed(0)}%) | ${pts.length} |`);
}
