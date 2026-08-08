# Iron Log — external review

Reviewed at v18 (`45c4308`), 8 Aug 2026. Written by a model that had no part in
building the app, per `REVIEW_PROMPT.md`. Everything below labelled
**verified** was reproduced against the real code — either by driving the UI
with Playwright at 390×844 (the same harness as `tools/test/`), or by calling
the real engine functions in-page via an instrumented copy of `index.html`
served from a scratch directory (a `window.__E = {…}` export added before the
closing IIFE; the repo copy was not touched). Where a claim needed thousands of
runs, a transcribed replica of `trendAt()`/`prescribe()` was used and
cross-checked against the real engine on the same scenario. All 287 existing
assertions pass before anything below (t20 8, t21 43, t22 19, t23 24, t24 68,
t25 40, t26 37, t27 48).

The short version:

- **The engine has one serious bug**: the 10% back-off is not "once". In a
  closed loop it re-fires every 4 sessions and walks a *progressing* lifter
  from 185 lb to 95 lb. One bad day is enough to start it, and so — under a
  realistic set-to-set fatigue model — is a perfectly executed load step. This
  is the top item in the whole review and the fix is small and validated below.
- Three more priority-1 defects: renaming a lift onto an existing name merges
  two histories silently and leaves ghost PR flags; editing an old session
  silently rewrites bodyweight/assisted loads with *today's* bodyweight; and a
  state without a `sessions` key bricks the app to a blank page.
- Everything else found is small. The seams the prompt worried about — v1
  import, huge logs, variants, empty log — are in good shape. The maths is
  mostly right; the v16 trend fix genuinely works for what it was tested
  against. What it was never tested against is its own output feeding back in,
  and that's where the serious bug lives.
- Several statements in the docs are wrong by measurement; they're listed in
  §1.11 so the docs can be corrected rather than trusted.

---

## 1. What is broken now

Ordered by the roadmap's own rule: trust first, per-session friction second,
feature-request territory last.

### 1.1 The back-off death spiral — `prescribe()` cuts 10% repeatedly and can bury a progressing lifter  ⚠ P1, the most important finding

**Symptom.** After any event that flips a lift's trend to "down" — one sick
day, or (see below) nothing more than a normally-executed load step — the app
cuts the weight 10%, then cuts *again* every 4 sessions, indefinitely, even
while the lifter does exactly what the card says. `PROJECT_STATE.md` says
"Back-off fires once and then holds" and "the guard exists because without it
… the app chases itself down". **The guard does not work. The app chases
itself down.**

**Cause.** Two interacting decisions in `prescribe()`'s down branch
(`index.html:1635–1651`):

1. The "already backed off" guard looks at `hist.slice(1,4)` — only the last
   **3** sessions. After a cut, three obedient sessions at the cut weight push
   every heavier session out of that lookback; `w < peak` becomes false and
   the branch cuts another 10%. But the trend window is `cycle+3` (≈9)
   sessions, so the slope still contains the pre-cut scores and stays ≤ −2%.
   Guard window (3) ≪ trend window (9) ⇒ the guard always expires first.
2. While the trend is down and the guard *does* hold, the prescription is
   `{w, r: low}` (`index.html:1643`) — reps pinned to the bottom of the range
   every session. An obedient lifter therefore never produces a rising e1RM,
   so the trend cannot recover, so the guard eventually expires, so it cuts
   again. The prescription suppresses exactly the evidence that would clear
   the verdict. A staircase of cuts every 4 sessions has a permanently
   negative slope over a 9-session window; the loop never exits.

**How it gets triggered without a bad day.** Under a realistic fatigue model
(last set 1–2 reps behind the first — which is what real sets look like), the
lifter sits at e.g. 12/12/11 for several sessions because `minR` gates the
progression, then finally hits 12/12/12 and takes the +5 lb step. The reset to
190×8–9 drops the top-set e1RM ~4–5% below a window that is otherwise flat —
slope −2.5%, verdict "down", cut. Trap 17's lesson (any e1RM signal must
survive the sawtooth) was applied to `trend()` but never to *`prescribe()`'s
reaction* to `trend()`.

**Verified**, three ways:

- *Closed loop against the real engine* (instrumented copy, real
  `prescribe()`/`trend()`, simulated lifter with true 1RM rising 250→295 over
  60 sessions, one rep per set of fatigue, lifter always does what the card
  prescribes). Excerpt of the actual trace:

  ```
  s29 [flat  0.0%] reps   185 x 12/12/12   Same weight — go for 12
  s30 [flat -1.8%] up     190 x 8/8/8      Hit 12s on every set — add 5 lb
  s31 [down -2.5%] reps   190 x 9/9/9
  s32 [down -6.0%] deload 170 x 8/8/8      Sliding 3 sessions — back off to 170
  s33–35           hold   170 x 8/8/8      Already backed off — beat this before adding
  s36 [down -10.5%] deload 155 x 8/8/8     Sliding 3 sessions — back off to 155
  … cuts continue every 4 sessions …
  s56 [down -7.3%] deload  95 x 8/8/8
  ```

  Final state: **95 lb prescribed to a lifter whose true 1RM had risen to
  294.** Seven cuts. The same run with a genuine decline (1RM 250→202) cut
  185→120 — roughly double the real loss.

