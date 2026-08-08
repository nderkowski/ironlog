# Iron Log — project state

Read this first. It is the current state of the app, the reasoning behind the
non-obvious parts, and what has actually been verified. Pair it with
[ROADMAP.md](ROADMAP.md) for what to build next, and [PRODUCT.md](PRODUCT.md)
for the commercial question. **[Traps](#traps--read-before-changing-anything)
is the section to read before touching anything.**

*Last updated: 8 Aug 2026 (v21) — built with Claude Opus 5.*

---

## What this is

A single-file lifting logbook for one person's phone. Built because Google Keep
worked fine for capture but had no structure, no carry-forward, and no way to see
whether anything was improving. Real apps were rejected for ads and friction.

**The design constraint that drives everything: logging a set must take one tap.**
Every feature is judged against that. Anything that adds a decision to the
between-sets moment is wrong unless it removes two decisions elsewhere.

## Where it lives

| | |
|---|---|
| Canonical source | `index.html` — a complete, self-hostable HTML document |
| PWA support | `manifest.webmanifest`, `sw.js`, `icon-*.png` |
| Live app | https://nderkowski.github.io/ironlog/ — GitHub Pages, deployed from `main` |
| Repo | `nderkowski/ironlog` |

**The repo is the product**, and **GitHub Pages serves `main`** — work on a
branch is not testable on a phone until it is merged. A whole test round was
lost to this. `BUILD` in `index.html` is printed at the bottom of the Plan tab
for exactly that reason: check it on the device before believing any bug report.

After editing `index.html`, **bump `BUILD` and `CACHE` in `sw.js` in the same
commit** — otherwise installed phones keep serving the old
copy from cache, and you'll debug a version that isn't running.

> **The Claude artifact is no longer maintained.** It was how the app was
> delivered before Pages existed. `tools/build-artifact.ps1` and the generated
> `artifact-body.html` are kept for reference only — don't run the build or
> republish as part of normal work. If you ever do revive it, note that the
> script must read *and* write UTF-8 explicitly: Windows PowerShell 5.1 reads as
> ANSI by default and writes a BOM with `-Encoding utf8`, which mangled every
> em-dash in the published copy to `â€"`.

## Architecture

Vanilla JS, no framework, no build, no dependencies, no network calls. One IIFE.

- **`S`** is the entire application state and the single source of truth. It is
  serialised wholesale into `localStorage` under `ironlog.v1`.
- Writes are debounced 120 ms via `save()`. `writeNow()` forces a synchronous
  write, and `flush()` is wired to `pagehide` / `blur` / `visibilitychange` so a
  pending write can't die with the tab. Anything irreversible (finishing a
  workout, editing history, importing) calls `writeNow()` directly.
- Rendering is `render()` → `viewToday()` / `viewProgress()` / `viewPlan()`,
  each of which rewrites `#view.innerHTML`. Sheets are built the same way.
- **Exception, and it matters:** logging a set does *not* re-render. See below.
- Events use delegation on `#view`. There are two click listeners: the first
  handles Today, the second early-returns unless `TAB` is progress or plan.
- **`data-x` values are scoped to a sheet, so they collide.** Sheet handlers wire
  up with `$('[data-x="..."]', el)`, which returns the *first* match in the whole
  sheet — a menu button named `top` silently binds its handler to the rep-range
  input of the same name, and the button does nothing. The in-session reorder
  buttons are `mvtop` / `mvup` / `mvdn` for exactly this reason. Grep the sheet
  before naming a new one.

### The data model

```
S = {
  version, settings, routines[], sessions[], active
}

settings = { unit, rest, autoRest, buzz, sound, notify, rpe, keepTone,
             autoBackup, shareMode, inc,
             doubleDefault, repLow, repHigh, rangeFixHidden,
             bodyweight, deloadUntil, deloadSnooze,
             bar, plates[], lastBackup }
  plates[] = { w, n }        // n = PAIRS owned, not singles

routine  = { id, key, name, variants[] }
  variant = { id, label, exercises[] }
  exercise (plan) = { id, name, sets, reps, repTop, inc, bw, bar, metric,
                      link, mg, mg2[] }

session  = { id, ts, endTs, routineId, key, name, variantId, variantName,
             note, bw, deload, exercises[] }
  exercise (logged) = { id, planId, name, targetReps, reps, repTop, inc, bw, bar,
                        metric, link, mg, mg2[], supplemental, why, kind,
                        lastW, lastR, sets[] }
    set = { w, r, done, warm, pr, load, ts, rpe }
```

Notes that will bite you if you miss them:

- **Exercises are joined by name, not id** (`normName()` lower-cases and trims).
  That's why `renameExercise()` has to rewrite routines, history *and* the active
  session together — otherwise a rename silently forks a lift's history in two.
  The same join makes renaming *onto an existing name* a merge, so that case
  asks first (merge the histories, or change the plan slot only) and carries a
  whole-state undo. Both paths run `recomputePRs()` and drop duplicate plan
  rows within a week. **Do not add a rename path that skips
  `renameExercise()`** — the collision check and the PR rebuild live there.
- **`w` is what you typed; `load` is what it means.** For a normal lift they're
  the same. For bodyweight work `w` is *added* weight and `load` is bodyweight +
  added. For assisted work `w` is *assistance* and `load` is bodyweight − assist.
  `load` is resolved and stored at log time, so changing your bodyweight setting
  later never rewrites history. All maths uses `loadOf(set)`; only display uses `w`.
- **`warm: true` sets are invisible to every calculation** — volume, e1RM, PRs,
  trends, and the progression engine. They exist only as a record.
- **`deload: true` sessions are excluded from `exWorking()`**, which is what
  `trend()` and `lastPerf()` read. They still appear in history, volume totals
  and charts. `exSessions()` returns everything.
- **`bar` is both the flag and the value.** `bar: 0` (or absent) means "not a
  loaded barbell" and suppresses the plate line entirely; any positive number is
  the empty bar's weight. There is no separate boolean to keep in sync.
  `guessBar()` only ever runs when an exercise is first created.
- **`r` is not always reps.** `metric` on the exercise reinterprets it:
  0 reps, 1 seconds, 2 distance. The field is reused rather than adding a
  second one, so every input, stepper, history record and editor kept working
  untouched — only the meaning moves. Anything that compares "how much work"
  must go through `setScore(set, metric)`, never `e1rm()` directly, or a plank
  gets scored as if seconds were reps.
- **Volume is only defined for rep work.** `sessionVolume()` returns 0 for
  time and distance — weight × seconds isn't pounds. A session of nothing but
  planks honestly reports 0 lb rather than inventing a number. Use `exVolume(e)`
  so the metric is never forgotten at a call site.
- **Supersets are adjacency, not ids.** `link: true` means "grouped with the
  exercise above me". Ids would need repairing on every reorder and delete;
  adjacency re-derives, so moving an exercise out of a pair just ends the pair.
  Anything landing at index 0 gets `link` cleared, since there is nothing above
  it to pair with.
