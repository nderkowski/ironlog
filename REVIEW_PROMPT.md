# Prompt for a Fable 5 review pass

This asks for a **plan, not a patch**. The output is a document that a later
Opus 5 session implements from. Copy everything below the line into a new chat
with Fable 5.

---

I want a full review of Iron Log, a single-file lifting logbook PWA at
`nderkowski/ironlog`, live at https://nderkowski.github.io/ironlog/. I train
with it several times a week, so it is real software with one real user — me —
and a bug in it costs me a session, not a support ticket.

**Your job is to produce a plan. Do not change any code.** No fixes, no
refactors, no "while I was in there". If you find something broken, write it up
with enough evidence that someone else can fix it without rediscovering it. The
one thing you may write is the plan document itself.

## Read these first, in this order

1. `PROJECT_STATE.md` — how the app works and why. **The Traps section is the
   most valuable thing in the repo**; every entry cost real time to learn.
   Read it even for parts of the app you think you understand.
2. `ROADMAP.md` — what has shipped, what was deliberately rejected and why, and
   the "Known weaknesses in the maths" section, which is where I would start.
3. `PRODUCT.md` — only if you end up with a commercial recommendation.

Note that two entries in those documents have already been found wrong by
measurement (the Epley note, and the trap-13 count of duplicated constructors).
**Treat the docs as a well-informed colleague's notes, not as ground truth.**
If you think something in them is wrong, check it and say so — that is one of
the more useful things you can do here.

## How the project works

- One HTML file. Vanilla JS, no framework, no build step, no dependencies, no
  network calls. `index.html` is the whole app.
- GitHub Pages serves `main`. Work on a branch is invisible to my phone.
  `BUILD` prints at the foot of the Plan tab; it is bumped with `CACHE` in
  `sw.js` in the same commit as any change.
- **Test by driving the real UI with Playwright, not by calling functions.**
  Chromium is at `/opt/pw-browsers`, Playwright at
  `/opt/node22/lib/node_modules/playwright`. Serve with
  `npx http-server -p 8117 -s -c-1 .` and use a 390×844 mobile context. There
  are 287 assertions across eight suites in `tools/test/` (`t20`–`t27`) sharing
  `tools/test/harness.mjs` — run them, read them, and use the harness for
  anything you want to check. Nearly every real bug in this codebase was
  invisible to function-level tests and obvious the moment a real click drove
  it.
- Data lives in `localStorage` under `ironlog.v1`. There is no server, no
  account, and that is a settled decision rather than a gap.

## The constraint everything is judged against

**Logging a set must take one tap.** Anything that adds a decision to the
between-sets moment is wrong unless it removes two decisions elsewhere.

A related rule, learned the hard way from a bug that hid for weeks: an option is
acceptable only if it is **set once**, has a **sane default so it never needs
setting**, *and* its **current state is visible at the point where its effect
lands**. A setting that silently changes behaviour somewhere you cannot see it
is a future bug report. Apply that test to anything you propose.

## Priorities, which I want kept

The roadmap's ordering rule stands and your plan should preserve it:

1. **Things that corrupt data or break trust.** Wrong numbers, silent state
   changes, anything that makes me distrust what the app tells me about my own
   training.
2. **Things I hit every session.** Friction in the gym, on a phone, one-handed,
   between sets.
3. **Things that would only ever show up as a feature request.**

## What I want from you

Four things, in one document.

### 1. What is broken now

Everything you can demonstrate is wrong. For each one:

- what the user-visible symptom is, in a sentence
- the cause, located in the code
- **how you verified it** — a Playwright run, a simulation, a measurement.
  Reproduce it; don't infer it. If you suspect something but cannot reproduce
  it, say exactly that and put it in a separate "suspected, unverified" list
  rather than mixing it in.
- severity against the priority order above
- the fix you would make, at enough detail that implementing it is mechanical

Please look hard at the seams as well as the features: the state migration
path, import of old backup files, what happens with an empty log, a huge log,
a lift renamed twice, an exercise that exists in two week variants, a session
edited after the fact. Several past bugs lived there.

