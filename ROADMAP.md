# Iron Log — roadmap

Prioritised backlog. Read [PROJECT_STATE.md](PROJECT_STATE.md) first for how the
app is put together and why.

Ordering logic: **things that corrupt data or break trust first**, then things a
user hits every session, then things that would only show up as feature requests.
Ship in slices; each slice should leave the app fully usable.

---

## Slice 0 — confirm the last round on a real phone

Nothing new. Three things shipped that could not be verified from a desktop
browser, and all three are load-bearing:

- [ ] The tap-freeze fix on Android Chrome (the reason the re-render was removed)
- [ ] The backup share sheet — does `navigator.share({files})` actually reach Drive
- [ ] Install to home screen once GitHub Pages is live, then a full offline session
      (nothing is deployed yet — the repo at `nderkowski/ironlog` still has to be
      created by hand; see README)

If the tap freeze survives, the next suspect is the artifact iframe rather than
the app, and the self-hosted build should be tested before changing any more code.

---

## Slice 1 — the gym-floor essentials

Everything here is hit in a normal session and is currently missing.

**1. Rest timer that survives a locked screen.** Today the countdown is wall-clock
based so it's *correct* when you come back, but the vibration never fires from a
backgrounded page. In a real gym the phone is in a pocket. Needs a Notification
with a timestamp, or an audio element that keeps the page alive. Requires
notification permission, so handle the denial path.

**2. Plate calculator.** Given a target and a bar weight, show plates per side.
Should be a per-exercise flag (barbell yes, dumbbell no) with a configurable
plate inventory. Highest-value-per-line-of-code item on this list.

**3. Reorder exercises mid-workout.** A rack is busy and you do things out of
order. Plan editing only offers "move up" and there is no in-session equivalent.

**4. Undo after a destructive action.** Deleting a session or an exercise is
confirm-then-gone. Keep the last deleted object in memory and offer undo in the
toast for ~10 seconds.

---

## Slice 2 — make Progress worth opening

The Progress tab currently answers "is this lift moving." It cannot answer the
question serious lifters actually ask.

**5. Muscle-group tagging and weekly sets per muscle.** Exercises have no
categorisation at all today, so nothing can report weekly sets for back, chest,
quads. This is *the* hypertrophy metric and it is the biggest single gap in the
app. Needs a `muscles: []` field on the plan exercise, a sensible default guess
from the name, and a stacked weekly view.

**6. A PR board.** PRs exist per set but there is no one screen that lists every
lift's best. It's the thing people screenshot.

**7. Calendar / consistency view.** A month grid of trained days. Cheap to build
from `sessions[].ts`, and it answers "am I actually showing up."

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
  or refuse to switch once history exists.
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
  The only build is the artifact-body generator, and that exists solely because
  the artifact host supplies its own document wrapper.