- **`rpe` on a set is always optional and often absent.** The engine rule only
  fires when at least half a session's working sets carry one, so it is
  invisible to anyone not using the feature.
- **A training day holds week variants, and one variant is the old behaviour.**
  That equivalence is what makes the migration a one-liner and what keeps a
  single-week day looking exactly as it always did — no switcher, no chip, no
  label. Read a day's exercises through `planExOf(r, ix)` and never
  `r.exercises`, which `normalize()` deletes outright so the two can't drift.
- **Every plan exercise is built by one of two constructors.** `newPlanEx(name)`
  builds one from a name — history, then the guessers, then the movement's
  default range. `planExFromSession(ex)` promotes an exercise you added
  mid-session. Nothing else may write a plan-exercise literal: the object used
  to exist in five places and two of them silently dropped `bar`, `metric`,
  `mg` and `mg2`. Adding a field to the model now means editing these two.
- **Muscle tags fall back, they don't default.** `mg` (one main muscle) and
  `mg2[]` (helpers) may be absent on any exercise — every session logged before
  the feature existed has none. `tagsOf(ex)` resolves in order: the exercise's
  own tags → however that *name* is tagged in the plan today → `guessMuscles()`
  from the name. That's what makes the weekly report meaningful on day one
  instead of reading "0 sets, ever". Always read tags through `tagsOf()`, never
  `ex.mg` directly, or old history silently drops out of the report.

### Why logging a set doesn't re-render

The first version rebuilt `#view.innerHTML` after every logged set. On Android
Chrome that destroys the element the soft keyboard is attached to mid-gesture and
the touch targets desync from what's drawn — the page looks alive but taps land
nowhere until you switch apps and back. It was reported as "the app becomes
uninteractable."

`toggleSet()` and the ± steppers now mutate state and call `refreshSetRow()` /
`refreshSummary()`, which touch only the affected nodes. Verified: the input
keeps **DOM identity** across a toggle and across a ± tap. (Keyboard focus does
*not* stay on the input — it moves to the button you tapped, which is what a
real tap does too. The property that matters is that the node the soft keyboard
is attached to is never replaced.) **Do not reintroduce a full re-render on the
set-logging path.** Structural changes (adding a set, adding an
exercise, reordering) may still re-render — they're not in the between-sets hot
path.

The plate line under each set row obeys the same rule. `refreshPlates()` writes
`innerHTML` into the *existing* `.plates` node rather than replacing it, and the
node is `pointer-events: none`, so it can neither lose DOM identity nor swallow
a tap aimed at the tick.

### Why the rest timer plays silent audio

The countdown was always wall-clock correct, but the alert never arrived: a
backgrounded page has its timers throttled to nothing and `navigator.vibrate()`
is ignored outright. With the phone in a pocket — the only case that matters —
the timer did nothing at all.

Android Chrome will not freeze a page that is *playing audio*. So starting a rest
plays a one-second, near-silent WAV on loop purely to keep the page alive, and at
zero the **same, already-unlocked** `<audio>` element swaps to an audible tone.
Reusing one element is what avoids the autoplay problem: the first `play()`
happens inside the tap that logged the set, and everything after that inherits
that gesture.

Details worth keeping:

- Both WAVs are **synthesised in JS** (`wavURL()`) rather than embedded as
  base64 — it keeps the one-file rule at a few hundred bytes of code instead of
  a few KB of payload.
- **The keep-alive must be inaudible to you but audible to Chrome, and those
  are different tests.** Chrome scores a tab's audibility from real signal
  power. The first version used ±1/32767 dither (about -90 dBFS) on the theory
  that it just had to be "not digital silence" — Chrome scored it as silence,
  froze the tab anyway, and the alarm never fired. It is now a 30 Hz sine at
  amplitude 0.06 — **-24.4 dBFS peak, -27.4 dBFS RMS**. (The doc used to say
  "about -27" and the code comment "-24"; both were right about different
  conventions, which is worse than either. Peak is the number quoted from here
  on.) No phone speaker reproduces 30 Hz, so nothing comes out, but the tab
  counts as playing media. On headphones it may be a faint rumble.
- **There is deliberately no MediaSession.** There was one, and it made things
  worse. Declaring a media session tells Android "this is a music player",
  which is exactly what makes the system duck whatever the user is listening
  to. Do not add it back.
- **The keep-alive tone is opt-in and off by default** (`settings.keepTone`).
  Reported from an actual gym session: the 30 Hz tone was audible through
  headphones *and* Android attenuated the user's music for the entire rest
  period to prioritise it. It worked and was unusable, which is not a working
  feature.

  The catch-22 is real and worth understanding before trying to be clever:
  audio loud enough for Chrome to count the tab as "playing" is audio loud
  enough for Android to grant it audio focus, and audio focus is what ducks
  music. There is no web API to play audio without requesting focus.

  So the app stops assuming it needs the tone. Chrome does not freeze a
  backgrounded page instantly, and a normal two-to-three minute rest may well
  survive without any keep-alive at all. Whether it does is device-specific and
  unknowable from here — which is what the self-test is for, and why the
  self-test now reports which mode it ran in. A verdict that doesn't name the
  mode proves nothing.

  When the tone is off and an alarm arrives late, the app says so and offers a
  one-tap fix rather than failing silently: `restLate` is recorded in the tick
  and surfaced on the next `visibilitychange`.
- If the page gets frozen anyway and thaws late, the alarm is **suppressed past
  90 seconds** rather than shouting at someone already looking at the screen.
- Notification permission is requested only when the switch is tapped, never on
  load, and refusal is reported in the settings row instead of a switch that
  silently won't stay on.
- `navigator.serviceWorker.ready` never resolves when nothing is registered, so
  the notification path tests `.controller` and falls back to `new Notification`.
  This matters: the artifact build has no service worker.

### The background alarm self-test

Plan → "Test the alarm with the screen off" runs a 20-second rest and reports
what actually happened. It exists because this is the one behaviour a desktop
browser cannot check, and "I didn't hear anything" is not a bug report you can
act on.

The tick gap is the whole diagnosis. The rest timer records a timestamp every
second, so:

- **gaps of ~1s** → the page stayed alive, the keep-alive worked, and any
  remaining failure is downstream (media volume, Bluetooth routing)
- **one huge gap** → Chrome froze the page and the audio trick did not hold

It also records how long the page was genuinely hidden and **refuses to report a
pass if the screen was never off**, so a foreground run can't be mistaken for a
real result.

### Backup rides a tap you were already making

Sharing turned out to be genuinely broken on the target device, so the backup
that matters is the local file — and a backup you have to remember is not a
backup. `commitSession()` writes one **inside the tap on "Save workout"**.

That placement is the whole trick. A download needs user activation, and
finishing a workout is the one moment that reliably has it *and* is exactly when
the log is worth keeping. No extra tap, nothing to remember. `autoBackup()`
returns whether a file was actually written so the toast never claims one that
wasn't. The setting is on by default; turning it off is honest about it.