### 2. The progression engine, examined properly

This is the part I care most about and the part I most want challenged. The
engine is in `prescribe()`, `trend()`, `trendLong()`, `deloadCheck()`,
`setScore()`, `e1rm()` and `defaultRange()`. It was materially changed in v16
after simulation showed it could tell a lifter who had never missed a rep that
they were declining — read that section of `PROJECT_STATE.md` before forming a
view, and then **check the new version the same way**: simulate flawless runs,
stalls, real declines, missed reps, wide and narrow rep ranges, bodyweight and
assisted lifts, timed work.

Specific things I want an opinion on, with reasoning:

- Are the thresholds defensible? `±1.5% / −2%` for the trend, `≤ 0` on a long
  horizon for the deload check, RPE `9.5` to hold the weight, `60% / 40%` of
  lifts stalled to suggest a deload, `½` a set of credit to a helper muscle.
  Several are documented as "a defensible guess, not a derived number". Say
  which ones are fine as conventions, which should be derived, and from what.
- Is double progression the right default at all, and is the three-tier rep
  range (heavy 5–8, compound 8–12, isolation 12–16, timed 30–60s) sensible?
- **Proximity to failure is the main hypertrophy driver and the app barely
  models it.** RPE exists but is optional and off by default, because asking
  for a rating every set breaks the one-tap rule. The idea already on the table
  is to *infer* effort from rep drop-off across sets within a session — 12/12/12
  is far from failure, 12/10/8 is close — since that data is already recorded
  and costs no taps. Evaluate that idea properly: is the signal real, how noisy
  is it, what should it drive, and how should it be shown? I have already
  decided it must be **visible on the card as a reason** if built, not a silent
  input. If you think it is a bad idea, say so and say why.
- What else could the app infer from data it already has, rather than asking
  for? Session duration, rest actually taken, set-to-set load changes, warm-up
  patterns, day of week, time since last session for that muscle.
- Is there anything in the maths that is simply wrong, as opposed to coarse?

Where you make an empirical claim, back it with a number you generated. The
Epley note in the roadmap was accepted wisdom for months and was wrong; a
five-minute table settled it.

### 3. A feature roadmap

Sliced so each slice leaves the app fully usable, ordered by the priorities
above rather than by what is interesting to build. For each item:

- what it is and why it earns its place
- **its cost in decisions**, measured against the one-tap rule — this is the
  test that kills most ideas here, so apply it honestly
- rough size, and whether it touches the data model (those need a migration and
  a design conversation before any code)
- what it would break or complicate

Ideas already floated and not yet built, which you should evaluate rather than
assume: an auto-generated warm-up ramp from today's working weight; bodyweight
history (currently a single settings value with no history, which bodyweight
and assisted lifts depend on); recording the rest actually taken (the timer
already runs, so storing it is free); swapping an exercise while keeping its
history joined; per-exercise cues on the card; percentage-based programme
templates such as 5/3/1 or GZCLP; CSV or Health export.

Feel free to propose things nobody has thought of. Also feel free to argue that
something on that list should never be built.

**Explicitly not wanted**, so don't spend the roadmap on them: social features,
streaks or gamification, AI form checking, video, ads, and accounts or a
backend unless you can make a specific argument that multi-device sync has
become a real need rather than a nice-to-have.

### 4. What you would delete

Genuinely — what is carrying its weight and what isn't. A one-file app with one
user can afford to remove things, and I would rather cut a half-used feature
than maintain it. Include anything in the codebase, the docs, or the tests.

## Style

Be blunt. If a decision in `PROJECT_STATE.md` is wrong, say it is wrong and say
why. If something I have asked for in the roadmap is a bad idea, say that
instead of designing it politely. If you cannot reproduce something the docs
claim, report that you could not rather than repeating the claim. I would much
rather read "I checked this and the doc is wrong" than a plan that agrees with
everything.

Write the result to `REVIEW.md` in the repo, and commit it on a branch. That
file is the whole deliverable — no other file should change.
