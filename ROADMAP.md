# Iron Log — roadmap

Prioritised backlog. Read [PROJECT_STATE.md](PROJECT_STATE.md) first for how the
app is put together and why.

Ordering logic: **things that corrupt data or break trust first**, then things a
user hits every session, then things that would only show up as feature requests.
Ship in slices; each slice should leave the app fully usable.

---

## Slice 0 — confirm on a real phone

**Still open, and now blocking more than it was.** Everything here is a thing a
desktop browser structurally cannot answer.

- [ ] The tap-freeze fix on Android Chrome (the reason the re-render was removed)
- [ ] The backup share sheet — does `navigator.share({files})` actually reach Drive
- [ ] Install to home screen from https://nderkowski.github.io/ironlog/, then a
      full offline session
- [ ] **New, and the important one:** does the rest alarm fire with the screen off
      and the phone in a pocket? The quiet-audio keep-alive is verified in the
      foreground, but whether Android Chrome keeps the page alive on a locked
      screen is the entire question and it can only be answered on the phone.
      Start a rest, lock, pocket, wait.
- [ ] Notification grant path — headless Chromium only exercised the refusal.

If the tap freeze survives, the next suspect is the artifact iframe rather than
the app, and the self-hosted build should be tested before changing any more code.

If the rest alarm *doesn't* survive a locked screen, the fallback is a
`showTrigger` notification or accepting that the alarm needs the app foregrounded
— but don't reach for either until the phone says the current approach failed.

**If the backup share sheet turns out to be broken, that jumps the queue ahead of
Slice 2.** A logger with no working backup is one cleared browser away from
losing everything, which outranks any feature on this list.

---

## Slice 1 — the gym-floor essentials ✅ *shipped 1 Aug 2026*

**1. Rest timer that survives a locked screen.** A near-silent looping WAV keeps
the page alive during a rest; at zero the same `<audio>` element swaps to an
audible beep, plus vibration and an optional lock-screen notification. Two new
settings (`sound`, `notify`); permission is asked only on tap and refusal is
explained in place. See PROJECT_STATE for why it works this way.
*Foreground-verified only — see Slice 0.*

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

## Slice 3 — programming features

**8. Supersets.** No way to pair A1/A2. Needs a grouping concept on the session
exercise and a rest-timer rule that only fires after the last item in a group.

**9. Timed and distance work.** Planks, carries, cardio. The data model is
strictly weight × reps; a `metric` field on the exercise (`reps` | `seconds` |
`distance`) would generalise it, but it touches every calculation — volume, e1RM,
progression — so plan it properly rather than bolting it on.

**10. RPE / RIR per set.** Would make autoregulation far better than inferring
intent from reps alone, and it's what modern programmes assume. Keep it optional
and off the critical path — an extra required field per set would violate the
one-tap rule.

**11. Program templates.** Three empty days means typing every exercise by hand.
"Setup took twenty minutes" is a predictable first complaint. Two or three
presets (PPL, upper/lower, 5/3/1) would fix onboarding entirely.

---

## Slice 4 — the structural one

**12. Sync and accounts.** The single biggest difference between this and a
commercial app, and the only item that genuinely needs a server. New phone,
cleared browser, or a second device all mean starting over unless a backup was
taken. Everything else on this list is a weekend; this is a project. Options in
increasing order of effort: a "restore from file on launch" prompt, a
user-supplied cloud file handle, or a real backend with auth.

Do not start this before slices 1–2. A logger that syncs but can't tell you
weekly set counts is worse than one that does the reverse.

---

## Known weaknesses in the maths

Not bugs, but they should be revisited and are honest limits of the current model.

- **Epley e1RM degrades above ~10 reps.** Using it as the trend signal for a
  12-rep accessory is noisy. Consider trending top-set load or volume for
  exercises whose rep range tops out high, and keep e1RM for the low-rep lifts.
- **~3 weeks before the app says anything.** `trend()` needs 4 sessions of a lift,
  which on an A/B/C split is about three weeks. New users see a dumb logger for a
  month. Consider a lower-confidence signal at 2–3 sessions, labelled as such.
- **The 60% deload threshold is a defensible guess, not a derived number.** It is
  now dismissible and deload-aware, which was the dangerous part. If it still
  fires too often, make it aware of intent — a cut or a maintenance block makes
  flat lifts the goal rather than a warning.
- **Unit switching relabels without converting.** Flipping lb → kg leaves every
  historical number numerically identical. Either convert the whole log on switch
  or refuse to switch once history exists. It now also strands the bar weight and
  plate inventory in the old unit — there's a "Reset to kg/lb" button in settings,
  but nothing prompts you to press it.
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
