/* Phase 2 closed loop, run INSIDE the hooked app page. The engine is the app's
   own code (makeSessionEx -> prescribe, nextRoutine,
   deloadCheck/startDeloadWeek, coachRun); only the lifter and the two
   baselines (DP, LIN) are written here. The lifter model is mine and does not
   borrow from tools/test/yearsim.js (not read while writing this).

   window.SIM.run(cfg, li) simulates lifter `li` for cfg.weeks weeks starting
   from Nick's real log, and returns compact exposure records. */
(function () {
  const T = window.__t;
  const A = T.ev(`({makeSessionEx, nextRoutine, nextVariantIx, variantAt, variantLabel, inDeloadWeek, deloadCheck,
    startDeloadWeek, repOutApplies, working, workLoad, isAt, num, normName, exWorking, coachRun, coachState, uid,
    today, stepFor, movementClass, eachPlanEx, schemeOf: typeof schemeOf === 'function' ? schemeOf : () => 'double'})`);
  // The loop must not touch storage, the DOM or the network.
  T.ev('writeNow=function(){}; save=function(){}; render=function(){}; coachRefresh=function(){}');
  window.__initState = JSON.stringify(T.S);

  /* ---------- deterministic randomness: common random numbers ----------
     Every draw is a hash of (lifter seed, what it is for), never a stream
     position, so two engines that make different choices still see the same
     lifter, the same schedule, the same day-to-day noise. */
  function h32(parts) {
    let h = 2166136261 >>> 0;
    for (const x of parts) {
      const s = String(x);
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      h ^= 0x2f; h = Math.imul(h, 16777619);
    }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return ((h >>> 0) + 0.5) / 4294967296;
  }
  const U = (...a) => h32(a);
  const N = (...a) => Math.sqrt(-2 * Math.log(U(...a, 'a'))) * Math.cos(2 * Math.PI * U(...a, 'b'));
  const LN = (med, sd, ...a) => med * Math.exp(sd * N(...a));

  const DAY = 864e5;
  const MAIN = ['leg press', 'incline db press', 'cable row', 'bulgarian split squat', 'db overhead press', 'lat pulldown', 'rdl', 'db row'];
  const SKIP = /face\s*pull/i;          // Nick doesn't do face pulls; he skips them

  /* Reps-to-failure scale E in RTF(p) = 1 + E(1/p - 1), from the medians of
     Nuzzo et al. 2024 (Sports Med, 10.1007/s40279-023-01937-7) and its open
     dataset (which carries Hoeger 1990 and Shimano 2006): leg press ~45, rows
     and pulldowns ~33, chest press ~29, curls ~25, triceps ~32, leg curl ~21,
     leg extension ~25. No data for lateral raises (general ~30) or RDL / split
     squats (35: between the squat's ~44 and the general ~30). */
  function baseE(name) {
    const n = name.toLowerCase();
    if (/leg press/.test(n)) return 45;
    if (/hamstring|leg curl/.test(n)) return 21;
    if (/leg ext/.test(n)) return 25;
    if (/split squat|rdl|deadlift/.test(n)) return 35;
    if (/pulldown|row/.test(n)) return 33;
    if (/press/.test(n)) return 29;
    if (/tricep|pushdown|extension/.test(n)) return 32;
    if (/curl/.test(n)) return 25;
    return 30;                                                   // lateral raise, fly, anything else
  }

  function rtf(p, E) { return p <= 0 ? 99 : 1 + E * (1 / p - 1); }       // reps to failure, real-valued
  /* Strength stimulus per set. Proximity to failure barely matters for
     strength (Robinson 2024, 10.1007/s40279-024-02069-2: null RIR slope for
     strength), so a far-from-failure set loses at most 30%; heavier loads gain
     more 1RM (Schoenfeld 2017, 10.1519/JSC.0000000000002200). */
  function prox(rir) { return Math.max(0.7, Math.min(1, 1 - 0.05 * Math.max(0, rir - 3))); }
  function inten(p) { return Math.max(0.6, Math.min(1.15, p / 0.75)); }
  const PHI = 0.03, TAU_F = 7, FREF = 3;
  let LOSS = 0.3;

  /* ---------- the two baselines ---------- */
  function dpPrescribe(name, pe) {
    const lo = A.num(pe.reps) || 8, top = A.num(pe.repTop) || 0, step = A.stepFor(pe), n = A.num(pe.sets) || 3;
    const h = A.exWorking(name); if (!h.length) return { w: '', r: lo, sets: n, kind: 'new' };
    const W = A.workLoad(h[0].sets, 0), at = h[0].sets.filter(s => A.isAt(s, W, 0)), m = Math.min(...at.map(s => A.num(s.r)));
    if (top > lo) {
      if (m >= top) return { w: W + step, r: lo, sets: n, kind: 'up' };
      return { w: W, r: m >= lo ? Math.min(top, m + 1) : lo, sets: n, kind: m >= lo ? 'reps' : 'hold' };
    }
    return m >= lo ? { w: W + step, r: lo, sets: n, kind: 'up' } : { w: W, r: lo, sets: n, kind: 'hold' };
  }
  function linPrescribe(name, pe, st) {
    const lo = A.num(pe.reps) || 8, top = A.num(pe.repTop) || 0, step = A.stepFor(pe), n = A.num(pe.sets) || 3;
    const R = top > lo ? Math.min(top, lo + 2) : lo;
    const h = A.exWorking(name); if (!h.length) return { w: '', r: R, sets: n, kind: 'new' };
    let W = A.workLoad(h[0].sets, 0);
    const at = h[0].sets.filter(s => A.isAt(s, W, 0)), m = Math.min(...at.map(s => A.num(s.r)));
    const k = A.normName(name), s = st[k] || (st[k] = { cnt: 0, miss: 0, every: Math.max(1, Math.round(step / (0.01 * W))) });
    s.miss = m < lo ? s.miss + 1 : 0;
    if (s.miss >= 2) {
      let b = Math.round(W * 0.9 / step) * step; if (b >= W) b = W - step;
      s.miss = 0; s.cnt = 0; return { w: Math.max(step, b), r: R, sets: n, kind: 'deload' };
    }
    if (++s.cnt >= s.every) { s.cnt = 0; return { w: W + step, r: R, sets: n, kind: 'up' }; }
    return { w: W, r: R, sets: n, kind: 'reps' };
  }
  function baselineEx(pe, p) {
    const sets = []; for (let i = 0; i < p.sets; i++) sets.push({ w: p.w === '' ? '' : String(p.w), r: String(p.r), done: false });
    return { id: A.uid(), planId: pe.id, name: pe.name, targetReps: p.r, reps: A.num(pe.reps) || p.r, repTop: A.num(pe.repTop) || 0,
      inc: pe.inc || null, bw: 0, bar: 0, metric: 0, link: !!pe.link, mg: pe.mg || '', mg2: (pe.mg2 || []).slice(),
      supplemental: false, note: '', why: '', kind: p.kind, lastW: null, lastR: null, sets };
  }

  /* ---------- the lifter ---------- */
  function makeLifter(cfg, li) {
    const seed = 'L' + li + '|' + (cfg.popSeed || 0);
    const V = cfg.variant;
    const g = LN(V.gMed, V.gSd, seed, 'g');                    // annual gain at the reference stimulus
    const L = { seed, g, lifts: {}, lin: {}, plateau: null };
    if (U(seed, 'plateau?') < 0.5) L.plateau = MAIN[Math.floor(U(seed, 'plateau-lift') * MAIN.length)];
    // Starting strength from Nick's last exposure of each lift, with unknown reps in reserve.
    const S = T.S, seen = {};
    S.sessions.forEach(s => s.exercises.forEach(e => {
      const k = A.normName(e.name); if (seen[k]) return;
      const sets = A.working(e.sets).filter(x => x.done !== false && A.num(x.r) > 0); if (!sets.length) return;
      seen[k] = 1;
      const W = A.workLoad(sets, 0), at = sets.filter(x => A.isAt(x, W, 0)), m = Math.min(...at.map(x => A.num(x.r)));
      const E = baseE(k) * V.Emul * LN(1, 0.12, seed, 'E', k);
      /* Fresh capacity c1 must make his last logged sets feasible under the
         rep-loss model (a flat 40x12,12,12 needs ~16 in the tank, not 13), plus
         0-2.5 reps of reserve nobody can see because he stops at the target. */
      const rs = at.map(x => A.num(x.r));
      let c1 = Math.max(...rs);
      for (; c1 < 60; c1 += 0.05) {
        let c = c1, ok = true;
        for (const r of rs) { if (c < r) { ok = false; break; } c -= LOSS * r * Math.pow(Math.min(1, r / c), 3); }
        if (ok) break;
      }
      const R = c1 + 2.5 * U(seed, 'rir0', k);
      L.lifts[k] = { M: W * (1 + (R - 1) / E), E, gl: LN(1, 0.3, seed, 'gl', k), F: 0, Ft: 0, lastT: s.ts, M0: 0, hist: [] };
    }));
    return L;
  }
  function liftOf(L, name, t) {
    const k = A.normName(name);
    if (!L.lifts[k]) {                                          // never done (e.g. Cross-body Tricep Extensions)
      const E = baseE(k) * L.Emul;
      L.lifts[k] = { M: 30 * LN(1, 0.2, L.seed, 'newM', k), E, gl: LN(1, 0.3, L.seed, 'gl', k), F: 0, Ft: t, lastT: t, M0: 0, hist: [] };
    }
    return L.lifts[k];
  }

  /* Perform one exercise as prescribed. Non-final sets stop at the target if
     he can; the last set of a ranged lift is the app's rep-out (compounds 1
     short of failure, isolation to failure) for EVERY engine, so engines are
     compared on their decisions, not on a different set protocol. */
  function perform(cfg, L, ex, t, si) {
    const V = cfg.variant, k = A.normName(ex.name), P = liftOf(L, ex.name, t);
    // detraining after 3 weeks off this lift
    const gap = (t - P.lastT) / DAY;
    if (gap > 21) P.M *= Math.max(0.85, 1 - 0.005 * (gap - 21) / 7);
    P.F = P.F * Math.exp(-(t - P.Ft) / DAY / TAU_F); P.Ft = t;
    const Mday = P.M * (1 - PHI * P.F / FREF) * (1 + V.dayNoise * N(L.seed, 'day', si, k));
    const work = ex.sets.filter(s => !s.warm);
    /* W is the top (first working) set: what the metrics read. A top + back-offs lift
       does its later sets at their own, lighter loads. */
    let W = A.num(work[0] && work[0].w);
    if (!(W > 0)) {                                             // he picks a start: about low+3 in the tank
      const step = A.stepFor(ex), lo = A.num(ex.reps) || 8;
      W = Math.max(step, Math.floor(P.M / (1 + (lo + 2) / P.E) / step) * step);
      work.forEach(s => { s.w = String(W); });
    }
    const ranged = A.repOutApplies(ex), iso = A.movementClass(ex.name) === 'iso';
    /* Fatigue is carried as the fraction of capacity left, so a lighter back-off
       starts from its own (larger) capacity, scaled by what the top set took. */
    let fr = 1, eff = 0;
    const perf = [];
    work.forEach((s, i) => {
      const Ws = A.num(s.w) > 0 ? A.num(s.w) : W;
      const c0 = rtf(Ws / Mday, P.E);
      let c = c0 * fr;
      const tgt = A.num(s.r) || A.num(ex.targetReps);
      const last = ranged && i === work.length - 1;
      let r;
      if (last) r = Math.floor(c - (iso ? 0 : 1) + 0.8 * N(L.seed, 'rir', si, k, i));
      else r = Math.min(tgt, Math.floor(c));
      r = Math.max(0, Math.min(r, Math.floor(c)));
      let logged = r;
      if (r >= tgt && U(L.seed, 'tick', si, k, i) < V.tick) logged = tgt;   // ticks the prefill
      const rir = Math.max(0, c - r);
      eff += prox(rir) * inten(Ws / P.M);
      /* Rep loss into the next set: 30% of the reps for a set taken to failure,
         much less for one stopped short. Sets to failure at 70% with 2-min rest
         lose ~52% (Heredia-Elvar 2022, 10.3390/biology11060851); his rest is
         3 min, which keeps more (Willardson & Burkett 2006, 10.1519/R-17735.1). */
      c = Math.max(0, c - LOSS * r * Math.pow(Math.min(1, r / Math.max(c, 1e-9)), 3));
      fr = c0 > 0 ? c / c0 : 0;
      perf.push(r);
      s.r = String(logged); s.done = logged > 0; s.ts = t + 60e3 * (8 + 3.2 * (si % 7) + 3.2 * i);
    });
    // adaptation after the session
    const plateaued = L.plateau === k && t >= cfg.t0 + 20 * 7 * DAY;
    const gAnn = plateaued ? 0 : L.g * P.gl;
    const M0 = P.M;
    P.M *= 1 + gAnn / 26 * eff / 3;
    P.F += eff; P.lastT = t;
    return { W, perf, eff, Mbefore: M0, Mday };
  }

  /* Training days: ~1.44 sessions a week with 20% of weeks missed, as in the
     log (21 sessions in 15 weeks, 4 empty weeks). */
  function weekDays(seed, w, sched) {
    const u = U(seed, 'wk', w);
    const k = sched === 'stated'                                // "2-3 times a week" as he states it (extra variant)
      ? (u < 0.05 ? 0 : u < 0.15 ? 1 : u < 0.5 ? 2 : 3)
      : (u < 0.2 ? 0 : u < 0.52 ? 1 : u < 0.84 ? 2 : 3);
    const pat = [[], [1], [0, 3], [0, 2, 4]][k];
    const sh = U(seed, 'sh', w) < 0.5 ? 0 : 1;
    return pat.map(d => d + sh);
  }

  function run(cfg, li) {
    T.ev('S=JSON.parse(window.__initState)');
    const S = T.S;
    S.coach = { proposals: [], history: [], lastCheck: 0 };
    S.settings.deloadUntil = 0; S.settings.deloadSnooze = 0;
    /* cfg.topback: lifts (lower-case names) whose plan rows become one top set + back-offs. */
    if (cfg.topback) A.eachPlanEx(e => { if (cfg.topback.includes(A.normName(e.name))) e.scheme = 'topback'; });
    LOSS = cfg.variant.loss ?? 0.3;
    const L = makeLifter(cfg, li); L.Emul = cfg.variant.Emul;
    Object.values(L.lifts).forEach(P => { P.M0 = P.M; });
    const recs = [], coach = [], deloads = [];
    let si = 0;
    for (let w = 0; w < cfg.weeks; w++) {
      for (const d of weekDays(L.seed, w, cfg.variant.sched)) {
        const t = cfg.t0 + (w * 7 + d) * DAY + 18 * 36e5;
        window.__now = t;
        // He takes the deload week the app asks for at "high" (pre-registered).
        if (cfg.engine === 'classic' && !cfg.noDeload && !A.inDeloadWeek()) {
          const dc = A.deloadCheck();
          if (dc && dc.level === 'high') { A.startDeloadWeek(7); deloads.push(t); }
        }
        const r = A.nextRoutine(), vix = A.nextVariantIx(r), v = A.variantAt(r, vix);
        const deload = A.inDeloadWeek();
        const exs = v.exercises.filter(pe => !SKIP.test(pe.name)).map(pe => {
          if (cfg.engine === 'dp') return baselineEx(pe, dpPrescribe(pe.name, pe));
          if (cfg.engine === 'lin') return baselineEx(pe, linPrescribe(pe.name, pe, L.lin));
          return A.makeSessionEx(pe, pe.id);
        });
        const sess = { id: A.uid(), ts: t, date: A.today(), routineId: r.id, key: r.key, name: r.name, variantId: v.id,
          variantName: A.variantLabel(r, vix), deload, note: '', exercises: exs };
        exs.forEach(ex => {
          const work0 = ex.sets.filter(s => !s.warm);
          const pw = A.num(work0[0] && work0[0].w), pr = A.num(ex.targetReps), ps = work0.length;
          const P = liftOf(L, ex.name, t);
          const o = perform(cfg, L, ex, t, si);
          let logged = ex.sets.filter(s => !s.warm && s.done).map(s => A.num(s.r)), perf = o.perf, psN = ps;
          /* A top-set lift is scored on its top set alone, like the engine judges it: the metrics read one load per exposure. */
          if (A.schemeOf(ex) === 'topback') { logged = logged.slice(0, 1); perf = perf.slice(0, 1); psN = 1; }
          recs.push([Math.round((t - cfg.t0) / DAY), A.normName(ex.name), ex.kind || '', pw, pr, psN, deload ? 1 : 0, o.W,
            logged, perf, +o.Mbefore.toFixed(2), +P.M.toFixed(2), +P.E.toFixed(2), A.num(ex.reps), A.num(ex.repTop), A.stepFor(ex), 0]);
        });
        // commitSession(), minus the UI: rep-out flag by position, undone sets dropped, newest first
        sess.endTs = t + 75 * 60e3; sess.bw = A.num(S.settings.bodyweight); sess.deload = !!sess.deload || A.inDeloadWeek();
        sess.exercises.forEach(e => {
          if (!A.repOutApplies(e)) return;
          const wk = A.working(e.sets); wk.forEach(s => { delete s.out; });
          if (wk.length && wk[wk.length - 1].done) wk[wk.length - 1].out = true;
        });
        sess.exercises.forEach(e => { e.sets = e.sets.filter(s => s.done); });
        sess.exercises = sess.exercises.filter(e => e.sets.length);
        S.sessions.unshift(sess);
        if (cfg.coach) {
          const before = new Set(A.coachState().proposals.map(p => p.id));
          A.coachRun(false);
          A.coachState().proposals.forEach(p => {
            if (before.has(p.id)) return;
            const P = L.lifts[A.normName(p.lift)];
            coach.push([Math.round((t - cfg.t0) / DAY), p.kind, A.normName(p.lift), p.stage || 0]);
          });
        }
        si++;
      }
    }
    // true-M trajectory summary per lift for the coach's false-positive test
    const M = {}; Object.entries(L.lifts).forEach(([k, P]) => { M[k] = [+P.M0.toFixed(2), +P.M.toFixed(2), +P.E.toFixed(2)]; });
    return { li, g: L.g, plateau: L.plateau, recs, coach, deloads: deloads.map(x => Math.round((x - cfg.t0) / DAY)), M, sessions: si };
  }
  window.SIM = { run };
})();
