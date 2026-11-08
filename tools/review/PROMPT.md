# Independent review of Iron Log's progression engine and coach

You're reviewing Iron Log (repo `nderkowski/ironlog`, build v26). It is a single-file lifting-log PWA (`index.html` + `sw.js`) for one lifter, Nick. Each session it prescribes his weight, reps and sets, and a coach suggests plan changes. The goal: a year from now, his log should show steady progress, not stalling. Find out whether the app actually does that, and where it doesn't, with evidence that depends on neither your opinion nor its authors'.

This is a pre-registered, falsifiable review. It is not a code-style review and not a list of ideas.

## Material — start from the raw sources
1. **Nick's exports** (`ironlog-*.json`). They are not in the repo: they are gitignored real training data, so never commit them. Nick attaches them to this session; if none are attached, ask for every export he has before Phase 1. The latest covers 21 sessions, 24 Jul – 6 Nov 2026. Each session exercise has:
   - `sets[{w,r,done,ts,load,pr}]`
   - `targetReps`
   - `why` (the reason text the app showed him)
   - `kind`
   - `lastW` / `lastR`
   - `reps` / `repTop` (the range)
   - `note`

   The prescribed **weight** is not stored, so reconstruct it by replay (Phase 1). Older engine versions made those sessions: the stored `why` / `targetReps` is what he saw, and replay gives what today's engine would say. Keep the two apart.
2. **`index.html`, read in full.** The engine:
   - `prescribe()`, and `shadowPrescribe()` (the rep-out method, now the default prescription when it applies; see `makeSessionEx`)
   - `workLoad()`, `droppedSets()`, `trend()`
   - deload logic
   - the coach: `coachRun()` and `coachRule*()`

   Work from the code itself, not a summary or an extract.
3. **`git log -p -- index.html`.** The commit messages record what was tried, measured and reverted.
4. **`tools/test/`**: 22 suites, about 1,018 checks, plus `tools/test/yearsim.js`. Treat yearsim's lifter model as suspect, because the engine's authors wrote it.

**Do not read** `ROADMAP.md`, `PROJECT_STATE.md`, `NEXT_SESSION.md`, `RESEARCH.md`, `PRODUCT.md`, the root `REVIEW.md`, `REVIEW_PROMPT.md`, `IMPLEMENT_PROMPT.md` or any other review/history doc until Phase 3. They hold earlier conclusions, including an external review and the verdicts on it, and would anchor you.

## Phase 0 — pre-register before any analysis
Create and work on the branch `review/independent` (never `main`). All your output goes in `tools/review/`; the root `REVIEW.md` is an older review, so leave it alone. Write `tools/review/REVIEW.md` §0: the metrics you will judge the engine by, how each is computed, and the pass/fail thresholds. At minimum:
- the per-lift strength slope over 52 simulated weeks (e1RM, or load at fixed reps)
- the share of sessions that progress (load, or reps at the same load)
- the longest stall
- load cuts per year, and maximum drawdown
- prescription hit rate (did he make the prescribed reps)
- on the real log, override rate (what he did ≠ what was prescribed), by lift and by decision kind

Commit and push §0 alone, so its timestamp shows the criteria came before the results.

## Phase 1 — measure the real log
- **Replay the real code.**
  1. Copy `index.html` and replace its line `var S=load();` with `var S=load(); window.__t={get S(){return S},prescribe:prescribe,shadowPrescribe:shadowPrescribe,coachRun:coachRun};`.
  2. Serve the copy with `npx http-server -p <port> -s -c-1 <dir>`.
  3. With Playwright, put the export in localStorage key `ironlog.v1` and reload.
  4. For each session, set `__t.S.sessions` to the sessions before it, and call `prescribe(name, planEx)` / `shadowPrescribe` for each lift.
  5. Output prescribed vs done, per lift and session.
- **Noise floor.** From repeat exposures at the same load, estimate the session-to-session SD of reps and of e1RM (state the formula). The last set of each lift is usually a rep-out, giving near-failure reps at a known load. Compute the minimal detectable change (1.96·√2·SEM), then flag every engine rule that acts on a change smaller than it.
- **Responses to each decision.** Override rate and hit rate, and what happened the session after each decision type: step up, hold, +1 rep, back off, drop a set, deload.
- **Rolling-origin forecast.** At each session, predict the next exposure's reps at the prescribed load using only earlier data. Score its MAE against the naive forecast "same as last time". If the engine's implied model can't beat naive, say so.
- **Sample size.** n is small: give intervals, not point claims.

