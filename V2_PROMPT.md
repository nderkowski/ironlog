# Prompt: review Iron Log and plan version 2.0

Paste everything below the line into the model, with the repository attached
(or its URL: https://github.com/nderkowski/ironlog — public, branch `main`).
The answers in "What I want from 2.0" are the owner's; edit them before pasting
if they've changed.

---

You are reviewing **Iron Log**, a lifting logbook and training coach that I use
on my phone several times a week. I want you to plan **version 2.0**: a release
that changes what the product *is*, not v27 with more features. Think "the
second edition of the idea", designed with everything 26 versions taught us.

## Read first, in this order (treat every document as a claim to check against the code)
1. `PROJECT_STATE.md`: how it works and why. The **Traps** section is
   mandatory reading: each trap cost real time.
2. `ROADMAP.md`: the top section is the latest sprint (before/after numbers,
   rejected ideas, backlog). Also read "Explicitly not doing".
3. `PRODUCT.md`: the commercial question and the Phase 0 / Phase 1 plan.
4. `HANDOFF.md`, `CLOUD_SPRINT.md`, `RESEARCH.md`.
5. `index.html` (the whole app, ~7,600 lines). Read `prescribe()`,
   `shadowPrescribe()`, `trend()`, `deloadCheck()`, `coachRun()`, `normalize()`,
   and the data model.
6. The independent engine review on branch `review/independent`
   (`tools/review/REVIEW.md`).

## Facts you can rely on (measured, Nov 2026)
- **Real use.** 21 sessions in 15 weeks, which is **1.4 sessions a week**.
  Three gaps were 10 days or more. Each lift comes up about every 8.5 days. I
  change the prescribed load in ~37% of exposures.
- **Engine review finding.** The engine is within ~1 pp/yr of plain double
  progression. The biggest lever on my results is **training frequency**:
  1.4 → 2–3 sessions a week is worth about +8 pp of strength a year, more
  than any engine change.
- **The sprint.** It cut under-loaded prescriptions from 37% to 32% in a
  20-seed simulated year. The core loop is already minimal: start 1 tap, log a
  set 1 tap, finish 2.
- **Test coverage.** 28 Playwright suites, 1,148 checks, including a
  closed-loop simulated year and engine invariants.
- **A limit of the simulator.** `tools/test/yearsim.js` makes its lifter
  stronger on a fixed, time-based curve. So it **cannot** tell whether a
  different program design (split, frequency, volume) produces more strength,
  only whether the engine tracks that strength well. The review branch's
  `tools/review/sim.mjs` does respond to the program: stimulus is proximity ×
  intensity per set. That response is an assumed dose–response curve, not
  measured.

## What I want from 2.0 (owner's answers)
- **Audience.** Me first. It should be *ready* to hand to a few friends,
  but accounts, payments and app stores are **out** unless you argue they
  are necessary.
- **Hard constraints.** It must stay usable mid-set: logging a set stays
  one tap. It must work offline. No ads and no tracking. My data stays mine
  (export, plus the existing private GitHub-gist backup).
- **Soft constraints.** "One HTML file, vanilla JS, no build step, no
  dependencies" has served well. You may argue to change it, but show the
  cost and the migration.
- **Already decided.** No auto-scroll during a workout. UI colours can
  change freely as long as they stay readable.

## What to produce
1. **Verdict on 1.x, in 5 bullets at most.** What is genuinely good, what is
   holding it back, with evidence (file:line or a measured number).
2. **The 2.0 thesis in one sentence.** Then the 2–3 candidate directions you
   considered and why you rejected the others.
3. **Scope.**
   - **Must:** at most 5 items.
   - **Should:** at most 5 items.
   - **Won't:** say why for each.
   For every item give: the user problem, with evidence; the change; what it
   costs at the moment I'm holding a bar; and how we'll know it worked, as a
   number we can measure with the existing harness or the real log.
4. **Architecture and data.** What changes in the state schema (currently
   version 5), the migration through `normalize()`, what happens to the
   engine, coach and tests, and how 2.0 ships without losing a single logged
   set.
5. **Validation plan.** What must be built in the simulator or harness
   *before* the features, especially a lifter model that responds to the
   program, given the limit above. Also what I test in the gym, and for how
   many weeks.
6. **Milestones.**
   - Alphas behind a flag or in shadow mode, betas, then 2.0.
   - Give an ETA for each, calibrated to this project's real pace. From the
     sprint: an engine rule change with simulation and review took ~40 min,
     and a UI change with review took ~40–50 min. Calendar time in the gym
     is the real constraint, because a training block is 4–6 weeks.
   - State the gate for moving to the next stage.
7. **Risks, and what we keep from 1.x untouched.**
8. **Questions only I can answer, at most 5.** Put them at the end, not the
   start: plan with stated assumptions instead of stopping.

## Rules
- **No generic fitness-app features.** No social feed, exercise database,
  demo videos or food tracking, unless you can tie them to evidence in this
  log or code.
- **Respect earlier decisions.** Don't re-propose anything ROADMAP lists as
  measured and rejected without new evidence.
- **Be specific.** Name functions, files and numbers. If you're unsure,
  say so and say how to find out.
- **Disagree with me** where my constraints or assumptions are wrong. Say it
  plainly.
- **Length.** About 1,500–2,500 words, with tables where they help.
