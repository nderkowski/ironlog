# Handoff — 2.0 beta, 11 Nov 2026

Build **v2.0-b2** on branch `cloud/sprint-1108` (commit `fddfcdb` plus these
docs). Every 2.0 work package is in; nothing is mid-change. `main` does not have
it. How it works: [PROJECT_STATE.md](PROJECT_STATE.md) ("2.0 architecture",
"What 2.0 changed in the engine", traps 24–29). Before/after, the rollout and the
gym test plan: top of [ROADMAP.md](ROADMAP.md). Who built and reviewed what:
[LEDGER_V2.md](LEDGER_V2.md). Test it with `tools/sprint/runall.sh`
(see NEXT_SESSION.md).

## P0 — owner, before anything else

**P0.1 Roll out in order, then run the gym test plan.**
- *What:* v26.14 to `main` (branch `cloud/v26.14`, `c5b5a29`); open the app twice;
  confirm the Plan footer reads v26.14; then merge 2.0 and open twice again
  (footer shows the 2.0 build, Settings offers "Restore pre-2.0 data"). Run the 15
  checks in ROADMAP.md over one or two sessions, finish at least one rotation of
  real training if you can, and export a backup.
- *Why:* the split must never land on a phone whose worker is still v26.13's
  (trap 25), and the engine, cascade, warm-ups, balance card and blocks have only
  ever been driven by simulated lifters, synthetic logs and one real export
  (migration check, aggregates only).
- *Done when:* every check is marked pass, or the failures are written down with
  what you saw on screen.

**P0.2 Replay the new export.**
- *What:* `tools/review/replay.mjs` on the post-2.0 export (outside the repo:
  `IRONLOG_EXPORT=… REVIEW_OUT=…`), against a v26.13 run for comparison
  (`REVIEW_INDEX=<v26.13 index.html> REPLAY_NAME=replay-old`), then
  `replay-diff.mjs`.
- *Why:* the engine's real-log evidence is 3 changed calls of 102 (all hold → reps,
  two on RDL as a top set). A real week of top-set and back-off logging is new.
- *Done when:* every changed call is listed next to what you actually did next.
  Any prescription that landed under the bottom of its range, or any top-set call
  that disagrees with what you did, is understood before the next engine change.

## P1 — what the acceptance review leaves open

See acceptance review. (Placeholder: the independent end-to-end review on real data,
ledger #9, was still out when these docs were written. Copy its open findings here,
each with *what / why / done when*.)

## P2 — backlog

1. Gemini cross-review of the plan and engine — waiting for the owner's Google key
   (ledger, "Channels").
2. Heavy-lift under-loading: Leg Press, RDL, Lat Pulldown, Ham Curl read "≥1 step
   under" in ~90–100% of simulated exposures (yearbase "behind" is 31.3%
   overall). Decide if it is a problem before engineering a rule; two fixes were
   already measured and rejected (ROADMAP, "Measured and rejected").
3. The simulator's `hold8` (112 vs limit 109) and `spiral` (98 vs 97) sit just over
   their limits — the accepted cost of removing the trend cut (0.2% of
   lift-years). Revisit only if the real log shows a lift holding for weeks.
4. Controls still under 44 px effective width: outer steppers and warm toggle at
   390 px, "+ Note on this lift", the Keep revert, the plate-editor ✕.
5. Unit conversion snapping 5 lb ↔ 2.5 kg (v26 review #9).
6. Slice 4 — sync and accounts (ROADMAP, below), starting at the cheapest rung.
7. `tools/build-artifact.ps1` does not work after the split; it is historical.
   Delete it or leave it marked.
