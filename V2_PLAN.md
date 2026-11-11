# Iron Log 2.0 — review and plan (revised 11 Nov with the owner's answers, round 2)

Owner's answers, 11 Nov:
- **Frequency:** usually 3 sessions a week, sometimes 4.
- **Session length:** 1–1.5 h.
- **Goal:** training for **size**.
- **Injury history:** years of tweaking something on barbell bench, squat
  and deadlift. Would like to do them if they could be done safely.
- **Audience:** **just for me.**
- **Modules:** didn't know what "splitting into modules" meant (explained in §4).

Round 2, same day:
- **The empty weeks:** both breaks and unlogged sessions, and he can't say
  which was which.
- **Modules:** yes, provided nothing can get lost.
- **No "felt that" button,** and no interest in the barbell big three.
- **Joints that go:** lower back and shoulders most. Heavy squats have hurt
  his hip and made his knees sore.
- **Muscles:** grow all of them evenly, and avoid imbalances. He asked whether
  a block means training one muscle for 5 weeks; it doesn't (§3, M1).

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

> **Iron Log 2.0: even, steady size across every muscle, a log that doesn't
> lose your training, and a codebase that's safe to keep building on.**

## 3. Scope

### Must (4)

**M0 — Never lose a session, and handle breaks properly.**
- **Problem:** 5 of 16 weeks are empty and September shows one session a
  week. That's a mix of breaks and sessions that were never logged, and
  nothing in the log can tell them apart. So trends, stalls and set counts
  have been read from partial data.
- **Change:**
  - **Log a past workout.** From Today, pick the day and the date. Sets
    prefill from what the engine would have prescribed. That's about 10 taps.
  - **Ask once when a gap opens.** After 7 or more days with nothing logged,
    Today asks once: "Nothing since Tue 3 Nov — trained without logging, or
    took a break?" **Log it** opens the past-workout entry; **Break** marks
    the gap. The question is one tap to dismiss and is never asked twice for
    the same gap. It is the only way the app can know which kind of gap it
    was.
  - **Breaks are handled.** A marked break is kept out of trend and stall
    maths, so it doesn't read as a stall. After 10+ days the first session
    back steps loads back one step. Today that only happens after 28 days
    (`makeSessionEx`, `stepBack`).
- **Cost at the bar:** none, because everything happens outside a workout.
- **Measured by:**
  - Logged sessions per week match the 3–4 you train, which you confirm at
    the end of the block.
  - No unexplained empty weeks.

**M1 — Balanced size blocks: every muscle, every week, with a planned
deload.**
- **Not a specialization block.** Every muscle is trained every week, as now.
  The block plans *how many* hard sets each muscle gets, adds a little across
  the weeks, and ends in an easy week before the next block.
- **Is a one-muscle block a good strategy?** Specialization blocks exist:
  pushing 1–2 lagging muscles hard while the rest sit at maintenance. They're
  a tool for advanced lifters fixing a specific lag. They're **not** the
  right default for "grow everything evenly"; evenly planned volume is. If a
  muscle ever clearly lags, a specialization block can be an option later.
- **Problem: today's plan is uneven.** Rough weekly hard sets per muscle on
  the current A/B/C at 3 sessions a week (a helper set counts ½):

  | Muscle | Sets a week |
  |---|---|
  | Chest | ~9 |
  | Upper back and lats | ~9 |
  | Hamstrings | ~9 |
  | Side delts | ~7 |
  | Rear delts | ~6 (face pull appears twice under two spellings) |
  | Biceps | ~6 |
  | Quads | ~6 |
  | Triceps | ~4–5 |
  | Calves | 0 |
  | Abs | ~0 |

  Some muscles get half what others do, and two get nothing. The
  weekly-sets card (`weeklySetsCard`) shows this, but nothing acts on it.
- **Change:**
  - **Balance check.** Each block starts with a check: every muscle should be
    at least at a floor. The usual convention is ~8–10 hard sets a week for
    growth, ramping toward ~12–16; these are conventions and are labelled as
    such.
  - **Suggestions for any muscle below the floor,** each one tap to accept:
    add a set to a lift you already do, or add a lift.
  - **What gets suggested, given your joints:**
    - Calves: standing or seated calf raise.
    - Quads: leg extension, or more leg press sets (both easy on hips and
      knees compared with heavy squats).
    - Triceps: overhead cable extension.
    - Abs: cable crunch.
    - Nothing that loads the lower back or shoulders heavily.
  - **The ramp.** Weekly sets ramp gently, about +1 set per muscle every 1–2
    weeks, up to the block's ceiling. Set counts are prefilled, so nothing is
    typed.
  - **The deload.** Week 6 is a scheduled deload using the existing
    `startDeloadWeek()`. `deloadCheck()` stays as an early "this block is
    stale — deload now?" prompt.
  - **Fit.** The block respects 60–90 min sessions: it won't add sets past
    the coach's long-session rule.
