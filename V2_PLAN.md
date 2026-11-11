# Iron Log 2.0 — review and plan (revised 11 Nov with the owner's answers)

Owner's answers, 11 Nov:
- **Frequency:** usually 3 sessions a week, sometimes 4.
- **Session length:** 1–1.5 h.
- **Goal:** training for **size**.
- **Injury history:** years of tweaking something on barbell bench, squat
  and deadlift. Would like to do them if they could be done safely.
- **Audience:** **just for me.**
- **Modules:** didn't know what "splitting into modules" meant (explained in §4).

The first draft was built on the logged 1.4 sessions a week. That was wrong:
it was the app's view, not the training (§1). Real-log figures are aggregates
of the owner's export (21 sessions, 24 Jul – 6 Nov 2026), which is not in the
repo.

---

## 1. Verdict on 1.x

- **The engine for the next set and the logging loop are effectively
  done.**
  - Prescriptions under what you could do fell from 37% to 32% in the
    simulated year.
  - Start a workout is 1 tap, log a set 1, finish 2.
  - No critical accessibility errors, no contrast failures, works offline.
- **The log has holes, and every analysis so far inherited them.**
  - Weeks that were logged fully show 3–4 sessions (Jul 27: 3, Aug 3: 4,
    Aug 31: 3), which matches what you describe.
  - 5 of 16 weeks are empty (Aug 10, Aug 24, Oct 5–19), and Sep 7–28 shows
    one a week.
  - The independent review's biggest finding ("train 2–3× instead of 1.4×,
    +8 pp a year") came from those gaps. **If the gaps are unlogged
    sessions, that finding doesn't apply to you.** The engine's trend and
    stall maths has also been reading a thinner history than you trained.
- **The plan already avoids the injury-prone lifts.**
  - It uses dumbbell presses, leg press, Bulgarian split squat and RDL; no
    barbell bench, squat or deadlift appears in the log.
  - But nothing in the app knows *why*. Pain only appears as a keyword the
    stall rule scans notes for (`coachRun()`, index.html:7005). Nothing
    records which joint hurt, after what, or keeps load jumps cautious on a
    lift that has bitten you before.
- **Deload and stall logic only react to what already happened.**
  - `deloadCheck()` (index.html:1405) notices staleness after the fact.
  - The coach's stall rule needs ~15 exposures at one load.
  - Nothing plans the volume a size block needs, though weekly sets per
    muscle are already counted (`weeklySetsCard`).

## 2. Thesis

> **Iron Log 2.0: build size steadily without getting hurt — and earn back
> the big lifts safely if you want them.**

Directions considered:

| Direction | Verdict |
|---|---|
| **A. Size without injury** (chosen) | It matches your goal and the thing that has cost you most over the years. It reuses the engine, weekly sets per muscle, the coach's swap families (`COACH_FAMILIES`) and form check. |
| B. Coach the week (first draft) | Built on a frequency problem you don't have. Its useful part, picking the most overdue day after a break, becomes S2. |
| C. Share it with others | Out: it's just for you. |

## 3. Scope

### Must (5)

**M0 — Find out why weeks are missing, then close the gap. Do this first.**
- **Problem:** 5 empty weeks, and 4 weeks of one session each, in a
  3–4-a-week routine. Either you took breaks, or sessions happened and
  weren't logged.
  - If they weren't logged, nothing else in 2.0 can work: a size block
    can't plan volume it never sees.
