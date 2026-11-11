/* The coach must not nag. A simulated year on the recommended plan, through the
   real engine (yearsim.js, as in t35), with the coach looking at the log after
   every saved session exactly as the app does (coachMeasure + coachRun), and a
   lifter who answers every card the same way:

     keep    taps "Keep it" on everything (the worst case for repeats)
     accept  taps the first choice on everything (the plan changes under him)

   Four scenarios: a healthy lifter getting stronger; one who skips a lift
   most weeks; one whose rows plateau for a quarter; the healthy one again
   with sessions that run long. The bound asked for was "well under one
   suggestion per lift per quarter" for the healthy lifter.

   Numbers (4 seeds, this suite prints them): see ROADMAP v26. */
import { launch, URL, ok, report } from './harness.mjs';
import fs from 'fs';

const SIM = fs.readFileSync(new globalThis.URL('./yearsim.js', import.meta.url), 'utf8');
const HOOK = 'window.__t={get S(){return S}, set S(v){S=v}, prescribe:prescribe,' +
  ' deloadCheck:deloadCheck, deloadStatus:deloadStatus, makeSessionEx:makeSessionEx, exWorking:exWorking,' +
  ' ev:function(src){ return eval(src); }};';

const START = {
  'Leg Press': [190, 13], 'Incline DB Press': [55, 12], 'Cable Row': [65, 13], 'Hamstring Curls': [125, 12],
  'Lateral Raise': [15, 19], 'DB Curl': [30, 11], 'Tricep Pushdown': [30, 15], 'Bulgarian Split Squat': [25, 12],
  'DB Overhead Press': [45, 11], 'Lat Pulldown': [150, 11], 'Leg Extension': [90, 15], 'RDL': [225, 10],
  'Flat DB Press': [60, 12], 'DB Row': [65, 13], 'Low to high cable fly': [20, 16], 'Rear Delt Fly': [10, 22] };
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function liftsFor(seed, extraNames) {
  const r = mulberry(seed * 7919 + 13), out = {};
  for (const [n, [w0, c0]] of Object.entries(START)) out[n] = { w0, c0: c0 + (r() * 3 - 1.5), G: 0.05 + r() * 0.10, K: 1 };
  /* Lifts the coach could swap in: any plausible lifter, so the loop can run. */
  for (const n of extraNames) if (!out[n]) out[n] = { w0: 30, c0: 12, G: 0.08, K: 1 };
  return out;
}
function missedFor(seed) { const r = mulberry(seed * 31 + 7); return [11, 27, 41].map(w => w + Math.round(r() * 4 - 2)); }

const { browser, errors } = await launch();
const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
await page.route('**/js/12-boot.js', async route => {
  const res = await route.fetch();
  const body = (await res.text()).replace('var S=load();', 'var S=load();\n' + HOOK);
  route.fulfill({ response: res, body });
});

/* Installed in the page before each year: stamps the sets (about 2.2 minutes apart, so a 21-set
   day is ~46 active minutes, or `pace` for long days), optionally drops a lift from most sessions,
   runs the coach as commitSession() does, and answers every card by policy. */
const DRIVER = (policy, skip, pace) => `
  (function(){
    var T=window.__t, RD=Date;
    window.Date=class extends RD{ constructor(...a){ if(a.length) super(...a); else super(RD.now()); } };
    window.__raised=[]; var seen={}, n=0;
    window.__afterSession=function(s){
      var k=0, i=0;
      if(${JSON.stringify(skip)}){
        s.exercises=s.exercises.filter(function(e){ return e.name!==${JSON.stringify(skip)}||(++n%10)<3; });   // done ~30% of the time
      }
      s.exercises.forEach(function(e){ e.sets.forEach(function(x){ x.ts=s.ts+Math.round(k*${pace}*60e3); k++; }); });
      T.ev('blockAfterSession')(s);   // 2.0: the block counts the session (and closes at 18 main sessions) before the coach looks, as commitSession() does
      T.ev('coachMeasure')();
      T.ev('coachRun')(false);
      T.S.coach.proposals.forEach(function(p){
        if(!seen[p.id]){ seen[p.id]=1; window.__raised.push({lift:p.lift, kind:p.kind, stage:p.stage||0, dbg:p.kind==='stall'?T.exWorking(p.lift).slice(0,9).map(function(x){ return T.ev('workLoad')(x.sets,0)+':'+x.sets.map(function(y){return y.r}).join('/'); }).join(' '):'', day:Math.floor((s.ts-Date.UTC(2026,0,5))/864e5)}); }
      });
      T.S.coach.proposals.filter(function(p){ return p.status==='open'; }).forEach(function(p){
        if(${JSON.stringify(policy)}==='keep') T.ev('coachKeep')(p.id); else T.ev('coachApply')(p.id,0);
      });
    };
  })();`;