- *One bad day, end-to-end through the real UI on :8117*: seed a flawless
  185 lb ramp, one 4/3/2 session, the 10% cut taken, then four obedient
  165×8/8/8 sessions. Start the next workout and the card reads:

  ```
  meta:    3 × 8–12 range  SLIPPING
  why:     ↓ Sliding 3 sessions — back off to 150
  prefill: 150
  ```

  With only *three* obedient sessions the bad day is still inside the
  3-session lookback and it holds — which is why this survived spot-checks.
  The fourth session is when the second cut fires.

- *Why t26 didn't catch it*: t26 seeds flawless runs where every set is equal
  (no set-3 lag) and reads a single verdict — it never feeds a prescription
  back in as the next session. The false "down" needs either a bad day or the
  censored-plateau-then-step shape, and the spiral needs the loop closed.

**Severity.** Priority 1 by the project's own definition. It prescribes wrong
numbers, and it does so most aggressively to someone doing everything right.
It also silently invalidates PRODUCT.md's core claim ("the progression engine
is the actual product … it depends on the engine being trustworthy").

**Fix (validated).** Two changes in `prescribe()`; the first is the
load-bearing one:

1. **Extend the back-off guard's lookback to the trend window.** Replace
   `hist.slice(1,4)` with `hist.slice(1, 1+Math.max(6, cycleOf(name)+3))`.
   Rule stated in words: *never cut again while the current weight is still
   below the heaviest first-set weight anywhere in the window the "down"
   verdict was computed from.* One cut per genuine decline episode, by
   construction.
2. **Let the rep climb run while holding after a back-off.** In the
   `alreadyDown` branch, prescribe the normal double-progression next-rep
   (`minR>=low ? min(top, minR+rstep) : low`) instead of pinning `r: low` —
   still refusing to add load. This lets an obedient lifter generate the
   rising e1RM that clears the verdict.

   Closed-loop results of the same scenarios with these applied (replica
   engine, which reproduces the real engine's 7-cuts/95 lb behaviour exactly
   on the unpatched path):

   | scenario | current engine | guard fix only | both fixes |
   |---|---|---|---|
   | gainer + one sick day | 9 cuts, ends 70 lb | 1 cut, ends 190 | 1 cut, ends 190×10/10/10 |
   | flawless gainer (organic trigger) | 7 cuts, ends 95 | 1 cut, ends 190 | 1 cut, ends 190×10/10/10 |
   | genuine decline (true 8RM falls to ~160) | 4 cuts, ends 120 | — | 1 cut, holds 165 |

   The genuine-decline case still gets its one cut and lands 5 lb above the
   true 8RM instead of 40 lb below it.

3. **Add the missing test**: a `t28` that runs the engine closed-loop — seed
   nothing, loop *prescribe → simulate a fatigued-but-progressing lifter →
   log → repeat* 40 times through the UI or storage, and assert the weight
   path never falls more than one cut below its peak. Trap 17 says "simulate
   a perfect run through any new signal first"; the missing half is *simulate
   the loop, not just the signal* — prescriptions are inputs to the next
   session, and no current test closes that loop.

### 1.2 Renaming a lift onto an existing name merges two histories silently, leaves ghost PRs, and duplicates the plan entry  ⚠ P1

**Symptom.** Rename "Curl" to "Barbell Curl" while a lift by that name already
exists: no warning, no undo, the two histories are permanently fused, sets
keep PR flags that are not PRs of the merged lineage, and the plan day now
contains two identical "Barbell Curl" rows.

**Cause.** `renameExercise()` (`index.html:2889–2896`) rewrites names in plan,
history and active session, then calls `save()` — and nothing else. It never
checks whether the target name exists, never calls `recomputePRs()` (trap 8:
"after *any* history edit"— a merge is the biggest history edit there is),
never dedupes the plan, and offers no undo for the one destructive action in
the app that has none (delete session/exercise/day all have one).

**Verified** through the real UI: seeded "Barbell Curl" 100×10 (10 days ago,
`pr: true`) and "Curl" 60×10 (5 days ago, `pr: true`), renamed Curl →
Barbell Curl via the plan ⋯ menu. Result in storage: the 60×10 set still
carries `pr: true` under a lift whose best ten days earlier was 100×10, and
`plan = ["Barbell Curl", "Barbell Curl"]`. No sheet, no toast beyond
"Renamed".

**Severity.** P1 — wrong records, irreversibly merged data, and it is exactly
the operation someone performs when tidying names ("DB Press" → "Dumbbell
Bench Press"). Note the flip side: merging *on purpose* is genuinely useful
(it's the "swap an exercise but keep the history joined" feature already on
the ideas list). The bug is that it happens silently.

**Fix.** In `renameExercise()`: if `normName(newName)` already exists anywhere
(plan or history), show a confirm sheet — "Curl already has 12 sessions.
Merge histories? This can't be undone." — with a whole-`S` snapshot undo like
`setUnit()` has. On confirm (and on every rename): `recomputePRs()`,
`writeNow()` instead of `save()`, and drop exact-duplicate plan rows within
the same variant. Mechanical; ~20 lines.

### 1.3 Editing an old session rewrites bodyweight/assisted loads with today's bodyweight  ⚠ P1

**Symptom.** Open a months-old session containing a bodyweight or assisted
lift, change *anything* — the note, the date — and save. Every set's stored
`load` in that session is recomputed from your *current* bodyweight. The
model's core promise ("`load` is resolved and stored at log time, so changing
your bodyweight setting later never rewrites history",
`PROJECT_STATE.md`) is broken by the editor.

