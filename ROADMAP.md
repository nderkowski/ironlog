# Iron Log — roadmap

Prioritised backlog. Read [PROJECT_STATE.md](PROJECT_STATE.md) first for how the
app is put together and why, and [PRODUCT.md](PRODUCT.md) if the question is
whether any of this should be sold rather than what to build next.

Ordering logic: **things that corrupt data or break trust first**, then things a
user hits every session, then things that would only show up as feature requests.
Ship in slices; each slice should leave the app fully usable.

---

## Next session starts here — from a few days of real use

Six items. Four are Nick's, from actually training with the app; two I found
while diagnosing those. Each has been reproduced or explicitly not reproduced —
don't re-derive that work.

**All six are fixed and shipped** — 1 in v12, 2/3/5/6 in v13, 4 in v14. They
stay here as the record of what the bugs were and what was decided.

Four more shipped after them, from working down this file rather than from a
gym session:

| | |
|---|---|
| **v15** | Switching lb ↔ kg converts the log, or relabels it, but asks first — it used to relabel silently and strand the bar and plates in the old unit |
| **v16** | `trend()` was reading the phase of the double-progression sawtooth and reporting "down" on a flawless run, which is what makes `prescribe()` cut 10% off the bar. Also: the "Epley degrades above 10 reps" note was wrong, and is now corrected in place |
| **v17** | Settings moved off the foot of the Plan tab into their own screen behind a header gear; Progression stayed with the split it shapes |
| **v18** | The gear had no SVG sizing rule and rendered edge-to-edge as a smudge |

287 assertions across eight suites now live in `tools/test/`. Run them before
and after any change.

### 1. BUG — both exercise menus overflowed sideways ✅ *fixed in v12*

Reported on the Plan page; it affected the Today menu identically. The sheet
measured **1180px wide inside a 388px viewport**, so the options needed a
horizontal scroll and the labels didn't line up.

**Cause, confirmed by DOM inspection:** `loadTypeRow()` and `metricRow()` each
open `<div class="field-row">` and never close it. Their trailing `</div></div>`
closes `.fh` and `.fl` only. So `loadTypeRow` leaves a `.field-row` open,
`metricRow` nests inside it and leaves another open, `barRow` nests inside both,
and `barRow`'s own closing tag then shuts the wrong element. The Barbell row ends
up **three `.field-row` flex containers deep**, and `.field-row` is
`display:flex` with no wrapping, so the width compounded.

**Fixed** by closing `.field-row` in both `loadTypeRow()` and `metricRow()`.
The sheet went from 1180px to 388px and the Barbell row from three field-rows
deep to one. `t14.mjs` now asserts, at 320px and 390px, that neither menu
scrolls sideways, that no `.field-row` is nested inside another, and that every
row fits — so this cannot come back quietly.

**Why it appeared now:** `loadTypeRow` was always unbalanced, but it used to be
the last field-row before the `.menu` block, so the browser's auto-close was
harmless. Slice 3 added `metricRow`, `barRow` and `muscleRow` after it and the
nesting compounded. A latent bug, exposed rather than introduced.

### 2. BUG — "always suggests more weight at 8 reps, never more reps" ✅ *fixed in v13*

**Cause: a fourth one, not on the original list.** Nick answered the diagnostic
question — card reads "8 target", the switch is **on**, and *basically every*
exercise is affected because they were all created in v1 and carried forward
untouched.

`settings.doubleDefault` has only ever been a **creation-time default**.
Turning it on does nothing to exercises that already exist, and an exercise
with no `repTop` falls through `prescribe()` to straight sets. So on a plan
built before rep ranges existed, double progression had never run once — and
the only thing the app said about it was "3 × 8 target" instead of
"3 × 8–12 range", which is a word, not a signal.

The engine was never wrong. It correctly ran the mode the data put it in.

**Reproduced** with a v1-shaped plan (`repTop` absent, `doubleDefault: true`):
card "3 × 8 target", verdict "Hit all 8s — add 5 lb", prefill 135 → 140.

**Fixed** in three parts, because surfacing without a repair would just be a
better-worded bug:

- Card and Plan row read **"8 straight"** — a mode, not a number. Both exercise
  menus state the mode in a sentence, and the plan menu offers one tap out.