async function year(seed, sc, policy, skip, pace) {
  await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => !!window.__t);
  const names = await page.evaluate(() => window.__t.ev('COACH_FAMILIES').flat().map(m => m[0]));
  await page.addScriptTag({ content: SIM });
  await page.addScriptTag({ content: DRIVER(policy, skip, pace) });
  const res = await page.evaluate(c => { const r = window.runSim(c); return { raised: window.__raised, coach: window.__t.S.coach, tally: window.__t.ev('coachTally')() }; },
    Object.assign({ seed, lifts: liftsFor(seed, names), missed: missedFor(seed) }, sc));
  return res;
}
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const SEEDS = [1, 2, 3, 4];
const rows = [];
async function scenario(label, sc, policy, skip, pace = 2.2) {
  const runs = [];
  for (const sd of SEEDS) runs.push(await year(sd, sc, policy, skip, pace));
  const per = runs.map(r => r.raised.length);
  /* "per lift per quarter": the most any one lift was raised in any 13-week window */
  const worst = runs.map(r => { const by = {}; r.raised.forEach(x => (by[x.lift] = by[x.lift] || []).push(x.day));
    let w = 0; for (const d of Object.values(by)) for (const a of d) w = Math.max(w, d.filter(b => b >= a && b < a + 91).length); return w; });
  const kinds = {}; runs.forEach(r => r.raised.forEach(x => { kinds[x.kind] = (kinds[x.kind] || 0) + 1; }));
  const lifts = {}; runs.forEach(r => r.raised.forEach(x => { lifts[x.lift] = (lifts[x.lift] || 0) + 1; }));
  if (process.env.COACH_DEBUG) runs[0].raised.slice(0, 12).forEach(x => console.log('      ' + x.lift + ' d' + x.day + '  ' + x.dbg));
  if (process.env.COACH_DEBUG) console.log('    by lift (4 seeds): ' + JSON.stringify(lifts));
  console.log('  ' + label.padEnd(34) + 'raised/yr ' + mean(per).toFixed(1) + '  (per seed ' + per.join(',') + ')  most for one lift in a quarter ' +
    Math.max(...worst) + '  kinds ' + JSON.stringify(kinds));
  rows.push({ label, per, worst, runs });
  return { per, worst, runs };
}

const healthyKeep = await scenario('healthy lifter, always Keep it', {}, 'keep');
const healthyAcc = await scenario('healthy lifter, always accept', {}, 'accept');
const skipper = await scenario('skips Rear Delt Fly, always Keep', {}, 'keep', 'Rear Delt Fly');
const skipperAcc = await scenario('skips Rear Delt Fly, always accept', {}, 'accept', 'Rear Delt Fly');
const plateau = await scenario('rows plateau 12 weeks, Keep', { plateau: { lifts: ['Cable Row', 'DB Row'], from: 12, to: 24 } }, 'keep');
const plateauAcc = await scenario('rows plateau 12 weeks, accept', { plateau: { lifts: ['Cable Row', 'DB Row'], from: 12, to: 24 } }, 'accept');
const slow = await scenario('long days (5.2 min a set), Keep', {}, 'keep', '', 5.2);

const perLiftQuarter = per => mean(per) / (16 * 4);          // 16 lifts in the plan, four quarters
const kindN = (sc, k, sd) => sc.runs[sd].raised.filter(x => x.kind === k).length;
ok(mean(healthyKeep.per) <= 8, 'healthy lifter who keeps everything: a handful of cards a year, not a stream  [' + mean(healthyKeep.per).toFixed(1) + ']');
ok(perLiftQuarter(healthyKeep.per) <= 0.25, 'healthy lifter, Keep: well under one card per lift per quarter  [' + perLiftQuarter(healthyKeep.per).toFixed(2) + ']');
ok(mean(healthyAcc.per) <= 8 && perLiftQuarter(healthyAcc.per) <= 0.25, 'healthy lifter who accepts everything: still a handful  [' + mean(healthyAcc.per).toFixed(1) + ', ' + perLiftQuarter(healthyAcc.per).toFixed(2) + ' per lift per quarter]');
ok(Math.max(...healthyKeep.worst, ...healthyAcc.worst) <= 2, 'healthy lifter: no lift raised more than twice in a quarter  [' + Math.max(...healthyKeep.worst, ...healthyAcc.worst) + ']');
ok(SEEDS.every((_, sd) => kindN(skipper, 'skipped', sd) >= 1), 'a lift skipped 7 sessions in 10 is noticed in every simulated year');
ok(SEEDS.every((_, sd) => kindN(skipper, 'skipped', sd) <= 3), 'skipped lift, always Keep: three cards in a year at most (6 weeks, then 18, then a year)  [' + SEEDS.map((_, sd) => kindN(skipper, 'skipped', sd)).join(',') + ']');
ok(SEEDS.every((_, sd) => kindN(skipperAcc, 'skipped', sd) <= 1), 'skipped lift, accept: one card (the problem is solved)  [' + SEEDS.map((_, sd) => kindN(skipperAcc, 'skipped', sd)).join(',') + ']');
ok(mean(plateau.per) <= 10 && mean(plateauAcc.per) <= 10 && Math.max(...plateau.worst, ...plateauAcc.worst) <= 2, 'rows plateau for a quarter: still a handful, at most two for one lift in a quarter  [' + mean(plateau.per).toFixed(1) + ',' + mean(plateauAcc.per).toFixed(1) + ']');
ok(SEEDS.every((_, sd) => kindN(slow, 'long', sd) >= 1 && kindN(slow, 'long', sd) <= 3 * 3), 'sessions of ~108 active minutes (past the 1.5 hours he is fine with) are noticed, and kept ones come back slowly (per day: 6 weeks, 18 weeks, a year)  [' + SEEDS.map((_, sd) => kindN(slow, 'long', sd)).join(',') + ' over 3 days]');
ok(mean(slow.per) <= 16, 'long days: not a stream  [' + mean(slow.per).toFixed(1) + ']');
ok(rows.every(r => r.runs.every(x => x.coach.proposals.filter(p => p.status === 'open').length <= 2)), 'never more than two open at the end of any simulated year');
ok(errors.length === 0, 'no page errors  ' + errors.join(' | '));
report('t39b coach spam check');
await browser.close();
