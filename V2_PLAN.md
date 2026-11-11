# Iron Log 2.0 — review and plan

Written 11 Nov 2026 from [V2_PROMPT.md](V2_PROMPT.md), on `main` at v26.13.
Real-log figures are aggregates of the owner's export (21 sessions, 24 Jul – 6
Nov 2026), which is not in the repo. It's a plan, not a commitment.
Questions for the owner are at the end.

---

## 1. Verdict on 1.x

- **The set-level engine is good and close to finished.**
  - The simulated year shows prescriptions under what the lifter could do
    falling from 37% to 32% this sprint, with impossible loads and
    back-and-forth flips unchanged.
  - Six invariants hold over 39,760 simulated exposures (`t43`).
  - The independent review puts every engine variant within ~1 pp of plain
    double progression a year (`review/independent`,
    `tools/review/REVIEW.md` §5).
  - So more cleverness per set has stopped paying.
- **The logging loop is done.** Start a workout is 1 tap, log a set 1 tap,
  finish 2 (`tools/sprint/journeys.mjs`). No critical accessibility errors,
  no contrast failures, works offline. 2.0 must not make this worse.
- **The thing holding results back is the week, not the set.**
  - The log shows **1.4 sessions a week**, three gaps of 10 days or more, and
    each lift trained about every **8.5 days**.
  - `nextRoutine()` (index.html:2694) walks A→B→C regardless. A missed week
    pushes every muscle back with it.
  - The review's largest effect was frequency, 1.4 → 2–3 a week: **+8 pp
    strength a year, ~10× any engine change**.
- **Programming is reactive.**
  - Deloads come from `deloadCheck()` (index.html:1405) noticing staleness.
    The review measured it at 0.16–0.48 deload weeks a year at this
    frequency, which is effectively inert.
  - The coach's stall rule needs ~15 exposures, about 7 months at 1.4 a week.
  - Nothing plans a block.
- **The codebase is one 7,600-line file.** It held up for one author at a
  time. In this sprint four parallel lanes had to be merged by hand into one
  file, every worktree started on the wrong base (trap 20), and port clashes
  produced false green test runs (trap 21). 2.0 is the cheapest moment to fix
  that.

## 2. Thesis

> **Iron Log 2.0 coaches the week you actually have, not just the next set.**

The app decides *what* to train today (the most overdue work, at your real
frequency) and *where you are in a block* (planned volume, planned deload). It
keeps the 1.x engine for the next set.

Directions considered:

| Direction | Why not as 2.0 |
|---|---|
| **A. Coach the week** (chosen) | It targets the measured bottleneck (frequency and coverage) and turns the reactive deload into a planned one. It reuses the engine, weekly-sets-per-muscle and the coach. |
| B. Iron Log for others: accounts, sync, store, payment | No retention evidence yet. PRODUCT.md's own rule is Phase 0 first: put it in front of real lifters, measure week-4 retention, *then* build infrastructure. 2.0 should make that experiment possible (S4), not presume its answer. |
| C. A smarter set engine: readiness check-ins, rep-out by default, more autoregulation | The review shows engine differences under 1.2 pp a year. The rep-out gate (≥ 9 real uses at ≥ 85%) has 0 real uses. A readiness question adds a tap before every workout. Diminishing returns. |

## 3. Scope

### Must (5)

**M1 — Today picks the most overdue session, and the plan fits your frequency.**
- **Problem:**
  - The rotation is strict. At 1.4 a week a three-day split meets each
    day every ~15 days.
  - After a 10–25 day gap the app still offers "next in line", not "what you
    most need".
- **Change:**
  - `nextSession()` replaces `nextRoutine()`. It ranks your days by how
    overdue their primary muscles are (days since last trained, weighted by
    weekly target). The default day is still one tap; the others are still
    one tap away.
  - Plan offers a template matched to the last 8 weeks' frequency (the
    v26.12 counts):
    - under 2 a week → full-body A/B
    - 2–3 a week → upper/lower or full-body A/B
    - 3 or more → the current A/B/C
  - It keeps your exercises and ranges, and asks before changing anything
    (trap 14: show the state, offer the migration).
