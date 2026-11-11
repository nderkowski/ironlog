# Prompt: review Iron Log and plan version 2.0

How to use: upload `ironlog-v2-context.zip` (or its files) to the model, then
paste everything below the line. The package is described in its `README.md`.
It deliberately leaves out our own 2.0 plan (`V2_PLAN.md`) so this review is
independent. Compare the two afterwards.

---

You are an experienced software engineer and strength coach. You're reviewing
**Iron Log**, a lifting logbook and training coach that one person (me) uses
on my phone 3–4 times a week. I want you to plan **version 2.0**: a release
that changes what the app is, not v27 with more features. Think "the second
edition of the idea", designed with everything 26 versions taught.

## The attached files (read in this order; treat every document as a claim to check against the code)
1. `README.md` (the package guide) and `FACTS.md` (measured numbers from my
   real log, as aggregates only).
2. `PROJECT_STATE.md`: how the app works and why. The **Traps** section is
   mandatory: each trap cost real time to learn.
3. `ROADMAP.md`: the top section is the latest sprint (before/after numbers,
   ideas measured and rejected, backlog). Also read "Explicitly not doing".
4. `HANDOFF.md`, `CLOUD_SPRINT.md`, `RESEARCH.md`, `PRODUCT.md`.
5. `review/REVIEW.md`: an independent review of the training engine. Some of
   its headline findings rest on gaps in my log; see `FACTS.md`.
6. `app/index.html`: the whole app, ~7,600 lines of vanilla JS. Read at
   least `prescribe()`, `shadowPrescribe()`, `trend()`, `deloadCheck()`,
   `coachRun()`, `normalize()`, `nextRoutine()`, `weeklySetsCard()`, and the
   data model.
7. `tests/`: the test list and the simulated-year harness.

## What I want from 2.0 (my answers; these override anything in the docs)
- **Who it's for:** just me. No accounts, payments, app stores or sharing.
- **Training:** 3–4 sessions a week, 60–90 min each, a three-day split
  (A/B/C). I own a cable stack and a leg extension.
- **Goal:** even size across all muscles, with no imbalances.
  - **Calves are excluded on purpose:** they're big enough and they cramp.
  - **Abs:** yes, but I've never found an ab exercise I like.
- **Joints:**
  - My lower back and shoulders get tweaked most.
  - Heavy squats have hurt my hip and made my knees sore.
  - I am **not** interested in barbell bench, squat or deadlift.
  - I don't want a "pain" button.
- **The log has gaps:** 5 of 16 weeks are empty. They're a mix of breaks and
  sessions I didn't log, and I can't say which is which.
- **Hard constraints:**
  - Logging a set stays one tap.
  - Works offline.
  - No ads, no tracking.
  - My data stays mine: export, plus the private GitHub-gist backup.
- **Code:** I'm OK splitting the single file into native modules (no build
  step, no dependencies), **only if nothing can get lost**: the offline cache,
  every function, every behaviour. Say how you'd guarantee that.
- **Already decided:** no auto-scroll during a workout. UI colours can change
  freely if they stay readable.

## What to produce
1. **Verdict on 1.x in at most 5 bullets,** with evidence: file and function,
   or a measured number.
2. **The 2.0 thesis in one sentence,** plus the 2–3 directions you rejected
   and why.
3. **Scope:**
   - **Must:** at most 5 items.
   - **Should:** at most 5 items.
   - **Won't:** a reason for each.
   For every item: the problem with evidence, the change, its cost while I'm
   holding a bar, and how we'll know it worked, as a number measurable with
   the existing harness or my log.
4. **Training design.** How 2.0 should plan weekly volume per muscle for
   balanced size, given my joints and equipment. Include specific exercise
   choices for any muscle that's under-served, and **2–3 ab exercises worth
   trying** that are kind to the lower back and shoulders. Label what's
   evidence and what's convention.
5. **Architecture and data:**
   - the schema change from version 5
   - the migration through `normalize()`
   - the module split, with its no-loss guarantees
   - how 2.0 ships without losing a single logged set
6. **Validation:**
   - what to build in the simulator or harness *before* the features (note
     that `yearsim.js` grows its lifter on a fixed time curve, so it can't
     judge program design)
   - what I test in the gym, and for how long
7. **Milestones** (alpha behind a flag or in shadow, then beta, then 2.0),
   with an ETA for each and a gate to move on. Calibrate to this project's real
   pace: in the last sprint an engine rule change with simulation and review
   took ~40 min, and a UI change with review ~40–50 min. A training block is
   4–6 weeks of calendar time.
8. **Risks, and what to keep from 1.x untouched.**
9. **At most 5 questions only I can answer,** at the end. Plan on stated
   assumptions rather than stopping.

## Rules
- **No generic fitness-app features.** No social feed, exercise database,
  demo videos or food tracking.
- **Respect earlier decisions.** Don't re-propose anything ROADMAP lists as
  measured and rejected without new evidence.
- **Be specific.** Name files, functions and numbers. If you're unsure, say
  so and how to find out.
- **Disagree with me** where my constraints or assumptions are wrong. Say it
  plainly.
- **Length:** about 1,500–2,500 words, with tables where they help.
