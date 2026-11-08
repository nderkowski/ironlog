# Independent review: Iron Log progression engine and coach (build v26)

**Reviewer's branch:** `review/independent`.
- §0 was committed alone first (`896e031`, 2026-11-08 21:35 UTC), before any result existed. It is unchanged below.
- Scripts are in this folder. Nick's export never enters the repo.
- One engine change is proposed as its own commit (v26.1, §5 #2 and the appendix).

## Verdict

**No: for Nick, this engine is not reliably better than plain double progression. In the closed loop it is very slightly worse.**

**The engine Nick actually runs** is E-classic (`prescribe()`): the rep-out default is off in his settings.
- **Primary metric (M1).** Against plain double progression (DP), on identical simulated lifters calibrated to his log, its 52-week true-1RM gain is lower by 0.20 percentage points (pp), 95% CI [−0.22, −0.18], on a median gain of about 9%. It is lower in every model setting, pre-registered or not: −0.17 to −0.57 pp. By the pre-registered rule that is a **No**.
- **Where the shortfall comes from.** The trend back-off and the step-down cost strength and add load cuts. Failed-jump memory is the one extra rule that earns its keep.
- **Its only failed criterion that DP passes** is M7, death spirals: 6.4% of lift-years. All of them come from one plan defect: the lateral raise is held at two rep ranges on two days under one name.

**The rep-out method (E-repout)** does beat DP on M1:
- +0.48 pp [+0.33, +0.66], and in all 3 untuned variants.
- The gain sits in fast responders: +1.3 pp in the top tertile, +0.0 in the bottom.
- It fails M7 (spirals in 21% of lift-years), and it has **zero real-world uses**. Nick's log ends two days before it shipped.
- So its verdict is **unclear**.

**Size of the differences.** Every engine difference here is under 1.2 pp of 1RM a year. That is far below what his log can detect: the MDC95 is 6% e1RM per session.

**What matters more for his progress:**
- **Frequency.** Training at the 2–3 sessions a week he intends, instead of the 1.4 he logged, is worth about +8 pp a year in the same model.
- **Following the prescription.** He overrides the load 37% of the time [27, 48].

The real-log forecast "skill" is self-fulfilling: he stops at the target, and the target is the forecast. The coach is quiet and rarely wrong (8% false stall cards), but it misses 89% of injected plateaus within 16 weeks.

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

## §1 Real-log findings

*Source: 21 sessions, 102 lift-exposures, 18 lifts, 24 Jul – 6 Nov 2026. Scripts: `replay.mjs` (today's engine, replayed session by session through the hook), `reallog.py`, `coach-reallog.mjs`. Intervals are Wilson 95% CIs or bootstrap 95% CIs.*

### 1.0 What the log can and cannot test

- **No rep-out flags at all.** There are 0 `out` flags in 102 exposures.
- **No rep-out suggestions and no coach state.** There are 0 `shadow` records and no `coach` key.
- **Nick has never trained on v24 or later.** Every v24–v26 commit is dated 8 Nov, two days after his last session. That covers the rep-out set, `shadowPrescribe`, failed-jump memory, the 21-day deload quiet and the coach.
- **Those features have no real-world record.** The rep-out method's ≥ 9-uses-at-85% gate cannot be scored on his data. Only `prescribe()` meets real data.
- **E-classic is his live default.** His settings have no `repOutDefault`, and `normalize()` defaults it to `false`. The prompt's "now the default prescription" holds only once he taps it on.
- **The early sessions don't fit the current setup.** Of the 102 exposures, 31 come from the first two weeks, which were straight sets with no range. Lateral raise appears under two ranges: 12–20 on Day A, 8–12 on Day B.

### 1.1 The log mostly records whether he reached the target, not his capacity

- 56% of sets at the working load (137/246) are logged exactly at the target he was shown.
- In 44% [34, 55] of exposures, *every* set equals the target.

With no rep-outs, the log can't say how much he had left. Every rule that reads reps is reading, in large part, the app's own prescription coming back.

### 1.2 Overrides (R1)

- **Load:** 37% [27, 48] of exposures were done at a load other than what today's engine prescribes on replay. 13 were heavier and 18 lighter.
  - This exceeds the pre-registered 30% line, so **a compliant simulated lifter does not describe Nick.** §2 tells you what the engine does *if followed*.
- **"Add load":** of 31 shown, he went heavier on 18, stayed on 10 and went lighter on 3.
- **Reps:** the minimum reps at the working load differed from the shown target in 45% [35, 56] of exposures.

| Shown decision | n | Load ≠ replayed | Reps ≠ shown | Hit (all sets ≥ target) |
|---|---|---|---|---|
| up | 31 | 19 | 13 | 30 |
| reps (+1) | 37 | 9 | 16 | 27 |
| hold | 14 | 1 | 7 | 8 |
| deload | 1 | 1 | 1 | 1 |

| Main lift | n | Load override | Rep override |
|---|---|---|---|
| Leg Press | 6 | 4 | 3 |
| Incline DB Press | 12 | 2 | 8 |
| Cable Row | 6 | 3 | 1 |
| Bulgarian Split Squat | 5 | 1 | 0 |
| DB Overhead Press | 6 | 0 | 2 |
| Lat Pulldown | 5 | 1 | 2 |
| RDL | 6 | 3 | 5 |
| DB Row | 5 | 1 | 2 |

### 1.3 Hit rate and what came next (R2, R3)

- **Hit rate:** 80% [71, 87], inside the 60–90% band pre-registered for M5. Judged against the replayed load and reps instead, it is 77% [64, 87].
- **Next exposure progressed** (heavier, or more mean reps at the same load):

| After the shown decision | Next exposure progressed |
|---|---|
| up | 88% [70, 96] (22/25) |
| reps (+1) | 70% [52, 83] (21/30) |
| hold | 64% [35, 85] (7/11) |
| all exposures | 75% [65, 83] |
| main lifts only | 73% [60, 83] |

### 1.4 Strength over 15 weeks

- **Median main-lift change in best e1RM at the working load:** +13% (mean of the first 3 exposures vs the last 3).
- **Spread:** RDL +61%, as he found his working weight. Incline DB Press +0.9%, with 10.7 weeks without a new best.
- **After the first 4 weeks:** the per-lift slopes run from −80% to +95% a year (median +7%). **The log cannot estimate his rate of progress.** The simulation therefore uses a wide population, centred on 10% a year.

### 1.5 Replay diff (today's `prescribe()` vs what he was shown)

Of 83 exposures past a lift's first:
- 11 change decision kind and 8 change target reps (12 differ in either);
- 5 of the 11 kind changes are in the first 16 days.

The later ones:

| Date | Lift | Shown | Today's engine |
|---|---|---|---|
| 23 Aug | Cable Row | +1 rep | hold |
| 1 Sep | Hamstring Curls | "back off to 100" | +1 rep |
| 4 Oct, 4 Nov | Lat Pulldown | "already backed off" | +1 rep |
| 29 and 30 Oct | Incline DB Press | "already backed off" | +1 rep |

All but one remove a back-off or "backed-off hold" that today's engine no longer gives. The 23 Aug Cable Row case goes the other way: +1 rep becomes a hold.

### 1.6 Noise floor (R4) and the rules that act inside it

**Measurement:** 35 pairs of consecutive exposures at the same load and range.
- **Reps:** typical error TE = SD(Δ)/√2 = 0.65 reps [0.44, 0.81]. MDC95 = 1.96·√2·TE = **1.8 reps**.
- **e1RM:** TE = 2.2% [1.4, 2.8]. MDC95 = **6.0%**.

He stops at targets, so these figures understate capacity noise and the MDCs are lower bounds. For comparison, 1RM test–retest CV has a median of 4.2% (Grgic 2020, [10.1186/s40798-020-00260-z](https://doi.org/10.1186/s40798-020-00260-z)).

**Rules that act on a change smaller than the MDC:**
- **`trend()`'s "down" at −2% per 3 sessions.**
  - The slope's 95% half-width at TE 2.2% is 5.7, 3.1, 2.4 and 2.0 percentage points at 4, 6, 7 and 8 points.
  - On a lift with a flat true trend, it reads "down" 25%, 10%, 5% and 2.4% of the time.
  - It computes from 4 exposures, and an 8–11 lift's window is 7.
  - Property P1 (§3.2) shows one extra rep in one set of the 4th-newest session turning "+1 rep" into "drop a set".
- **Failed-jump memory.** Its "cost" is a 1–3 rep difference between two single sessions.
- **Step-down right after a jump.** It acts on one session's best set below `low`.
- **The rep-out table's boundaries.** low−1, top and top+4 are each read off one set; ±1 rep changes the step.
- **Target-echo +1.** It fires on A = target exactly.
- **`deloadStatus`'s pct ≤ 0.** It sits at the noise mean, so a flat lift is called "stalled" half the time. That is why it needs ≥ 60% of lifts to agree.

### 1.7 Forecast skill (R5)

- **Setup:** 46 exposures done at the replayed load. The target is the minimum reps at that load.
- **Result:** engine MAE 0.50 vs naive ("same as last time") 1.57. The difference is −1.07 [−1.59, −0.59]; against the Epley-adjusted naive forecast it is −1.04.
- **This passes the pre-registered test, but it is not evidence of a model of his capacity.** The engine predicts the number it told him to stop at, and he stops there (§1.1).

### 1.8 Coach and deload check on the real log

- **Coach:** `coachRun(true)` raises 2 cards, both "Face pull keeps getting skipped" (4 of 4 on Day A, 4 of 4 on Day C). Both are correct: he doesn't do face pulls. No stall, volume or long-session card.
- **Deload check:** `deloadCheck()` returns nothing. 6 lifts judged, 0 stalled, 10 still waiting for exposures, and 1 left out as too wide (lateral raise at 12–20).

## §2 Simulation: engine vs baselines vs ablations

### 2.1 Method

**Engine: the real code, not a port.** `sim.mjs` builds hooked copies of `index.html` and runs `sim-page.js` inside Chromium. Each simulated session calls the app's own functions:
- `nextRoutine` / `nextVariantIx` (rotation)
- `makeSessionEx` (prescription, rep-out default, step-back)
- `deloadCheck` → `startDeloadWeek`, taken whenever it says `high`
- `coachRun(false)` after each save
- `commitSession`'s save rules: the rep-out flag by position, undone sets dropped

`Date` is mocked, including a bare `new Date()`, so `weekBounds` follows simulated time.

**Ablations are single source edits.** Each must apply exactly once or the run aborts:
- `abl-trend`: `false&&` on the trend back-off branch.
- `abl-jump`: the failed-jump blocks in both functions.
- `abl-step`: the step-down in `prescribe` (the "back to" block); in `shadowPrescribe`, k = −1 becomes a hold.
- `abl-echo`: the +1 nudge.
- "No deload": the lifter ignores `deloadCheck`.

**Baselines:**
- **DP:** hold until every set reaches the top, then +1 step. The prefill is last-min+1. No cuts.
- **LIN:** fixed reps at low+2, +1 step every ⌈step / 1% of W⌉ exposures, and a 10% reset after 2 misses.

**Lifter model.** Mine; `yearsim.js` was not read.
- **Start:** Nick's real log and plan (he skips face pulls), from 9 Nov 2026, for 52 weeks.
- **Starting 1RM per lift:** the smallest fresh capacity that makes his last logged sets feasible under the rep-loss model (a flat 40×12,12,12 needs about 16 in the tank), plus U(0, 2.5) reps of reserve he never shows because he stops at the target.
- **Reps to failure:** RTF(p) = 1 + E·(1/p − 1), with E per lift from Nuzzo 2024 ([10.1007/s40279-023-01937-7](https://doi.org/10.1007/s40279-023-01937-7)) and its dataset (Hoeger 1990, Shimano 2006). Leg press 45, rows/pulldowns 33, presses 29, curls 25, triceps 32, leg curl 21, leg extension 25, RDL/BSS 35, lateral raise 30 (no data). Each lifter-lift is perturbed by ×LN(0, 0.12).
- **Within a session:** the next set's capacity loses 0.30·r·(r/c)³ reps. That is 30% after a set to failure, and much less when a set is stopped short. Heredia-Elvar 2022 ([10.3390/biology11060851](https://doi.org/10.3390/biology11060851)) measured −52% after the first set at 2-min rest; he rests 3 min.
- **Set protocol:** non-final sets stop at the target if he can. The last set of a ranged lift is the app's rep-out for **every** engine: compounds 1 rep short, isolation to failure, with N(0, 0.8) error in judging it.
- **Ticking:** with probability q, he logs the prefilled target when he did at least that many. q = 0.25 in the base model.
- **Adaptation:**
  - Each set's stimulus = proximity × intensity.
    - Proximity: 1 at RIR ≤ 3, falling 0.05 per RIR to a floor of 0.7 (Robinson 2024, [10.1007/s40279-024-02069-2](https://doi.org/10.1007/s40279-024-02069-2): reps in reserve barely matter for strength).
    - Intensity: p/0.75, clamped to 0.6–1.15. 1RM gains favour heavier loads (Schoenfeld 2017).
  - The latent 1RM grows by g·g_lift/26 × (Σ stimulus)/3 per exposure.
    - g ~ LN(10%/yr, 0.6): slow to fast responders, 10th–90th percentile about 4.6–22%/yr.
    - g_lift ~ LN(0, 0.3).
  - Banister fatigue, τ = 7 d, lowers the day's 1RM by up to about 3%.
  - Detraining: 0.5% a week beyond 21 days off a lift.
  - Day noise SD 2% (his e1RM TE is 2.2%).
- **Plateau injection:** in 50% of lifters, one main lift stops adapting at week 20.
- **Schedule:** 0/1/2/3 sessions a week with probabilities 0.20/0.32/0.32/0.16, i.e. 1.44 a week and 20% of weeks empty, as in his log.
- **Common random numbers:** every draw is a hash of (lifter, purpose, session, lift, set), so every engine meets the same lifter, schedule and noise.
- **Runs:** 200 lifters per (engine × variant).

**Parameter history.** Every change was made before the full grid ran.
1. **A 40-lifter smoke test.** It ran the four main engines to debug the pipeline. I saw its table and do not report it.
2. **Literature values.** I then set the E table, the rep loss (0.2 → 0.3) and the proximity function to the values the literature check returned. The citations decided these; I did not check the direction of their effect against the smoke test.
3. **Starting-strength fix.** The first full grid was stopped part-way, and none of its output is used. The 8-week prediction had him doing DB Overhead Press 45×8,8,5, while he logged 45×8,8,8 on 4 Nov. Starting strength had been seeded as "0.5–3 reps in reserve", which contradicts his flat sets under the rep-loss model. It is now the feasibility rule above.

Two extra variants are **not pre-registered**:
- `lowloss`: rep loss 0.15.
- `stated`: the 2–3 sessions a week he states, against 1.44 in the log.

**Deviations from §0, all decided before the full grid ran unless marked:**
- **Set effectiveness.** §0.4 had it falling to 0 at RIR 8. It now floors at 0.7, because Robinson 2024 finds a null RIR slope for strength.
- **No soft ceiling.** §0.4 promised one; none is modelled, because over a single year it is negligible at about 10%/yr.
- **Detraining.** §0.4 started it at 14 days; it starts at 21.
- **Fatigue reference.** It is a fixed 3 effective sets rather than "steady-state fatigue".
- **Responder median: 10%/yr.** It is not fitted to his slope, which the log cannot estimate (§1.4: the post-week-4 median is +7%/yr, with the range spanning ±90%).
- **R4 noise floor.** It uses mean reps and e1RM at the working load, because there are no rep-outs to use.
- **Coach cadence.** `coachRun(false)` runs after every save, which applies the app's own 14-day gate. That is equivalent to §0.6's `coachRun(true)` every 14 days.
- **Coach cards are never answered.** The simulated lifter never taps a card, so cards expire after 28 days.
- **Ablation verdicts.** M3, M4a and M9 differences use paired per-lifter bootstrap CIs, which is my reading of "by more than the CI half-width".
- **Judging M2–M9.** M2–M5 are judged on the main lifts and M6–M9 on all lifts. Both views are printed.
- **Per-range scoring for v26.1** (added after v26.1 was built). A lift the plan holds at two ranges is also scored per range, for the before/after only. The pre-registered per-lift numbers are kept and shown.

### 2.2 Results: the base model

*200 lifters × 52 weeks per row, on v26. M1 is the median across lifters; ΔM1 is the paired mean with a 95% bootstrap CI.*

The **fails** column is judged against the §0 thresholds:
- M2–M5 are judged on the main lifts.
- M6–M9 are judged on all lifts.
- "(all lifts)" and "p90" are the second half of each two-part threshold.

| config | M1 gain % | ΔM1 vs DP, pp [95% CI] | obs e1RM %/yr | M2 progress | M3 stall wk (slow decile) | M4a cuts/lift-yr (all lifts) | M4b drawdown % (p90) | M5 hit | M6 osc/yr | M7 spiral | M8 hold≥8 | M9 stuck | deload wk/yr | fails |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **E-classic** (Nick's live engine) | 9.0 | −0.20 [−0.22, −0.18] | 7.8 | 53% | 22.7 (30.7) | 0.38 (0.93) | 0.0 (10.5) | 63% | 1.00 | 6.4% | 4.5% | 40.7% | 0.24 | M3, M7, M9 |
| **E-repout** | 9.5 | +0.48 [+0.33, +0.66] | 8.8 | 55% | 23.0 (31.7) | 1.25 (1.47) | 6.7 (16.7) | 58% | 0.53 | 20.8% | 0.0% | 34.1% | 0.21 | M3, M5, M7, M9 |
| **DP** (plain double progression) | 9.4 | — | 8.0 | 53% | 24.0 (33.4) | 0.00 (0.00) | 0.0 (0.0) | 59% | 0.00 | 0.0% | 9.5% | 40.5% | 0.00 | M3, M5, M8, M9 |
| **LIN** (small fixed increments) | 8.7 | −0.86 [−1.00, −0.73] | 7.7 | 50% | 23.1 (31.4) | 1.62 (1.30) | 9.4 (20.0) | 70% | 0.20 | 3.1% | 66.2%* | 47.2% | 0.00 | M3, M8, M9 |

\* LIN holds its reps fixed by design, so M8 is an artefact for it.

**Every engine fails M3 and M9, DP included.** Neither failure comes from the extra rules. Both come from double progression at his frequency:
- **M3 (longest stall).** A lift gets about 0.5 exposures a week and gains about 9% a year, which is 0.17% a week. A new e1RM best then needs months to clear 2% day-to-day noise.
- **M9 (stuck below the next step).** The load steps only when *every* set, including the rep-out on the tired last set, reaches the top of the range. Loads therefore sit about 10% below what he could lift for `low` reps at the next step.

### 2.3 Results across lifter-model settings (ΔM1 vs DP, pp, 95% CI)

| model | E-classic | E-repout | LIN | DP's M1 gain |
|---|---|---|---|---|
| base | −0.20 [−0.22, −0.18] | +0.48 [+0.33, +0.66] | −0.86 [−1.00, −0.73] | 9.4% |
| V-noisy (2× day noise) | −0.57 [−0.61, −0.53] | +0.42 [+0.27, +0.59] | −0.85 [−0.98, −0.73] | 9.3% |
| V-ticker (logs the prefill 70%) | −0.23 [−0.25, −0.20] | +0.10 [+0.01, +0.19] | −0.86 [−1.00, −0.74] | 9.4% |
| V-flat (E × 1.4) | −0.35 [−0.39, −0.32] | +0.33 [+0.18, +0.53] | −1.17 [−1.33, −1.02] | 10.3% |
| *lowloss (not pre-registered)* | −0.17 [−0.20, −0.15] | +0.39 [+0.25, +0.58] | −0.77 [−0.92, −0.63] | 10.0% |
| *stated: 2–3 sessions/wk (not pre-registered)* | −0.37 [−0.40, −0.34] | +1.23 [+0.82, +1.73] | −1.47 [−1.75, −1.22] | **17.8%** |

**By responder tertile** (base), ΔM1 vs DP:
- **E-classic:** slow −0.18, median −0.19, fast −0.23.
- **E-repout:** slow +0.01 [−0.03, +0.03], median +0.15, fast +1.26 [+0.88, +1.71].

**The last row is the largest effect in this review.** At his stated frequency, every engine gains about twice as much as at his logged frequency. The model assumes the gain scales with the sets he does, which is the dose-response the volume literature reports (Pelland 2026; Schoenfeld 2017). How strongly it scales is an assumption, but the direction is not.

### 2.4 Ablations: does each rule beat its own absence?

The columns are paired per lifter, as **with the rule − without it**.
- **ΔM1:** positive means the rule adds strength.
- **ΔM3, ΔM4a, ΔM9:** negative means the rule helps.
- **Verdict:** by the §0 rule. A rule is justified if removing it lowers M1, or significantly worsens M3, M4 or M9 while not raising M1 by more than 0.5 pp.
- **ΔM1 range:** the spread over the 4 pre-registered model settings.

| rule | engine | ΔM1 base | ΔM3 stall wk | ΔM4a cuts/lift-yr | ΔM9 stuck pp | ΔM1 range | verdict |
|---|---|---|---|---|---|---|---|
| trend back-off | E-classic | −0.12 [−0.14, −0.10] | −0.86 [−1.10, −0.65] | +0.20 [+0.17, +0.23] | −0.2 [−0.8, +0.4] | −0.12 to −0.45 | **justified by the letter** (on M3); **costs M1 in every setting** and adds cuts |
| failed-jump memory | E-classic | −0.00 [−0.01, +0.00] | +0.02 | −0.44 [−0.50, −0.39] | +0.3 | −0.01 to 0.00 | **justified**: prevents cuts at no cost; halves oscillation (M6 2.00 → 1.00) |
| step-down | E-classic | −0.06 [−0.08, −0.05] | −0.08 | +0.75 [+0.71, +0.79] | +0.2 | −0.05 to −0.11 | **not shown to help**. Without it, permanent holds rise from 4.5% to 8.8%. |
| deload week | E-classic | −0.01 | +0.05 | −0.01 | +0.2 | −0.01 to −0.03 | justified by the letter, on −0.01 cuts; **inert in practice** (0.16–0.48 deload weeks a year) |
| failed-jump memory | E-repout | −0.21 [−0.25, −0.19] | +0.65 | −1.83 [−1.90, −1.76] | +12.9 | −0.09 to −0.42 | **justified**: without it, cuts go +1.8/yr, spirals 21% → 41%, oscillation 0.5 → 4.2/yr |
| step-down (k = −1) | E-repout | −0.63 [−0.70, −0.57] | +0.11 | +1.46 [+1.42, +1.50] | +13.5 | −0.48 to −1.13 | **not shown to help**. Without it, holds ≥ 8 rise from 0% to 34% and hit rate falls to 47%. |
| deload week | E-repout | −0.02 | +0.09 | −0.01 | +0.1 | −0.01 to −0.03 | inert in practice |
| target-echo +1 | E-repout | +0.07 [+0.05, +0.09] | −0.24 | −0.01 | +1.4 | +0.05 to +0.34 (largest for the ticker) | **justified** |
| rep-out method | E-repout vs E-classic | +0.68 [+0.53, +0.86] | +0.26 | +0.49 [+0.44, +0.54] | −6.6 | +0.32 to +0.99 | **justified**; costs cuts and spirals |

**Caveat on the trend back-off.** My population has no genuine declines: no injury, no illness, only plateaus and detraining after gaps. The back-off exists for those declines, so this table cannot credit it for them. What it does show is the price on lifters who are *not* declining: 0.1–0.45 pp a year and 0.1–0.6 extra cuts per lift-year.

### 2.5 Coach (`coachRun` after every simulated session)

*Pass thresholds:* cards per lifter-year ≤ 12; false stall cards ≤ 20%; plateaus missed ≤ 50%.

| | E-classic | E-repout | Pass? |
|---|---|---|---|
| Cards per lifter-year: median (p90) | 9 (12) | 8 (10) | pass |
| Cards by kind (all lifters) | skipped 1,200 (face pulls; correct), stall 428, volume 298 | skipped 1,206, stall 187, volume 298 | |
| False stall cards (true 1RM up ≥ 2% over the previous 8 weeks) | 36/428 = 8% | 19/187 = 10% | pass |
| Injected plateaus missed within 16 weeks | 98/110 = **89%** | 107/110 = **97%** | **fail** |
| Median detection latency | 153 days | 160 days | |

**The stall rule is quiet by construction.** It needs ≥ max(6, 3 cycles) exposures at one load, which is 15 for an 8–12 lift. At his roughly 0.5 exposures per lift per week that takes about 30 weeks. At the stated 2–3 sessions a week, misses fall only to 82%, and false stall cards rise to 23%.

**On the real log** the coach raises exactly the 2 face-pull cards (§1.8).

## §3 Failure modes

### 3.1 Where they happen

*Base model, v26.* Each cell reads: load cuts per lift-year / % of lift-years with a death spiral / % stuck below the next step / % with a permanent hold (≥ 8 exposures). The rows shown are the ones that matter. `analyze.py` prints all 15 lifts.

| lift (Nick's plan) | E-classic | E-repout | DP |
|---|---|---|---|
| **Lateral Riase** (12–20 Day A, 8–12 Day B) | **9.9 / 96%** / 4% / 0% | 5.8 / 94% / 70% / 0% | 0.0 / 0% / 0% / 0% |
| RDL (8–11, at 225) | 0.2 / 0% / 46% / **50%** | 2.4 / **67%** / 49% / 0% | 0.0 / 0% / 44% / 52% |
| Incline DB Press | 0.6 / 0% / 82% / 0% | 1.9 / 25% / 70% / 0% | 0.0 / 0% / 86% / 0% |
| Bulgarian Split Squat (25 lb DBs) | 0.8 / 0% / 1% / 6% | 1.7 / 25% / 7% / 0% | 0.0 / 0% / 0% / 32% |
| DB Curl / Reverse Curl | 0.2 / 0% / 4–51% / 0–1% | 1.1–1.3 / 20% / 13–28% / 0% | 0.0 / 0% / 4–49% / 0–1% |
| Lat Pulldown / Leg Press / Hamstring Curls | 0.2–0.3 / 0% / 82–93% / 0% | 0.2–0.4 / 0–2% / 44–76% / 0% | 0.0 / 0% / 84–93% / 0% |

**1. Death spiral on the lateral raise: a new finding, and the one code change.**
- **The cycle:** Day A tops 12 at 15 lb, so Day B (8–12) steps to 20. Day A then misses 12 at 20, which is "right after a jump", so it goes back to 15. Repeat.
- **Scale:** in E-classic, every one of its spirals is this lift.
- **The real log shows it:** 10, 15 and 20 lb bounce between days (§1.5).
- **Why no earlier simulation saw it:** the authors' simulation runs `REC_PLAN`, which holds Lateral Raise at a single 12–20 range. Nick's export is still on his own plan.

**2. Permanent hold on the RDL, from two rules that disagree.**
- **The two rules:** the step-down judges failure by the **best** set (trap 17d), while the climb reads the **minimum** set.
- **What results:** a lift whose first set makes `low` but whose later sets don't, such as 225×8,6 or 225×8,6,4, is never stepped down (the best set is fine) and never progresses (the minimum is short). The card reads "Fell short — run it back" for as long as that lasts. That is 50% of RDL lifter-years in E-classic, about as often as plain DP (52%).
- **The real log is in this state now:** RDL 29 Oct 225×8,6 (then 185), 6 Nov 225×8 (then drop sets). Both replays say "run it back".
- The earlier review's §2.2 asked for a way out of "run it back forever". v25's step-down was built for that, but 17d's best-set rule switches it off in exactly this case.

**3. Rep-out spirals on coarse dumbbell steps.**
- **Where:** 20–25% of lifter-years on BSS, curls and incline; 67% on RDL.
- **Why:** a single rep-out read in steps of 17–25% of the load, plus a step-down that fires right after a jump.
- Failed-jump memory halves these. Removing the step-down removes them, but replaces them with permanent holds (34%).

**4. Stuck below the next step (M9).**
- **How often:** 40% of lift-years for E-classic and for DP alike, mostly lat pulldown, incline, leg press and hamstring curls.
- **Cause:** double progression's all-sets-at-top rule, with the rep-out last set as the binding set. This was noted, though not quantified, as "the last set governs everything" in the earlier review (§2.2).
- E-repout reduces it to 34%.

**5. Oscillation (M6)** is within the threshold for every engine except the ablations that remove failed-jump memory.

### 3.2 Property and metamorphic tests on the real code (`props.mjs`)

*Each property ran 500 random synthetic histories through fast-check, against the real `prescribe()` and `shadowPrescribe()`. Fixed seed 20261108.*

| # | Property | prescribe | shadow |
|---|---|---|---|
| P1 | More reps in the **last** exposure never lowers the prescription | pass | pass |
| P1 | More reps in **any past** exposure never lowers it | **FAIL** | pass |
| P2a | Warm-up sets (flagged) below the working load change nothing | pass | pass |
| P2b | Unflagged ramp sets (1–2, lighter, before the first working set) change nothing | pass | pass |
| P3a | An lb → kg → lb round trip gives the same prescription (within 0.5 lb) | **FAIL** | — |
| P3b | The same log in kg prescribes the same thing (within 1 lb) | **FAIL** | — |
| P4 | Permuting the sets at the working load (rep-out flag kept on the last set) changes nothing | pass | — |
| P5 | Shifting the whole log and the clock by the same amount changes nothing | pass | pass |
| P6 | Another lift's sessions in between change nothing | pass | pass |

**Shrunk counterexamples:**

**P1.** Lateral-raise-like lift: 12–20 range, 10 lb, five sessions of about 16 reps.
- Adding **one rep to one set of the 4th-newest session** turns "10 × 17, go for 17" into "Sliding 3 sessions — drop a set this week".
- The trend reads a 1-rep change in one old set as a decline. With only 5 exposures it computes a slope whose noise band is ±5 percentage points (§1.6).

**P3a.** Last sessions 30×10,10,10, then 35×10,7,10.
- The lb log backs off to 30.
- After a round trip it backs off to **30.6**, because `convertUnits` turned the 5 lb step into 2.3 kg and then into 5.1 lb.

**P3b.** Last sessions 70×10 ×3, 65×10 ×3, 65×10 ×3, then 70×9,7,9.
- The lb log backs off to **65 lb**.
- The same log in kg backs off to **27.6 kg (60.8 lb)**, because the back-off is rounded on a 2.3 kg grid. That is a 13% cut instead of 7%.
- Nick logs in lb, so this is low priority for him.

## §4 Threshold audit

**Classes:**
- **Trial** means a primary trial or meta-analysis, with a DOI checked on Crossref, supports *this value*.
- **Convention** means common coaching practice, a position stand, or Nick's own stated preference.
- **Arbitrary** means chosen by the authors, usually tuned on their own simulation (`yearsim.js`).

**Result:** no number in the engine or the coach is trial evidence for its *value*. A few have trial support for their *direction*, and two in-app citations do not say what the app cites them for.

### Engine

| Number (where) | Class | Evidence / note |
|---|---|---|
| Rep ranges: 8–12 default; heavy 5–8; isolation 12–16; holds 30–60 s (`defaultRange`) | Convention | ACSM 2009 position stand ([10.1249/MSS.0b013e3181915670](https://doi.org/10.1249/MSS.0b013e3181915670)). Trials show similar hypertrophy across a wide band of loads, and more 1RM with loads above 60% (Schoenfeld 2017, [10.1519/JSC.0000000000002200](https://doi.org/10.1519/JSC.0000000000002200)). |
| Step 5 lb / 2.5 kg (`inc`, `defaultInc`) | Convention | Equipment grid. Converting units gives 2.3 kg, not 2.5 (property P3 fails). |
| +1 rep per session while climbing | Convention (direction: trial) | Plotkin 2022 ([10.7717/peerj.14142](https://doi.org/10.7717/peerj.14142)): progressing reps ≈ progressing load over 8 weeks, lower body, trained. The size of +1 is convention. |
| Back-off ×0.9 (`easier`) | Convention | No trial of a 10% reset was found. |
| `MAX_CUT` 20% | Arbitrary | |
| Trend window max(6, cycle+3); fewer than 4 points → "new" | Arbitrary | Computes a slope from 4 points. At Nick's noise floor that reads "down" 25% of the time on a lift with a flat true trend (§1.6). |
| Trend +1.5% / −2% per 3 sessions | Arbitrary | Carried over from the retired 3-vs-3 rule. Inside the 95% band of a 6–7-point slope (§1.6). |
| Long window max(10, 2·cycle+3); stalled at pct ≤ 0; `DELOAD_MAX_CYCLE` 8 | Arbitrary | Derived from the authors' own simulation. |
| Deload check: ≥3 lifts judged, each needing ≥6 exposures; ≥60% stalled = high, ≥40% = watch | Arbitrary | |
| Deload week: 7 days; load ×0.9; sets ×0.6 | Convention | Surveys and coach interviews: deloads about every 5.6 weeks, lasting about 6 days (Rogerson 2024, [10.1186/s40798-024-00691-y](https://doi.org/10.1186/s40798-024-00691-y); Bell 2022, [10.3389/fspor.2022.1073223](https://doi.org/10.3389/fspor.2022.1073223)). The one trial found no hypertrophy benefit from a 1-week break and slightly worse strength (Coleman 2024, [10.7717/peerj.16777](https://doi.org/10.7717/peerj.16777)). |
| `DELOAD_QUIET` 21 d | Arbitrary | |
| RPE ≥ 9.5 → hold | Convention | The RIR-based RPE scale is Zourdos 2016 ([10.1519/JSC.0000000000001049](https://doi.org/10.1519/JSC.0000000000001049)); the cut-off is arbitrary. RPE is off in Nick's settings. |
| Failed-jump memory: jump best < low−1; retry once reps recover the measured "cost" | Arbitrary | The cost is a 1–3 rep difference, under the 1.8-rep MDC95 (§1.6). |
| Step-down: best < low right after a jump, or 2 sessions running at an established load | Arbitrary | |
| Rep-out table: low−1 / top / top+`OUT_JUMP2`(4); +2 steps only if 2 steps ≤ 10% of load; one-low-day guard; echo +1 | Arbitrary (inspired by a trial) | "APRE-style" cites Mann 2010 ([10.1519/JSC.0b013e3181def4a6](https://doi.org/10.1519/JSC.0b013e3181def4a6)): 23 college football players, 6 weeks, barbell bench and squat, using APRE's own table. The app's range-relative table, its thresholds and its use on dumbbells and isolation lifts were not trialled. |
| Rep-out gate: ≥ 9 uses at ≥ 85% landed (`OUT_GATE_*`) | Arbitrary | Set from the authors' simulation (93%). Nick has 0 uses (§1.0). |
| Swapped-in lift starts a step lighter after 28 d away | Arbitrary (direction: trial) | Detraining losses grow with time off (Bosquet 2013, [10.1111/sms.12047](https://doi.org/10.1111/sms.12047)). |

### Coach

| Number | Class | Evidence / note |
|---|---|---|
| Runs every 14 d; at most 2 cards open; needs ≥ 6 sessions; cards expire after 28 d; cool-downs 42/126/365 d; 42 d after an accept | Arbitrary | UX choices. |
| Long session: median active time > 90 min | Convention (Nick's stated limit) | He says up to 1.5 h is fine. Active time skips gaps > 15 min (arbitrary) and needs ≥ 4 timed sets and 3 of 4 sessions (arbitrary). |
| Busy guard: 80 active min / 21 planned sets | Arbitrary | |
| Volume: < 6 weekly sets per muscle, helper set = ½, over 3 complete weeks, ≥ 6 sessions | Arbitrary (direction: trial) | More sets → more growth (Schoenfeld 2017, [10.1080/02640414.2016.1210197](https://doi.org/10.1080/02640414.2016.1210197); Pelland 2026, [10.1007/s40279-025-02344-w](https://doi.org/10.1007/s40279-025-02344-w)), with no threshold. **Citation error:** the card attributes "about 10 or more a week is the usual floor" to Pelland 2026, which reports no threshold. The ≥ 10 figure is ACSM 2026's ([10.1249/MSS.0000000000003897](https://doi.org/10.1249/MSS.0000000000003897)). |
| Skipped lift: ≥ 3 of the last 4 sessions of its day | Arbitrary | Right on the real log: face pulls, 4 of 4. |
| Stall: ≥ max(6, 3 cycles) exposures at one load (15 for an 8–12 lift), ≥ 28 d, cycle ≤ 8, step ≤ 8% of load, slope ≤ 0, trend not "up", not at the range top | Arbitrary | PROMPT.md describes this as "≥ 3 cycles, ≥ 8 exposures". The code says `COACH_STALL_N=6`. **Citation error:** the card cites "Bell 2023 is coach opinion", but Bell 2023 ([10.1186/s40798-023-00633-0](https://doi.org/10.1186/s40798-023-00633-0)) is a Delphi consensus on *deloading*, not plateaus. |
| Stall ladder: +1 set if < 6 sets; range −2 if low−2 ≥ 3; swap only after ≥ 4 exposures and 42 d | Arbitrary | |
| `COACH_LIGHT` 0.85 and the family load ratios | Arbitrary | Labelled in the code as guesses. |

## §5 Ranked recommendations

The ranking is by expected effect on his 1-year progress, then by confidence. Effects are simulated (base model, paired, 95% CI) unless marked otherwise.

| # | Recommendation | Expected effect | Evidence |
|---|---|---|---|
| 1 | **Train at the frequency he intends: 2–3 sessions a week, not the logged 1.4.** It is not an engine change. The app could show sessions per week against his target on Progress. | **+8 pp/yr** true 1RM (DP 9.4% → 17.8%; E-classic 9.0% → 17.3%). That is about 10× any engine effect. | Simulation (`stated` variant, not pre-registered). It rests on the model's dose–response assumption, which matches the direction of Pelland 2026 and Schoenfeld 2017; the size is model-dependent. |
| 2 | **Give each range of a two-range lift its own history**, or put lateral raise on one range. **Done as v26.1** (`b362cab`). Switching to `REC_PLAN` also removes the problem. | **E-classic:** lateral raise spirals **18–27% → 0%** of lifter-years per range in all 4 settings; per-range cuts 1.1 → 0.2 a year; its true gain unchanged (within ±1.7 pp); M1 unchanged (main lifts unaffected). **E-repout:** no benefit — lateral raise spirals rise from 40% to 49%. **Scored per lift as pre-registered, it looks worse** (9.9 → 19.8 "cuts"), because different loads on Day A and Day B now read as cuts. | Simulation before/after (appendix A). Real log: 1 of 102 prescriptions changes, and it is **more conservative**: 15×8 where he then made 20×8. That is the cost. |
| 3 | **Follow the load, and log true reps on the rep-out set.** Neither is a code change. | Untested in the model as an intervention. The ticker variant shows logging the prefill costs E-repout about 0.4 pp. | Real log: load overrides 37% [27, 48], 56% of sets exactly on target. Every engine conclusion assumes he follows it. |
| 4 | **Don't switch the rep-out method on by default yet.** Let him tap Use on real sessions until the scorecard gate (≥ 9 uses, ≥ 85%) is met on **his** data. | If adopted: +0.48 pp/yr [+0.33, +0.66] over DP, mostly in fast responders. It costs +0.9 cuts/lift-yr and spirals in 21% of lift-years. | Simulation; 0 real uses. |
| 5 | **Close the RDL-style permanent hold.** The best-set step-down (trap 17d) and the min-set climb leave "run it back" forever when set 1 makes `low` and later sets don't. Candidate: after 3 sessions at one load with min < `low` and the best set not improving, step back once. | Unmeasured. Holds ≥ 8 exposures affect 50% of RDL lifter-years, and his real RDL is in this state now. | Simulation, §3.1-2. Earlier review §2.2 proposed a 3-miss step back. **Needs its own replay and simulation before shipping (trap 17c).** |
| 6 | **Trend back-off: require a full window** (n ≥ `trendWin`) before a "down" can cut, or remove the back-off. | Removing it: **+0.12 pp/yr** [+0.10, +0.14] (+0.12 to +0.45 across settings), 0.2 fewer cuts per lift-year, about 0.9 weeks longer longest stall. A full window takes the false-"down" rate on a flat lift from 25% (4 points) to 2.4% (8 points). | Ablation; P1 counterexample; §1.6 noise floor. My model has no genuine declines, which is what the rule exists for, so it is a tradeoff for Nick to decide. |
| 7 | **Coach stall rule:** state the latency honestly ("needs ~15 sessions at one load, about 7 months at your frequency"), or make the minimum count time-aware. | Today it misses 89% of plateaus within 16 weeks; 8% false positives. | Simulation, §2.5. |
| 8 | **Fix two citations on coach cards.** The volume card's "about 10 or more … (… Pelland 2026 …)" should say ACSM 2026. The stall card's "Bell 2023 is coach opinion" describes a Delphi study on deloading, not plateaus. | Accuracy of what the app tells him. | §4, verified on Crossref. |
| 9 | **Units:** snap increments to the new unit's standard step (5 lb ↔ 2.5 kg, 10 lb ↔ 5 kg) instead of `round(x·0.4536, 1)`. | It removes the 2.3 kg step and some P3 failures. Different load grids still round differently, so P3b cannot fully pass. | Properties P3a and P3b. Low priority: he logs in lb. |

**Not recommended on this evidence:**
- **Removing the step-down rules.** Both cost M1, but removing them roughly doubles permanent holds (E-classic) or takes them from 0% to 34% (E-repout).
- **Changing the deload logic.** It is inert at his frequency.

## §6 Reconciliation with past decisions

*Phase 3: I read `PROJECT_STATE.md` (engine section and traps 17–17d), `ROADMAP.md` (v24–v26 and the Argon review table), the root `REVIEW.md` (§2) and `RESEARCH.md` (citations), all after §1–§3 were computed.*

| Finding | Status | Whose evidence is stronger |
|---|---|---|
| The export holds no rep-out, shadow or coach data; v24+ has never met Nick | **New**, as a fact about the log. ROADMAP v24/v25 plan to collect it via the scorecard. | — |
| Logged reps mostly echo the target (56% of sets) | **Known**: the v24 commit says "half of the logged exercises stop exactly on target". | Agree |
| Load-override rate 37%; he declines a shown step-up 13 times in 31 | **New** | — |
| The forecast "beats naive" only because the log echoes the target | **New** | — |
| E-classic is very slightly worse than plain DP (−0.2 pp/yr) | **New.** No earlier work compared the engine against plain DP on a common lifter population. | — |
| The trend back-off costs a little on lifters who aren't declining | **Contradicts** keeping it (v19, v25 "a same-weight slide still gets its back-off"; t26/t30 expect it). | **Mixed.** Theirs is scenario tests with real declines; mine is a population with none. Both stand, and the decision is a tradeoff (§5 #6). |
| Trend "down" acts inside noise on 4–7-point windows | **Partly contradicts** the earlier review §2.1 ("±1 rep noise never crossed it in a thousand checks"). | **Mine, for short histories:** it rests on his measured noise floor and a P1 counterexample on the real code. Theirs, for full windows: at ≥ 8 points I agree (≤ 2.4%). |
| Failed-jump memory prevents cuts at no strength cost | **Known** (v25 P1/P2) | Agree; this review confirms it independently on Nick's plan with a different lifter model. |
| v25's step-down: their 146 → 6 unreachable loads; my "costs 0.06 pp and adds 0.75 cuts, prevents holds" | **Partly contradicts.** Their benefit was measured on `REC_PLAN`'s 15 → 20 lb lateral raise. | Both hold on their own plan. Mine is on the plan he actually uses. |
| Lateral raise two-range spiral | **New.** `REC_PLAN` removes it, but his export is still on his own plan. | — (fixed in v26.1) |
| RDL permanent hold: best-set step-down × min-set climb | **New interaction.** Trap 17d (best set) re-opens the earlier review's §2.2 "run it back forever" gap that the step-down was meant to close. | Mine, for this pattern; the real log is in it now. |
| M9: the fatigued last set governs load steps | **Known**: earlier review §2.2, "the last set governs everything". | Agree. v24's rep-out makes the last set *more* fatigued (RIR 1) while `prescribe()` still takes the minimum. |
| The rep-out method beats DP on M1 but spirals on coarse steps | **New in part.** ROADMAP v25 reports flips 198 → 19 and 93% landed, on `REC_PLAN` with their own lifter model. | **Neither is decisive.** Both rest on models built by the method's evaluators (theirs explicitly; mine has no data on his rep-outs either). Only his real uses can settle it, which is what the gate is for. |
| Deload check is inert | Consistent with ROADMAP (2.9 deload weeks only in an illness year) | Agree |
| The coach is quiet, with low false positives and high misses | Their t39b spam check chose the 3-cycle rule for low card counts. **The miss rate is new.** | Agree on false positives; the 89% misses are a new cost of the same choice. |
| Citation errors (Pelland, Bell) | **New** for the card texts. `RESEARCH.md` correctly gives ACSM 2026 as the source of ≥ 10 sets. | Mine (Crossref-verified) |
| lb↔kg: 2.3 kg step, off-grid round trip | **New**; earlier review §1.9 found a related bar-snap issue. | — |
| PROMPT.md says the stall rule needs "≥ 8 exposures"; the code has `COACH_STALL_N=6` (15 for an 8–12 lift via 3 cycles) | Documentation drift | Code is ground truth |

## Appendix A: the code change, v26.1 (per-range history)

**The change:** `rangeHist()` in `index.html`, used by `prescribe()` and `shadowPrescribe()`.
- When the plan holds a lift at **more than one range**, each row reads only the exposures done at its own range, falling back to all of them while there are none.
- A lift with one range in the plan keeps its whole history, so a range changed for good keeps its past.
- BUILD and CACHE are bumped to v26.1.

**Test:** the new suite `tools/test/t41-range-history.mjs` has 11 checks.
- On v26.1 all 11 pass.
- On v26, 4 fail: Day B reads Day A's 15×16 as a top-out and steps to 20, and Day A gets a back-off off Day B's 20×9.

**Regression:** all 22 existing suites pass on v26.1 with an unchanged 1,018 checks (t20–t40, t39b), plus t41's 11 (`npx http-server -p 8117 -s -c-1 .`, then each `node tools/test/tNN-*.mjs`). No existing expectation changed.

**Real-log replay diff** (`replay.mjs`, v26 → v26.1): 1 of 102 prescriptions changes.
- On 9 Sep (Day B, 8–12), v26 gave 20×8 and v26.1 gives 15×8, read from the last 8–12 session (5 weeks earlier, at 10 lb). He did 20×8,8,8.
- So the change is **more conservative than the old engine** where cross-range evidence was fresh, and it gets this one real call worse. In the simulation that cost is outweighed by the spirals removed (below). For Nick, the cleaner fix is to put lateral raise on one range, or to switch to `REC_PLAN`.

**Simulation before/after** (`compare.py`): same lifters, same seeds; v26 vs v26.1.

Lateral raise is scored per range here (`name@lo-top`, added to `metrics.mjs`). Once each range progresses on its own, Day A at 15 and Day B at 20 alternating are not cuts. Read per lift, as pre-registered, the same runs show lateral raise "cuts" doubling (9.9 → 19.8 a year): that is the scoring, not the engine.

| variant | engine | ΔM1 after−before pp [95% CI] | M7 spiral (all lifts) before → after | cuts/lift-yr (all) before → after | lateral riase, per range: cuts/yr, spiral, stuck before → after | lateral riase true gain % before → after |
|---|---|---|---|---|---|---|
| base | classic | +0.00 [+0.00, +0.00] | 2.3% → 0.0% | 0.43 → 0.32 | 1.1 → 0.2, 18% → 0%, 16% → 20% | 25.8 → 25.9 |
| base | repout | +0.00 [+0.00, +0.00] | 18.6% → 19.8% | 1.25 → 1.26 | 1.9 → 2.0, 40% → 49%, 59% → 55% | 22.5 → 23.8 |
| noisy | classic | +0.00 [+0.00, +0.00] | 3.4% → 0.1% | 0.88 → 0.74 | 1.3 → 0.2, 27% → 0%, 18% → 24% | 25.6 → 24.9 |
| noisy | repout | +0.00 [+0.00, +0.00] | 34.3% → 36.2% | 1.91 → 1.94 | 1.9 → 2.2, 37% → 52%, 56% → 55% | 23.0 → 23.7 |
| ticker | classic | +0.00 [+0.00, +0.00] | 2.7% → 0.1% | 0.43 → 0.31 | 1.2 → 0.2, 21% → 0%, 28% → 22% | 24.0 → 25.7 |
| ticker | repout | +0.00 [+0.00, +0.00] | 13.3% → 13.1% | 0.98 → 0.95 | 2.1 → 1.8, 41% → 39%, 63% → 44% | 20.6 → 22.9 |
| flat | classic | +0.00 [+0.00, +0.00] | 3.5% → 0.4% | 0.60 → 0.54 | 1.3 → 0.9, 25% → 0%, 8% → 8% | 28.1 → 27.4 |
| flat | repout | +0.00 [+0.00, +0.00] | 26.9% → 30.0% | 1.56 → 1.62 | 1.7 → 2.2, 33% → 58%, 46% → 44% | 25.2 → 26.2 |

- **What v26.1 does:** for E-classic, Nick's live engine, it removes every lateral-raise spiral and most of its per-range cuts, at no strength cost. M1 is unchanged, and the lift's own true gain is within ±1.7 pp.
- **Where it doesn't help:** E-repout, whose lateral-raise spirals come from the 33% dumbbell step, not from shared history. They rise from 40% to 49%.
- **Before-run note:** the "before" runs here were re-simulated on v26 with the same per-range scoring (`REVIEW_INDEX` pinned to `896e031:index.html`), so both sides are scored identically.

## Appendix B: reproducing this review

```
cd tools/review && npm i                      # fast-check
export REVIEW_OUT=/some/dir/outside/the/repo   # outputs contain training data
# Nick's export at the repo root as ironlog-*.json (gitignored), or IRONLOG_EXPORT=/path
node tools/review/replay.mjs                  # real log replayed through the hooked app
python3 tools/review/reallog.py               # §1 numbers
node tools/review/coach-reallog.mjs           # §1.8
node tools/review/props.mjs 500               # §3.2
node tools/review/sim.mjs 200 all base,noisy,ticker,flat   # §2, ~10 min on 4 cores
node tools/review/sim.mjs 200 classic,repout,dp,lin lowloss,stated
python3 tools/review/analyze.py               # §2 tables, §3.1
node tools/review/predict.mjs 400 base classic   # PREDICTIONS.md
REVIEW_INDEX=/path/to/old/index.html …        # pin a build for before/after runs
```