- **Cost at the bar:** none, because the decision happens before Start.
- **Measured by:**
  - In the stimulus simulator at your logged frequency, the fitted template
    beats A/B/C on strength gain by a pre-registered margin (≥ 2 pp/yr).
  - On the real log replayed: the longest gap any primary muscle goes
    untrained, which must drop.
  - If the simulator shows no gain, ship only the overdue ordering.

**M2 — Blocks: planned volume and a planned deload.**
- **Problem:**
  - The deload is reactive and almost never fires at this frequency.
  - Weekly sets per muscle are reported (`weeklySetsCard`) but never
    planned.
- **Change:**
  - A block is 4–6 weeks. Each muscle gets a weekly set target that ramps
    from a floor toward a ceiling.
  - The ceiling and floor are the usual MEV/MAV conventions, labelled as
    conventions.
  - The block ends in a scheduled deload week, using the existing
    `startDeloadWeek()`.
  - `deloadCheck()` stays as an early-exit signal ("this block is stale —
    deload now?").
  - Set counts per session come from the block, prefilled as now.
- **Cost at the bar:** none. The number of sets is already prefilled.
- **Measured by:**
  - Weekly sets per muscle inside the block's band in ≥ 80% of weeks, in the
    simulator and in the gym block.
  - New `t43`-style invariants: deload on schedule, no week above the
    ceiling, a missed week extends the block rather than skipping ahead.

**M3 — A short-day button.**
- **Problem:** frequency is the lever. A full day is ~15 working sets, and
  when time is short the choice today is all or nothing.
- **Change:**
  - At Start, one extra option: **Short**. It keeps the main lifts at full
    sets, drops or supersets accessories by priority, and stays under about
    35 minutes.
  - The block redistributes what was dropped to the following sessions.
  - It reuses the coach's trim/pair logic (`coachRun()`, index.html:7005).
- **Cost at the bar:** none. It is chosen once, before the workout.
- **Measured by:**
  - Sessions per week (now on Progress) over the gym block, against 1.4.
  - Short days used, and whether weekly sets stay in the band.

**M4 — Schema v6, the app split into modules, and the engine runnable in Node.**
- **Problem:** M1–M3 need program and block state. One file blocks
  parallel work, and the simulated year runs inside a browser (~20 s for
  20 seeds).
- **Change:**
  - State version 6 adds `S.program`: template, frequency target, and block
    (start, weeks, week, per-muscle targets, deload week).
  - The `normalize()` migration wraps today's A/B/C as `template:"custom"`.
    Sessions and sets are untouched.
  - `index.html` becomes a shell plus ~8 native ES modules: state, engine,
    planner, coach, backup, and the UI views. No bundler, no dependencies.
  - The service worker caches the module list under one versioned cache.
  - The engine module imports in Node, so simulations run without a browser.
- **Cost at the bar:** none, if done right. The risk is offline first-load
  (see Risks).
- **Measured by:**
  - All 28 suites pass unchanged.
  - The journey numbers are identical.
  - Replaying the real log gives 102 of 102 prescriptions identical before
    and after the split.
  - Offline first-load after an update works on the phone.

**M5 — The simulator that can judge program design, built first.**
- **Problem:** `yearsim.js` can't tell a better program from a worse one.
  Its strength curve ignores training.
- **Change:**
  - Port the review's stimulus lifter (`tools/review/sim.mjs`: per-set
    stimulus = proximity × intensity, gain ∝ weekly stimulus) into
    `tools/test`.
  - Calibrate it against the review's own numbers: plain double progression
    9.4%/yr at 1.4 a week, 17.8% at the stated frequency.
  - Pre-register the M1–M3 thresholds before any feature runs through it.
- **Cost at the bar:** none.
- **Measured by:** it reproduces the review's figures within ±1 pp. A gate,
  not a feature.

### Should (5)

- **S1 Warm-up ramp.**
  - Generate 2–4 warm-up sets from today's working weight, the bar and your
    plates. The data is there (plate maths, `newPlanEx` bar field), and it
    removes typing at the most distracted moment.
  - Measured by: journeys taps to log a warm-up go from typing to 1 tap each.