- Plan → Progression counts the exercises still on straight sets, names them,
  explains why the switch didn't fix them, and offers to fit ranges to all of
  them. Undoable. Turning the switch on re-offers it.
- The repair **keeps each exercise's existing bottom** and only adds the
  reps-first room on top, so a programme mid-flight isn't quietly rewritten.

Trap 14 in PROJECT_STATE is the general lesson.

### 3. FEATURE — rep ranges should suit the movement ✅ *shipped in v13*

`defaultRange(name, metric)` classifies the movement and derives the range from
`repLow`/`repHigh` rather than adding two more settings — heavy lifts sit lower
and narrower (5–8 from 8–12), isolation higher (12–16), timed holds get 30–60s.
`movementClass()` is an ordered regex list like `guessMuscles()`, with a
`MOVE_LIGHT` override so a dumbbell bench press isn't treated as a heavy
barbell lift. Full table in PROJECT_STATE.

Two notes on what was built versus what was asked:

- The ask was 12–20 for isolation, adding load at 16–18. Those are the same
  request stated twice: under double progression, load goes up when you hit the
  **top**, so "add load at 16–18" *is* the top. It shipped as **12–16** — a
  16-rep ceiling with a 12-rep floor. A 12–20 range would take eight sessions
  to cross at one rep a time, which is a stall, not a progression.
- Templates now go through the same constructor, which fixes a latent one:
  a template Plank used to arrive asking for **8–12 seconds**.

### 4. FEATURE — A/B week variants inside each training day ✅ *shipped in v14*

**Settled with Nick before building:** a week variant is a **different exercise
selection**, not the same lifts programmed heavy/volume — so a variant owns an
exercise list and nothing else changes. And a day may have **two or more**
weeks, not exactly two; the array model gave that for free and only the
switcher UI had to grow.

Built as sketched below, `variants[]` on the routine with no parallel field.
What the sketch didn't cover, and what turned out to matter:

- `session` stores `variantId` **and** `variantName` — the id drives the
  rotation, the name is a history snapshot like `key`/`name` already are, so
  renaming or deleting a week can't rewrite the past. An unresolvable id
  restarts the rotation rather than throwing.
- **A deload session consumes its slot.** The fortnight ticks through it.
- **Every day's every week is one tap from Today.** Offering only each day's
  *next* week stranded the other one whenever that day wasn't up next — found
  by a test, not by reading the code.
- `normalize()` became the single door into the state (storage, file, paste),
  and the migration is written back on boot so the next backup is already v5.
- Rejected on the way: putting "straight" in the Plan row alongside the muscle
  tag. It starved the exercise name to nothing at 320 px. See trap 16.

The original design sketch follows, kept because the reasoning still holds.

#### The sketch as written

Wanted: Day A, B and C each get a **week-A and a week-B version**, so the split
alternates fortnightly — different exercise selection, or heavy/volume weeks,
inside the same day letter.

This is the largest item here and the only one that changes the data model, so
design it before typing.

**Model.** A routine gains variants rather than the app gaining a second axis of
routines:

```
routine = { id, key, name, variants: [ {label, exercises[]}, … ] }
```

A single-variant routine is the existing behaviour, so migration is
`variants: [{label:"", exercises: r.exercises}]` and every read goes through a
`variantOf(routine, n)` helper. **Do not** add a parallel `altExercises` field —
that is the five-places-to-update problem in trap 13 all over again.

**Which variant is next** must be derived from history, like everything else in
this app — no stored counter. `session` gains `variantIx`, and `nextRoutine()`
finds the last session for that routine and flips. Two rotations now interact:
which *day* is next, and which *week* that day is on. They are independent —
finishing Day A week 1 should advance Day A to week 2 while the day rotation
moves to B — so they must not be collapsed into one modulo.

**Things that will bite:**

- `exSessions()` joins by exercise **name**, so a lift appearing in both variants
  correctly shares one history and one progression. That is the right behaviour
  and it already works. A lift in only one variant sees its sessions two weeks
  apart, which makes `trend()` slower to speak — worth a note in the UI rather
  than a maths change.
- `deloadCheck()` reads `trackedLifts()` from routines; it must span all variants
  or it will judge the block on half the lifts.
- The plan editor needs a variant switcher that does not double the screen. A
  segmented control at the top of each day card is probably enough.
- Templates should stay single-variant. Do not double every template.