- **Change, depending on your answer (question 1):**
  - **"Didn't log it":**
    - Add "Log a past workout" on Today. Pick the day, pick the date, and the
      sets prefill from what the engine would have prescribed. That turns a
      forgotten session into ~10 taps instead of a lost one.
    - Add a gentle line if a planned day passes unlogged ("Tuesday's Day B —
      did you train? Log it").
    - Separately, find out what stopped you logging: phone left in the bag,
      the app being slow, a bug.
  - **"Took a break":**
    - A re-entry session after a gap of 10+ days. Today the app only steps
      back after 28 days (`makeSessionEx`, `stepBack`).
    - Mark the break so trend and stall maths don't read it as a stall.
- **Cost at the bar:** none, because it happens after the fact.
- **Measured by:** logged sessions per week over the 2.0 block matches what
  you actually trained, which you confirm at the end of the block. No week at
  0 unless it was a break.

**M1 — Size blocks: planned volume per muscle, planned deload.**
- **Problem:**
  - Size is driven mostly by weekly hard sets per muscle (Schoenfeld 2017;
    Pelland 2026).
  - The app counts those sets but never plans them.
  - Deloads are reactive.
- **Change:**
  - A block is 5 weeks plus a deload week. Each muscle gets a weekly set
    target that ramps from a floor toward a ceiling (the usual
    MEV → MAV conventions, labelled as conventions). At 3–4 sessions of
    60–90 min there's room for ~12–18 sets a week on priority muscles.
  - Set counts per session come from the block, prefilled as today.
  - The block ends in a scheduled deload using the existing
    `startDeloadWeek()`. `deloadCheck()` stays as an early-exit prompt.
  - You pick 1–2 priority muscles per block, which get the higher end.
- **Cost at the bar:** none. Sets are already prefilled.
- **Measured by:**
  - Weekly sets per muscle inside the block's band in ≥ 80% of weeks.
  - The deload happens on schedule.
  - Over the next blocks, rep and load gains on the priority muscles' lifts.
    This is a real-world signal and a slow one.

**M2 — "Felt that" — one tap to flag a niggle, and the app remembers.**
- **Problem:** years of tweaks, and today the app can't tell a lift that
  aggravates your shoulder from one that doesn't.
- **Change:**
  - **The flag:**
    - After a set, never between taps on the set row, the lift's ⋯ menu gets
      "Felt it: shoulder / elbow / lower back / knee / hip / other".
    - It is stored per exercise and session.
  - **What the app does with it:**
    - Next time, that lift holds its load (no jump) and the target drops a
      rep.
    - A second flag in 3 weeks makes the coach offer 2–3 same-muscle
      alternatives that load the joint less. It reuses `COACH_FAMILIES`,
      extended with a joint-stress tag.
    - Never automatic, always one-tap undo.
  - **The history:** Progress shows which lifts and joints get flagged over
    time ("left shoulder: 3 flags, all on overhead press").
- **Cost at the bar:** zero during the set, and one optional tap after it.
- **Measured by:**
  - Flags per block trending down.
  - No lift flagged 3 or more times while still in the plan without you
    choosing "keep it".
- **This is not medical advice.** A joint that keeps getting flagged gets a
  plain "worth seeing a physio" line, the way form check already does.

**M3 — Earn-back ladders for bench, squat and deadlift (opt-in, one at a time).**
- **Problem:** you'd like the big three, and in your experience they bite.
  Most tweaks come from too much load too soon, grinding reps, or skipping
  the warm-up. The app can control all three.
- **Change:** each lift becomes a ladder of rungs, each one easier on the
  joints than the next:

  | Lift | Rungs |
  |---|---|
  | Squat | goblet squat → heels-elevated goblet → safety-bar or box squat → back squat |
  | Bench | DB bench (you have this) → DB floor press → barbell floor press → close-grip barbell bench → bench |
  | Deadlift | RDL (you have this) → trap bar from blocks → trap bar from the floor → conventional |

  Rules on a ladder lift (these are conservative conventions and are
  labelled as such):
  - **Reps:** 6–10, never singles.
  - **Effort:** last set stops about 2 short of failure. The rep-out ends at
    "2 in the tank", not form breaking.
  - **Load steps:** ≤ 5% of the load.
  - **Moving up a rung:** after 6 clean sessions, meaning no M2 flag and no
    missed reps. A form check video (v28, already built) is suggested at each
    rung change.
  - **A flag sends you down one rung,** not out.
- **Cost at the bar:** none extra. It's an ordinary plan row with a stricter
  rule set.
- **Measured by:** rungs climbed, against flags on ladder lifts. The target is
  zero flags per rung.

**M4 — Warm-up ramps on every compound.**
- **Problem:** cold, heavy first sets are a classic tweak.
  - Warm-ups are typed by hand today, so they get skipped when you're in a
    hurry.
- **Change:**
  - Generate 2–4 warm-up sets from today's working weight, the bar and your
    plates (plate maths exists). Each is one tap to log.
  - Ladder lifts (M3) always get a ramp.
- **Cost at the bar:** fewer taps than typing.
- **Measured by:** warm-ups logged on compounds before the first working set
  in ≥ 90% of sessions.

### Should (4)

- **S1 A simulator that can judge program design.**
  - Port the review's stimulus lifter (`tools/review/sim.mjs`) to check M1's
    volume ramps before you train them.
  - It is a gate for M1, not a feature.
- **S2 Most-overdue day after a break.**
  - After 7+ days off, Today suggests the day whose muscles have gone longest
    untrained, not the next in strict rotation (`nextRoutine()`,
    index.html:2694).
- **S3 Learn from overrides.**
  - You change the prescribed load in ~37% of exposures.
  - When a lift is overridden the same way in 3 of its last 4 exposures, the
    coach asks once whether to change that lift's step or starting weight.
- **S4 Stall judged at block ends.**
  - Two blocks with no gain at one load counts as a stall.
  - It replaces the 15-exposure rule (review #7).

### Won't, for now

- **Accounts, sync, sharing, onboarding for strangers.** It's just for you.
  The gist backup covers it.
- **A short-day button.** Your sessions are 60–90 min by choice.
- **A check-in before every session.** It adds a tap to every workout. M2
  covers the injury half of it.
- **The rep-out method as default.** It has 0 real uses against its gate.
- **Auto-scroll.** Your decision.
- **Social, exercise database, videos, food tracking.**

## 4. Architecture and data

**"Splitting into modules", in plain words.** Today the whole app is one
7,600-line file, `index.html`.
- **What it means:** split it into ~8 smaller files (the engine, the coach,
  backup, each screen). The browser loads them together.
- **What changes for you:** nothing. Same app, same URL, still offline, still
  no installs or dependencies.
- **What it buys:** faster and safer work for whoever builds 2.0. In the last
  sprint, four streams of work had to be merged by hand into one file.
- **What it costs:** a one-time move with some risk around offline updates.
  The 28 test suites and a phone check are the safety net.
- **Recommendation:** worth doing at the start of 2.0, but optional.
  Everything above works either way.

| Layer | 1.x | 2.0 |
|---|---|---|
| State | `version:5` (index.html:823) | `version:6`. Adds `program.block` (weeks, per-muscle targets, priority muscles, deload week); `flags[]` per exercise per session (joint, ts); `ladder` per plan row (lift, rung, clean count); `breaks[]`. Migration in `normalize()` (index.html:854) only adds fields. A v5 snapshot is kept under `ironlog.v1.before-v6`. |
| Next set | `prescribe()` | Unchanged for ordinary lifts. Ladder lifts get stricter caps (≤ 5% steps, stop 2 short), and a flagged lift holds. |
| Next session | strict rotation | Unchanged, except S2 after a break. |
| Deload | reactive | Scheduled by the block. `deloadCheck()` is an early-exit prompt. |
| Coach | rules + Claude check-in | Adds flag-driven swaps (M2) and override cards (S3). Stall judged at block ends (S4). Flags and ladder state go into the check-in summary. |
| Tests | 28 suites | Adds block invariants, flag and ladder rules (UI-driven), the v5→v6 migration diff on a synthetic export, and warm-up generation against plate maths. |

**Not losing a set:** the migration only adds fields. A test migrates a
synthetic v5 export, exports it again, and diffs every session against the
original. `t31` and `t34` (backup and data safety) must pass.

## 5. Validation plan

1. **Answer question 1 first.** It decides M0.
2. **Before training on M1,** check the block's volume ramp in the stimulus
   simulator (S1) and the existing `yearsim`. Pre-register:
   - weekly sets in band ≥ 80%
   - the deload on schedule in 100% of blocks
   - no prescription under-loaded more than today's 32%
   - all `t43` invariants holding
3. **Real-log replay** after each alpha. Set prescriptions must be identical
   except where a feature intends a change.
4. **In the gym: one size block** (5 weeks + deload, ~6 weeks), with at most
   one ladder lift active. The numbers we read:
   - sessions logged per week vs trained (you confirm)
   - weekly sets in band
   - flags per week
   - ladder rung and clean sessions
   - override rate (baseline 37%)
   - taps to log, which must not rise

## 6. Milestones

ETAs use this sprint's measured pace. With review and fixes:
- an engine rule took ~38 min (v26.2)
- a UI feature ~39 min (v26.4)
- a CSS and accessibility pass ~50 min (v26.3)
- a test-only suite ~15 min (`t43`)

| Stage | Contents | Agent time | Gate |
|---|---|---|---|
| **2.0-a0** | M0 (whichever way question 1 goes) and M4 warm-up ramps | ~1.5 h | Journeys: logging a past workout ≤ 10 taps; warm-ups 1 tap each |
| **2.0-a1** | Optional: module split, schema v6, migration. No behaviour change. | ~3 h | 28/28 suites; 102/102 replay identical; offline update checked on the phone |
| **2.0-a2** | M2 niggle flags and flag-driven swaps | ~1.5 h | Flag → hold → swap card works by real taps; undo works |
| **2.0-a3** | M1 size blocks, S1 simulator gate, S4 stall-on-blocks | ~3 h | Simulator pre-registration met |
| **2.0-a4** | M3 ladders (all three defined, one active at a time) | ~2 h | Ladder rules in `t43`-style invariants; rung change by real taps |
| **2.0-beta** | S2–S3, full review pass, merge to `main` | ~1.5 h | All suites green; one gym session with no blockers |
| **Gym block** | You run one size block on the beta | **~6 weeks calendar** | Gate in §5.4 met; no data loss |
| **2.0** | Fixes from the block, docs | ~1 h | — |

Total: **~11 hours of agent work without the split, ~14 with it**, plus a
6-week block in the gym. Starting now puts 2.0 around **late December 2026
to early January 2027**.

## 7. Risks, and what stays untouched

**Risks**
- **The app can't see your joints.** Flags, ladders and caps lower the usual
  causes of tweaks (load jumps, grinding, cold sets). They don't guarantee
  anything, and they're not a substitute for a physio when something keeps
  recurring.
- **Volume targets are conventions, not measurements.** Start at the floor.
  The ceiling is labelled as a guess, and the block reads your recovery
  through flags and stalls.
- **If the log gaps were unlogged sessions,** every number the engine and
  coach have computed so far was on partial data. Expect trends to move once
  logging is complete.
- **Scope creep.** Five Musts and four Shoulds. Anything new waits for 2.1.

**Kept from 1.x untouched**
- One-tap logging with no re-render on the set path (trap 1).
- `prescribe()`'s rules for ordinary lifts.
- The backup safety rules.
- `normalize()` as the only way into the state.
- One-tap undo.
- The coach never changes the plan by itself.

## 8. Questions only you can answer

1. **The empty weeks:** Aug 10, Aug 24, Oct 5–19, and the one-a-week stretch
   through September. Were they breaks, or did you train without logging? If
   the latter, what got in the way?
2. **Which big lift would you most like back first:** squat, bench or
   deadlift? Or none, and stay with what works?
3. **Which joints tend to go?** Shoulder, lower back, knee, elbow? It decides
   which flags and swaps matter most.
4. **Any muscles you most want to grow** for the first block?