- **Cost at the bar:** none. Sets are already prefilled.
- **Measured by:**
  - Every muscle's weekly sets inside its band in ≥ 80% of weeks.
  - The largest muscle-to-muscle gap in weekly sets shrinks from ~9 to ≤ 4.
  - The deload happens on schedule.
  - Over the following blocks, rep and load gains spread across all muscles'
    lifts, not just a few.

**M2 — Split the app into modules, with nothing able to get lost.**
- **Can something get lost? Yes, and here's how:**
  - A file isn't in the offline cache, so the app breaks offline.
  - A function ends up referenced from one file but defined in none.
  - A file is loaded twice, or in the wrong order.
  - A file exists but nothing loads it.
- **Change and guards:**
  - **One list of modules in one place.** The page and the offline cache both
    read the same list, so they can't disagree.
  - **A check that runs with every test pass:**
    - Every module is on the list and in the cache.
    - Every name used is defined exactly once.
    - All 374 functions of today's file still exist somewhere after the split.
    - Nothing on the list goes unused.
  - **Same behaviour, proven:**
    - All 28 test suites pass unchanged.
    - Replaying your real log gives 102 of 102 prescriptions identical.
    - The tap and accessibility numbers are identical.
  - **Offline-update test:** install the old version, update to the split
    one, go offline, reload. The app must boot and log a set. That's the
    failure you'd notice in the gym, so it's tested directly, then checked on
    your phone before merging.
  - **No new dependencies, no build step.** The browser loads the files
    directly.
- **Cost to you:** nothing visible.
- **Measured by:** the checks above pass on every run, not just once.

**M3 — Warm-up sets generated for your compound lifts.**
- **Problem:** your lower back and shoulders are the usual victims, and a
  cold first working set on RDL, overhead press, leg press or split squats is
  the classic setup for that.
  - Warm-ups are typed by hand today.
- **Change:**
  - 2–3 warm-up sets from today's working weight and your equipment, e.g.
    RDL 225: 95×8, 135×5, 185×3. One tap each.
  - They are on by default for compounds, and can be turned off per lift.
- **Cost at the bar:** fewer taps than typing.
- **Measured by:** warm-ups logged before the first working set on compounds
  in ≥ 90% of sessions.

### Should (4)

- **S1 Joint-aware caps on the lifts that load your lower back and shoulders.**
  - The lifts: RDL, DB overhead press, Bulgarian split squat.
  - The cap: smaller load jumps (≤ 5%), and the last set stops about 1 short
    of form breaking instead of going further.
  - It's opt-in per lift and shown on the card.
  - Measured in the simulator: no loss of progress beyond noise.
- **S2 A simulator that can judge M1's volume ramps.**
  - Port the review's stimulus lifter (`tools/review/sim.mjs`) as a gate
    before training a block.
- **S3 Learn from overrides.**
  - You change the prescribed load in ~37% of exposures.
  - When a lift is overridden the same way in 3 of its last 4 exposures, the
    coach asks once whether to change that lift's step or starting weight.