**Sequencing:** do this *after* items 1–3 and 5. It touches the plan editor,
which item 3 also touches, and the exercise constructor, which item 5 fixes.
Doing it last means both are already tidy.

**Still open, deliberately not built:** the *same* exercises programmed
differently across weeks — heavy 4×5 one week, volume 3×12 the next. Nick's
answer was that a week is a different exercise selection, so this wasn't
needed. It is a genuinely harder change and worth knowing why before anyone
promises it: `exSessions()` joins by **name**, so one lift appearing in two
weeks shares one history and one progression *by design*. Giving it two rep
ranges means two progressions over one history, which the engine has no
concept of. Do not treat it as a small follow-on.

### 5. BUG — keeping an extra exercise from the finish screen loses its settings ✅ *fixed in v13*

Confirmed and fixed. `finishSheet()`'s keep-extras path dropped `bar`,
`metric`, `link`, `mg` and `mg2`, so an exercise promoted that way lost its
plate maths, its time/distance metric and its muscle tags.

### 6. BUG — the session editor's "Add exercise" ignores every default ✅ *fixed in v13*

Confirmed and fixed. `drawEditor()` hardcoded
`{targetReps: 8, reps: 8, repTop: 0, inc: null, bw: 0}`.

**Both fixed by the same change, which is the real fix:** all six places that
built a plan exercise by hand now go through `newPlanEx(name)` or
`planExFromSession(ex)`. There were five according to trap 13; `pickExercise()`
was a sixth nobody had counted. Adding a field to the model is now a two-file
edit instead of a six-site scavenger hunt — see trap 13, rewritten.

---

## Slice 0 — confirm on a real phone ✅ *closed 1 Aug 2026*

Tested on Nick's Android against the v7–v10 Pages deploys. Everything here was
something a desktop browser structurally could not answer.

- [x] **The tap-freeze fix.** Gone. Removing the re-render was the right call,
      and the rule against re-rendering on the set-logging path stands.
- [x] **The rest alarm with the screen off. It works.** Self-test: alarm at
      20.7s of a 20s rest, longest tick gap 1s — the page was never frozen.
      This was the single biggest unknown in the project.
      **Follow-up from real gym use:** the keep-alive tone was audible on
      headphones and Android ducked the user's music for the whole rest to
      prioritise it. Working but unusable. The tone is now opt-in and off by
      default, the MediaSession is gone, and a late alarm reports itself with a
      one-tap fix. **Open: does a 2–3 minute rest survive a locked screen with
      the tone off?** Run the self-test with it off and read the tick gap.
- [x] **Lock-screen notification.** Fires and displays.
- [x] **Backup sharing. Fixed, and the cause is known.** Chrome was refusing
      `application/json` as a shareable file type. Not user activation, not a
      permission — it reports `NotAllowedError: Permission denied` for a refused
      type, with no prompt ever shown, which sent the first diagnosis the wrong
      way. On-device testing confirmed `.txt` works and `.json` does not.
      Sharing now offers `text/plain` first and the Android share sheet opens.
- [x] **Auto-backup.** Finishing a workout writes a file with no extra tap.

Confirmed on the phone too:

- [x] Install to home screen, and a full offline session end to end.
- [x] A wiped browser restores from an auto-backup file. The round trip is real,
      not just green in Chromium.

**Backup is no longer the thing blocking everything.** There are three
independent paths off the device now — one-tap share, an automatic file per
workout, and copy-as-text — plus a restore prompt on a fresh install. What is
still missing is *off-phone* durability without a manual step, which is Slice 4.

---

## Slice 1 — the gym-floor essentials ✅ *shipped 1 Aug 2026*

**1. Rest timer that survives a locked screen.** A looping tone — inaudible to
you, audible to Chrome's tab-audibility check — keeps the page alive during a
rest; at zero the same `<audio>` element swaps to an
audible beep, plus vibration and an optional lock-screen notification. Two new
settings (`sound`, `notify`); permission is asked only on tap and refusal is
explained in place. See PROJECT_STATE for why it works this way.
**Confirmed working on a locked Android screen** — see Slice 0.

**2. Plate calculator.** Per-exercise `bar` weight (0 = not a barbell, guessed
from the name on creation), configurable inventory counted in pairs, and a plate
line under every barbell set row that updates as you type. Inexact loads show the
achievable total rather than lying.

