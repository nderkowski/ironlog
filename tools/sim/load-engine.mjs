/* Loads the app's engine in plain Node, no browser, for fast simulations.

   The js files are classic scripts that share one global scope, so a vm
   context is the same thing a page is. Only the files the engine needs are
   loaded (js/files.js order is kept): state and storage, helpers, metrics and
   plan model, the engine itself, and the coach's data shape (load() calls
   coachShape()). Their top level touches no DOM beyond a few listeners and a
   <meta> lookup, which the stubs below absorb. The views, the sheets and boot
   are not loaded.

   Usage:  node tools/sim/load-engine.mjs        (smoke test: one prescribe())
   Import: import { loadEngine } from './load-engine.mjs'
           const app = loadEngine(state)   // app.S, app.prescribe(...), app.run("any expression")
*/
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const ENGINE_FILES = ['js/01-state.js', 'js/02-helpers.js', 'js/03-metrics.js', 'js/04-engine.js', 'js/11-coach.js'];

export function loadEngine(state) {
  const store = new Map();
  if (state) store.set('ironlog.v1', JSON.stringify(state));
  const noop = () => {};
  const sandbox = {
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: k => { store.delete(k); } },
    document: { querySelector: () => ({}), addEventListener: noop, hidden: false, head: { appendChild: noop }, createElement: () => ({}) },
    navigator: {}, console, Math, Date, JSON, setTimeout, clearTimeout,
    addEventListener: noop,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;             // each numbered file ends by counting itself in self.__ilf
  const ctx = vm.createContext(sandbox);
  for (const f of ENGINE_FILES) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });
  // boot's first statement, which is not in the engine files (it needs every one of them first)
  vm.runInContext('var S=load();', ctx);
  return { ctx, get S() { return vm.runInContext('S', ctx); }, run: src => vm.runInContext(src, ctx),
           prescribe: (name, ex) => { ctx.__args = [name, ex]; return vm.runInContext('prescribe(__args[0], __args[1])', ctx); } };
}

/* ---- smoke test ---- */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const day = 86400000, now = Date.now();
  const sets = [0, 1, 2].map(() => ({ w: '135', r: '12', done: true, load: 135 }));
  const state = {
    version: 4, settings: { unit: 'lb', repLow: 8, repHigh: 12, doubleDefault: true, bar: 45, inc: 5, bodyweight: 180 },
    routines: [{ id: 'r1', key: 'A', name: 'Day A', exercises: [{ id: 'p1', name: 'Bench Press', sets: 3, reps: 8, repTop: 12, bar: 45 }] }],
    sessions: [{ id: 's0', ts: now - 3 * day, endTs: now - 3 * day + 3600000, routineId: 'r1', key: 'A', name: 'Day A',
                 exercises: [{ id: 'e0', planId: 'p1', name: 'Bench Press', sets }] }],
    active: null,
  };
  const app = loadEngine(state);
  const v = app.prescribe('Bench Press', { id: 'p1', name: 'Bench Press', sets: 3, reps: 8, repTop: 12, bar: 45 });
  console.log(JSON.stringify(v));
  if (!(v && Number(v.w) > 135)) { console.error('FAIL: expected a load increase after 3x12 at 135, got', v); process.exit(1); }
  console.log('ok: engine loaded in Node, prescribe() answered: ' + v.why);
}