The other half is `fresh` in `viewToday()`: a wiped browser or a new phone lands
on a **stock split with empty days**, not on "no routines", so the restore offer
keys off having no sessions *and* no exercises anywhere. The first version of
this check was wrong and put the button in a branch a fresh install never
reaches — which would have made it useless in precisely the situation it exists
for. Verified by wiping localStorage and restoring from a file the app itself
had just written.

### "NotAllowedError: Permission denied" is not about permission

`navigator.share()` rejects with `NotAllowedError` in two unrelated cases, and
**neither involves a prompt** — which is why the message is so misleading. The
device reported it having never been asked anything.

1. The call had no **transient user activation**.
2. Chrome refused the **file's type**, even though `canShare()` had just said
   yes. The two disagree in practice.

**On this device it was cause 2, confirmed by the on-device test:** `.txt` and
plain text share fine, `application/json` does not. Sharing has worked since the
default order was changed to try `text/plain` first.

The fixes are opposite, so the app no longer guesses: `shareTestSheet()` tries
four payloads one tap at a time — `.txt` file, `.json` file, file plus title,
and text with no file — and reports each result. If one works, it is stored in
`settings.shareMode` and used by "Send a copy" from then on; if all four fail
identically, the browser is blocking sharing outright and no file-type change
will help. Backing out of a sheet that *opened* counts as working, because the
question is whether the sheet appears at all.

The default order now tries **`text/plain` first**: it is on every allowlist,
the contents are the same JSON either way, and the importer takes both. A
working share beats a tidier file extension. Downloads are still `.json`.

### Backup must never dead-end

`navigator.share({files})` failed silently on a real device: no sheet, no error,
nothing. Two independent causes, and both are worth remembering.

The first was ours. The rejection handler was `.catch(function(){})` with a
comment saying "user backed out of the share sheet" — so a genuine
`NotAllowedError` and a deliberate cancel produced identical behaviour, namely
none. **An empty catch on a user-facing action is a bug even when the common
case is benign.** Cancelling is now silent; anything else names the error.

The second is that a `share()` promise can neither resolve nor reject. A
watchdog treats "still focused three seconds later" as proof the sheet never
opened, since a real share sheet takes focus.

Every failure path now ends with a file saved to the device and a message
saying what happened, and the error is surfaced in the backup sheet next time
it is opened. `shareableFile()` also probes `canShare` with `.json` first and
falls back to `.txt`, because Android's allowlist for shareable types is not
something to guess at.

### Plate maths

`platesFor(target, bar)` works from `(target − bar) / 2` and goes greedy from the
heaviest plate down, bounded by how many pairs you own. Greedy is optimal for
every real plate set — each denomination divides the ones above it — and where it
isn't, the line shows the achievable total (`= 135`) rather than pretending.
The inventory is counted in **pairs**, because that's how you load a bar.

Only `bwMode(ex) === 0` gets a plate line; assisted and bodyweight work never
involves loading a bar.

### Metrics, supersets and RPE

**Metrics.** `metricOf(ex)` returns 0 reps / 1 time / 2 distance and everything
downstream branches on it: `setScore()` replaces `e1rm()` for PRs and trends,
`sessionVolume()` refuses to invent pound totals, the ± stepper moves in 5s for
time and distance, and the row separator reads "for" instead of "×".

The progression rule that needed real thought is unloaded timed work. A plank
has nothing to add weight to, so when `metric != 0` and there is no load, the
range top stops being a cap and becomes a floor: hold 60s on every set and the
next prescription is 65s, not "add 5 lb" to a bar that isn't there. Put weight
on the same plank and it goes back to adding load at the top of the range.

**Supersets.** `groupsOf()` derives contiguous runs of `link: true`; `groupTag()`
labels them A1/A2 and returns "" for a group of one, so nothing is marked unless
it's actually paired. `lastInGroup()` is what the rest timer consults —
autoRest fires after the last exercise of a group and not between its parts,
which is the entire point of supersetting.

**RPE.** Off by default. The chip only appears on a set that is already logged,
because rating a set you haven't done is meaningless and an extra required
field would break the one-tap rule. `rpeMean()` returns 0 unless at least half
the working sets carry a rating, and only a mean of 9.5+ changes anything: the
prescription repeats instead of adding load. Anyone not using RPE sees
identical behaviour to before.

**Templates.** `applyTemplate()` builds ordinary routines — bar weights come
from `guessBar()`, muscles from `guessMuscles()`, metric from `guessMetric()`.
Nothing about a template exercise is special-cased afterwards. Replacing a split
is undoable for ten seconds like every other destructive action.

### Weekly sets per muscle

The hypertrophy metric, and the reason the Progress tab is worth opening. A
completed working set counts **1.0 toward the main muscle and 0.5 toward each
helper**. Full credit everywhere is how volume trackers lie: three sets of bench
would read as three chest *and* three triceps *and* three shoulders, and a
four-exercise session would claim 40 triceps sets a week.

Deload sessions count — you still did the sets. Warm-ups don't, like everywhere
else.

The bar is this week; the dark line across it is last week. It's a marker rather
than a ghost bar behind the fill, because a ghost bar is invisible exactly when
this week is bigger — the case you most want to see. Faint marks sit at 10 and
20 sets, the usual weekly range for growth.

`guessMuscles()` is an **ordered** list and the order is the specification:
`leg curl` has to be tested before `curl`, `upright row` before `row`. Adding a
pattern in the wrong place silently re-tags existing lifts, since untagged
history resolves through the guess.

### Week variants — two rotations that must not become one

A day can hold more than one week's version of itself, so a split alternates
fortnightly with a different exercise selection each time round. It is one
axis, not two: **`routine.variants[]`**, never a parallel `altExercises` field.

**Two rotations run at once and they are independent.**

- `nextRoutine()` — which *day* is next. Reads the last session that had a
  routine and steps to the next day. Untouched by variants.
- `nextVariantIx(r)` — which *week* that day is on. Reads the last session **of
  that routine** and flips.

Finishing Day A week 1 must advance Day A to week 2 *while* the day rotation
moves on to B. Collapsing them into one modulo would tie the fortnight to the
number of training days, which is wrong the first time you skip a session.
Both are derived from history: there is no stored counter, as everywhere else.

**Details that carry weight:**

- A session stores `variantId` **and** `variantName`. The id drives the
  rotation; the name is a snapshot for history, exactly like `key` and `name`
  already are. Renaming a week later doesn't rewrite what past sessions say
  they were, and deleting one doesn't orphan them — an unresolvable
  `variantId` restarts the rotation at the first week rather than throwing.
- **A deload session consumes its slot.** A deload week is a real week and the
  fortnight keeps ticking through it.
- **Everything that asks "what am I training" spans all variants**, through
  `eachPlanEx()`: muscle tags, `trackedLifts()` (so `deloadCheck()` doesn't
  judge the block on half the plan), the exercise picker, renames, and the
  straight-sets repair. Only the Plan tab's *display* is per-variant.