- **S4 Stall judged at block ends.**
  - Two blocks with no gain at one load counts as a stall.
  - It replaces the 15-exposure rule (review #7).

### Won't

- **A "felt that" button.** Your decision.
- **Barbell bench, squat or deadlift ladders.** Your decision. The swap
  suggestions will steer away from them.
- **Specialization blocks** as a default (above).
- **Accounts, sync, sharing, onboarding for others.** It's just for you.
- **A short-day button.** Your sessions are 60–90 min by choice.
- **A check-in before every session.**
- **The rep-out method as default.** It has 0 real uses against its gate.
- **Auto-scroll.** Your decision.
- **Social, exercise database, videos, food tracking.**

## 4. Architecture and data

| Layer | 1.x | 2.0 |
|---|---|---|
| Code | one 7,600-line `index.html` | A shell plus ~8 module files (state, engine, coach, planner, backup, each screen), loaded from one list that the offline cache also uses. Guards as in M2. |
| State | `version:5` (index.html:823) | `version:6`. Adds `program.block` (start, week, per-muscle floor/ceiling/target, deload week), `breaks[]` (start, end, kind: break or unlogged), and a warm-up setting per plan row. The migration in `normalize()` (index.html:854) only adds fields. A v5 snapshot is kept under `ironlog.v1.before-v6`. |
| Next set | `prescribe()` | Unchanged, plus S1 caps on lifts you opt in. |
| Deload | reactive `deloadCheck()` | Scheduled by the block. `deloadCheck()` is an early-exit prompt. |
| Coach | rules + Claude check-in | Adds balance suggestions (M1) and override cards (S3). Stall judged at block ends (S4). Breaks excluded from stall maths (M0). |
| Tests | 28 suites | Adds the module guard check, the offline-update test, block and balance invariants, a v5→v6 migration diff on a synthetic export, gap and past-workout journeys, and warm-up generation against plate maths. |

**Not losing a set:** the migration only adds fields. A test migrates a
synthetic v5 export, exports it again, and diffs every session against the
original. `t31` and `t34` (backup and data safety) must pass.

## 5. Validation plan

1. **The module split ships alone and first, behind every guard in M2.**
   Nothing else changes in that release, so if anything looks different it's
   the split.
2. **Before training a block,** check its ramp in the stimulus simulator
   (S2) and `yearsim`. Pre-register:
   - every muscle in band ≥ 80% of weeks
   - the deload on schedule
   - under-loading no worse than today's 32%
   - all `t43` invariants holding
3. **Real-log replay** after each step. Set prescriptions must be identical
   except where a feature intends a change.
4. **In the gym: one block** (5 weeks + deload, ~6 weeks). The numbers we
   read:
   - logged vs trained sessions (you confirm)
   - weekly sets per muscle in band
   - the muscle-to-muscle gap
   - override rate (baseline 37%)
   - warm-ups logged
   - taps to log, which must not rise

## 6. Milestones

ETAs use this sprint's measured pace. With review and fixes:
- an engine rule took ~38 min (v26.2)
- a UI feature ~39 min (v26.4)
- a CSS and accessibility pass ~50 min (v26.3)
- a test-only suite ~15 min (`t43`)

| Stage | Contents | Agent time | Gate |
|---|---|---|---|
| **2.0-a1** | M2 module split with all guards. No behaviour change. | ~3.5 h | Guards pass; 28/28 suites; 102/102 replay identical; offline update checked on your phone |
| **2.0-a2** | M0 past workouts, gap question, breaks; M3 warm-ups | ~2 h | Past workout ≤ 10 taps; gap asked once; warm-ups 1 tap each |
| **2.0-a3** | M1 balanced blocks, S2 simulator gate, S4 stall-on-blocks | ~3 h | Simulator pre-registration met |
| **2.0-beta** | S1, S3, a full review pass, merge to `main` | ~1.5 h | All suites; one gym session with no blockers |
| **Gym block** | One block on the beta | **~6 weeks calendar** | §5.4 numbers read; no data loss |
| **2.0** | Fixes from the block, docs | ~1 h | — |

Total: **about 11 hours of agent work, plus a 6-week block in the gym.**
Starting now puts 2.0 around **late December 2026 to early January 2027**.

## 7. Risks, and what stays untouched

**Risks**
- **The module split is the riskiest step.** It ships alone, behind the M2
  guards and the offline test, and is checked on your phone before merging.
- **Volume floors and ceilings are conventions, not measurements.** Start at
  the floor, ramp gently, and read recovery from stalls and how you feel.
- **Adding calves and abs adds time.** If sessions would run past 90 min, the
  block trims sets elsewhere instead of making the day longer.
- **The app can't see your joints.** Warm-ups and the S1 caps reduce common
  causes of tweaks. They're not a guarantee, and a recurring problem is worth
  a physio.
- **Scope creep.** Four Musts and four Shoulds. Anything new waits for 2.1.

**Kept from 1.x untouched**
- One-tap logging with no re-render on the set path (trap 1).
- `prescribe()`'s rules.
- The backup safety rules.
- `normalize()` as the only way into the state.
- One-tap undo.
- The coach never changes the plan by itself.

## 8. Questions still open

1. **Calves and abs:** do you want them in the plan? They're the two muscles
   at zero.
2. **Equipment:** do you have a calf raise machine, a cable stack and a leg
   extension? That decides what the balance suggestions can offer.
