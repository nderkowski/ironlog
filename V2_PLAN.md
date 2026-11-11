# Iron Log 2.0 — the reconciled plan

Status: **agreed scope; all owner questions answered 11 Nov (§7). Ready for 2.0-a1.** Written 11 Nov 2026
from three sources:
- my plan (rounds 1–3, kept in git history)
- an independent Gemini review run with [V2_PROMPT.md](V2_PROMPT.md)
- fresh checks of Gemini's claims against the code and the simulators (§1)

Real-log figures are aggregates; the export stays out of the repo.

## 0. What the owner has decided

| Decision | Answer |
|---|---|
| Who it's for | Just me |
| Training | 3–4 sessions a week, 60–90 min, A/B/C |
| Equipment | Full gym, including a cable stack (its pins aren't 5 lb apart) and a leg extension |
| Goal | Even size across every muscle, no imbalances |
| Calves | Excluded (big enough, they cramp) |
| Abs | Yes; no favourite exercise yet |
| Joints | Lower back and shoulders get tweaked most. Heavy squats hurt the hip and knees. No barbell big three. |
| Pain button | No |
| Log gaps | A mix of breaks and unlogged sessions, unknowable which |
| Modules | Yes, if nothing can get lost |
| Auto-scroll | No |
| Colours | May change if readable (done in v26.12–13) |

## 1. Gemini's review, checked

Every code claim was checked in `index.html` (v26.13). Every engine claim
was re-run in the review's simulator (`tools/review/sim.mjs`, 100 lifters,
on v26.13, not the older build the review used).