- **A lift in both weeks shares one history and one progression**, because
  `exSessions()` joins by name. That is the right behaviour and it needed no
  code. A lift in only one week is trained fortnightly, so `trend()` takes
  about twice as long to speak — the Plan card says so out loud rather than the
  maths being quietly changed.
- **Every day and every week is one tap from Today.** Offering only each day's
  *next* week left the other one unreachable whenever that day wasn't up next,
  which turns a skipped fortnight into a plan edit. A one-week day is still a
  single button.
- **Templates stay single-variant.** Doubling every template would be noise.

### Switching lb ↔ kg asks, because the app can't know

Flipping the unit used to relabel and nothing else, so a 225 lb squat became a
"225 kg" squat: every number in the log silently changed meaning, and the bar
and plate inventory were stranded in the old unit. Both readings of that switch
are legitimate —

1. *"convert my log"* — the numbers are lb and I want them in kg;
2. *"just change the label"* — the numbers were always kg, the label was wrong;

— and nothing in the data distinguishes them, so `unitSheet()` asks rather than
guessing. Cancel is a real option and changes nothing.

- **Reps, seconds and distance are never touched.** `load` is converted
  alongside `w`, because it is a *resolved* weight stored at log time, not
  something re-derived on read. Converting one without the other would desync
  every bodyweight and assisted lift.
- **A bar that was the standard one snaps to the new standard**, rather than
  converting to 20.4 kg — plate maths against 20.4 with real kg plates is
  inexact on every single lift. A genuinely custom bar (trap, safety squat) has
  no standard to snap to, so it converts. Same rule for the settings bar and
  the per-exercise override.
- **Both paths reset the plate inventory**, since 20.4 kg plates don't exist
  and the relabel path's own premise is that everything was already kg.
- A backup file is written **inside the tap**, before anything changes, on the
  same reasoning as `commitSession()`. Undo holds a whole-state snapshot for
  ten seconds — an undo that re-derived would just be a second chance to get
  the arithmetic wrong.
- An empty log switches with no questions asked: there is nothing to convert or
  mislabel, so don't make an empty app ask.
- **Round-tripping drifts.** Values are rounded to 0.1, so lb → kg → lb lands
  at 225.1 rather than 225. Accepted, and asserted so it can't get worse.

### `normalize()` is the only door into the state

Storage, a backup file and a paste all go through it, so an old export can't
land half-migrated. It is also where `r.exercises` becomes
`r.variants[0].exercises` and the old field is deleted. The migration is
written back to storage once on boot (`MIGRATED`), deferred until after the DOM
exists because `writeNow()` can toast — so the next backup file is already v5
rather than something the importer has to migrate again.

"Only door" has to mean the **whole shape**, not just the parts that have
needed migrating. It checks `sessions`, `routines`, `active` and the arrays
below them are actually arrays, because a state whose `sessions` key was
missing used to render a blank `#view` and stay blank on every reload, with
nothing but "clear your storage" to do about it. Those repairs set `MIGRATED`
too, so a damaged state is fixed in storage rather than re-repaired every boot.
`load()` no longer falls back to a stock split when `routines` is damaged
either — that discarded the entire log to fix half of it.

### Settings is a screen, not a tab

Session, Barbell and Data used to sit at the foot of the Plan tab, below the
split, where the list you scrolled past to reach them had nothing to do with
them. They now live in `viewSettings()`, reached from a gear in the header.

- **Not a fourth tab.** The bottom bar is the gym-floor surface and a settings
  tab would be dead weight in every session. `renderTabs()` keeps Plan
  highlighted while Settings is open, so the bar still says where you are, and
  any tab tap leaves.
- **Progression stayed on Plan.** Rep ranges and the deload window shape the
  split they sit under, and separating cause from effect is precisely what made
  the `doubleDefault` bug invisible for weeks.
- **The rows kept their handlers**, which live behind `if(TAB!=="plan") return;`
  on the two `#view` listeners. Both now accept `"settings"` as well. Miss that
  and every switch on the new screen silently does nothing — there is a suite
  that toggles all five and asserts the state actually changed.
- Anything that re-renders after changing a preference calls **`viewPrefs()`**,
  which routes by tab, because a few of these rows are reachable from either
  screen. Calling `viewPlan()` directly throws you off Settings mid-edit.
- **The gear is the only way in, so it is sized and inked for it.** An inline
  SVG with no rule fills its `.iconbtn` edge to edge — the text-labelled icon
  buttons (`↑`, `⋯`) have natural padding and hid that omission for months. It
  is now inset to 20px inside the 32px target and uses `--ink-2` rather than
  the most muted ink.
- **`BUILD` still prints at the foot of the Plan tab.** It is also in Settings →
  About, but the Plan one is the documented place and the one in muscle memory.

### Undo

`toastUndo(msg, fn)` holds the removed object in a closure for 10 seconds — no
re-derivation from the DOM, no tombstone in `S`. Wired to the four destructive
paths: delete session, remove exercise from session, remove plan exercise, delete
training day. The session one re-runs `recomputePRs()` in **both** directions.

Only the Undo pill takes pointer events; the toast body is `pointer-events: none`
so a 10-second toast can't sit on top of "Finish workout".

---

## The engine

### `prescribe(name, ex)` — what to do today

Returns `{w, r, sets, why, kind}`. Everything is derived from history; there are
no stored counters to drift out of sync. `makeSessionEx()` uses the result as the
prefill, so following the plan costs zero taps and the card explains itself.

Order of precedence:

1. **Deload week running** → `easier()` load, reps at the bottom of the range,
   sets × 0.6. (`kind: "deload"`)
2. **Trend is down** → one 10% back-off per decline episode. If today's load is
   still below the best first-set load anywhere in **the same window the "down"
   verdict was computed from** (`trendWin()`), it holds instead — and while
   holding, the reps still climb. This guard exists because without it a
   decline produces a cut, which produces a lower session, which reads as a
   further decline; the app chases itself down. **The window length is
   load-bearing.** It used to be a flat 3 sessions against a ~9-session
   verdict, which expired first and cut again every four sessions. On assisted
   work "best" means the *least* assistance, so the comparison inverts with the
   load direction. See trap 17b and `t28`.
3. **Double progression** (`repTop > reps`) → all sets at the top of the range
   means harder load and reps reset to the bottom; inside the range means same
   load and one more rep; short of the bottom means run it back.
4. **Straight sets** (`repTop` empty) → hit the target on every set, load goes up.

`harder()` / `easier()` respect load direction: on assisted work progress means
the *number goes down*, so they invert. Getting this backwards silently prescribes
regression, which is why it has a dedicated test case.

### Where a rep range comes from

`defaultRange(name, metric)` decides what a *new* exercise starts at. A cable
curl and a deadlift do not want the same range, and everything used to arrive
at the one global default.

`settings.repLow`/`repHigh` stays the spec for an ordinary compound and the
other tiers are **derived from it**, so one setting still steers the whole plan
rather than the app growing three of them:

