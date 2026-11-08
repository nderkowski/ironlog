# Independent review: Iron Log progression engine and coach (build v26)

*Verdict: pending. This commit contains §0 only. Its timestamp shows the criteria were fixed before any result was computed.*

## §0 Pre-registration (written 2026-11-08, before any analysis of outcomes)

**What I had read when I wrote this:** the engine and coach source in `index.html` (`prescribe`, `shadowPrescribe`, `workLoad`, `droppedSets`, `trend*`, `deload*`, `makeSessionEx`, `repOutScore`, `coach*`); the export's schema, settings and plan. I had computed nothing about outcomes in the 21 sessions. I had not opened any review or history doc, `yearsim.js`, or `git log -p`.

**One fact that shapes the design:** Nick's export has no `repOutDefault`, and `normalize()` sets it to `false`. His prescriptions therefore come from `prescribe()`. The rep-out method (`shadowPrescribe`) is a shadow he can tap. I evaluate both:
- **E-classic** is his live configuration.
- **E-repout** is `repOutDefault=true`, which `makeSessionEx` uses wherever a rep-out exists.

### 0.1 Definitions
- **Exposure:** one lift in one session, using non-deload sessions only (as `exWorking` does).
- **Working load W:** `workLoad(sets)` from the app.
- **e1RM:** Epley, `w·(1+r/30)`.
- **Main lifts:** Leg Press, Incline DB Press, Cable Row, Bulgarian Split Squat, DB Overhead Press, Lat Pulldown, RDL, DB Row. Accessories are reported separately.
- **True 1RM:** the simulated lifter's latent strength (simulation only).
- **CI:** a percentile bootstrap over lifters (simulation) or over exposures (real log), with 2,000 resamples, at 95%.
- **Paired comparisons:** engines being compared see identical lifters and random streams (common random numbers).

### 0.2 Metrics and pass/fail thresholds (simulation, 52 weeks)

All values are per lift-year, using the median simulated lifter unless stated otherwise.

| # | Metric | Computation | Pass |
|---|---|---|---|
| M1 | **Strength gain (primary)** | (true 1RM at wk 52 − wk 0) / wk 0, per lift; mean over main lifts per lifter. Secondary: the OLS slope of observed weekly best e1RM (%/yr). | Engine ≥ double progression (DP): paired difference 95% CI lower bound > −0.5 pp. "Better" requires the lower bound > 0. |
| M2 | Share of exposures that progress | vs that lift's previous exposure: W heavier, or W equal and mean reps at W strictly higher | ≥ 50%, and not more than 5 pp below DP |
| M3 | Longest stall | longest run, in weeks, without a new best observed e1RM at W | median ≤ 8 wk; slow-responder decile ≤ 12 wk |
| M4a | Load cuts | exposures whose prescribed load is easier than the previous exposure's W, excluding deload weeks | ≤ 3 per lift-year |
| M4b | Max drawdown | largest peak-to-trough fall in W as % of the peak, excluding deload weeks | median ≤ 15%; 90th percentile ≤ 25% |
| M5 | Prescription hit rate | exposures where every logged working set ≥ prescribed reps | inside 60–90%. Below 60% is overreaching; above 90% is under-asking. |
| M6 | Oscillation | prescribed load reversing direction (up→down or down→up) twice within 4 exposures | ≤ 1 per lift-year |
| M7 | Death spiral | ≥ 2 load cuts within 6 exposures while true 1RM is not falling | 0 in ≥ 95% of lift-years |
| M8 | Permanent hold | ≥ 8 consecutive exposures with the same W and the same prescribed reps | 0 in ≥ 95% of lift-years |
| M9 | Stuck below a coarse jump | same W for ≥ 12 weeks while true 1RM ≥ 1.10 × the 1RM needed for `low` reps at W+step | ≤ 5% of lift-years |

**Rule ablations.** Each rule (rep-out method, trend back-off, failed-jump memory, step-down, deload, target-echo +1) is switched off in turn on the same lifters. A rule is **justified** if removing it:
- lowers M1 (paired CI upper bound < 0), or
- worsens M3, M4 or M9 by more than the CI half-width,
- while not raising M1 by more than 0.5 pp.

Otherwise it is reported as **not shown to help**.

**Verdict rule ("is the engine reliably better than plain DP for Nick?").** The engine is E-classic, his live configuration; E-repout is reported beside it.
- **Yes:** M1 better than DP (CI > 0) in the base model **and** in ≥ 2 of the 3 untuned variants (§0.4), with no criterion among M2–M9 failed that DP passes.
- **No:** M1 not better in the base model, plus at least one M2–M9 criterion failed that DP passes. Or DP is better on M1 (CI < 0).
- **Unclear:** anything else.