- **S2 Learn from overrides.**
  - You change the load in ~37% of exposures. When a lift is overridden the
    same way in 3 of its last 4 exposures, the coach asks once whether to
    change that lift's step or starting point.
  - It is a card, never automatic, so it fits v26's coach rules.
  - Measured by: the override rate in the gym block falls below 30%.
- **S3 Bodyweight history.**
  - `S.settings.bw` is one number, and bodyweight lifts score against it.
  - Add a dated list, prefilled from the last value, editable from Progress.
    Back-fill old sessions where `session.bw` exists.
  - Measured by: bodyweight-lift trends no longer jump when the setting
    changes.
- **S4 Share-ready first run.**
  - A fresh install asks 3 questions (sessions a week, equipment, goal) and
    builds the first block from `REC_PLAN`. Backup goes to a file, so no
    GitHub token is needed.
  - This is what PRODUCT.md's Phase 0 needs, with no accounts.
  - Measured by: a stranger reaches a first logged set in under 2 minutes in
    a scripted Playwright run.
- **S5 A stall rule that runs on blocks.**
  - Judge stalls at block ends: two blocks with no load or rep gain at the
    same load means a stall.
  - Today's rule needs ~15 exposures, about 7 months for you (review #7).
  - Measured by: the review's plateau-injection test (misses 89% today) gets
    under 50% missed, while `t39b` keeps the card rate at or below 12 a year.

### Won't (and why)

- **Accounts, sync server, app stores, payments.** No retention evidence.
  The gist backup covers one user. Revisit after Phase 0 (PRODUCT.md).
- **A readiness check-in before every session.** It adds a tap to every
  workout to fix a problem the data doesn't show. Revisit if blocks
  under-recover.
- **Rep-out as the default method.** Its own gate has 0 real uses. Keep it
  in shadow.
- **Auto-scroll during a workout.** Owner decision, 10 Nov.
- **Social feed, exercise database, demo videos, food tracking.**
  ROADMAP's "Explicitly not doing" still holds, and none of them touches the
  bottleneck.

## 4. Architecture and data

| Layer | 1.x | 2.0 |
|---|---|---|
| State | `version:5` (index.html:823); `routines` with week variants, `sessions`, `coach` | `version:6`. Everything in v5, plus `program {template, freqTarget, block}` and `bwLog[]`. Migration in `normalize()` (index.html:854), the only way into the state. A v5 snapshot is kept under `ironlog.v1.before-v6`, the pattern used for restore. |
| Next set | `prescribe()` / `shadowPrescribe()` | Unchanged. The near-miss rule, failed-jump memory and back-offs stay. Set count comes from the block when one is active. |
| Next session | `nextRoutine()`, strict rotation | `nextSession()`: most overdue by muscle coverage. The rotation stays available as a template. |
| Deload | reactive `deloadCheck()` | Scheduled by the block. `deloadCheck()` becomes an early-exit prompt. |
| Coach | rules + Claude check-in (`coachRun`, `coachAsk`) | Same system. Stall judged at block ends (S5). Override card (S2). The block becomes part of the check-in summary. |
| Code | 1 file | Shell + ~8 native ES modules. The service worker caches a versioned list. The engine module imports in Node. |
| Tests | 28 Playwright suites, `yearsim`, `t43` | All kept. Adds the stimulus simulator (M5), block invariants, a v5→v6 migration test using a synthetic export, and an offline-update test. |

**Not losing a set.**
- The migration only adds fields.
- `t34` (data safety) and `t31` (gist backup) must pass.
- A test loads a synthetic v5 export, migrates it, exports it, and diffs every
  session against the original. It must match byte for byte.
- The v5 snapshot stays until 2.1.

## 5. Validation plan

1. **Before any feature**, M5's simulator must reproduce the review's numbers.
   Pre-register these:
   - M1: the fitted template beats A/B/C by ≥ 2 pp/yr at 1.4 a week.
   - M2: in-band weeks ≥ 80%, and the deload lands on schedule in 100% of
     blocks.
   - M3: weekly sets stay in band when 1 in 3 sessions is Short.
   - Unchanged: the sprint's metrics. Under-loaded ≤ 32%, too heavy ≤ 6%,
     flips within noise, all `t43` invariants holding.
2. **Real-log replay** after every alpha:
   - Set prescriptions identical except where a feature intends a change.
   - The new day choice listed against what you actually did.