| class | from 8–12 | examples |
|---|---|---|
| heavy | 5–8 (`low−3`, `top−4`) | squat, deadlift, bench, OHP, row, pull-up |
| compound | 8–12 (unchanged) | leg press, lunge, hip thrust, anything unmatched |
| isolation | 12–16 (`low+4`, `top+4`) | curl, extension, raise, fly, calf, shrug, pushdown |
| timed | 30–60s | anything with `metric === 1` |

`movementClass()` is an ordered regex list like `guessMuscles()`, with the same
first-match-wins rule, **plus one override**: `MOVE_LIGHT` demotes a heavy
match to compound when the name says dumbbell, machine, cable, smith, band or
kettlebell — a dumbbell bench press is not a heavy barbell lift.

Timed work is the exception that had to be special-cased rather than derived:
a plank has nothing to do with a rep count, and template planks were arriving
as "8–12 seconds", which is not a plank.

**These are defaults, not rules.** The range is two taps away in the exercise's
own menu, and `repLow`/`repHigh` remains the fallback for anything unmatched.

### The switch that only applied to new exercises

`settings.doubleDefault` has always been a *creation-time* default. Turning it
on did nothing to the plan you already had, and an exercise with no `repTop`
falls through `prescribe()` to straight sets — so it adds weight the moment you
hit the target. On a plan carried forward from v1, where no exercise ever had a
`repTop`, that meant double progression never ran at all, and the only signal
was the card reading "3 × 8 target" instead of "3 × 8–12 range". That is not a
signal; the reported symptom was "it always suggests more weight at 8 reps".

Three things fix that class of bug, and all three matter:

- The card and the Plan row say **"8 straight"**, which names a mode, rather
  than "8 target", which reads as a number.
- Both exercise menus state the mode in a sentence (`modeHint()`), and the plan
  menu offers **one tap out of it**.
- Plan → Progression counts the exercises still on straight sets and offers to
  fit ranges to all of them, undoably. Turning the switch on re-offers it,
  because a switch that silently means "from now on" is the original bug.

`applyRanges()` **keeps each exercise's existing bottom** and only adds the
reps-first room on top (`repTop = reps + rangeWidth(name)`). Moving the bottom
would quietly change a programme you are mid-way through; adding a ceiling
doesn't. It also updates a workout already in progress, which holds its own
copy of every exercise.

### `trend(name)` — is this lift moving

**Least-squares slope** of best-e1RM over the last `max(6, cycle + 3)` non-deload
sessions, scaled to *percent per 3 sessions*. `up` ≥ +1.5%, `down` ≤ −2%, `flat`
between. Returns `new` until 4 sessions exist, so the app stays quiet rather
than guessing.

It used to be the mean of the last 3 sessions against the 3 before, **and that
measured the wrong thing.** Under double progression e1RM *sawtooths*: reps
climb from the bottom of the range to the top, then the load steps and reps
reset, dropping the score back. A 3-vs-3 mean straddling that reset reads the
phase of the sawtooth, not the trend.

Simulated on a flawless run — never a missed rep — the old code reported
**"down"**:

| range | load | old verdict |
|---|---|---|
| 8–12 | 185 | −2.6% down |
| 8–12 | 225 | −2.9% down |
| 6–10 | 185 | −2.8% down |
| 8–15 | 135 | −8.3% down |
| 8–20 | 100 | −16.6% down |

and it got **worse the stronger you got**, because a fixed 5 lb step is a
shrinking fraction of the load while the rep climb is not. `"down"` is what
makes `prescribe()` cut 10% off the bar, so the engine could back off someone
doing everything right.

A slope over a window guaranteed to contain a whole cycle has no phase to read.
`cycleOf(name)` is `repTop − reps + 1`, from the plan and then from history;
straight sets have no cycle, so 1. Scaling to "% per 3 sessions" is what lets
the ±1.5 / −2 thresholds keep the calibration they were tuned with.

Two things to know before touching it:

- **Whole-cycle windows are worse, not better.** A window of exactly one cycle
  captures the ramp and then the reset as separate phases and swings harder
  (−2.1% to +7.2% on 8–15, versus +0.5% to +2.1% for `cycle + 3`). The
  overlapping longer window is what smooths it.
- **A wide range genuinely reads slower.** 8–15 gains 5 lb every eight sessions,
  which really is under the +1.5% bar, so it shows "flat". The chip is a rate
  now. That is honest, not a bug.

### `deloadCheck()` — is the whole block stale

Of the lifts in your routines with at least 6 sessions, the share whose
**`trendLong()` slope is ≤ 0**. ≥60% → "time to deload"; ≥40% → a softer watch
note. Suppressed while a deload week is running or during a 14-day snooze.

Both halves of that changed, and for one reason. Over the short window the
slope still depends slightly on cycle phase: across every plausible range and
load, a flawless run dips as low as **−0.37%** at its worst phase, while a
genuine stall reads exactly **0.00%**. Those overlap, so *no threshold on the
short window can separate "progressing slowly" from "not progressing at all"*.
Over two cycles the phase mostly washes out, and `pct <= 0` splits them —
but **only up to a rep range about eight sessions wide**. Measured on flawless
runs at 185 / 225 / 315 / 405, worst phase:

| cycle (`repTop − reps + 1`) | worst flawless long-window slope |
|---|---|
| 7 (e.g. 8–14) | +0.27% |
| 8 (8–15) | +0.15% |
| 9 (8–16) | +0.02% |
| 10 (8–17) | −0.05% |
| 13 (8–20) | −0.18% |

A stall is exactly 0.00%, so from cycle 9 the two classes touch and no
threshold separates them at all — the step is a shrinking fraction of the load
while the cycle stretches. `deloadCheck()` therefore **skips any lift wider
than cycle 8** and says so in the status line. Every default tier (5–8, 8–12,
12–16) is far inside that; only a hand-widened range is affected.

> An earlier version of this section claimed "flawless never drops below
> +0.35%" without qualification. That is true at the default tiers and false at
> wide ones — three heavy 8–20 lifts trained perfectly for 34 sessions read
> −0.13 / −0.21 / −0.27 and produced a flat "Time to deload". Corrected in v21;
> `t26` asserts that exact seed.

That is also why it no longer keys off the `"up"` *label*: the flat band
includes real but slow progress, and counting that as stalled is exactly how a
working plan gets told to take a week off.

### `recomputePRs()`

Walks the entire history in chronological order and re-flags `pr`. Must run after
**any** edit, delete or import — otherwise a corrected typo leaves a phantom
record behind that poisons every future comparison.

---

## Verification status

Tested against seeded histories in Chrome via a local static server, plus a
320 px-wide viewport pass and both colour themes. No console errors on any path.

The Slice 1 round was driven with Playwright against mobile-emulated Chromium
(390×844, touch), which exercises real clicks and real focus rather than calling
functions directly. That's how the `data-x="top"` collision below was caught.

**Verified working**

- Split rotation, carry-forward prefill, one-tap logging, rest timer, PR badges
- All four progression verdicts, in both straight-set and double-progression modes
- Assisted lifts progress by *removing* assistance; bodyweight lifts score against
  bodyweight and climb reps before adding load