### 0.3 Real-log metrics (21 sessions, 24 Jul – 6 Nov 2026)
- **R1 override rate**, by lift and by decision kind:
  - a load override: done W ≠ the W that `prescribe()` gives on replay (today's engine);
  - a rep override: the minimum reps at W ≠ the stored `targetReps` (what he saw).

  These are reported separately, because the stored `why`/`targetReps` came from older engines. Interpretation fixed in advance: a load-override rate above 30% means the closed-loop simulation's compliant lifter does not describe Nick.
- **R2 hit rate:** done reps ≥ stored `targetReps` on every working set, with a Wilson 95% CI.
- **R3 response after each decision kind:** progress (M2 definition) at the next exposure, after up, hold, reps (+1), deload/back-off, and drop-a-set.
- **R4 noise floor:**
  - Pairs of consecutive exposures at the same W: typical error TE = SD(Δ)/√2, and MDC95 = 1.96·√2·TE (Hopkins 2000; Weir 2005). This is done for the rep-out reps and for the session e1RM (%).
  - Every engine rule whose trigger is smaller than MDC95 is flagged.
- **R5 forecast skill:** rolling origin, from each lift's 3rd exposure on. The target is the minimum reps at W at the next exposure, using only earlier data.
  - The engine's implied forecast is the prescribed reps at the prescribed load.
  - The naive forecast is the last exposure's minimum reps (Epley-adjusted if the load changed, and also unadjusted).
  - The score is MAE, with a paired bootstrap CI of the difference. **Skill = engine MAE < naive MAE with the CI excluding 0.** Otherwise the result is "no demonstrated skill".
- With n this small, every real-log number carries an interval.

### 0.4 Lifter model (my own; `yearsim.js` is not read before §2 is done)

**Reps to failure** at fraction p of the 1RM: RTF(p) = 1 + E·(1/p − 1). E is set per lift from the primary/meta-analytic literature on reps at %1RM, with citations in §2. E is larger for leg press and machines, as those studies report.

**Adaptation:**
- A latent 1RM grows per exposure in proportion to the effective sets, scaled by the responder's rate, with a soft ceiling.
- A set's effectiveness falls with reps in reserve: 1 at RIR ≤ 3, linearly to 0 at RIR 8.
- Banister fitness–fatigue: the day's 1RM = latent × (1 − φ·fatigue / steady-state fatigue), with τ_fatigue = 7 d.
- Detraining after 14 days without an exposure.

**Noise:**
- day-to-day 1RM noise, with SD calibrated to the R4 noise floor;
- within-session rep loss across sets.

**Behaviour:**
- Missed weeks happen at a rate calibrated to the log.
- He loads exactly what is prescribed, on dumbbell grids of 5 lb per hand (coarse at 15–30 lb) and stack grids at the lift's `inc`.
- He stops non-final sets at the target if able. The last set is a rep-out: compounds 1 short of failure, isolations to failure.
- A **ticker** logs the prefilled target instead of his true reps (probability q) whenever he made at least the target.
- He takes a deload week when `deloadCheck()` returns `high`.

**Population and runs:**
- 200 lifters per setting. Responder rate is log-normal, from slow to fast, with the median calibrated to Nick's observed e1RM slope.
- Starting loads, ranges and rotation are Nick's real plan.

**Untuned variants** (no calibration applied):
- **V-noisy:** 2× day noise.
- **V-ticker:** q = 0.7.
- **V-flat:** E × 1.4, so more reps at a given %1RM.

**Engines:**
- E-classic and E-repout are the real `index.html` in Chromium, through the hook, with `Date.now` mocked.
- The baselines and ablations run on the same harness:
  - **DP:** hold until every set reaches the top, then +1 step and back to `low`. No cuts. The prefill is last-min+1.
  - **LIN:** fixed reps at low+2. +1 step every ⌈step / (1% of the starting W)⌉ exposures. After 2 consecutive misses of `low`, a 10% reset (the conventional linear-progression reset).

### 0.5 Property tests (the real `prescribe()` and `shadowPrescribe()`)
- 500 random histories per property.
- Pass = 0 counterexamples. Any counterexample is reported verbatim and shrunk.

### 0.6 Coach
`coachRun(true)` is run every 14 simulated days, and on the real log.
- **Cards** per lifter-year. Pass: median ≤ 12.
- **False positive:** a stall card on a lift whose true 1RM rose ≥ 2% over the previous 8 weeks. Pass: ≤ 20% of stall cards.
- **Miss:** an injected plateau (true-1RM growth stopped at week 20 for one main lift in 50% of lifters) with no stall card within 16 weeks. Detection latency is reported. Pass: ≤ 50% missed.

### 0.7 Predictions
`PREDICTIONS.md` gets, for each main lift, load × reps at its exposure nearest **2027-01-03** (8 weeks after the last session):
- under E-classic;
- under any change I propose;
- each with an 80% interval taken from the simulated population calibrated to him.
