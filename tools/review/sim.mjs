/* Phase 2 driver: runs the real engine (hooked copies of index.html, some with
   one rule ablated at source) in the closed loop of sim-page.js, over a
   population of lifters, on 4 Chromium workers. Per-lifter metrics go to
   $REVIEW_OUT/sim/<variant>/<config>.jsonl (no raw training data).

   Usage: node tools/review/sim.mjs [nLifters=200] [configs=all] [variants=all]
   e.g.   node tools/review/sim.mjs 20 classic,dp base */
import { buildCopy, serve, openApp, loadExport, OUT } from './lib.mjs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { writeFileSync, appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lifterMetrics } from './metrics.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 8140, WORKERS = 4, CHUNK = 10;
const NL = +(process.argv[2] || 200);

/* Ablations, each a single source edit that must apply exactly once.
   (2.0: the trend cut and the rep-out shadow are gone from the engine, so their
   ablations and the repout configs went with them.) */
const COPIES = {
  base: [],
  'abl-jump': [['if(jf&&repsAt(hist[jf.i],jf.w,mode)<low-1){', 'if(false&&jf&&repsAt(hist[jf.i],jf.w,mode)<low-1){']],
  'abl-step': [['if(!noLoad&&hist[1]&&repsAt(last,w,mode,true)<low){', 'if(false&&!noLoad&&hist[1]&&repsAt(last,w,mode,true)<low){']],
};
export const CONFIGS = {
  classic:      { copy: 'base', engine: 'classic', coach: true },
  /* the engine with the RDL and Leg Press as one top set + back-offs (V2_SPEC §2e gate 4) */
  topback:      { copy: 'base', engine: 'classic', coach: true, topback: ['rdl', 'leg press'] },
  dp:           { copy: 'base', engine: 'dp' },
  lin:          { copy: 'base', engine: 'lin' },
  'c-jump':     { copy: 'abl-jump', engine: 'classic' },
  'c-step':     { copy: 'abl-step', engine: 'classic' },
  'c-nodeload': { copy: 'base', engine: 'classic', noDeload: true },
};
const BASEV = { gMed: 0.10, gSd: 0.6, dayNoise: 0.02, tick: 0.25, Emul: 1 };
export const VARIANTS = {
  base: BASEV,
  noisy: { ...BASEV, dayNoise: 0.04 },
  ticker: { ...BASEV, tick: 0.7 },
  flat: { ...BASEV, Emul: 1.4 },
  // NOT pre-registered (added after the literature check, before any full run): sensitivity only
  lowloss: { ...BASEV, loss: 0.15 },
  stated: { ...BASEV, sched: 'stated' },
};

const cfgNames = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3].split(',') : Object.keys(CONFIGS);
const varNames = process.argv[4] && process.argv[4] !== 'all' ? process.argv[4].split(',') : Object.keys(VARIANTS);
const T0 = Date.UTC(2026, 10, 9);       // Monday after his last session (6 Nov)

const root = join(OUT, 'serve-sim');
buildCopy(root);
for (const [name, patches] of Object.entries(COPIES)) buildCopy(join(root, name), patches);
const srv = await serve(root, PORT);
const state = loadExport();
const simSrc = readFileSync(join(HERE, 'sim-page.js'), 'utf8');

const jobs = [];
for (const v of varNames) for (const c of cfgNames)
  for (let i = 0; i < NL; i += CHUNK) jobs.push({ v, c, from: i, to: Math.min(NL, i + CHUNK) });
for (const v of varNames) { mkdirSync(join(OUT, 'sim', v), { recursive: true });
  for (const c of cfgNames) writeFileSync(join(OUT, 'sim', v, c + '.jsonl'), ''); }

let done = 0; const t0 = Date.now();
async function worker(wi) {
  const browser = await chromium.launch();
  const pages = {};
  try {
    while (jobs.length) {
      const j = jobs.shift();
      const C = CONFIGS[j.c];
      if (!pages[C.copy]) {
        const app = await openApp(PORT, state, browser, C.copy + '/index.html');
        await app.page.addScriptTag({ content: simSrc });
        pages[C.copy] = app;
      }
      const app = pages[C.copy];
      const cfg = { ...C, variant: VARIANTS[j.v], weeks: 52, t0: T0, popSeed: 0 };
      const res = await app.page.evaluate(({ cfg, from, to }) => {
        const out = []; for (let li = from; li < to; li++) out.push(window.SIM.run(cfg, li)); return out;
      }, { cfg, from: j.from, to: j.to });
      if (app.errors.length) throw new Error(j.c + ' page error: ' + app.errors[0]);
      const lines = res.map(r => JSON.stringify({ c: j.c, v: j.v, ...lifterMetrics(r, cfg) })).join('\n') + '\n';
      appendFileSync(join(OUT, 'sim', j.v, j.c + '.jsonl'), lines);
      done++;
      if (done % 10 === 0) console.log(`  ${done} chunks, ${((Date.now() - t0) / 1000).toFixed(0)}s, ${jobs.length} left`);
    }
  } finally { await browser.close(); }
}
console.log(`${jobs.length} chunks of ${CHUNK} lifters: ${cfgNames.join(',')} x ${varNames.join(',')}`);
try { await Promise.all([...Array(WORKERS)].map((_, i) => worker(i))); }
finally { srv.kill(); }
console.log('done in', ((Date.now() - t0) / 1000).toFixed(0), 's');