- Warm-ups excluded from volume, PRs and prescriptions — a 400 lb "warm-up" adds
  nothing and sets no record; working-set numbering renumbers around them
- Deload week: light-and-short prescriptions, session tagged, and the trend held
  at +7.9% instead of being dragged down
- Back-off fires once per genuine decline episode and then holds while the reps
  climb back. **This was claimed here before it was true**: the guard looked at
  3 sessions while the verdict it guards is a slope over ~9, so it expired
  first and the app cut 10% again every four sessions — 190 lb down to 115 for
  a lifter getting stronger. Fixed and closed-loop asserted in v19 (`t28`)
- Session editing: a 210 → 2100 typo blew the trend to +339.5%, and correcting it
  restored both the PR and the +7.9% trend exactly
- Editor add/remove set, add warm-up, remove exercise, change date, re-sort
- Rename propagates to plan, history and active session; history stays joined
- Export / import / bad-file rejection; service worker serves the whole app with
  the server killed

Slice 1 specifically:

- Rest alarm: quiet loop starts on rest and is `loop: true` / playing; at zero the
  element swaps to the ~1 s beep track with `loop: false`; fires exactly once; skip
  and restart both stop the audio
- Plate line: 225 over a 45 bar → `45×2`; 185 → `45 25`; 137 → `45 = 135` flagged
  as inexact; below the bar flagged; absent on dumbbell work and on assisted /
  bodyweight modes; survives a set toggle; updates on both typing and the ± steppers
- `guessBar()` picks up "Back Squat" and "Romanian Deadlift", stays off
  "Dumbbell Bench Press"
- Reorder: move-to-top from the ⋯ menu, with the card scrolled into view
- Undo on all four paths, restoring at the original index; the session path
  restores PR flags via `recomputePRs()`
- The toast body does not intercept taps (checked with `elementFromPoint`)
- Plate inventory editing keeps input focus — it updates on `input`, no re-render
- Notification **denial** path (headless Chromium reports `denied`): switch stays
  off and the reason is shown

Slice 2, against a seeded 8-week A/B history whose sessions carry **no** tags,
so the `tagsOf()` fallback is what's under test:

- Weekly sets arithmetic, checked number by number — bench gives Chest 3 (not 6);
  Triceps 3 = bench 1.5 + overhead press 1.5; Back 7.5 = row 3 + pulldown 3 +
  RDL helper 1.5
- Retagging Back Squat to Core moved 3 sets out of Quads and into Core **across
  the existing history**, and Quads dropped off the list entirely
- The last-week marker sits left of the fill when the week is up and right of it
  when the week is down, measured in pixels rather than eyeballed
- PR board: capped at 5, "see all" lists every lift, a row opens the lift sheet
- Calendar: marks trained days, outlines today, disables paging into the future,
  a trained day opens that session, and the month resets on re-entering the tab
- The muscle picker preselects the guess, main muscle is disabled as its own
  helper, and both persist

Slice 3:

- Templates: all three load, PPL makes 3 days and 15 exercises, every one
  arrives muscle-tagged and barbell lifts get a bar; undo restores the previous
  split
- Metric: a template Plank arrives as Time, the card shows a TIME chip, the row
  separator reads "for", the placeholder says "secs", the stepper moves 5s while
  reps still move 1, and a bench+plank session counts only the bench in volume
- Progression: an unloaded plank at the top of its range prescribes 65s rather
  than adding weight; mid-range it steps 5s; a *weighted* plank at the top does
  add load
- RPE: three sets at RPE 10 hold the weight ("Averaged RPE 10 last time"); the
  same sets without ratings add 5 lb as before; one rating out of three is
  ignored
- Supersets: A1/A2 markers appear, no rest fires after the first of a pair, rest
  does fire after the last
- `guessMuscles()` checked against the twelve names most likely to be mis-tagged,
  including the two the ordering exists for — `Incline Dumbbell Curl` → biceps
  (not chest) and `JM Press` → triceps (not chest)
- PWA install criteria: service worker activates, manifest has name + standalone
  + 192 + 512 + maskable, and the shell caches for offline

Slice 5 (v13), against a v1-shaped plan whose exercises have no `repTop` field
at all — the state the reported bug lives in. **The suites are in
`tools/test/`** (`t20`–`t23`) and run against
`npx http-server -p 8117 -s -c-1 .` with `node tools/test/tNN-….mjs`. Per-suite
assertion counts are deliberately not written down here — they went stale the
moment a suite grew, and two of the five doc errors the v18 review found were
exactly that. Run them and read the summary line:

- The reported symptom, end to end: a v1 exercise reads "3 × 8 straight" on
  both the Plan row and the session card, the engine adds weight because that
  is genuinely the mode the data is in, and taking the offered repair flips the
  same exercise to "3 × 8–11 range" and "go for 9 this time" at the same load
- Plan warns with a count and names the exercises, disappears once repaired,
  comes back on undo, and re-offers itself when `doubleDefault` is switched on
- `applyRanges()` widths, checked one by one: bench 8 → 8–11 (heavy), squat
  8 → 8–11, cable curl 10 → 10–14 (isolation), bottoms untouched
- New-exercise ranges: deadlift 5–8, lateral raise 12–16, **dumbbell** bench
  press 8–12 (the `MOVE_LIGHT` demotion), leg press 8–12, plank 30–60s as time
- Item 5: an extra kept from the finish screen now carries `metric`, `mg`,
  `repTop` and `bar` — it dropped all four
- Item 6: the session editor's "Add exercise" produces 12–16 with `mg: biceps`
  for a cable curl instead of a hardcoded `{reps: 8, repTop: 0}`
- Both exercise menus measured at 320 px and 390 px after gaining a row and a
  button: no sideways scroll, no nested `.field-row`, no duplicated `data-x`
- Regressions on everything the constructor change reroutes: PPL still builds
  3 days / 15 exercises / all tagged / all with a bar where due, all four
  progression verdicts, assisted inversion, unloaded-plank time progression,
  a 405 lb warm-up still counting for nothing, and the plate line
- The set-logging path still doesn't re-render, **with a control**: the weight
  input keeps DOM identity across a tick and a ± stepper, while "+ Set" — a
  structural change, which is allowed to re-render — demonstrably replaces it.
  Note the earlier claim that the input keeps *keyboard focus* is wrong as
  written: focus moves to the button you tapped, exactly as a real tap does.
  What matters, and what is asserted, is that the node survives.

Slice 6 (v14), week variants — `t24`:

- Migration: a v4 state becomes a single-variant v5 day, keeps its exercises,
  loses `r.exercises`, and a single-variant day renders with no switcher and no
  chip — indistinguishable from the old app
- Adding a week from a copy or empty, renaming it to anything, removing it, and
  undo on the add and the remove
- Editing one week leaves the other alone, including fresh exercise ids on a
  copy so the two don't share objects
- **The two rotations, driven through three real sessions:** finishing Push
  week 1 moves the *day* rotation to Pull while Push independently advances to
  week 2; training Pull doesn't disturb it; Push then flips back to week 1
