# Cloud sprint 2026-11-08 (branch `cloud/sprint-1108`)

## Result (final run on v26.11, 17:55 CST)

| | v26.1 baseline | v26.11 |
|---|---|---|
| engine: prescriptions ≥1 step under what the lifter could do mid-range | 37.3% | **31.8%** (paired −5.5 ± 0.5 pts, z≈11) |
| engine: mean \|steps off\| | 0.82 | **0.68** |
| engine: over-loaded / unreachable per yr / flips per yr | 5.9% / 7.65 / 14.4 | 5.6% / 7.7 / 14.75 (noise) |
| engine: sessions progressing / light-lift median weeks at one load | 50.4% / 11.0 | 51.6% / 9.65 (within ~1.5 se) |
| rep-out landing (Use mode, target 85%) | 93.6% | 93.6% (shadow untouched) |
| real log (owner's export, kept out of repo): calls changed / load agreement | — / 62% | 1 of 102 / 61% |
| edit the session just finished | 5 taps, 2 scrolls | **3 taps, 0 scrolls** |
| start / log a set / finish | 1 / 1 / 2 taps | unchanged (already minimal) |
| active-workout controls < 24 px | 12 | **0** |
| active-workout controls with effective hit < 44 px | (121 by box) | 64; 0 overlaps, 0 stolen taps |
| critical axe (tabs + two sheets) | 4 + 9 | **0** |
| colour-contrast nodes light Today/active/Progress/History/Plan | 7/18/61/69/26 | 2/9/1/2/1 (dark 0) |
| offline after SW install | works | works |
| suites | 23 / 1,029 checks | **27 / 1,139 checks, 0 failures** |

Gym test plan: top of `ROADMAP.md`.

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

`tools/sprint/runall.sh` on v26.1: **23 suites, 1,029 checks, 0 failures** (t20–t41 incl. t39b).

### Gym usability

`PORT=8117 node tools/sprint/journeys.mjs` (390×844, real taps; full output in
`tools/sprint/journeys-baseline.txt`).

| journey | taps | scrolls |
|---|---|---|
| start today's workout (cold open) | 1 | 0 (Start bottom at 263 px) |
| log a prefilled set | 1 | 0 |
| log a set at +5 lb | 2 | 0 |
| finish (header Finish → Save) | 2 | 0 |
| whole 12-set workout | 15 | 4 |
| deload card accept / undo | 1 / 1 | 0 (no Undo on the accept toast) |
| **edit a past session** | **5** | **2** (History list starts at y≈2214 px; editor Save below the fold) |

Touch targets: active workout **121 of 126** controls under 44 px, **12 under
24 px** (warm-up index button 20×38 next to the 28×38 steppers — a mis-tap
flips a set to warm-up and re-renders). Finish sheet buttons 42 px.
axe-core: **4 critical** (Plan: unlabelled `.switch`, unlabelled repLow/repHigh
inputs), label-content-name-mismatch ×12 (warm-up buttons), colour contrast
serious on every screen (7 / 18 / 61 / 69 / 26 nodes on Today / active /
Progress / History / Plan). Offline after SW install: **works** (boots, logs,
persists).

Taps on the core loop are already minimal (1–2). The usability gains are in
hit size, a11y, and the past-session edit path.

## Plan: lanes

| lane | owner | target metric | owns |
|---|---|---|---|
| A engine | sonnet implementer (worktree) | behind ↓ > 2 paired se; over/unmeet/flips not worse | jump condition in `prescribe()` double-progression branch; BUILD/CACHE |
| B harness | sonnet implementer (worktree) | invariants: no NaN/negative/off-grid loads, progress after success, no double cut, deload sanity, bounded steps | `tools/test/t43-invariants.mjs`, yearsim (back-compat) |
| C usability | sonnet (worktree) | <24 px → 0; stepper/warm/finish hit ≥44 px; 0 critical axe; contrast down | CSS tokens, set-row/stepper sizes, aria labels |
| D usability | sonnet (worktree) | edit last session: 5 taps/2 scrolls → ≤3/0 | viewToday() last-session row, editSession() sticky Save |

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
- 16:48 Brief changed (owner via parent session): HARD STOP 19:00 CST. Handoff pushed by 18:45; 18:45–19:00 only reviewed finishing work; no wakeups at/after 19:00.
- 16:40 Cherry-picked v26.1 from review branch rather than redo it.
- 16:55 Rejected "target never slides below set 1": behind −0.5 pp (noise), progressing −7 pp (metric artefact, but no real gain).
- 16:50 Real export received; replay: prototype changes 1/102 calls, in the right direction.
- 16:45 Chose jump-rule redesign as lane A from a 3-variant prototype.

## Real-log replay (owner sent the export at 16:47; kept in the scratchpad, never committed)
`tools/review/replay.mjs` (from the review branch), v26.1 vs the near-miss
prototype: **1 of 102 real calls changes**, the same one at slack 1 and 2:
a curl at 8–12: after 12,12,9 the app had lowered the target to 10 (the
target slid off the rep-out); after 12,12,11 v26.1 said "go for 12" and the
prototype said add the step. He made the heavier load at the bottom of the
range when he took it himself, about a month later. the prototype asks for was made at the bottom of the range when he finally
took it, a month later. Supports lane A;

Real-log **load agreement** (replayed `prescribe()` load = load he used, non-deload,
84 exposures): v26.1 **62%** (52/84; he went heavier 14, lighter 18). The near-miss
prototype: 61% (the one changed call is a jump he took a month later, so it
counts as a disagreement). Agreement is a baseline, not a target: an override
is evidence, not truth (the review found overrides in 37% of exposures).
 no real call gets more aggressive
than what he went on to make.

## Wave 1 results
- **Lane B merged** (test-only, 817bdef): `t43-invariants` — 6 invariants over 8 seeds × 6 scenarios (39,760 exposures): no NaN/negative loads, loads always on the start+k·step grid, progress after a clean top, no double trend back-off, deload bounds/spacing, bounded step size. **All hold on v26.1**; five in-memory mutants each caught by the intended invariant. One documented exemption: during "Building reps before …" the target runs past the top (≈11% of prescriptions in prescribe mode, up to +9 reps on a 12–20 raise) — v25 behaviour, kept.
- Review #6 (trend reads "down" 25% at 4 sessions on a flat lift): reproduces only with whole-session ±1 noise; closed-loop through the real engine it is 4.8% at 4 sessions, 0% at 8. **Not worth a change this sprint** — backlog.

## Wave 2 results (17:00–17:25)
- **Lane A merged — v26.2 near-miss jump** (922e081 + review fixes 9cc1c5e). Rule: step up when every set but the last is at the top and the last (the rep-out) is within min(2, ⌊range/2⌋) of it, every planned set logged, rep-counted loaded lifts only. 20 seeds, paired vs v26.1, follow prescribe(): **behind 37.3% → 31.8% (−5.5 ± 0.5 pts)**, mean |steps off| 0.82 → 0.68 (−0.14 ± 0.01); over −0.2 ± 0.5, unmeetable +0.05 ± 0.86, flips +0.35 ± 0.54 (all inside noise). Progressing 50.4 → 51.6%. Always-Use mode unchanged (shadow untouched). t43 invariants 37/37 on it; t42 34/34. Real log: 1/102 calls change (the curl jump he made a month later); load agreement 62% → 61%.
  - Gate: fresh Opus review (no Important; fixed Minor 1 timed lifts, Minor 2 long assisted text) + `/code-review high` (fixed: skipped last set counted; narrow ranges 10,10,8 at 8–10 jumped; why length. Rejected: require the `out` flag — the one real-log case predates it; shadow disagreeing on the card — labelled as the other method, already disagrees elsewhere; helper refactor).
- **Lane D merged — v26.4 edit last session from Today** (0987a79 + fixes). Edit just-finished session: **5 taps / 2 scrolls → 3 taps / 0 scrolls**; editor Save/Cancel sticky. Gate: Opus review (no Important; fixed calendar-day label "Today/Yesterday"), `/code-review high` (fixed: dropped volume/deload info restored; scroll-padding so focused fields don't sit under the sticky bar). Verified by real taps at 390×844 (labels, editor opens with Save in view, 0 page errors).

## Wave 3 (17:25–17:45)
- v26.5: the session editor keeps its scroll position after + Set / warm-up / remove (reviewer nit on lane D; t45 fails on v26.4: 900 → 0 px).
- v26.6: coach card citations corrected (review #8, checked against RESEARCH.md). Text only.
- **Where the remaining "behind" is** (10 seeds, after v26.2): heavy lifts with small relative steps — Leg Press 100%, RDL 100%, Lat Pulldown 94%, Hamstring Curls 88% of exposures — and 0% on every light lift. Cause: double progression adds one rep per session, so a 5 lb step on 190 lb comes every 4–5 exposures, and the classic rule settles where the fatigued rep-out reaches top−2, i.e. fresh capacity ≈ top+1 — about 3 reps above the metric's mid-range "ideal". Part of this is the metric's definition, not an engine error; I'm reporting it, not chasing it.
- Rejected prototypes (both measured, paired vs v26.2, 20 seeds):
  - two steps when the rep-out is ≥ top+4 (OUT_JUMP2 in classic): behind +0.7 ± 0.3 pts, flips +0.4 ± 0.2 — worse.
  - let the target skip ahead to rep-out−2: behind −0.5 ± 0.1 pts. Real but tiny; not worth a behaviour change and a review cycle.

## Wave 4 (17:30–17:55)
- **Lane C merged as v26.9** after fresh Opus review (Important: 9 critical `label` violations in the editor and exercise-menu sheets the harness never opened — fixed, axe 0 critical on both; Minor: the stepper slop filled the "×" gutter so a tap there changed a value — now a ~5 px dead strip; switch slop 42.5 → 44+) and `/code-review high` (follow-ups below; rejected: brand-colour contrast on tinted chips — owner decision).
- v26.10–v26.11: Finish, + Set / − Set and the editor's controls get vertical hit-slop (no row grows); editor rows 44 px; Edit pill readable (accent on white was 2.9:1). `/code-review` on each.
- Harness fixes: DARK=0 meant dark; viewport not restored on error.
- 18:00 handoff docs pushed (ROADMAP, PROJECT_STATE traps 20–23, NEXT_SESSION).

## After the sprint (10 Nov, owner answers)
- Merge check: `main` (v26) is an ancestor of the branch — fast-forward, 34+ commits, no conflicts.
- No auto-scroll (owner).
- v26.12–13: sessions per week on Progress (last 8 calendar weeks, average over full weeks since the first session; t46), and readable coloured text: `--accent-ink/--good-ink/--bad-ink` for text, brand colours kept for fills. axe colour-contrast 0 in light and dark. Opus review: 2 Important (dark red text, faded banner text) fixed. 28 suites / 1,148 checks.

## Owner questions
0. **`main` is v21.** GitHub Pages serves `main`, and `main` holds v21:
   v22–v26 were never merged, so your phone runs v21 (check the BUILD line at
   the foot of Plan). Everything this sprint measured is v26.1+. Merge when
   you have reviewed it — nothing here touches `main`.
1. ~~Real export for replay~~ — received, used (see above).
3. Whole 12-set workout needs 4 swipes (journey 3b). Want the screen to scroll the next exercise into view when you tick the last set of one? It touches the logging path (Trap 1 forbids re-rendering there; a scroll is not a re-render), so I didn't do it unasked.
2. The review's biggest lever is frequency (1.4 → 2–3 sessions/week ≈ +8 pp
   strength/yr), not code. Want a sessions-per-week vs target line on Progress?

## Wave log
- Wave 0 (16:37–16:50): baseline, plan, lanes A/B/C/D launched.
- Wave 1 (16:50–17:00): lane B merged.
- Wave 2 (17:00–17:25): lanes A and D merged after review; lane C in review.
- Wave 3 (17:25–17:45): editor fixes, citations, two engine prototypes rejected.
- Wave 4 (17:30–17:55): lane C merged, hit-area follow-ups, final run, handoff.