| Gemini claim | Verdict | Evidence |
|---|---|---|
| Logging is surgical: `toggleSet`/`refreshSetRow`/`refreshPlates` never rebuild the view | ✅ | index.html:3005–3029, 3202 |
| The engine trails plain double progression (DP) by −0.20 pp/yr | ⚠ **Stale** | That was v26/v26.1. On v26.13 it is **−0.06 ± 0.05** (logged schedule) and **−0.14 ± 0.06** at 3+/wk. The v26.2 near-miss rule closed two-thirds of the gap. |
| `trend()` load cuts fire inside noise; remove them | ✅ **Strongly** | Removing the cut takes v26.13 to **+0.06 ± 0.04** vs DP (logged schedule) and **+0.09 ± 0.04** at 3+/wk. That's a paired gain of +0.12 to +0.24 pp/yr, and the engine then beats DP. |
| A top set plus back-off RDL gets a permanent hold | ✅ **On your log** | Your last two RDL sessions were top set + back-offs. v26.13 answers "Fell short — run it back" and "Only 2 of 3 sets at the top weight — get them all there first" (`droppedSets()`, `prescribe()`). It never progresses that structure. |
| Removing the step-back is safe | ❌ (Gemini didn't claim it; checked anyway) | Without it, stuck lift-years double (109 → 214). The step-back stays. |
| The two engines contradict each other on the card | ✅ | The shadow strip under the main call after 12,12,11 (HANDOFF P1.3). The rep-out method has **0 real uses**. |
| You change the load in 37% of exposures | ✅ | Independent review R1. |
| Changing set 1's weight doesn't carry to the next sets | ✅ **Not mentioned anywhere before** | The stepper and input handlers (index.html:3085, 3183) change only that set, so every override costs extra taps per set. |
| One light day becomes the new baseline | ✅ | `lastW` is the last session's first set (index.html:2757), so "Keep" shows the light weight. `sinceChosenDrop()` also resets the trend history after a chosen drop. |
| Cable stacks get phantom weights | ✅ | `stepFor()` is one fixed step (`ex.inc`). A stack going 27.5 → 35 gets asked for 32.5. |
| An unlogged session leaves the rotation stuck | ✅ | `nextRoutine()` (index.html:2694) reads only the last logged session. |
| Deltoids are one muscle | ✅ | `MUSCLES` (index.html:1608) has a single `delts`. |
| The weekly-sets card nags about calves | ✅ | `weeklySetsCard` lists every untrained muscle by name, calves included. |
| The stall rule needs `max(6, 3×cycle)` exposures | ✅ | index.html:6880–6902. That's 15 on an 8–12 lift. |
| `sw.js` swallows install failures | ✅ **Important for the split** | `SHELL.map(u => c.add(u).catch(() => {}))`. A missing file would install a broken offline copy. |
| `manifest.webmanifest` vs `manifest.json` mismatch | ❌ **Not a bug** | I renamed it to `.json` in the package so Gemini's upload would accept it. The app is consistent. |
| Weekly set ramps lack hypertrophy support (Enes 2024) | ✅ **I concede** | Matches our own RESEARCH.md ("possible small hypertrophy benefit"). My round-3 ramp is dropped. |
| Self-rated reps-in-reserve is off by 2–5 reps at 12–20 (Zourdos 2021) | ? **Unverified** | Not in RESEARCH.md. It doesn't change any decision, since no RIR button is planned either way. |
| An 18-session block catches 100% of stalls | ⚠ **Over-promised** | v26's spam test: a rule judging ~6 exposures raised **37 cards a year** on a healthy lifter, because rep noise is the size of the gain. One block gives ~6 exposures per lift. The block scorecard may *report*; a *stall verdict* needs two blocks. |
| The proposed split puts every muscle at 9–16 sets a week | ⚠ **Not by its own table** | Counting its days (helper sets = ½): rear delts **~6 per rotation**, abs **3–6**, front delts ~7.5. Below its own floor. Fixable (§3, S1). |
| Defer `skipWaiting()` while `S.active` exists | ⚠ **Can't work as written** | A service worker can't read localStorage. The page has to tell the waiting worker when no workout is active. |
| `?v=BUILD` on every import | ⚠ **Avoidable** | One more string to forget each release. Not needed with the split in M5 below. |
| Build the Node simulator first (M0), importing `js/engine.js` | ⚠ **Wrong order** | That file only exists after the split. Use the review's browser simulator until then; it ran 100 lifters in 12 s. |

**Net:** Gemini found real problems I hadn't:
- the set-1 cascade
- the usual-load chip
- stack pins
- the top-set + back-off hold
- the trend cut's cost
- the service-worker install bug
- rotation-native counting

Its numbers were partly stale, and a few designs need fixing. No further
questions for Gemini are needed; the open questions are yours (§7).

## 2. Thesis

> **Iron Log 2.0: one engine that follows how you actually lift, a plan
> balanced by design and counted in rotations rather than calendar weeks — on
> a codebase split into files without losing anything.**

## 3. Scope

### Must (5)

**M1 — One engine, two schemes, no phantom weights.**
- **Change:**
  - **Two schemes, chosen per lift:**
    - `double`: today's double progression, including the near-miss rule.
      The default.
    - `topback`: one top set plus 2 back-offs at about −12%. The back-offs
      count as planned, not as "dropped".
  - **Remove** the trend-based load cut. The trend stays as a badge on
    Progress.
  - **Keep** the step-back and the failed-jump memory.
  - **Retire** the rep-out shadow and its "Use" strip (0 real uses; it
    contradicts the main call).
  - **Stack weights per machine** (owner, §7 Q5): a "Stack weights" field
    on the plan row, typed once (e.g. `20, 27.5, 35, 42.5`). The next weight
    up or down snaps to that list. With no list, the fixed step applies as
    today. Nothing is learned silently.
- **Why:** sim +0.12 to +0.24 pp/yr vs v26.13; the RDL hold ends; no more
  32.5 on a stack that jumps 27.5 → 35.
- **Cost at the bar:** fewer overrides; the second strip goes away.
- **Gate:**
  - ≥ DP in the review simulator at both schedules.
  - Stuck lift-years ≤ 109.
  - Spiral lift-years ≤ 97.
  - `t43` invariants green, with the grid invariant extended to allow pins.
  - Real-log replay: RDL progresses under `topback`, and every changed call
    is listed.

**M2 — Fewer taps when you deviate.**
- **Change:**
  - **Set-1 cascade:** changing the weight on set 1 updates the following
    undone working sets that still hold the old prefill. Inputs are updated in
    place; nothing re-renders (trap 1).
  - **Usual-load chip:** after a single self-chosen light day, the card offers
    "Usual: 65 × 10" as one tap.
  - **"Trained Day B, didn't log it":** one tap on Today, with 10 s undo.
    The rotation advances and the session counts toward frequency. It's
    excluded from volume, trends and skipped-lift maths.
  - **Ease-back chip** after 10+ days with nothing logged. It's one tap and
    applies to that session only, not automatically.
- **Gate:** journeys measured by real taps:
  - an override on 3 sets goes from 6 taps to 2
  - an unlogged session takes 1 tap
  - no extra tap on the normal path

**M3 — A muscle model that can plan balance.**
- **Change:**
  - `delts` becomes front, side and rear delts.
  - `core` becomes a planned target (abs).
  - `excludedMuscles: ["calves"]`, so no nag.
  - **A balance card on Plan:** sets per muscle per rotation, projected to
    a week at your frequency, against a 9–16 band. Excluded muscles are shown
    as "by choice".
  - **Progress counts volume per rotation,** the last 3 non-deload sessions,
    not per calendar week. That ends the fake swings when A/B/C runs 4 times a
    week.
- **Gate:**
  - Muscle tags re-resolved for all 18 lifts in your log, with no muscle
    history lost.
  - Every non-excluded muscle on the 2.0 plan sits inside the band.

**M4 — Blocks counted in rotations.**
- **Change:**
  - A block is 6 rotations (18 sessions, about 5 weeks at 3.5 a week).
    Today shows "Rotation 4 of 6".
  - After session 18 comes a **block scorecard**:
    - per-lift change
    - override rate
    - muscle balance
    - one-tap choices: deload rotation, a swap or range change for a flat
      lift, or start the next block
  - A **stall** is only declared after two flat blocks, to avoid card spam.
  - **No automatic set ramps** (Enes 2024).
- **Gate:** the `t39b` spam check stays at or under 12 cards a year.
  Scorecard numbers match a hand calculation on a scripted block.

**M5 — Split into files with a proof nothing was lost.**
- **Change:**
  - **Step 1 is a mechanical split** into ordered classic script files
    (`js/01-state.js` … `js/09-boot.js`) plus `css/app.css`. The app is
    already one sealed function with no inline handlers and no `eval`
    (checked), so this split can be **proven lossless**: the files joined in
    order must equal today's code byte for byte, and a test checks exactly
    that.
  - **A single list of files** is read by the page, the offline cache and the
    tests, so none of them can disagree.
  - **Fix the offline install:** `cache.addAll` over the list, so a missing
    file fails the install instead of shipping a broken offline copy.
  - **A new worker waits until no workout is active.** The page messages it;
    the worker can't read localStorage itself.
  - **The engine file loads in Node** for fast simulations.
  - Native ES modules with imports can come later, file by file, only if
    wanted. They add a "forgot an import" risk that the joined-files proof
    can't catch.
- **Gate:**
  - the byte-identical join
  - 28/28 suites
  - 102/102 replay identical
  - identical journeys numbers
  - an offline cold boot that logs and saves after an update
  - checked on your phone

### Should (5)

- **S1 — Keep the current plan and add only what's missing** (owner, §7 Q3).
  - Gemini's split would have replaced ~15 of ~20 exercises, each starting
    with no history.
  - The additions, put into both week variants of B and C through
    `eachPlanEx()` and `newPlanEx()`:
    - **B:** + Cable Crunch 3 × 10–15, + Overhead Cable Tricep Extension
      3 × 10–15, Lateral Raise 3 → 4.
    - **C:** + Cable Crunch 3 × 10–15, + Leg Extension 3 × 10–15.
  - Per rotation (helpers ½):
    - abs 0 → 6
    - quads 6 → 9
    - triceps ~7.5 → ~10.5
    - side delts ~8.5 → ~9.5
    - the rest unchanged at ~7.5–9
  - Session sets: A 22, B ~25, C 24. Supersetting the new cable moves keeps
    B and C inside 90 min.
  - Offered from the balance card as one-tap additions, never applied
    silently. `S.planBackup` keeps the old plan one tap away.
  - RDL stays (owner: it hasn't hurt) and runs `topback`. The seated DB
    overhead press stays.
- **S2 — A "Pump day" button on Today** (owner: yes).
  - It's an optional routine you slot in when you want. It never moves the
    A/B/C rotation, never triggers skipped-lift cards, and counts toward
    volume and frequency.
  - Cables and isolations only, so it's fine on a back-to-back day.
  - It starts from Gemini's two menus as its week variants (arms/delts;
    chest/lats/core), and is editable like any day.
- **S3 — Warm-up sets generated** for compounds (my round-3 item), one tap
  each. That matters most for the hinge and the presses.
- **S4 — Hit-target polish:**
  - "+ Note on this lift" and the revert chip to 44 px
  - the outer steppers to 44 px where width allows, keeping the 5 px dead
    strip
  - a warm-up flip can't happen on a set already ticked
- **S5 — Bridge sets for coarse jumps,** simulator-gated. About 6% of
  simulated lift-years still spiral, the same as before the sprint and
  unaffected by the trend, step or jump rules. That points at coarse dumbbell
  steps. Ship only if the simulator shows spirals falling.

### Won't

- **Unit snapping:** you log in lb only.
- **The rep-out scheme:** 0 uses, spiral risk.
- **Readiness surveys, a pain button, RIR prompts.**
- **Weekly set ramps.**
- **AI-written daily prescriptions:** they'd break offline use and can't be
  tested.
- **Specialization blocks.**
- **Accounts, sharing.**
- **`?v=` import strings:** not needed with M5's split.

## 4. Data (schema v6)

`S.version = 6`, same storage key. The migration lives in `normalize()`, runs
once, and only adds fields. A raw v5 snapshot is written once to
`ironlog.v1.v5-backup`, with a "Restore pre-2.0 data" button in Settings.

| Where | Adds |
|---|---|
| `settings` | `targetFreq` (computed from logged weeks, editable), `excludedMuscles`, `blockRotations: 6`. `repOutDefault` is retired. |
| Plan row | `scheme: "double"\|"topback"`, `backPct: 0.12`, optional `pins[]`. Built **only** in `newPlanEx()` / `planExFromSession()` (trap 13). |
| Sets | `role: "top"\|"back"` on `topback` lifts |
| Sessions | `unlogged: true` (M2), `easeBack: true` |
| `S.block` | `{num, startSessId, rotation, history[]}` |
| Muscles | `delts` → `front_delts`/`side_delts`/`rear_delts`, re-guessed by name on plan rows and tagged history. `core` kept as abs. |

**Not losing a set:**
- A test migrates a synthetic v5 export, exports it again, and diffs every
  session against the original.
- The session count is preserved, so the backup's fewer-sessions guard stays
  satisfied.
- `t31` and `t34` (backup and data safety) stay green.
- A gist backup and a file export are taken before the first 2.0 build runs
  on your phone.

## 5. Validation before the gym

1. **The review simulator** (browser, 100 lifters, ~15 s a run) at the logged
   and the 3+/wk schedules, as a gate for M1 and S5. A Node port comes after
   M5.
2. **`yearbase` and `t43` invariants:** no regression from the sprint
   numbers (under-loaded ≤ 32%).
3. **Real-log replay** after every milestone: every changed call listed and
   explained.
4. **Journeys** (taps, targets, axe, offline) after every UI milestone.

## 6. Milestones

ETAs use the sprint's measured pace (engine rule + simulation + review ≈ 40
min; UI feature + review ≈ 40–50 min; test-only ≈ 15 min).