- A deload session records its week and consumes its slot
- Sessions pointing at a deleted variant don't break either rotation
- Cross-variant reads: the straight-sets warning and its repair reach into
  week 2, the picker knows lifts that live only in the other week, a lift in
  both weeks carries one history
- Export→import round trip with variants, **and a v4 backup file importing
  clean** — which is the shape every auto-backup already on the phone has
- Plan with a switcher measured at 320 px and 390 px, no sideways scroll

Slice 7 (v15), switching units — `t25`:

- An empty log switches silently and picks up the kg bar, plate set and step
- With history it asks, shows the actual arithmetic (225 lb → 102.1 kg), and
  cancelling changes nothing at all
- Converting: `w` and `load` together, session and settings bodyweight, the
  per-exercise weight step; reps left alone; the standard bar snapped to 20
  while a 60 lb trap bar converted to 27.2
- Relabelling leaves every number and still un-strands the bar and plates
- Undo restores the whole log, the inventory and the per-exercise overrides
- A round trip lands within 0.1 of where it started
- The sheet measured at 320 px and 390 px

Slice 8 (v16), the trend signal — `t26`, driven by seeding a
textbook double-progression history and reading the verdict off the card:

- Four ranges that used to read "down" on a flawless run — 8–12 @185, 8–12
  @225, 6–10 @185, 8–15 @135 — now read climbing or flat, never slipping, and
  the engine never backs off or cuts a set
- A genuine decline still shows SLIPPING and still refuses to add weight
- A genuine stall reads flat, and is not mistaken for a decline
- Straight sets, which have no cycle, are unaffected
- Under 4 sessions it still says nothing
- **The deload nudge checked at every phase of the cycle**, 10 through 20
  sessions, on a 3-lift plan: never fires on flawless progress — and still
  fires on a plan that has genuinely stopped

Slice 9 (v17), Settings as its own screen — `t27`:

- The gear opens it, the back arrow returns to Plan, any tab tap leaves, and
  the bottom bar stays three tabs with Plan lit while it is open
- Progression and the build marker are still on Plan; Session, Barbell and Data
  are not
- **All five switches toggled and the stored state checked** — the guard bug
  would have left every one of them inert while looking fine
- Number fields save; the plate inventory saves *and* keeps DOM identity while
  typing; add / reset re-render Settings rather than throwing you back to Plan
- The unit sheet opens from here and cancelling returns here
- Measured at 320 px and 390 px: no sideways scroll, no nested `.field-row`
- The gear itself: a full-size tap target, an icon inset rather than filling it,
  and readable ink — the first version rendered edge to edge and looked like a
  smudge

Slice A (v19–v21), the external review's trust findings — `t28` (the closed
loop) and `t29` (history integrity), plus new copy and deload assertions in
`t26`. Every item was reproduced through the UI *before* being fixed, and the
reproduction is what became the assertion:

- **The back-off spiral, closed-loop.** `t28` drives 30–45 real sessions —
  prescribe, simulate a lifter with per-set fatigue, log through the UI, repeat
  — for a steady gainer, a gainer with one sick day, a genuine decline, and an
  assisted lift. Before: a lifter whose true 1RM rose 250→295 was walked from
  190 lb to 115, and the sick-day lifter from 185 to 80. After: one cut, full
  recovery to 185 and 195 respectively
- The genuine decline **still cuts**, twice over 30 sessions of real strength
  loss, and tracks the true 8RM to 150. What is asserted is the *spacing* —
  cuts can never come closer than the trend window
- The assisted lift, where every direction inverts: before the fix a
  strengthening lifter with one bad day was walked from 50 lb of assistance up
  to 105
- **Rename-merge**: the collision sheet, both outcomes, cancel, undo, an
  ordinary rename unaffected, PRs rebuilt over the merged lineage (the 60 lb
  ghost flag gone, the 120 lb set now a real record), and the sheet measured at
  320 px and 390 px
- **Editor loads**: a 30-day-old weighted pull-up at stored load 205 with
  today's bodyweight at 200 — editing only the note used to make it 225. It
  stays 205, the session is backfilled with the bodyweight its loads imply, and
  a weight you *do* change re-resolves against the session (25→35 gives 215),
  not against today
- **Shape hardening**: a state with no `sessions` key, one with `sessions: {}`
  and `routines: "nope"`, a session with no `exercises`, an exercise with no
  `sets` — all render, all repair, all written back
- **Banner copy**: the down banner names the slope it measured and the
  prescription `prescribe()` actually returns; a flat lift that already has a
  range is no longer told to set one
- **Deload check**: three heavy 8–20 lifts trained flawlessly for 34 sessions
  used to produce "Time to deload". They are now excluded as too wide to judge,
  and Progress says what it is watching instead of going silent

**Confirmed on a real phone** (Android, 1 Aug 2026, v7 deploy)

- The tap-freeze is gone.
- **The background alarm works.** Alarm at 20.7s of a 20s rest, longest tick gap
  1s, screen off throughout — Chrome did not freeze the page. The 30 Hz
  keep-alive plus MediaSession is doing its job.
- The lock-screen notification fires.
- **The share-sheet backup did not work at all**, and produced no error, which
  is what led to the failure-path rework below. On the rebuilt path it errors
  cleanly and falls back to a file, confirmed on the device. Sharing itself is
  still broken there, so the local file is the real backup and auto-backup on
  finish exists because of it.

**Not verified — needs a real phone**

- The "can't tap anything" fix. The cause is understood and the mechanism is
  fixed, but it was never reproduced on desktop, so only Nick's Android can
  confirm it.
- `navigator.share({files})` — the backup share sheet. Desktop Chrome reports
  `canShare: false`, so that button was never exercised; the download fallback was.
- Install-to-home-screen and the standalone launch from Pages. The install
  *criteria* are verified in Chromium; whether Android actually offers the
  prompt and launches fullscreen is not.
- **The whole point of the rest alarm**: that the quiet loop actually keeps the
  page alive on Android Chrome with the screen off and the phone in a pocket.
  The mechanism is verified in the foreground; the background survival is exactly
  what a desktop browser cannot tell you. Test it by starting a rest, locking the
  phone, pocketing it, and waiting.
- Notification **grant** path. Headless Chromium has no notification support, so
  only the refusal branch was exercised.

## Traps — read before changing anything

Every one of these cost real time. They are in rough order of how badly they
bite.

1. **Never re-render on the set-logging path.** `toggleSet()` and the ± steppers
   mutate state and refresh individual nodes. Rebuilding `#view.innerHTML`
   between sets desyncs Android Chrome's touch targets and the app goes
   unresponsive mid-workout. Structural changes may re-render; logging may not.
2. **GitHub Pages serves `main`.** Work on a branch is invisible to the phone.
   A whole test round was lost to this. `BUILD` prints at the foot of the Plan
   tab — check it on the device before believing any bug report.
