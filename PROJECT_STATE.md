# Iron Log — project state

Read this first. It is the current state of the app, the reasoning behind the
non-obvious parts, and what has actually been verified. Pair it with
[ROADMAP.md](ROADMAP.md) for what to build next.

*Last updated: 1 Aug 2026 — built with Claude Opus 5.*

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

**The repo is the product.** After editing `index.html`, **bump `CACHE` in
`sw.js` in the same commit** — otherwise installed phones keep serving the old
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

settings = { unit, rest, autoRest, buzz, sound, notify, rpe, inc,
             doubleDefault, repLow, repHigh,
             bodyweight, deloadUntil, deloadSnooze,
             bar, plates[], lastBackup }
  plates[] = { w, n }        // n = PAIRS owned, not singles

routine  = { id, key, name, exercises[] }
  exercise (plan) = { id, name, sets, reps, repTop, inc, bw, bar, metric,
                      link, mg, mg2[] }

session  = { id, ts, endTs, routineId, key, name, note, bw, deload, exercises[] }
  exercise (logged) = { id, planId, name, targetReps, reps, repTop, inc, bw, bar,
                        metric, link, mg, mg2[], supplemental, why, kind,
                        lastW, lastR, sets[] }
    set = { w, r, done, warm, pr, load, ts, rpe }
```

Notes that will bite you if you miss them:

- **Exercises are joined by name, not id** (`normName()` lower-cases and trims).
  That's why `renameExercise()` has to rewrite routines, history *and* the active
  session together — otherwise a rename silently forks a lift's history in two.
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
`refreshSummary()`, which touch only the affected nodes. Verified: the input keeps
DOM identity *and* keyboard focus across a toggle. **Do not reintroduce a full
re-render on the set-logging path.** Structural changes (adding a set, adding an
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
- The quiet loop is dithered ±1/32767, not digital silence. A track of pure
  zeroes can be optimised away and stops counting as playback.
- If the page gets frozen anyway and thaws late, the alarm is **suppressed past
  90 seconds** rather than shouting at someone already looking at the screen.
- Notification permission is requested only when the switch is tapped, never on
  load, and refusal is reported in the settings row instead of a switch that
  silently won't stay on.
- `navigator.serviceWorker.ready` never resolves when nothing is registered, so
  the notification path tests `.controller` and falls back to `new Notification`.
  This matters: the artifact build has no service worker.

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
2. **Trend is down** → one 10% back-off, *once*. If today's load is already below
   the peak of the last three sessions, it holds instead. This guard exists
   because without it a decline produces a cut, which produces a lower session,
   which reads as a further decline — the app chases itself down.
3. **Double progression** (`repTop > reps`) → all sets at the top of the range
   means harder load and reps reset to the bottom; inside the range means same
   load and one more rep; short of the bottom means run it back.
4. **Straight sets** (`repTop` empty) → hit the target on every set, load goes up.

`harder()` / `easier()` respect load direction: on assisted work progress means
the *number goes down*, so they invert. Getting this backwards silently prescribes
regression, which is why it has a dedicated test case.

### `trend(name)` — is this lift moving

Mean best-e1RM (Epley) of the last 3 non-deload sessions vs the 3 before.
`up` ≥ +1.5%, `down` ≤ −2%, `flat` between. Returns `new` until 4 sessions exist,
so the app stays quiet rather than guessing.

### `deloadCheck()` — is the whole block stale

Of the lifts in your routines that have enough history, the share that aren't
climbing. ≥60% → "time to deload"; ≥40% → a softer watch note. Suppressed while a
deload week is running or during a 14-day snooze.

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
- Back-off fires once and then holds
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