**Cause.** `commitEdit()` (`index.html:3420–3423`) does
`s.load = effLoad(s.w, mode, d.bw !== undefined ? d.bw : S.settings.bodyweight)`
for **every set of every exercise** in the draft. Sessions logged before the
`bw` snapshot field existed have `d.bw === undefined`, so they get today's
bodyweight. It also re-resolves sets whose `w` was never touched.

**Verified** through the real UI: session 30 days old, `Weighted Pull-up`
+25 lb, stored `load: 205` (logged at bodyweight 180), settings bodyweight
since changed to 200. Edited only the note, saved. Stored load became **225**.
That shifts e1RM history, PRs and trend for that lift — silently, on an edit
that touched nothing numeric.

**Severity.** P1 — silent history rewrite. Bounded (only pre-snapshot
sessions, only bw/assisted lifts), but it corrupts precisely the sessions the
editor exists to *fix*, and every edit widens the damage.

**Fix.** In `commitEdit()`, keep a set's existing `load` unless its `w`
actually changed in the draft; when it did change and the session has no `bw`
snapshot, derive the session's implied bodyweight from any *unedited* sibling
set (`load − w` for mode 1, `load + w` for mode 2) before falling back to
`S.settings.bodyweight`. Also then backfill `d.bw` so the session is
self-describing from then on.

### 1.4 A state without `sessions` bricks the app to a blank page  ⚠ P1 (robustness; low likelihood)

**Symptom.** If `ironlog.v1` ever contains a state whose `sessions` key is
missing (or not an array), the app renders nothing at all — blank `#view`,
dead tabs — and stays that way on every reload until storage is cleared.

**Cause.** `normalize()` (`index.html:715–734`) fixes settings, plates and
routine variants but never touches `sessions` or `active`. `load()` only
checks `s.routines`. First read (`nextRoutine()`, `index.html:2032`
`S.sessions.find`) throws.

