# Iron Log — roadmap

Prioritised backlog. Read [PROJECT_STATE.md](PROJECT_STATE.md) first for how the
app is put together and why, and [PRODUCT.md](PRODUCT.md) if the question is
whether any of this should be sold rather than what to build next.

Ordering logic: **things that corrupt data or break trust first**, then things a
user hits every session, then things that would only show up as feature requests.
Ship in slices; each slice should leave the app fully usable.

---

## Slice 0 — confirm on a real phone ✅ *closed 1 Aug 2026*

Tested on Nick's Android against the v7–v10 Pages deploys. Everything here was
something a desktop browser structurally could not answer.

- [x] **The tap-freeze fix.** Gone. Removing the re-render was the right call,
      and the rule against re-rendering on the set-logging path stands.
- [x] **The rest alarm with the screen off. It works.** Self-test: alarm at
      20.7s of a 20s rest, longest tick gap 1s — the page was never frozen.
      This was the single biggest unknown in the project.
- [x] **Lock-screen notification.** Fires and displays.
- [x] **Backup sharing. Fixed, and the cause is known.** Chrome was refusing
      `application/json` as a shareable file type. Not user activation, not a
      permission — it reports `NotAllowedError: Permission denied` for a refused
      type, with no prompt ever shown, which sent the first diagnosis the wrong
      way. On-device testing confirmed `.txt` works and `.json` does not.
      Sharing now offers `text/plain` first and the Android share sheet opens.
- [x] **Auto-backup.** Finishing a workout writes a file with no extra tap.

Still open, low risk:

- [ x] Install to home screen, then a full offline session end to end.
- [ x] Confirm on-device that a wiped browser restores from an auto-backup file.
      The round trip passes in Chromium but the phone has not done it.

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

Slices 1–3 are done and Slice 0 is nearly closed, so this is next. Start with
the cheapest rung — **"restore from file on launch"** — because it is most of
the safety for none of the server: on a fresh install with no data, offer to
import a backup file before showing an empty split. That plus a working export
is the whole disaster-recovery story, and neither needs a backend.

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
- **Distance work has no unit.** `metric: 2` stores a bare number and the app
  never asks whether it's metres, yards or laps. Fine for one person who knows
  what they meant; wrong the moment the log is shared or charted against
  anything else.
- **The RPE 9.5 hold threshold is another defensible guess.** So is weighting a
  helper muscle at ½ a set. Both are conventions, both are documented, neither
  is derived.
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