**3. Reorder exercises mid-workout.** "Move to the top" / up / down in the
exercise ⋯ menu, which is what a busy rack actually calls for.

**4. Undo after a destructive action.** 10-second undo toast on the four
destructive paths, holding the removed object in a closure.

Also fixed in passing: the artifact build script mangled every non-ASCII
character (PowerShell 5.1 encoding defaults), and the toast wrapped to three
lines because a fixed-position shrink-to-fit box is capped at 50vw by `left:50%`.

---

## Slice 2 — make Progress worth opening ✅ *shipped 1 Aug 2026*

**5. Muscle-group tagging and weekly sets per muscle.** 12 groups, one main
muscle plus helpers per exercise, guessed from the name and editable in a picker.
A set counts 1.0 for the main muscle and 0.5 for each helper — full credit
everywhere is how volume trackers inflate. Untagged history resolves through the
plan's current tagging and then the name guess, so the report is meaningful
against existing data rather than starting at zero.

Shipped as `mg` + `mg2[]` rather than the `muscles: []` the roadmap sketched:
a flat array can't express "main vs helper", and without that distinction the
half-set rule has nothing to hang on.

Bars are this week with last week as a marker line, not the stacked view
originally sketched — stacking answers "what made up this week", which is not the
question. "Is this muscle getting more or less than last week" is.

**6. A PR board.** Every lift's best set by estimated 1RM, newest record first.
Top 5 in Progress, "see all" for the full board, each row opens the lift's chart.

**7. Calendar / consistency view.** Month grid, Monday-first, trained days marked
with the routine key. Tap a day to open that session. Pages backwards only.

---

## Slice 3 — programming features ✅ *shipped 1 Aug 2026*

**8. Supersets.** `link: true` groups an exercise with the one above it, marked
A1/A2 on the card, and the rest timer only fires after the last item in a group.
Modelled by adjacency rather than group ids so reordering and deleting can't
leave a corrupt group behind.

**9. Timed and distance work.** A `metric` field on the exercise reinterprets
the existing `r` field as seconds or distance instead of adding a parallel one,
so every input, stepper and history record kept working. Volume, e1RM, PRs,
trends and the progression engine all branch on it. Unloaded timed work
progresses by *time* — a plank that hits the top of its range is told to hold
longer, not to add weight to a bar it doesn't have.

**10. RPE / RIR per set.** Off by default, rated after the set is logged, never
required. A session averaging RPE 9.5+ repeats its weight instead of adding —
and that rule stays dormant unless at least half the working sets were rated,
so it is invisible to anyone who leaves the feature off.

**11. Program templates.** Push/Pull/Legs, Upper/Lower and 3-day Full Body.
They build ordinary routines — bar weights, muscles and metric all come from the
same guessers used for anything you type by hand, so nothing is special-cased
afterwards. Undoable for ten seconds like every other destructive action.

Also fixed: the RPE chip rendered 112px wide regardless of its text, as both a
float and a flex item, because a plain `<button>` there was not content-sized at
all in Chrome. `display:inline-flex` on the chip is load-bearing, not styling.

---

## Slice 4 — the structural one

**12. Sync and accounts.** The single biggest difference between this and a
commercial app, and the only item that genuinely needs a server. New phone,
cleared browser, or a second device all mean starting over unless a backup was
taken. Everything else on this list is a weekend; this is a project. Options in
increasing order of effort: a "restore from file on launch" prompt, a
user-supplied cloud file handle, or a real backend with auth.

**The cheapest rung is already built** — the `fresh` check in `viewToday()`
offers "Restore from a backup" on an install with no sessions and no exercises
anywhere, and auto-backup writes a file inside the tap on "Save workout". That
plus a working export is the whole disaster-recovery story, and none of it
needed a backend. So what is actually left here is the expensive half: a
user-supplied cloud file handle, or a real backend with auth. Both are a
project rather than a weekend, and neither should start without deciding
whether multi-device is a real need — see the settled decision on accounts.

---

## Known weaknesses in the maths

Not bugs, but they should be revisited and are honest limits of the current model.

