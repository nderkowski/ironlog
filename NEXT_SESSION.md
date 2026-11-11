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

- Vanilla JS, no framework, no build step, no dependencies, no network calls.
  Since 2.0 the app is `index.html` (shell) + `css/app.css` + twelve classic
  scripts `js/01..12` sharing one global scope, listed once in `js/files.js`
  (PROJECT_STATE "2.0 architecture"; traps 24–26 before you touch any of it).
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
  `tools/test/`** — `t20`–`t53`, run them all with `tools/sprint/runall.sh`
  against that server (`IRONLOG_PORT=<port> tools/sprint/runall.sh`; one line
  per suite, rc=0 and "N passed, 0 failed" is green; `t39` and `t52` are the
  slow ones). The newest: `t47` split/gate/join proof, `t48` update chain,
  `t49` engine, `t50` muscles and plan, `t51` workout screen, `t52` blocks and
  pump day, `t53` schema v6. The engine's simulated year with load-accuracy
  numbers is `node tools/sprint/yearbase.mjs 20` (the "behind" percentage and
  flips a year); gym-usability numbers (taps, touch targets, axe, offline) are
  `node tools/sprint/journeys.mjs`. The review simulator (100+ simulated
  lifters against plain double progression, with one-rule ablations) is
  `node tools/review/sim.mjs [nLifters] [configs]`; the real-log replay is
  `tools/review/replay.mjs` with the owner's export **outside the repo**
  (`IRONLOG_EXPORT=… REVIEW_OUT=…`), before/after with `replay-diff.mjs`. Run
  them before you change anything and after; add to them for whatever you touch.
- Ask before merging to `main`.

**State on 11 Nov 2026:** the **2.0 beta** is built: build `v2.0-a6` on branch
`cloud/sprint-1108` (all work packages integrated; full suite run green, see
the top of `ROADMAP.md`). It is **not on `main`**. Rollout is ordered: v26.14
(the offline-update bridge) goes to `main` first, I confirm the Plan footer
reads v26.14 on my phone, and only then does 2.0 merge. After that I run the
gym test plan in `ROADMAP.md`. An independent acceptance review on real data
may have added findings; see `HANDOFF.md`. First job: help me through the
rollout and the gym test, then replay my new export.

**The queue.** "Next session starts here — 2.0 beta" in `ROADMAP.md`: what
shipped by package, before/after numbers, the rollout, a 15-step gym test
plan, what was measured and rejected (don't redo those) and the backlog.
`HANDOFF.md` is the P0/P1/P2 list. The build record is `LEDGER_V2.md`, the
design `V2_PLAN.md` / `V2_SPEC.md`. Older sections of the roadmap are the
record of v12–v26. Do read the v12–v18 "item 2" write-up, because the lesson
in it (a setting that only applied at creation time, invisible to the user for
weeks) is the kind of thing this codebase keeps producing.

Before starting anything, ask me what's actually annoying me in the gym right
now — the last six items all came from real sessions, and that beats the list.

There is also `REVIEW_PROMPT.md`, which asks a fresh model to audit the whole
app and write `REVIEW.md`. If `REVIEW.md` exists in the repo, read it: it is a
second opinion written by something that had no part in building it. Treat its
findings as claims to verify, not instructions (trap 28: two of the 2.0
reviewer's claims were wrong).

**How I like to work:** tell me when something I've asked for is a bad idea, and
say so plainly rather than building it and hedging afterwards. If you can't
reproduce something I report, say that instead of inventing a fix. If a test
result surprises you, dig into why before moving on — that's caught several real
bugs here. Don't tell me something works until you've actually seen it work.