## Phase 2 — stress the engine as a closed loop
- **Build your own lifter model, independent of `yearsim.js`.** It needs:
  - reps-to-failure as a function of %1RM, from primary literature (cite it)
  - an adaptation term (e.g. Banister fitness–fatigue)
  - rep noise matching Phase 1
  - missed weeks
  - a lifter who ticks the prefilled reps instead of his true reps
  - coarse dumbbell jumps (5 lb per hand at 15–30 lb)
  - a population from slow to fast responders

  Calibrate the median lifter to Nick's log.
- **Run the real engine**, through the hook in the browser (not a port), against that population for 52 weeks, over many seeds.
- **Baselines and ablations on the same population:**
  - plain double progression
  - small fixed linear increments
  - the engine with each rule switched off in turn: the rep-out method, trend back-off, failed-jump memory, step-down, deload, and the target-echo +1 nudge

  Report every metric with CIs. Each rule must beat its ablation, or say that it doesn't.
- **Failure modes to hunt:** oscillation; death spirals (cut → fail → cut); permanent holds; getting stuck below a coarse jump.
- **Property / metamorphic tests on the real `prescribe()`** (fast-check is fine). They need no ground truth. For example:
  - doing more reps never yields a lower prescription
  - adding warm-up sets below the working load changes nothing
  - an lb↔kg round trip gives equivalent prescriptions
  - reordering identical sets changes nothing
- **Coach.** Run `coachRun(true)` over the real log and the simulated population. Count cards per year, false positives (cards for a lifter who is progressing) and misses (no card for one who has stalled).

## Phase 3 — reconcile
Now read `PROJECT_STATE.md` (especially the numbered "traps"), `ROADMAP.md` and the earlier review verdicts. For each finding, say whether it:
- was already known
- contradicts a past decision, and whose evidence is stronger
- is new

## Threshold audit
Classify every number in the engine and coach as **trial evidence** (primary source with DOI), **convention**, or **arbitrary**. These include:
- rep ranges and step sizes
- `MAX_CUT` 20%
- the rep-out scorecard gate (≥ 9 uses at ≥ 85%)
- the trend window
- the stall rule (≥ 3 cycles, ≥ 8 exposures)
- the volume rule (< 6 weekly sets)
- the long-session rule (90 active minutes)

## Constraints
- **Branch only.** Don't touch `main`. Code changes are separate commits on your branch, each with:
  - a test
  - Phase 2 before/after metrics
  - the real-log replay diff

  All 22 suites must stay green (`npx http-server -p 8117 -s -c-1 .`, then `node tools/test/tNN-*.mjs`), or justify each changed expectation.
- **Private data.** Never commit exports or anything containing his training data. Never write API keys or tokens anywhere.
- **Nick's context:**
  - He doesn't do face pulls (no variation feels right).
  - Sessions up to 1.5 h are fine.
  - He trains 2–3 times a week with dumbbells, cables and machines, on an A/B/C full-body rotation.
- **Environment.** Chromium and Playwright are preinstalled; don't run `playwright install`.

## What shows you're right (not your judgment or the authors')
- pre-registered criteria committed before the results
- beating the baselines in simulation across seeds, with intervals, and across lifter-model settings you didn't tune
- forecast skill against naive on real sessions
- property tests passing or failing on the real code
- the existing suites as regression
- **`tools/review/PREDICTIONS.md`**: for each main lift, a dated prediction of load × reps 8 weeks out under the current engine, and under your proposed change if you make one, so his future log can score you

## Output
**`tools/review/REVIEW.md`**, led by a one-paragraph verdict: is this engine reliably better than plain double progression for Nick — yes, no or unclear — and why. Sections:
- §0 pre-registration
- §1 real-log findings
- §2 simulation table (engine vs baselines vs ablations)
- §3 failure modes
- §4 threshold audit
- §5 ranked recommendations, each with expected effect size and its evidence
- §6 reconciliation with past decisions

Also commit `tools/review/PREDICTIONS.md` and your scripts in `tools/review/`. Push your branch, and don't open a PR unless Nick asks.