- ~~**Epley e1RM degrades above ~10 reps.**~~ ❌ *this was wrong — checked in
  v16.* Measured against standard %1RM reference tables across 1–20 reps, Epley
  has the **lowest** mean error of the common formulas (1.09 pp; Wathen 1.19,
  Brzycki 2.09, Mayhew 3.79, Lombardi 4.18) and is essentially exact at 10, 12
  and 20 reps. The belief comes from noticing Epley and Brzycki diverge above
  10 — but it is Brzycki that collapses up there (−9.8 pp at 20 reps against
  the Landers table). Epley's only structural flaw is at 1 rep, and `e1rm()`
  already special-cases it. **Do not swap the formula.**

  *Re-checked in v21 against two standard %1RM tables, because the v18 review
  raised a nuance.* The nuance holds: over the isolation band specifically
  (12–16 reps, the v13 default), **Wathen is closer than Epley** — 1.33 pp vs
  1.85 pp on Landers, 0.86 vs 1.25 on the NSCA-style table. What does *not*
  survive independent checking is the claim that Epley wins overall: which of
  the two leads across 1–20 depends on which reference table you pick (Wathen
  edged it on both of mine, Epley on the review's). They are within ~0.2 pp of
  each other and everything else is far behind — Brzycki 2.7, Mayhew 4.8,
  Lombardi 7.1. The gap between Epley and Wathen is a fraction of a pound on a
  curl, so the conclusion is unchanged and the reason is now the honest one:
  **not "Epley is measurably best", but "the two candidates are
  indistinguishable at this app's stakes, and swapping costs a history that is
  all scored in Epley."**

  Chasing this did find a real bug, one level up: `trend()` was reading the
  phase of the double-progression sawtooth and reporting "down" on a flawless
  run, which is what makes `prescribe()` cut 10% off the bar. ✅ *fixed in v16* —
  see PROJECT_STATE and trap 17.
- **~3 weeks before the app says anything.** `trend()` needs 4 sessions of a lift,
  which on an A/B/C split is about three weeks. New users see a dumb logger for a
  month. Consider a lower-confidence signal at 2–3 sessions, labelled as such.
- **The 60% deload threshold is a defensible guess, not a derived number.** It is
  now dismissible and deload-aware, which was the dangerous part. If it still
  fires too often, make it aware of intent — a cut or a maintenance block makes
  flat lifts the goal rather than a warning.
- **Distance work has no unit.** `metric: 2` stores a bare number and the app
  never asks whether it's metres, yards or laps. Fine for one person who knows
  what they meant; wrong the moment the log is shared or charted against
  anything else.
- **The RPE 9.5 hold threshold is another defensible guess.** So is weighting a
  helper muscle at ½ a set. Both are conventions, both are documented, neither
  is derived.
- ~~**Unit switching relabels without converting.**~~ ✅ *fixed in v15.* The
  switch now asks: convert the log, or relabel it. Both readings were
  legitimate and nothing in the data distinguishes them, so guessing either way
  would have been wrong for half of users. Both paths also un-strand the bar and
  plate inventory, which was simply broken. Round-tripping drifts by 0.1 —
  accepted and asserted. See PROJECT_STATE.
- **The ½-set helper weighting is a convention, not a measurement.** It's the
  common one and it beats both alternatives (full credit inflates, main-only
  undercounts pressing triceps), but nobody has derived it. If it ever needs to
  be defended, make the weight per-exercise rather than global.
- **`guessMuscles()` is a regex list and will mis-tag something eventually.**
  It's first-match-wins and order-sensitive. The cost is capped — every guess is
  visible in the Plan row and overridable in two taps — but a wrong guess is
  silent until you look. Consider surfacing "N exercises still on a guess"
  in Plan.
- **Bodyweight is a single current value.** `session.bw` snapshots it per session
  going forward, but sessions logged before that field existed have none, and
  there's no bodyweight history. If bodyweight tracking gets built, backfill it.

---

## Explicitly not doing

Recorded so they don't get relitigated every session:

- **Ads, accounts-to-use, paywalls.** The entire reason this exists.
- **Social features, feeds, sharing workouts.** Not the job.
- **Exercise demo videos or an exercise database.** Bloat; the name is enough.
- **A framework or a build step.** One file that runs anywhere is the feature.
- **Maintaining the Claude artifact copy.** The repo and GitHub Pages are the
  product now. `tools/build-artifact.ps1` and `artifact-body.html` stay in the
  tree as history; don't rebuild or republish them as part of normal work.
