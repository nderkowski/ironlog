# Cloud sprint 2026-11-08 (branch `cloud/sprint-1108`)

Time-boxed sprint, 16:37–19:00 CST (22:37–01:00 UTC). Owner offline. Nothing
here is on `main`; the phone still runs v26 until the owner merges.

## Baseline (measured on this branch, not copied from docs)

Build: v26 + v26.1 cherry-picked from `review/independent` (b362cab, the
two-ranges `rangeHist` fix the independent review made and tested with t41).
v26.1 does not change the simulated year (no lift in the recommended plan is
held at two ranges) — numbers identical to v26.

### Engine — `node tools/sprint/yearbase.mjs 20` (20 seeds × 52 weeks, real `prescribe()`/`shadowPrescribe()`/`deloadCheck()`)

| metric | follow prescribe() | always tap Use |
|---|---|---|
| sessions progressing (load up or target up) | **50.4%** (sd 2.2) | 53.7% (sd 1.4) |
| light/isolation lifts: median weeks at one load | **11.0** (sd 4.2) | 9.6 |
| … 90th percentile / max | 32.1 / 42.5 | 34.8 / 47.3 |
| weight flips per year (all lifts) | 14.4 (sd 4.0) | **17.8** (sd 4.3) |
| rep-out landing ≥ low (target 85%) | — | **93.6%** (sd 1.0) |
| unmeetable loads per year | 7.65 | 5.9 |
| **new: ≥1 step lighter than the heaviest load where fresh reps ≥ mid-range** | **37.3%** (sd 1.7) | 37.4% |
| new: ≥1 step heavier than that | 5.9% | 1.9% |
| new: mean \|steps off\| | 0.82 | 0.71 |

The v24.1 headline (40% progressing) is stale: v25 is at 50–54%. Landing
(93.6%) already clears the 85% gate. Flips are 14–18 a year, not 198.

**Why "weeks stuck" is not the target.** The simulated lifter gains 5–15% a
year. A 5 lb step on a 15 lb raise is +33%, on a 30 lb curl +17%: sitting at
one load most of the year is *correct* there, by construction. "Stuck" is
mostly load granularity, not engine error (`tools/sprint/stuckdiag.mjs`: every
lift, heavy or light, spends ~50 of 52 weeks in ≥6-week runs). So I added a
two-sided accuracy metric against the simulated truth: how often the
prescription trails the heaviest grid load the lifter could do mid-range.
That is 37% — the real structural bottleneck — and it is caused by:

- **The jump needs every set at the top, and the last set is a rep-out.**
  Sets 1–2 stop at the target; the rep-out ends 1–2 reps under from fatigue.
  12,12,11 at 8–12 holds. Then the next target comes from the *minimum*
  (`minR+1`), so the target saws 10 → 9 → 10 (the review's "RDL permanent
  hold", finding 5). Prototype: jump when all non-last sets ≥ top and the
  rep-out ≥ top−1 → behind 37.3% → 33.7%; top−2 → 31.9%; over-loading,
  unmeetable loads and flips unchanged. Patching the target slide alone
  (target never below set 1) moved behind 0.5 pp — noise — and lowered
  "progressing" (it removes the fake 9↔10 "progress"), so rejected.

### Correctness — t20–t41

See `tools/sprint/runall.sh`. Baseline result: _(filled in below when the run lands)_

### Gym usability

Journey harness being built (lane C): taps/time for start, log, finish,
coach card accept/undo, edit past session; touch targets; axe-core; offline.
_(numbers below when it lands)_

## Plan: lanes

| lane | owner | target metric | owns |
|---|---|---|---|
| A engine | sonnet implementer (worktree) | behind ↓ > 2 paired se; over/unmeet/flips not worse | jump condition in `prescribe()` double-progression branch; BUILD/CACHE |
| B harness | sonnet implementer (worktree) | invariants: no NaN/negative/off-grid loads, progress after success, no double cut, deload sanity, bounded steps | `tools/test/t43-invariants.mjs`, yearsim (back-compat) |
| C usability | sonnet (worktree) → then fix lane | taps/time/targets/axe from journey script | measurement first; UI fixes after numbers |

Why the jump rule beats patching symptoms: the stuck/slide/oscillation
reports all come from one condition (`minR>=top` with a fatigued rep-out in
`minR`). Changing what counts as "made the top" fixes the root; patching the
target slide or adding stall cards would each treat one symptom.

Review findings (from `review/independent`, verified where noted):
- #2 lateral raise two ranges → **taken** (v26.1 cherry-pick).
- #5 RDL permanent hold → addressed by lane A (verified the mechanism in
  `stuckdiag` output: RDL 230 saws 10,10,8 → 9 → 10 for 30+ weeks).
- #6 trend back-off from 4 points → lane B measures the claim first.
- #7 coach stall latency, #8 two wrong citations, #9 unit snapping → backlog.
- #1 frequency, #3 overrides → not code; owner questions.

## Quality gate per change
before/after yearbase (paired per seed) + full t-suite → fresh Opus reviewer
on the diff + `/code-review high` → Playwright run of the changed flow at
390×844 → merge.

## Decision log
- 16:40 Cherry-picked v26.1 from review branch rather than redo it.
- 16:55 Rejected "target never slides below set 1": behind −0.5 pp (noise), progressing −7 pp (metric artefact, but no real gain).
- 17:00 Chose jump-rule redesign as lane A from a 3-variant prototype.

## Owner questions
1. Lane A changes when a lift steps up. Trap 17c says replay the real export
   before trusting a prescription change; the export is not in this public
   repo. Can you drop `ironlog-*.json` at the repo root (gitignored) for the
   next session to replay `tools/review/replay.mjs`?
2. The review's biggest lever is frequency (1.4 → 2–3 sessions/week ≈ +8 pp
   strength/yr), not code. Want a sessions-per-week vs target line on Progress?

## Wave log
- Wave 0 (16:37–17:10): baseline, plan, lanes A/B/C launched.
