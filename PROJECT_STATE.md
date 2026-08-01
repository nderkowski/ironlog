# Iron Log — project state

Read this first. It is the current state of the app, the reasoning behind the
non-obvious parts, and what has actually been verified. Pair it with
[ROADMAP.md](ROADMAP.md) for what to build next.

*Last updated: 31 Jul 2026 — built with Claude Opus 5.*

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
| Artifact copy | `artifact-body.html` — **generated**, never edit by hand |
| Build step | `tools/build-artifact.ps1` (strips the doctype/head, drops the SW registration) |
| PWA support | `manifest.webmanifest`, `sw.js`, `icon-*.png` |
| Live artifact | https://claude.ai/code/artifact/af735a88-8f5a-480e-abe1-fe22f4c684fc (private to Nick's Claude account) |
| Self-hosted | **not deployed.** Target is https://nderkowski.github.io/ironlog/ — repo does not exist yet; steps in [README.md](README.md) |

After editing `index.html`: run the build script, republish the artifact, and
**bump `CACHE` in `sw.js`** or self-hosted installs keep serving the old copy.

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

### The data model

```
S = {
  version, settings, routines[], sessions[], active
}

settings = { unit, rest, autoRest, buzz, inc,
             doubleDefault, repLow, repHigh,
             bodyweight, deloadUntil, deloadSnooze, lastBackup }

routine  = { id, key, name, exercises[] }
  exercise (plan) = { id, name, sets, reps, repTop, inc, bw }

session  = { id, ts, endTs, routineId, key, name, note, bw, deload, exercises[] }
  exercise (logged) = { id, planId, name, targetReps, reps, repTop, inc, bw,
                        supplemental, why, kind, lastW, lastR, sets[] }
    set = { w, r, done, warm, pr, load, ts }
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
exercise) may still re-render — they're not in the between-sets hot path.

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

**Not verified — needs a real phone**

- The "can't tap anything" fix. The cause is understood and the mechanism is
  fixed, but it was never reproduced on desktop, so only Nick's Android can
  confirm it.
- `navigator.share({files})` — the backup share sheet. Desktop Chrome reports
  `canShare: false`, so that button was never exercised; the download fallback was.
- Install-to-home-screen and the standalone launch, since nothing is deployed yet.

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
