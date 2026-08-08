# Prompt: deliver the fixes and roadmap in REVIEW.md

Copy everything below the line into a new session.

---

You are picking up Iron Log, a single-file lifting logbook PWA at
`nderkowski/ironlog`, live at https://nderkowski.github.io/ironlog/. It has
one real user who trains with it several times a week — a bug costs him a
session, not a support ticket. An external audit has just been completed and
your job is to deliver its findings.

**Read these first, in this order, before writing any code:**

1. `PROJECT_STATE.md` — how the app works and why. The **Traps** section is
   mandatory reading; every entry cost real time to learn.
2. `REVIEW.md` — the audit. This is your work order. It contains four parts:
   verified defects with causes, evidence and fix designs (§1); an engine
   analysis (§2); a sliced roadmap (§3); and a delete list (§4).
3. `ROADMAP.md` — the project's history and its ordering rule, which stands:
   data/trust bugs first, per-session friction second, feature requests last.

**Treat REVIEW.md the way it treated the other docs: as claims to verify,
not as ground truth.** Before fixing anything in §1, reproduce it first —
every finding states its seed shape and the exact observed output, so
reproduction should take minutes. If you cannot reproduce a finding, stop and
say so rather than fixing blind. If you find the review is *wrong* somewhere,
that is a valuable result: correct it in REVIEW.md in the same commit as the
evidence.

## How this project works — do not rediscover this

- One HTML file. Vanilla JS, no framework, no build step, no dependencies.
  `index.html` is the whole app.
- GitHub Pages serves `main`; work on a branch is invisible to the phone.
  After editing `index.html`, **bump `BUILD` and `CACHE` in `sw.js` in the
  same commit**, or the phone serves a stale cached version.
- **Test by driving the real UI with Playwright, never by calling functions.**
  Chromium is at `/opt/pw-browsers`, Playwright at
  `/opt/node22/lib/node_modules/playwright`. Serve with
  `npx http-server -p 8117 -s -c-1 .`, use a 390×844 mobile context. The
  suites are `tools/test/t20–t27` (287 assertions) sharing
  `tools/test/harness.mjs`. **Run all of them before you change anything,
  after every fix, and add assertions for everything you touch.**
- For engine work at simulation scale, the review's method works well: copy
  `index.html` to a scratch directory, inject a `window.__E = {trend, prescribe,
  …}` export before the closing `})();`, serve it on a second port, and drive
  the real functions via `page.evaluate`. Never commit the instrumented copy.
- The two design laws, judged on every change: **logging a set must take one
  tap**, and **an option is acceptable only if it is set once, has a sane
  default, and its current state is visible where its effect lands.**
- Ask before merging to `main`.

## The work, in order

### 1. Slice A — restore trust (REVIEW §3, items 1–6). Do this first, completely, before anything else.

Work through it in the review's order. Notes beyond what's written there:

- **Item 1, the back-off spiral (§1.1), is the reason this session exists.**
  Build the `t28` closed-loop suite *before* the fix and watch it fail on the
  current engine: loop *prescribe → simulate a fatigued-but-progressing
  lifter (last set 1–2 reps behind the first) → log → repeat* for 40+
  sessions, and assert the prescribed weight never falls more than one cut
  below its peak. §1.1 gives the exact scenarios (steady gainer, one sick
  day, genuine decline) and the numbers the fixed engine should produce —
  one cut, full recovery for the false positives; one cut, held near the
  true 8RM for the genuine decline. Then apply the two-part fix
  (window-length guard lookback + rep-climb under hold) and re-run the loop.
  The genuine-decline case must still cut — a fix that never cuts has
  overshot.
- **Item 2 (rename-merge, §1.2)**: while in there, consider landing roadmap
  item 12 (merge-or-not as an explicit choice) in the same change — the
  review argues they are the same ~30 lines. Your call; the guard +
  `recomputePRs()` + undo are the mandatory part.
- **Items 3–6** are mechanical from their write-ups. For every one:
  reproduce first, fix, then convert the reproduction into a permanent
  assertion in the closest-matching suite.
- Finish the slice by making the five doc corrections in §1.11, and add the
  closed-loop lesson to the Traps section (the review suggests the wording:
  *prescriptions are inputs to the next session — simulate the loop, not
  just the signal*).

### 2. Slice B — gym floor (REVIEW §3, items 7–10)

Only after Slice A is merged and green. Item 10 (the drop-off hold rule) is
**gated on a measurement that needs Nick's real export** — the fraction of
logged working sets whose reps differ from the session's prescription
(REVIEW §2.4). Ask him for an export and run that measurement before writing
any of item 10; if the edit rate is low, report that and skip the feature, as
the review specifies.

### 3. Slice C and the delete list — ask first

Slice C items all touch the data model; each says "design conversation
first", and that conversation is with Nick, not with yourself. Likewise the
§4 delete list: the artifact build and the NEXT_SESSION.md trim are safe to
propose in a PR; the distance-metric deletion is conditional on his real
data; the others are judgement calls he should sign off. Present, don't
presume.

## Ways of working

- Small commits, one finding per commit where practical, each with its test.
- Reproduce → fix → assert → run all suites → bump BUILD/CACHE. Every time.
- If a test result surprises you, dig into why before moving on — that habit
  has caught several real bugs here.
- Tell Nick plainly when something he's asked for is a bad idea. Don't claim
  anything works until you have watched it work through the UI.
- When the session ends, update `PROJECT_STATE.md` and `ROADMAP.md` to
  reflect what actually shipped, and mark the delivered findings in
  `REVIEW.md` (✅ *fixed in vNN* strikethrough style, matching how
  ROADMAP.md records history) so the next session doesn't re-litigate them.

Start by running the eight suites to confirm the baseline is green, then
reproduce §1.1.
