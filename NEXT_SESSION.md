# Prompt for the next session

Copy everything below the line into a new chat.

---

I'm continuing work on Iron Log, a single-file lifting logbook PWA at
`nderkowski/ironlog`. It's live at https://nderkowski.github.io/ironlog/ and I
use it in the gym several times a week, so it's real software with a real user,
not a toy.

**Read these first, in this order, before writing any code:**

1. `PROJECT_STATE.md` — how it works and why. The **Traps** section is the
   important part; every entry cost real time to learn. Read it even if the task
   looks unrelated.
2. `ROADMAP.md` — the **"Next session starts here"** section at the top is your
   work queue.
3. `PRODUCT.md` — only if the question is commercial rather than technical.

**How this project works, so you don't have to rediscover it:**

- One HTML file, vanilla JS, no framework, no build step, no dependencies, no
  network calls. `index.html` is the whole app.
- GitHub Pages serves `main`. Work on a branch is invisible to my phone until
  it's merged — a whole test round was lost to that once. `BUILD` prints at the
  foot of the Plan tab; bump it and `BUILD` in `sw.js` in the same commit as any
  change, or my installed phone serves a cached old version.
- **Test by driving the real UI with Playwright, not by calling functions.**
  Chromium is at `/opt/pw-browsers`, Playwright at
  `/opt/node22/lib/node_modules/playwright`. Serve with
  `npx http-server -p 8117 -s -c-1 .` and use a 390×844 mobile context
  (another tree already on 8117? serve on your own port and set
  `IRONLOG_PORT`, or the tests pass against the wrong build — trap 21). Most of
  the genuine bugs in this codebase were invisible to function-level tests and
  obvious the moment a real click drove them. **The suites live in
  `tools/test/`** — `t20`–`t45`, run them all with `tools/sprint/runall.sh`
  against that server. The engine's simulated year with load-accuracy
  numbers is `node tools/sprint/yearbase.mjs 20`; gym-usability numbers
  (taps, touch targets, axe, offline) are `node tools/sprint/journeys.mjs`. Run them before you change
  anything and after; add to them for whatever you touch.
- Ask before merging to `main`.

**State on 8 Nov 2026:** `main` is v21. The cloud sprint left v26.11 on
branch `cloud/sprint-1108` (unmerged, reviewed, all suites green) — see the
top of `ROADMAP.md` and `CLOUD_SPRINT.md`. First job: help me check it on the
phone and merge it.

**The queue.** "Next session starts here" in `ROADMAP.md` is the 8 Nov
sprint: what shipped, what was measured and rejected (don't redo those), a
backlog in order, and a gym test plan. Older sections below it are the record
of v12–v25. Do read the v12–v18 "item 2" write-up, because the lesson in it
(a setting that only applied at creation time, invisible to the user for weeks)
is the kind of thing this codebase keeps producing.

The live backlog is **Slice 4 — sync and accounts**, and the roadmap argues for
starting at the cheapest rung. There's also a "Known weaknesses in the maths"
section; nothing there is urgent, but the Epley-above-10-reps one now matters
more than it did, because isolation lifts default to a 12–16 range as of v13.

Before starting anything, ask me what's actually annoying me in the gym right
now — the last six items all came from real sessions, and that beats the list.

There is also `REVIEW_PROMPT.md`, which asks a fresh model to audit the whole
app and write `REVIEW.md` — a plan of what to fix and what to build next. If
`REVIEW.md` exists in the repo, read it: it is a second opinion on this
codebase written by something that had no part in building it, so it is worth
more than its length suggests. Treat its findings as claims to verify, not
instructions — the same way it was told to treat these documents.

**How I like to work:** tell me when something I've asked for is a bad idea, and
say so plainly rather than building it and hedging afterwards. If you can't
reproduce something I report, say that instead of inventing a fix. If a test
result surprises you, dig into why before moving on — that's caught several real
bugs here. Don't tell me something works until you've actually seen it work.