**Verified**: booted with `{version:5, settings, routines}` and no `sessions`
key → `#view` empty, `TypeError: Cannot read properties of undefined (reading
'find')`. The importer's truthiness check blocks a *missing* key but happily
passes `sessions: {}`, which reaches `recomputePRs()` and throws mid-import
(before `writeNow()`, so that path at least doesn't persist the damage).

**Severity.** P1 class (total loss of access) but low probability — it needs a
hand-edited or truncated backup, or a partial write. Worth two lines given
`normalize()` is *documented* as "the only door into the state": today the
door doesn't check the whole shape.

**Fix.** In `normalize()`:
`if(!Array.isArray(s.sessions)) s.sessions=[];`
`if(!Array.isArray(s.routines)) s.routines=[];`
`if(s.active&&!Array.isArray(s.active.exercises)) s.active=null;` — and while
there, default `exercises`/`sets` arrays per session for the same reason.

### 1.5 `deloadCheck()`'s `≤ 0` threshold miscounts wide-range heavy lifts as stalled  — P1-edge

**Symptom.** A lift on a wide rep range at a heavy load can be counted toward
"time to deload" while progressing flawlessly.

**Cause.** The long-window separation the docs rely on ("flawless never drops
below +0.35%, a stall is 0.00%, `pct <= 0` splits them cleanly",
`PROJECT_STATE.md` and `index.html:1087–1095`) does not hold at wide ranges:
the 5 lb step shrinks relative to the load while the cycle stretches, and the
worst phase of a flawless run crosses zero.

**Verified** against the real `trendLong()` — flawless runs, every phase, min
long-window slope:

| range | @225 | @315 |
|---|---|---|
| 8–12 | +1.01 | +0.64 |
| 8–15 | +0.56 | +0.33 |
| **8–20** | **+0.02** | **−0.13** |

Stall reads exactly 0.00 (confirmed), so at 8–20 the two classes overlap and
`≤ 0` cannot separate them. The default tiers (5–8, 8–12, 12–16, 30–60s) are
all safely clear — this only bites manually-widened ranges — and with ±1-rep
noise the misclassification rate at default ranges stayed 0.0–0.3% over
~4,000 checks. So: real, narrow, not urgent.

**Fix.** Either derive the boundary per lift — a flawless run's expected rate
is computable, `expected = 100·3·step/(cycle·e1RM)`, so count "stalled" as
`pct <= expected/2` — or simply skip lifts whose `cycle > 8` in
`deloadCheck()` and say so in the sheet, matching the existing honesty about
wide ranges reading slower.

### 1.6 The lift sheet's "Trending down" banner describes an algorithm deleted in v16 — P2 (trust copy)

**Symptom.** Open a slipping lift's chart: "Three sessions below the three
before. The app has already dropped your next prescription 10% — take it,
then build back."

Both sentences are wrong. The 3-vs-3 comparison is the algorithm v16 removed
(`index.html:3226–3227` vs the actual slope at `1070–1083`), and "has already
dropped 10%" is frequently false — the next prescription may be a hold
("Already backed off") or, today, a *repeat* cut. **Verified**: seeded a
genuine decline, read the banner through the UI.

**Fix.** Reword to describe the slope ("Falling about N% per three sessions
over the last M"), and state what the *next* prescription actually is by
calling `prescribe()` — the plan-menu subtitle already does exactly this
(`index.html:3981`).

### 1.7 The "Holding flat" banner tells you to set a rep range you already have — P3

`index.html:3229–3231` shows "Set a rep range on this lift so it climbs by
reps before it climbs by weight" for every flat lift. **Verified**: a lift
*with* an 8–15 range, flawless (wide ranges legitimately read flat — the docs
say so), still gets the advice. It's noise that undermines the card's
authority. Fix: only show when `!(repTop>reps)`; when a range exists, either
say nothing or show the honest "wide ranges read slower" note from the Plan
tab.

### 1.8 DST fall-back drops an hour of sessions from both weeks — P3

`weekBounds()` (`index.html:1519–1525`) takes local Monday midnight and adds
exactly `7·864e5` ms. Across a fall-back the true week is 7 d + 1 h, so last
week's `end` lands one hour *before* this week's `start`. **Verified** with
the function transcribed verbatim under `TZ=America/Chicago`, now = Wed 4 Nov
2026: last week ends Sun 23:00, this week starts Mon 00:00, and a Sunday
23:30 session is in *neither* — it vanishes from weekly sets and the volume
comparison (charts and history are unaffected). Twice a year, one hour,
late-Sunday sessions only. Fix: compute `end` the same way as `start`
(`d.setDate(d.getDate()+7)`) instead of adding milliseconds.

### 1.9 A 35 lb women's bar "snaps" to 20 kg on unit conversion — P3

`cvBar()` (`index.html:1174–1178`) snaps any bar equal to `settings.bar` to
the new unit's *default* bar. If the configured bar is a 35 lb women's bar,
conversion produces a 20 kg bar (**verified**: 35 → 20; a 60 lb trap bar
correctly converts to 27.2). The right answer is 15 kg. Fix: snap table
`{45↔20, 35↔15, 33↔15}` rather than "equal to settings.bar ⇒ default"; or
convert anything that isn't 45/20 exactly.

### 1.10 `cycleOf()` ignores the 5-second step for timed work — P3 (calibration, not correctness)

`cycleOf` (`index.html:1030–1046`) is `repTop − reps + 1`, assuming a 1-unit
step. Timed work steps by 5 s (`metricStep`, `index.html:912`), so a 30–60 s
plank has a true cycle of 7 sessions but `cycleOf` returns 31, giving a trend
window of 34 sessions and a deload window of 65. **Verified**: real engine
returns 31; consequences checked by simulation — a flawless weighted plank
never reads down (min +5.2% across all phases; the feared time-sawtooth false
positive does *not* occur, because +5 s on a 30 s base outweighs the load
reset), so this is benign for prescriptions. The cost is that trend chips on
timed lifts effectively never leave "flat" and a fortnightly plank needs
years of data to fill its window. Fix:
`(top-lo)/metricStep(metricOf(ex)) + 1`.

### 1.11 The docs are wrong in five checkable places

Per the brief — "if you think something in them is wrong, check it and say
so":

1. **`PROJECT_STATE.md` "Back-off fires once and then holds"** (Verified
   working list) — false; see §1.1. The guard holds for exactly 3 sessions.
2. **`PROJECT_STATE.md` "flawless never drops below +0.35%"** (deloadCheck
   section) — false at wide ranges / heavy loads; measured −0.13% at 8–20
   @315, +0.02 at @225 (§1.5). True at the default tiers.
3. **Suite counts**: "t20–t23, 88 assertions" — they are 94 (8+43+19+24).
   "t27, 45 assertions" — it is 48. The 287 total is right.
4. **The Epley correction in `ROADMAP.md` is confirmed** — I rebuilt the
   table independently against a standard %1RM reference: mean |error|
   1.09 pp (Epley), 1.19 (Wathen), 2.09 (Brzycki), 3.79 (Mayhew), 4.18
   (Lombardi); Brzycki −12.8 pp at 20 reps. One nuance the note doesn't
   mention: over the isolation band (12–16) specifically, Wathen (0.97 pp)
   edges Epley (1.55 pp). Not worth a swap — the difference is under a pound
   on a curl — but worth recording since v13 made 12–16 the isolation
   default. "Do not swap the formula" stands.
5. **The keep-alive tone level**: the doc says "about −27 dBFS", the code
   comment says −24. Amplitude 0.06 is −24.4 dBFS peak, −27.4 RMS. Both are
   "right"; pick one convention.

### 1.12 Verified working — checked and healthy

Reported because the prompt asked for seams to be probed; these all held:

- **Huge log**: 725 sessions / 3 years / 1.28 MB of JSON. Boot+Today 92 ms,
  session start with 6 prescriptions 113 ms, set log ~40 ms, Progress 102 ms,
  lift sheet 160 ms. No cliff anywhere near realistic sizes; localStorage has
  ~4× headroom left. The O(sessions×exercises) full-walks everywhere are fine
  and not worth caching.
- **v1-shaped backup import** (no `version`, `r.exercises`, bare sets without
  `load`): migrates to v5, plan intact, `r.exercises` deleted, and the next
  prescription correctly progresses off the v1 history (135 → 140 straight
  sets). The importer also correctly rejects non-JSON and missing-key files.
- **Empty log**: covered by t25/t27 and re-checked incidentally throughout;
  the fresh-install restore card keys off "no data" as documented.
- **Week variants**: shared-lift history joins, per-week trend honesty note,
  and both rotations behaved in every state I generated (t24's coverage here
  is genuinely good).
- **Trend v16, on its own terms**: across 30 range×load combinations and
  every phase, a flawless run *never* reads "down" (worst short-window
  −1.09% at 8–20 @315, threshold −2). A pure stall reads exactly 0.00. A
  real decline is caught in 2–4 sessions depending on rate. With ±1 rep of
  noise: 0.0% false "down" in ~1,000 checks at 8–12; ±2 reps: 0.56%. The
  *signal* is solid; §1.1 is about the *response*.
- **`deloadCheck` on sane plans**: never fired across 200 noisy progressing
  3-lift trials; fires correctly (2 of 3 stalled → "high") on genuine stalls.
- **RPE hold** (mean ≥9.5 → repeat), **assisted inversion** (progress =
  assistance down, back-off = assistance up), **unloaded timed progression**
  (top is a floor), **weighted plank** (no false decline) — all behave as
  documented under simulation.

### 1.13 Suspected, unverified

- **Prefill-anchoring in the rep data.** One-tap logging means a set logged
  without editing records the *prescribed* reps. I could not measure how
  often that happens (no real log in the repo), but every engine feature
  reading rep patterns — including the drop-off idea in §2.4 — depends on
  this rate being low. Worth measuring before building anything on it (§2.4).
- **`refreshSummary()` recomputes volume from current bodyweight**
  (`index.html:2319`) rather than stored `load`, so changing bodyweight
  mid-session would make the header volume disagree with what gets committed.
  Cosmetic at worst; not reproduced through the UI.
- **Escape closes any sheet without running its cancel path** — e.g. the unit
  sheet's cancel re-renders and Escape doesn't. I found no state this
  actually corrupts (`draft` is abandoned safely), so noting rather than
  filing.
- Background-freeze behaviour with the tone off on a real locked phone —
  inherently unverifiable here; the in-app self-test already covers it.

---

## 2. The progression engine, examined

Method: real functions (instrumented copy), flawless/stall/decline/noise
sweeps, then *closed-loop* runs where each prescription is fed back as the
next session against a lifter model with per-set fatigue and a true-1RM
trajectory. The closed loop is the part the existing verification never did,
and it is where the only serious defect was found (§1.1). This section covers
the judgement calls.

### 2.1 Are the thresholds defensible?

- **`±1.5% / −2%` per 3 sessions (trend chip / back-off trigger).** The −2
  side is fine *as a detector*: flawless never crosses it (worst −1.09%),
  ±1 rep noise never crossed it in a thousand checks, and a real decline
  crosses it in 2–4 sessions. Keep it. Two honest caveats. First, what
  happens *after* it trips is the problem (§1.1) — fix the response, not the
  threshold. Second, the +1.5 side sits **inside** the flawless band: a
  perfect 8–12 run at 185 lb oscillates +0.75…+2.24% across the cycle, so
  the chip flickers CLIMBING↔FLAT while nothing changes. If that flicker
  ever bothers you, the fix is to scale the threshold per lift to half the
  expected flawless rate (`100·3·step/(cycle·e1RM)`) — derivable from data
  the app already has — rather than tuning the constant. As a convention,
  though, ±1.5 is defensible and honest.
- **`≤ 0` on the long horizon.** Right idea, provably clean at the default
  tiers, breaks at wide+heavy (§1.5). Add the margin or the cycle cap; don't
  hand-tune.
- **RPE 9.5 to hold.** Convention, fine. It acts once per grind-week, only
  when ratings exist, and errs toward caution. Not worth deriving — the
  literature would give you "somewhere between 9 and 10".
- **60% / 40% of lifts stalled.** Fine as conventions; in 200 noisy
  progressing trials the nudge never fired, and it fires promptly on real
  stalls. The gates in front of them matter more than the numbers: 6 sessions
  per lift and ≥3 judged lifts means a two-week-variant split (fortnightly
  lifts) can take a quarter of a year before `deloadCheck` judges anything —
  and it returns `null` silently below 3 judged. That silence is the same
  class of bug as trap 14; the Progress tab could say "deload check: watching
  2 of 8 lifts, needs 6 sessions each" instead of nothing.
- **½ set to a helper muscle.** Keep as a convention. It's the standard
  fractional-set compromise; full credit provably inflates (the docs' own
  example), main-only undercounts. Deriving a "true" weight per exercise is
  a research project with EMG electrodes, not a logbook feature. The cost of
  being wrong is capped and visible.

### 2.2 Is double progression the right default? The tiers?

Yes, and yes. Given the one-tap constraint, the field of possible engines is
small: percentage-based (needs a tested max and a program calendar —
decisions), RPE-driven (needs a rating per set — taps), velocity (needs
hardware). Double progression is the one scheme whose inputs are entirely
things the app already records by existing. It is also self-healing: a wrong
weight guess costs one session, not a mesocycle.

The tier ranges (5–8 / 8–12 / 12–16 / 30–60 s) match mainstream hypertrophy
practice, and deriving the outer tiers from the one setting was the right
call. Two observations from the closed loop, not defects:

- **The last set governs everything.** `minR >= top` means a lifter whose
  third set lags (i.e., everyone) spends most of their time at "12/12/11 —
  go for 12", and the load steps only when the *worst* set clears the top.
  That is conservative and defensible — but it is worth knowing that the
  effective progression rate is set by the fatigued set, and it lengthens
  the censored plateaus that feed §1.1's organic trigger. An alternative
  (step the load when all-but-the-last set hit the top) would progress
  ~30% faster at the same miss risk. I'd leave it alone until §1.1 is fixed
  and re-simulated, then decide with the same closed-loop harness.
- **A missed session prescribes "run it back" forever** at the same weight
  for as long as reps stay short — there is no per-lift strategy between
  "run it back" and the whole-block deload nudge. A third consecutive miss
  at the same weight is strong evidence the weight is wrong; a one-line rule
  ("3 straight sessions short of the bottom → drop one step, not 10%") would
  fill the gap between the two existing mechanisms. Cheap, visible on the
  card, worth doing when touching `prescribe()` anyway.

### 2.3 Bodyweight and assisted lifts

The inversion logic is correct under simulation, with two soft spots:
(a) with `settings.bodyweight` unset, bodyweight lifts score 0 —
`trend` stays "new" forever, PRs never fire, and only the exercise menu says
why. Cheap improvement: the card's why-line, which is the surface you
actually read, should say "set your bodyweight to score this lift".
(b) The single stored bodyweight is the engine's only notion of you; §3
covers bodyweight history, and §1.3 must land first or edits keep corrupting
the resolved loads.

### 2.4 The rep drop-off idea, evaluated properly

The proposal: infer proximity to failure from within-session rep decay
(12/12/12 = far, 12/10/8 = close), zero taps, drive the hold rule.

**Is the signal real? Yes.** Under a standard fatigue model (reps-to-failure
falling ~1.5–2 per set at 2–3 min rest near failure, ~1 far from it, ±1 rep
of noise, 500 trials per class, target 10):

| true RIR on set 1 | mean observed drop (set1−set3) | P(no drop) |
|---|---|---|
| 0 | 3.8 | 0% |
| 1 | 3.0 | 0% |
| 2 | 1.0 | 20% |
| 3 | 0.25 | 77% |
| 5 | 0.0 | 100% |

A drop of ≥3 essentially guarantees RIR ≤1; a flat triple at target is
RIR ≥2 with ~90% confidence. The classes you care about (grinding vs
comfortable) separate cleanly through ±1 rep of noise.

**But three things temper it, and the first is decisive for now:**

1. **The measurement may not exist in the data.** Reps are *prefilled* with
   the prescription; a drop-off only appears when the lifter edits set 2/3
   downward. If a meaningful fraction of sets are logged by tapping the tick
   without editing, the recorded 12/12/12 is an artifact of the prefill, not
   a report of ease — and the signal reads "far from failure" precisely when
   the lifter was too gassed to fiddle with an input. **Before building
   anything: export the real log and count what fraction of logged working
   sets differ from their session's prescribed reps.** That one number
   decides whether this feature is real. (It also audits the honesty of all
   existing rep-based signals.)
2. **Censoring:** sets are capped at the target, so the signal is one-sided —
   it can only ever say "closer to failure than prescribed", never "further".
   That's fine for the proposed use (a hold rule fires on *too hard*, like
   RPE 9.5) and useless for "add more than one rep", so scope it to the hold
   slot only.
3. **Half the information is already used.** `minR` *is* the drop-off's
   endpoint; the engine already runs it back on a short bottom and withholds
   the step below the top. The genuinely new information is narrow: the
   *shape* at-or-above `low` — 12/10/8 (min 8, in range, currently "go for
   9") versus 10/9/8 (same min). The increment is a smarter hold, not a new
   engine.

**Verdict: worth building, small, gated on the prefill-edit measurement.** As
designed it should be exactly the RPE rule's silent twin: *if reps fell ≥3
from first to last working set at the same weight, treat it like an RPE-9.5+
session — repeat, don't add — and put "Reps fell 12→8 last time — repeat it
before adding" on the card as the why-line.* One derived input, one existing
action, visible reason, zero taps, and consistent with the option rule
(nothing to set; its state is the card text). If the edit-rate measurement
comes back bad (most sets logged unedited), don't build it, and distrust the
minR data slightly too.

### 2.5 What else could be inferred from data already held

Ranked by value per implementation cost:

- **Rest actually taken** (timestamps per set already exist — `set.ts` is
  stored at toggle). Storing the gap costs nothing (§3, slice B); the
  *inference* it eventually enables is context for bad sessions ("reps fell,
  but rest was 45 s shorter than usual") — an input that stops the trend
  reading rushed sessions as weakness. Store now, infer later.
- **Session duration** — already stored (`ts`/`endTs`), already shown in the
  session sheet; a per-routine typical duration on the Today card ("Day A ·
  usually ~55 m") is one line and genuinely useful for deciding whether you
  have time to train. Cheap, no data change.
- **Days since each muscle was last trained** — derivable from tags + dates;
  could power a one-line "hamstrings last hit 9 days ago" note on Progress.
  Borderline; only if it stays one line.
- **Set-to-set load drops** (user lowers the weight mid-session) — a
  struggle signal like drop-off; fold into the same hold rule, same caveats.
- **Day-of-week / time-of-day performance** — computable, actionable by
  nobody. Skip.
- **Warm-up patterns** — the ramp generator (§3) makes them, reading them
  back adds nothing. Skip.

### 2.6 Anything simply wrong, as opposed to coarse?

Three things, all covered above: the back-off loop (§1.1 — wrong), the editor
load rewrite (§1.3 — wrong), and `cycleOf` for timed work (§1.10 — wrong
formula, benign consequences). The rest of the maths — Epley, setScore's
load-clamped timed scoring, plate greedy (optimal for divisible
denominations, honest when not), the slope algebra, half-credit sets — checks
out against independent computation.

---

## 3. Roadmap

Sliced so every slice leaves the app fully usable, ordered by the project's
priority rule. Costs are judged against the one-tap rule and the option rule
(set once, sane default, state visible where the effect lands).

### Slice A — restore trust in the engine (do first, it's all small)

1. **The back-off fix** (§1.1: window-length guard + rep-climb under hold,
   plus the `t28` closed-loop suite). No decisions added; the card's why-line
   already explains every branch. Touches ~10 lines of `prescribe()`.
   *This is the whole slice's reason to exist; ship it alone if need be.*
2. **Rename-merge guard + `recomputePRs()` + undo** (§1.2). One confirm
   sheet, only on collision — a decision, but at a moment (renaming in Plan)
   that is nowhere near the between-sets path.
3. **Editor load preservation** (§1.3). Zero UI.
4. **`normalize()` shape-hardening** (§1.4). Zero UI.
5. **Banner copy fixes** (§1.6, §1.7) and the doc corrections (§1.11).
6. **`deloadCheck` wide-range margin + "watching N of M lifts" line**
   (§1.5, §2.1). The status line is the option-rule applied to an invisible
   feature.

Nothing here touches the data model. Every item is mechanical from its §1
write-up.

### Slice B — the gym floor

7. **Auto warm-up ramp.** Earns its place: it deletes typing and mental
   arithmetic at the moment attention is lowest, and every input exists
   (today's working weight, `bar`, plate inventory, `platesFor()`). Design:
   a "Ramp" button in the exercise ⋯ menu (not automatic — lifters' warm-up
   needs differ by slot in the session; first lift needs 3–4 sets, fourth
   needs 0–1) that inserts e.g. bar×5, 60%×3, 80%×1 rounded to achievable
   plate loads, replacing carried-forward warm-ups. Decision cost: one tap,
   optional, session-local; the existing carry-forward remains the default.
   Small; no model change (warm sets already exist).
8. **Record rest actually taken.** `set.ts` already exists; store
   `restTaken` (planned vs actual gap) at the next set's toggle. Zero UI,
   zero decisions, invisible until something reads it (§2.5). Touches the
   set object — additive field, no migration needed (absent = unknown), but
   note it in the model doc.
9. **Session duration line on Today** (§2.5). One line of derived display.
10. **The drop-off hold rule** (§2.4) — *gated on the prefill-edit
    measurement*, which is itself a 20-minute script against a real export
    and should be run during this slice. If the measurement passes, the rule
    is ~15 lines in `prescribe()` beside the RPE rule, with the card
    why-line as its visibility.

### Slice C — data-model items (each needs the design conversation first)

11. **Bodyweight history.** The strongest candidate on the floated list. A
    single current value already leaks (§1.3, §2.3), `session.bw` is already
    a per-session snapshot, and bodyweight × strength is the pair a lifter
    actually wants to see. Design sketch: `settings.bwLog: [{ts, w}]`,
    appended (not replaced) when the settings value changes or via a
    one-field prompt at session finish *only if stale* (respects one-tap: at
    most one optional field, at the finish screen where decisions already
    live). Backfill from existing `session.bw` snapshots on migration, as
    the roadmap note anticipates. `effLoad()` then resolves against the
    nearest entry at log time — but stored `load` stays authoritative for
    history, so no retro-rewrites. Model change: yes; migration: trivial and
    additive.
12. **Merge/rename as a feature** ("swap an exercise keeping history
    joined"). §1.2's fix builds the confirm-and-merge machinery; this item
    is only the framing on top: "Replace with…" in the exercise menu that
    renames the plan entry going forward while explicitly merging or *not*
    merging history (two clearly-labelled options in the confirm sheet). Do
    it in the same PR as §1.2 or immediately after; it converts a data
    hazard into the requested feature for ~30 extra lines. No model change
    (names remain the join key — adding identity ids would be a far bigger
    change than this feature justifies).
13. **CSV export.** Cheap (one function beside `payload()`: one row per set,
    session fields denormalised), zero decisions (a second button in the
    Data card), and it's the honest answer to "analyse my training" — hand
    the data to a spreadsheet instead of growing an analytics tab. Also the
    tool for the prefill-edit measurement (item 10) and any future claim
    checking. **Health export: no** — HealthKit/Health Connect need a native
    wrapper; that's the app-store conversation in PRODUCT.md, not a feature.
14. **Per-exercise cues.** A `cue` string on the plan exercise, one muted
    line on the session card ("elbows 45°, pause at chest"). Zero decisions
    in-session, set once in the menu, visible where it lands — passes the
    option rule cleanly. Only cost is card height; truncate to one line.
    Model change: additive field via the two constructors (trap 13 makes
    this a two-edit change — the refactor pays off here).

### What I'd argue against building, from the floated list

- **Percentage-based templates (5/3/1, GZCLP).** Wrong fit. The engine's
  identity is *derive everything from history, store no counters*; 5/3/1 is
  the opposite — a stored program state (training max, week-in-cycle,
  planned AMRAPs) that the app must advance and the lifter must trust over
  the derived signals. Every conflict between "the sheet says 5×85%" and
  "trend says back off" needs a resolution rule, which is a second engine.
  GZCLP is closer (its T1/T2 progressions are rep-range-triggered), but its
  tier structure still wants per-slot programming the plan model doesn't
  have. The 20% of value — "start me on something sensible" — is already
  shipped as templates + tiered ranges. If block programming ever happens,
  PRODUCT.md's mesocycle direction (the engine planning its *own* blocks) is
  the version consistent with this app; imported third-party programs are
  not. Don't build it.
- **Multi-device sync / backend.** The prompt asks for a specific argument
  that multi-device has become real. I looked for one and can't make it:
  one user, one phone, auto-backup on every finish, restore path verified on
  a real device, and the failure mode it protects against (phone death)
  already has a tested answer measured in minutes of recovery. The honest
  next rung, *if* recovery friction ever grates, is the File System Access
  API — persist a file handle to a synced folder once, rewrite the backup
  file silently on each finish. That is "sync" for this app's actual
  topology (Chrome-on-Android supports it; it degrades to the current
  download elsewhere). A backend remains unjustified until there are two
  devices or two users, per the settled decision.

### Ideas nobody floated, cheap enough to mention

- **Plate-aware weight steps** (engine, no UI): `harder()` currently adds
  `inc` blindly; when a bar is set, snapping the prescription to the nearest
  *achievable* load via `platesFor()` kills the "= 135" mismatch between
  prescription and reality. Small, invisible, removes a between-sets
  decision (what to actually load).
- **A "why" line for `new` lifts** — the card is silent for 4 sessions
  (roadmap's "~3 weeks of dumb logger"); "2 more sessions and trends start"
  costs one string and converts dead air into an explanation. Cheaper than
  the roadmap's "lower-confidence signal" idea and probably enough.

## 4. What I would delete

- **`tools/build-artifact.ps1` and the generated artifact body.** The docs
  already declare the artifact channel dead and warn people not to run the
  build. A corpse with a warning sign is still a corpse; git history is the
  archive. Delete both, and the paragraph in `PROJECT_STATE.md` explaining
  the PowerShell BOM trap shrinks to one line ("artifact build removed at
  vNN; see history").
- **`NEXT_SESSION.md`, mostly.** Two-thirds of it restates `PROJECT_STATE.md`
  and `ROADMAP.md` (which the prompt it contains then tells the reader to
  read anyway). Keep it as five lines: read order, test command, the
  ask-me-first note, and the branch/BUILD rules. Duplicated prose is the
  documented failure mode of this repo's docs — three of the five doc errors
  in §1.11 are copies drifting from the thing they copied.
- **The "distance" metric (`metric: 2`) — conditionally.** It has no unit
  (the roadmap already flags this), no volume, no template exercise uses it,
  no test exercises it beyond construction, and its score (distance × load,
  clamped) has no physical meaning for the loaded case. If the real log has
  no `metric: 2` exercises — one grep of the export — delete the third
  segment button and let `metricRow` be a two-way switch; the field itself
  stays (absent = 0) so nothing migrates. If carries are actually being
  logged, keep it and give it the unit instead. Decide from data, not taste.
- **The share-diagnosis machinery, half of it.** `shareTestSheet()` (the
  four-variant tester, ~80 lines) earned its keep diagnosing the device
  once; `settings.shareMode` now stores the answer. The tester's ongoing
  value is nearly zero — if sharing regresses, the backup sheet already
  falls back to a saved file loudly. I'd fold the lesson into the docs and
  delete the sheet, keeping the `shareMode` preference and the watchdog.
  (Weak conviction: it's self-contained and never runs unless opened. But
  the review asked what isn't carrying weight, and this is the largest
  self-contained block that isn't.)
- **`settings.buzz` as a *setting*.** Vibration-on-log is free feedback with
  no known cost; nobody turns it off on purpose, and it's one of five
  switches diluting Settings. Hardwire it on, drop the row. (Counterpoint:
  it's 6 lines. But every switch is a decision offered.)
- **Nothing from the tests.** All eight suites assert behaviour that bit
  someone once; they run in ~90 s total. The suites are the best thing in
  `tools/` — the gap is the missing closed-loop suite (§1.1), not excess.
- **Docs: the per-suite assertion counts** (§1.11) — replace with "run them
  and read the summary line"; counts in prose go stale every time a suite
  grows, and did.

Not deleting, deliberately: RPE (off-by-default, and §2.4's rule wants its
hold slot); the keep-alive tone + self-test (the docs' reasoning holds and
the self-test is the only instrument for an unanswerable question); the
calendar; templates; `mem` fallback storage; the undo system.

---

*Repro notes: every §1 item states its seed shape and the exact observed
output; all were driven against `npx http-server -p 8117` with the t2x
harness conventions (390×844, Pixel 5 emulation). Engine sweeps used the real
functions via a scratch instrumented copy; the spiral fix table used a
transcribed replica validated by reproducing the real engine's unpatched
behaviour (7 cuts, terminal 95 lb) on the identical scenario.*
