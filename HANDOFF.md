# Handoff — cloud sprint 8 Nov 2026

Branch `cloud/sprint-1108`, build **v26.13**, clean: last full run on v26.13
was 28 suites / 1,148 checks / 0 failures (`tools/sprint/runall.sh`). Nothing
is mid-change. `main` is **v26**; the branch fast-forwards onto it with no conflicts (checked 10 Nov). Details and every measurement:
[CLOUD_SPRINT.md](CLOUD_SPRINT.md); before/after and gym test plan: top of
[ROADMAP.md](ROADMAP.md).

## How long things actually took this sprint (basis for the ETAs)

Wall clock from launch to merged with both reviews done and their findings fixed:

| item | build | implement | review + fixes | total |
|---|---|---|---|---|
| near-miss jump (engine rule, sim + replay, t42) | v26.2 | 24 min | 14 min | **~38 min** |
| "Last … Edit" row + sticky Save (UI, t44) | v26.4 | 13 min | ~25 min (review queue) | **~39 min** |
| thumb sizing + a11y (CSS/attrs, journeys probe) | v26.3→v26.9 | 33 min | 17 min | **~50 min** |
| t43 invariants (tests only, mutants) | — | 14 min | merge 1 min | **~15 min** |
| editor keeps scroll (small JS + t45) | v26.5 | 4 min | 5 min (v26.7) | **~10 min** |
| Finish/+Set hit-slop, editor rows (CSS) | v26.10–11 | 8 min | 9 min | **~17 min** |
| an engine prototype measured and rejected | — | 4–6 min each | — | **~5 min** |

A fresh Opus review took 9–13 min; `/code-review high` 5–10 min. Every
`isolation: worktree` agent started on `main` (v21) and had to be rebased —
budget 2 min for that (PROJECT_STATE trap 20).

## Owner only

1. **Gym test v26.13** (one session). Plan at the top of ROADMAP.md: Plan
   tab shows v26.13; Progress → Consistency shows sessions a week; a "Hit 12, rep-out 11 — add 5 lb" jump lands inside the
   range; count mis-taps on − / + / set number; "Last … Edit" after
   finishing. Then export a backup.
2. **Merge `cloud/sprint-1108` → `main`** after that session (or before it,
   so the phone gets it — Pages serves `main`). This also ships v22–v26,
   which were never merged.
3. ~~Decisions~~ answered 10 Nov: **no auto-scroll**; sessions per week on
   Progress — built (v26.12–13); colours may change freely if readable —
   done (v26.12–13: text uses darker/lighter ink variants, 0 axe contrast
   failures in light and dark).

## P0 — before or right after the merge

**P0.1 Replay the new export after the gym session.**
- *What:* run `tools/review/replay.mjs` on the post-sprint export (outside
  the repo: `IRONLOG_EXPORT=… REVIEW_OUT=…`), and diff v26.1 against v26.11.
- *Why:* v26.2 changes when a lift steps up. Its only real-log evidence so far
  is 1 of 102 calls (trap 17c).
- *Done when:* every changed call is listed next to what was actually done
  next. Any near-miss jump that landed under `low` is investigated before the
  next engine change.
- *ETA:* ~15 min. The replay plus the agreement script took ~5 min in this
  sprint; allow 10 to read the calls.

## P1 — next engine and usability work

**P1.1 Decide whether heavy-lift under-loading is a problem.**
- *What:* Leg Press, RDL, Lat Pulldown and Ham Curl read "≥1 step under" in
  ~90–100% of simulated exposures. Light lifts read 0%.
- *Why:* it is the whole remaining gap in the headline metric. It is partly
  the metric's mid-range definition and partly double progression's
  one-rep-per-session climb. Two fixes were already measured and rejected
  (CLOUD_SPRINT wave 3).
- *Done when:* there is either a written decision that it is acceptable, or a
  rule that cuts `behind` by more than 2 paired se. The rule must leave
  over/unmeet/flips within 1 se, pass t43, and change the real-log replay only
  in defensible ways.
- *ETA:* decision only, 10 min. A new rule is ~40 min, like v26.2; add ~5 min
  per rejected prototype.

**P1.2 Coach stall rule latency (review #7).**
- *What:* `COACH_STALL_N=6` misses 89% of injected plateaus, with a median
  latency of 153 days.
- *Why:* the card exists to catch a plateau, and it almost never does.
- *Done when:* there is either an honest latency line on the card, or a
  time-aware minimum. Either way, t39b spam stays ≤ 12 cards/yr and the
  review's plateau-injection miss rate is ≤ 50%.
- *ETA:* text-only, ~10 min (like v26.6). Rule change ~45 min including
  t39b and review, comparable to v26.2.

**P1.3 Rep-out shadow vs classic disagreement on the card.**
- *What:* after 12,12,11 the card says "add 5 lb", and the shadow line below
  says "same weight".
- *Why:* two opposite instructions on one card, mid-workout.
- *Done when:* it is decided which wins (or the shadow line hides when it
  disagrees in this case), with t32 and t42 green and a 390×844 screenshot.
- *ETA:* ~20 min, comparable to the v26.4 review fixes plus a screenshot.

**P1.4 Remaining small touch targets.**
- *What:* still under 44 px:
  - outer steppers and warm toggle: 38 px wide effective at 390
  - "+ Note on this lift": 31 px tall
  - plate-editor ✕: 34×34
- *Why:* mis-taps mid-set. The warm toggle re-renders the view when hit.
- *Done when:* `journeys.mjs` reports active effective < 44 below 64, with 0
  overlaps and 0 stolen points. A dead strip must stay between value
  controls (trap 23). No overflow at 320.
- *ETA:* ~17 min, like v26.10–11. Widths at ≤390 px may not be solvable
  without a layout change; if so, write that down rather than force it.

## P2 — backlog

**P2.1 ~~Contrast on tinted chips~~ — done in v26.12–13.**
- *What:* accent, good and bad text on their `-soft` backgrounds, 2.6–3.4:1.
  There are 15 light-mode nodes.
- *Why:* readability in bright gyms.
- *Done when:* axe color-contrast is 0 on all tabs in light mode.
- *ETA:* ~15 min once the owner picks colours. Blocked on owner decision 3.

**P2.2 Unit conversion snapping (review #9).**
- *What:* 5 lb → 2.3 kg. It should snap to standard steps (2.5 kg).
- *Done when:* the review's props P3a/P3b pass (`tools/review/props.mjs` on
  the review branch) and t25 is green.
- *ETA:* ~20 min.

**P2.3 Trend back-off from 4 points (review #6).**
- *What:* measured at 4.8% closed-loop (t43-trend-flat), not 25%.
- *Done when:* only re-opened if real logs show a cut off a flat lift.
- *ETA:* ~5 min to re-measure.

**P2.4 Refactors flagged by code review (no behaviour change).**
- *What:*
  - a `sheet(html, onMount, {replace})` option, replacing the editor-only
    scroll keep
  - one `sessionSummary(s)` for set and volume counts, which currently live in
    3 places
  - a shared CSS variable for sheet padding, used by the sticky foot
- *Done when:* the full suite is green and journeys numbers are unchanged.
- *ETA:* ~25 min.

**P2.5 Slice 4 (sync and accounts)**, per ROADMAP. A project, not a session.
