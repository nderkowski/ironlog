/* A year of training through the real engine, for t35. Runs in the page:
   window.__t is injected by the test at load (see t35-year.mjs), so the app
   ships without a hook. Written for the v25 review (ROADMAP), which used it
   to find light lifts parked at unreachable loads, the shadow flip-flopping,
   and the deload check re-firing the day a deload week ends.

   The lifter: Epley capacity rising 5–15% over the year and slowing, ±1 rep
   noise, a 1-rep fatigue drop per set, 6% bad days at −3, 10–14 day gaps
   with a rep of rust after them; stops at the target on sets before the
   last, takes the last set to 1 short of failure (compounds) or to failure
   (isolation), and always accepts a deload week when told to take one. */

window.runSim = function (cfg) {
  const T = window.__t, ev = T.ev;
  const DAY = 864e5;
  // ---- deterministic RNG ----
  let seed = cfg.seed >>> 0 || 1;
  function rnd() { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
  const U = (a, b) => a + (b - a) * rnd();

  // ---- clock ----
  const t0 = Date.UTC(2026, 0, 5, 17);
  let now = t0;
  Date.now = () => now;


  // ---- state ----
  const settings = Object.assign(ev('defaultState().settings'), {
    unit: 'lb', inc: 5, deloadUntil: 0, deloadSnooze: 0, doubleDefault: true, repLow: 8, repHigh: 12,
    rpe: false, autoBackup: false, rest: 120 });
  T.S = { version: 5, settings, routines: [], sessions: [], active: null };
  const REC = ev('REC_PLAN');
  ['A', 'B', 'C'].forEach(key => {
    const ex = REC.days[key].map(sp => ev('recPlanEx')(sp, {}));
    ex.forEach(e => { if (/cable fly/i.test(e.name)) e.inc = 10; });
    T.S.routines.push({ id: 'r' + key, key, name: 'Day ' + key, variants: [{ id: 'v' + key, label: '', exercises: ex }] });
  });
  const movementClass = ev('movementClass');

  // ---- lifter ----
  const LIFTS = cfg.lifts;            // name -> {w0, c0, G, K}
  const lift = {};
  Object.keys(LIFTS).forEach(n => {
    const L = LIFTS[n];
    lift[n] = Object.assign({}, L, { M0: L.w0 * (1 + L.c0 / (30 * L.K)), cls: movementClass(n) });
  });
  // multiplicative strength curve, weeks since start
  function base(G, wk) { return 1 + G * (1 - Math.exp(-wk / 26)) / (1 - Math.exp(-2)); }
  function strength(n, wk) {
    const L = lift[n];
    let f;
    const pl = cfg.plateau && cfg.plateau.lifts.includes(n) ? cfg.plateau : null;
    if (pl && wk >= pl.from) {
      // frozen for the plateau, then resumes at the base curve's rate from the frozen value
      if (wk < pl.to) f = base(L.G, pl.from);
      else f = base(L.G, pl.from) + (base(L.G, wk) - base(L.G, pl.to));
    } else f = base(L.G, wk);
    const il = cfg.illness;
    if (il) {
      let m = 1;
      if (wk >= il.from && wk < il.from + il.len) m = 1 - il.depth * (wk - il.from) / il.len;
      else if (wk >= il.from + il.len && wk < il.from + il.len + il.rec)
        m = 1 - il.depth * (1 - (wk - il.from - il.len) / il.rec);
      f *= m;
    }
    return L.M0 * f;
  }
  // fresh reps to failure at load w (continuous)
  function capAt(n, w, wk) { const L = lift[n]; return L.K * 30 * (strength(n, wk) / w - 1); }

  // ---- schedule ----
  const gapsAt = cfg.missed || [];      // weeks at which a 10–14 day gap starts
  const end = t0 + 52 * 7 * DAY;
  let rot = 0, prevTs = null, missedIdx = 0;
  const log = [];          // per exposure
  const sessLog = [];      // per session
  let sessionN = 0;
  while (now < end) {
    const wk = (now - t0) / (7 * DAY);
    const key = ['A', 'B', 'C'][rot % 3]; rot++;
    const r = T.S.routines.find(x => x.key === key), v = r.variants[0];
    const gapDays = prevTs == null ? 0 : (now - prevTs) / DAY;
    const rust = gapDays > 9 ? -1 : 0;
    const bad = rnd() < (cfg.badP == null ? 0.06 : cfg.badP) ? -3 : 0;
    const sNoise = U(-1, 1);
    const inDeload = now < (T.S.settings.deloadUntil || 0);
    const exs = [];
    for (const pe of v.exercises) {
      const n = pe.name, L = lift[n];
      const ex = T.makeSessionEx(pe, pe.id);
      const work = ex.sets.filter(s => !s.warm);
      const presc = { w: work[0].w === '' ? null : Number(work[0].w), r: Number(work[0].r), n: work.length, kind: ex.kind, why: ex.why };
      const sh = ex.shadow ? Object.assign({}, ex.shadow) : null;
      if (cfg.useShadow && sh && !inDeload) {
        work.forEach(s => { s.w = String(sh.w); s.r = String(sh.r); });
        ex.shadow.used = true;
      }
      const W = work[0].w === '' ? L.w0 : Number(work[0].w);
      const tgt = Number(work[0].r);
      const low = Number(pe.reps), top = Number(pe.repTop);
      const done = [];
      work.forEach((s, i) => {
        const last = i === work.length - 1;
        const c = capAt(n, W, wk) + sNoise + U(-0.5, 0.5) + rust + bad - i * (cfg.fatigue == null ? 1 : cfg.fatigue);
        let reps;
        if (last) reps = Math.floor(c) - (L.cls === 'iso' ? 0 : 1);
        else reps = Math.min(tgt, Math.floor(c));
        reps = Math.max(1, reps);   // an obedient lifter grinds out at least one
        done.push({ w: String(W), r: String(reps), done: true, load: W });
      });
      if (!done.length) continue;
      if (Number(pe.repTop) > Number(pe.reps)) done[done.length - 1].out = true;   // commitSession()
      ex.sets = done;
      exs.push(ex);
      const fresh = capAt(n, W, wk);
      log.push({ n, sess: sessionN, ts: now, wk, M: strength(n, wk), presc, sh, used: !!(cfg.useShadow && sh && !inDeload),
        W, tgt, reps: done.map(s => Number(s.r)), A: Number(done[done.length - 1].r), low, top, step: Number(pe.inc) || 5,
        fresh, deload: inDeload, cls: L.cls });
    }
    const s = { id: 's' + sessionN, ts: now, endTs: now + 3600e3, routineId: r.id, key, name: r.name, variantId: v.id,
      exercises: exs, deload: inDeload };
    T.S.sessions.unshift(s);
    if (window.__afterSession) window.__afterSession(s);   // t39b: the coach looks at the log after each save
    // after the session the lifter opens Progress: deloadCheck()
    now += 2 * 3600e3;
    const dc = T.deloadCheck();
    const dst = T.deloadStatus();
    let started = false;
    if (dc && dc.level === 'high' && cfg.obeyDeload !== false) { ev('startDeloadWeek')(7); started = true; }
    sessLog.push({ sess: sessionN, ts: s.ts, wk, key, deload: inDeload, dc: dc ? dc.level : null,
      stalled: dst.stalled.map(x => x.name), judged: dst.judged.length, started });
    sessionN++;
    prevTs = s.ts;
    // next session
    let gap = [2, 3, 3, 3, 2, 4][Math.floor(rnd() * 6)];
    if (missedIdx < gapsAt.length && wk + gap / 7 >= gapsAt[missedIdx]) { gap = 10 + Math.floor(rnd() * 5); missedIdx++; }
    now = s.ts + gap * DAY;
  }
  // strength at the end for each lift
  const truth = {};
  Object.keys(lift).forEach(n => { truth[n] = { M0: strength(n, 0), M1: strength(n, 52), K: lift[n].K, w0: lift[n].w0 }; });
  return { log, sessLog, truth };
};