3. **In the gym: one full block** (5 weeks + deload, about 6 weeks) on the
   beta. These are the numbers we read:
   - sessions per week (baseline 1.4)
   - longest gap per muscle
   - override rate (baseline 37%)
   - short days used
   - whether the deload happened on schedule
   - taps to start and log (must not rise)

## 6. Milestones

Agent-time ETAs come from this sprint's measured pace. With review and fixes:
- an engine rule took ~38 min (v26.2)
- a UI feature ~39 min (v26.4)
- a CSS and accessibility pass ~50 min (v26.3)
- a test-only suite ~15 min (`t43`)

The calendar is set by the gym, not the code.

| Stage | Contents | Agent time | Gate to move on |
|---|---|---|---|
| **2.0-a0** | M5 simulator, calibration, pre-registered thresholds | ~2 h (≈ 3 sprint waves) | Reproduces the review ±1 pp |
| **2.0-a1** | M4: schema v6, migration, module split, engine in Node. No behaviour change. | ~3 h (mechanical, but 7,600 lines; the 28 suites are the safety net) | 28/28 suites; 102/102 replay identical; journeys identical; offline update on the phone |
| **2.0-a2** | M1: overdue ordering and frequency-fit templates | ~1.5 h | M1 pre-registered result. If missed, ship the ordering only. |
| **2.0-a3** | M2: blocks, and S5 stall-on-blocks | ~2.5 h | Block invariants; the simulator's in-band ≥ 80% |
| **2.0-a4** | M3: short day | ~1 h | Simulator in-band with 1 in 3 days Short |
| **2.0-beta** | S1–S4, a full review pass, merge to `main` behind a flag (or with the old flow one tap away) | ~3 h | All suites; one owner session with no blockers |
| **Gym block** | You run one block on the beta | **~6 weeks calendar** | Sessions a week up from 1.4; override rate < 30%; no data loss; taps not up |
| **2.0** | Fixes from the block, flag removed, docs | ~1 h | The block gate above |

Total: **about 14 hours of agent work, roughly two to three sprint days, plus
6 weeks in the gym.** Starting this week puts 2.0 around **late December 2026
to early January 2027**. The gym block is what sets the date.

## 7. Risks, and what stays untouched

**Risks**
- **Frequency may be a life constraint, not an app problem.** That's the
  biggest risk. The app can lower the cost of going (M1, M3), not make you go.
  If the gym block doesn't move sessions per week, 2.0 still delivers better
  coverage and planned deloads, but not the +8 pp.
- **The program simulator rests on an assumed dose–response curve.** It can
  rank designs; it can't promise the size of the effect. Treat its numbers as
  direction, and the gym block as the test.
- **The module split can break offline first-load.** That's trap 2's family:
  a stale service worker serving a half-old app. Mitigations:
  - one versioned cache with an atomic switch
  - an update test in Playwright
  - the phone check is part of the a1 gate
- **Volume targets can over-prescribe a 1.4-a-week lifter.** Mitigations:
  ceilings are conventions and labelled, start at the floor, and set counts
  per session are capped at today's.
- **Scope creep.** Five Musts and five Shoulds. Anything new waits for 2.1.

**Kept from 1.x untouched**
- One-tap logging with no re-render on the set path (trap 1).
- `prescribe()`'s set rules.
- The backup safety rules (fewer-sessions guard, restore snapshot).
- `normalize()` as the only way into the state.
- One-tap undo.
- The coach never changes the plan by itself.

## 8. Questions only you can answer

1. **Why 1.4 sessions a week, and what's realistic?** Time, energy, schedule
   or recovery? This decides whether M1/M3 can move the number, and which
   template to default to.
2. **How long is a session you'd actually do on a busy day?** 30, 40 or 45
   minutes? It sets M3's budget.
3. **Strength first, size first, or both equally?** It sets M2's volume
   ceilings and where the rep ranges sit.
4. **OK to split the one file into native modules (no build step, no
   dependencies)?** I recommend it. Say no and everything else still works,
   but parallel work stays slow.
5. **Friends: who and when?** If there's a group ready, S4 moves up and
   Phase 0 can run during the gym block.