| Stage | Contents | Agent time | Gate |
|---|---|---|---|
| **2.0-a1** | M5 split, offline install fix, the file list, migration scaffold (v6, no behaviour change) | ~3.5 h | §3 M5 gate, checked on your phone |
| **2.0-a2** | M1 engine (schemes, no trend cut, pins), simulator runs, replay | ~3 h | §3 M1 gate |
| **2.0-a3** | M2 cascade, usual-load chip, off-book session, ease-back | ~2 h | Journeys taps |
| **2.0-a4** | M3 muscles and balance card, M4 blocks and scorecard | ~3.5 h | Band met; `t39b` ≤ 12/yr |
| **2.0-beta** | S1–S4 (S5 if the simulator says so), full review pass, merge to `main` | ~2.5 h | All suites; one clean gym session |
| **Gym block** | 6 rotations on the beta | **~5–6 weeks** | Override rate < 20% (from 37%); 1-tap logging intact; scorecard sane |
| **2.0** | Fixes, docs, retire leftovers | ~1 h | Replay of the new export green |

Total: **~15 hours of agent work plus one block in the gym.** If a1 starts
this week, 2.0 lands around **early-to-mid January 2027**. Each alpha merges
to `main` only after your phone check, behind `settings.v2` where behaviour
changes.

## 7. Owner answers (11 Nov), all questions closed

1. **RDL:** it hasn't hurt the back. Keep it, as `topback` (top set +
   back-offs, the way it's lifted).
2. **Overhead press:** keep the seated DB overhead press.
3. **Split:** keep the current exercises and add only what's missing (S1).
4. **Pump day:** yes, as an optional button to slot in when wanted (S2).
5. **Cable stacks:** type each machine's weights once (M1).