3. **An empty `catch` on a user-facing action is a bug**, even when the common
   case is benign. `.catch(function(){/* user cancelled */})` made a genuinely
   broken share indistinguishable from a cancelled one, and the symptom was a
   button that did nothing at all. Cancels are silent; everything else reports.
4. **`NotAllowedError` from `navigator.share()` is not about permission.** No
   prompt exists. It means missing user activation *or* a refused file type.
   `canShare()` approving a type does not mean `share()` will accept it.
5. **Chrome scores tab audibility from real signal power.** A keep-alive track at
   -90 dBFS counts as silence and the tab gets frozen anyway. It has to be
   inaudible to a human but loud to the meter — hence 30 Hz at -24 dBFS peak. But
   see 5b: solving that created a worse problem.
5b. **Anything loud enough to keep the tab alive is loud enough to duck the
   user's music**, because Android grants audio focus on the same signal Chrome
   measures. There is no way to play audio without requesting focus, and a
   MediaSession makes it worse rather than better. The tone is therefore
   opt-in, off by default, and the app degrades loudly instead of silently.
6. **`data-x` values collide inside a sheet.** `$('[data-x="top"]', el)` returns
   the first match in the whole sheet, so a menu button named `top` silently
   binds its handler to the rep-range input. Grep the sheet before naming one.
7. **A `<button>` as a flex item is not content-sized in Chrome.** One measured
   112px wide regardless of its text, as both a float and a flex item.
   `display:inline-flex` on the button fixes it. This will look like styling and
   is not.
8. **`recomputePRs()` after *any* history edit, in both directions.** Delete,
   undo, import, editor save. A corrected typo otherwise leaves a phantom record
   that poisons every future comparison.
9. **Read muscle tags through `tagsOf()`, never `ex.mg`.** Most history has no
   tags; the fallback chain is what makes the weekly report meaningful instead
   of reporting zero.
10. **Fresh-install detection must key off "no data", not "no routines".** A
    wiped browser lands on a stock A/B/C split with empty days. The restore
    prompt was first written into a branch that a fresh install never reaches —
    useless in exactly the situation it exists for.
11. **Volume is undefined for time and distance.** Use `exVolume(e)` so the
    metric can't be forgotten at a call site.
12. **HTML built from template strings has no compiler, and unbalanced tags
    fail silently and compound.** `loadTypeRow()` left a `.field-row` open for
    months with no visible effect, because it happened to be the last row in its
    sheet. Adding three more rows after it nested them inside each other and
    blew a menu out to 1180px in a 388px viewport. Count your closing tags when
    a function returns markup, and assert `scrollWidth <= clientWidth` on any
    sheet you add rows to.
13. **Plan-exercise literals are now banned.** They existed in five places —
    `addToPlan()`, `applyTemplate()`, `pickExercise()`, `exerciseMenu()`'s
    keep-permanently, `finishSheet()`'s keep-extras — plus a sixth in the
    session editor, and three of them had drifted: the finish screen dropped
    `bar`, `metric`, `link`, `mg` and `mg2`, and the editor hardcoded
    `{targetReps: 8, reps: 8, repTop: 0}` over every default. All six now go
    through `newPlanEx()` or `planExFromSession()`. **Add new model fields
    there and nowhere else**, and don't reintroduce a literal "just for this
    one case" — that is exactly how the first five happened.
14. **A setting that only applies at creation time is a bug unless it says so
    and offers to apply itself.** `doubleDefault` looked like a mode and was a
    default. Every exercise Nick had predated it, so the headline feature of
    the engine had never once run on his data, and the app reported this as a
    slightly different word on a card. If you add another switch that shapes
    new objects, make the existing ones' state visible and offer the migration
    in the same screen.
15. **Read a day's exercises through `planExOf(r, ix)`, and put every new
    entry point through `normalize()`.** `r.exercises` no longer exists; a day
    holds `variants[]`. Anything that asks what lifts are in the whole plan
    uses `eachPlanEx()` — miss that and a feature silently judges the block on
    one week out of two.
16. **The Plan row is a width budget, and it has already been overspent once.**
    `.pxs` is rigid and `.pxn` truncates, so the sets×reps can never be the
    half that disappears. That balance only holds while the meta stays short:
    adding the word "straight" to it starved the exercise name to *nothing* at
    320px in one commit. If you add anything to that row, run the 320 px
    overflow assertions in `t21` first.
17. **Any signal derived from e1RM has to survive the double-progression
    sawtooth.** Reps climb, load steps, reps reset — so the score saws up and
    down with a period of `repTop − reps + 1` sessions. Compare two windows
    across that and you measure phase, not progress; it read "down" on a
    flawless run and cut the weight. If you add another trend, stall, PR-pace
    or readiness signal, simulate a perfect run through it *first* and check it
    never reports a decline. `tools/test/t26-trend.mjs` does exactly that.
17b. **A prescription is an input to the next session — simulate the loop, not
   just the signal.** Trap 17 got `trend()` right and stopped there. The bug
   that survived was in `prescribe()`'s *reaction* to it: the back-off guard
   looked back 3 sessions while the verdict it guards is a slope over ~9, so
   three obedient sessions at the cut weight expired the guard while the slope
   still saw the pre-cut scores, and it cut another 10%. Every four sessions,
   for ever. Holding also pinned reps to the bottom of the range, which
   suppressed exactly the rising e1RM that would have cleared the verdict — the
   app was censoring the evidence that would have stopped it. Closed-loop, a
   lifter whose true 1RM rose 250→295 was prescribed 115 lb. **Any window a
   guard uses must be at least the window of the signal it guards**, and
   anything that changes what gets logged has to be simulated by feeding its
   own output back in for 40+ sessions, which is what `t28` does. One-verdict
   tests cannot see this class of bug at all.
18. **A view that borrows another view's event listeners inherits its guard.**
    The `#view` click and input listeners early-return unless `TAB` is the one
    they were written for. Moving rows to a new screen without widening those
    guards leaves every control rendered, styled and completely inert. Toggle
    one of everything on any screen you add.
19. **Test through the UI, not the functions.** The `data-x` collision, the
    112px button and the miswired restore prompt were all invisible to
    unit-style checks and obvious the moment a real click drove them. The menu
    overflow above is the same lesson again: it was found by measuring a
    rendered sheet, not by reading the code.

## Settled decisions

- **No accounts, no server.** The whole point was zero friction and zero ads.
  The cost is no sync and no automatic backup, which is accepted and mitigated
  with the share-sheet backup. Revisit only if multi-device becomes a real need.
- **Data is keyed to the origin.** Moving hosts means export-then-import. There is
  no way around this in the browser.
- **Numbers are monospace everywhere**, UI is system-ui. Font CDNs are blocked in
  the artifact host, so no webfont is loaded at all — this is deliberate, not an
  oversight.
- **`localStorage`, not IndexedDB.** The whole log is tens of KB; a synchronous
  blob is simpler and the flush-on-hide handling makes it safe enough.
- **Epley for e1RM.** Known to drift above ~10 reps; accepted for now, flagged in
  the roadmap.
