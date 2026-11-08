/* Pre-registered metrics (REVIEW.md §0.2), computed per lifter from the
   compact exposure records sim-page.js returns. Record layout:
   [0 day, 1 lift, 2 kind, 3 prescribedW, 4 prescribedReps, 5 prescribedSets, 6 deload, 7 W done,
    8 logged reps[], 9 performed reps[], 10 true1RM before, 11 true1RM after, 12 E, 13 low, 14 top, 15 step, 16 shadow used] */
export const MAIN = ['leg press', 'incline db press', 'cable row', 'bulgarian split squat', 'db overhead press', 'lat pulldown', 'rdl', 'db row'];
const e1 = (w, r) => (w > 0 && r > 0 ? w * (1 + r / 30) : 0);
const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);

export function liftMetrics(rows, days, M0, Mend) {
  const nd = rows.filter(r => !r[6] && r[7] > 0);
  const m = { n: nd.length, gain: M0 ? (Mend / M0 - 1) * 100 : null };
  if (nd.length < 2) return m;
  // observed e1RM slope, %/yr
  const xs = nd.map(r => r[0]), ys = nd.map(r => e1(r[7], Math.max(0, ...r[8])));
  const mx = mean(xs), my = mean(ys), sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  m.obsSlope = sxx && my ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx / my * 36500 : 0;
  // M2 share progressing
  let prog = 0;
  for (let i = 1; i < nd.length; i++) {
    const a = nd[i - 1], b = nd[i];
    if (b[7] > a[7] || (b[7] === a[7] && mean(b[8]) > mean(a[8]))) prog++;
  }
  m.progress = prog / (nd.length - 1);
  // M3 longest stall (weeks), tail to the end of the run included
  let best = 0, since = nd[0][0], longest = 0;
  nd.forEach((r, i) => { const y = ys[i]; if (y > best + 0.01) { if (i) longest = Math.max(longest, r[0] - since); best = y; since = r[0]; } });
  longest = Math.max(longest, days - since); m.stallWk = longest / 7;
  // M4a cuts, M4b drawdown
  let cuts = 0, peak = 0, dd = 0; const cutIx = [];
  nd.forEach((r, i) => {
    if (i && r[3] > 0 && r[3] < nd[i - 1][7]) { cuts++; cutIx.push(i); }
    peak = Math.max(peak, r[7]); dd = Math.max(dd, (peak - r[7]) / peak);
  });
  m.cuts = cuts; m.drawdown = dd * 100;
  // M5 hit rate
  const hj = nd.filter(r => r[3] > 0 && r[4] > 0);
  m.hit = hj.length ? hj.filter(r => r[8].length >= r[5] && r[8].every(x => x >= r[4])).length / hj.length : null;
  // M6 oscillation: three alternating load moves within 4 exposures
  const mv = []; for (let i = 1; i < nd.length; i++) { const d = Math.sign((nd[i][3] || nd[i][7]) - (nd[i - 1][3] || nd[i - 1][7])); if (d) mv.push([i, d]); }
  let osc = 0; for (let i = 2; i < mv.length; i++) if (mv[i][1] === -mv[i - 1][1] && mv[i - 1][1] === -mv[i - 2][1] && mv[i][0] - mv[i - 2][0] <= 4) osc++;
  m.osc = osc;
  // M7 death spiral: 2 cuts within 6 exposures while true 1RM is not falling
  let spiral = 0;
  for (let j = 1; j < cutIx.length; j++) {
    const a = cutIx[j - 1], b = cutIx[j];
    if (b - a <= 5 && nd[b][10] >= nd[Math.max(0, b - 5)][10]) spiral++;
  }
  m.spiral = spiral;
  // M8 permanent hold: >= 8 exposures with the same W and the same prescribed reps
  let run = 1, maxRun = 1;
  for (let i = 1; i < nd.length; i++) { run = (nd[i][7] === nd[i - 1][7] && nd[i][4] === nd[i - 1][4]) ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
  m.hold8 = maxRun >= 8 ? 1 : 0;
  // M9 stuck below a coarse jump: same W >= 12 weeks while true 1RM >= 1.10x what low reps at W+step need
  let stuck = 0, s0 = 0;
  for (let i = 1; i <= nd.length; i++) {
    if (i < nd.length && nd[i][7] === nd[s0][7]) continue;
    const a = nd[s0], b = nd[i - 1];
    if (b[0] - a[0] >= 84) {
      const need = (b[7] + b[15]) * (1 + ((b[13] || 8) - 1) / b[12]);
      if (b[10] >= 1.10 * need) stuck = 1;
    }
    s0 = i;
  }
  m.stuck = stuck;
  return m;
}

export function lifterMetrics(r, cfg) {
  const days = cfg.weeks * 7, by = {};
  r.recs.forEach(x => (by[x[1]] = by[x[1]] || []).push(x));
  const lifts = {};
  for (const [k, rows] of Object.entries(by)) {
    const M = r.M[k] || [0, 0];
    lifts[k] = liftMetrics(rows, days, M[0], M[1]);
  }
  const main = MAIN.filter(k => lifts[k] && lifts[k].gain !== null);
  // coach: false positives against the true trajectory, plateau detection
  const traj = k => (by[k] || []).map(x => [x[0], x[10]]);
  const Mat = (k, d) => { let v = null; for (const [t, m] of traj(k)) if (t <= d) v = m; return v; };
  const stall = r.coach.filter(c => c[1] === 'stall');
  const fp = stall.filter(c => { const a = Mat(c[2], c[0]), b = Mat(c[2], c[0] - 56); return a && b && a / b - 1 >= 0.02; }).length;
  let plateau = null;
  if (r.plateau) {
    const hit = stall.filter(c => c[2] === r.plateau && c[0] >= 140).sort((a, b) => a[0] - b[0])[0];
    plateau = { lift: r.plateau, detectedDay: hit ? hit[0] : null, missed: !hit || hit[0] > 140 + 112 };
  }
  const kinds = {}; r.coach.forEach(c => { kinds[c[1]] = (kinds[c[1]] || 0) + 1; });
  return {
    li: r.li, g: r.g, sessions: r.sessions, deloads: r.deloads.length,
    M1: mean(main.map(k => lifts[k].gain)),
    obs: mean(main.map(k => lifts[k].obsSlope ?? 0)),
    lifts,
    coach: cfg.coach ? { cards: r.coach.length, kinds, stall: stall.length, fp, plateau } : null,
  };
}
