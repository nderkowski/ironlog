# Iron Log 2.0 — build ledger

The commander (main session) plans, routes and reviews. Workers build. The
scope is in [V2_PLAN.md](V2_PLAN.md). Branch `cloud/sprint-1108`; `main` is
updated only after the owner's phone check at each milestone.

**Channels this session:**
- Claude (Haiku, Sonnet, Opus) via subagents.
- **DeepSeek** (`deepseek-v4-pro`, `deepseek-v4.1-flash`) via the owner's
  OpenCode Go key: `tools/fleet/deepseek.py`, with the key injected by the
  proxy. **Owner's rule: DeepSeek only on that key**, no other models from its
  catalog.
- Gemini (Flash, Argon) waits for the owner's Google key.
- Cross-family review for now is DeepSeek V4 Pro, plus a blind Opus
  reviewer.

| # | Wave | Task | Model / channel | Status | Result (1 line) | Artifact |
|---|---|---|---|---|---|---|
| 1 | 1 | M5 file split: ordered classic scripts, file list, atomic SW, byte-identical join test, offline-update test, test/tool plumbing | sonnet (high) / worktree | done → in review | 12 files, 470 names 0 collisions, join proof (2 declared deviations), all suites + yearbase + journeys identical | branch worktree-agent-aa26dd38741608bec @ c5ec721 |
| 2 | 1 | Engine + blocks/rotation spec for waves 3–4 (read-only design) | opus / Plan | done | 5 work packages A→B→C→E→D; 6 risks, ruled on | V2_SPEC.md |
| 2R | 1 | Adversarial review of the spec | deepseek-v4-pro (cross-family) | done | 15 findings (2 blockers), all accepted as amendments | V2_SPEC.md (end) |
| 3 | 1R | Review of #1 (no-loss guards, SW, globals collisions) | opus (blind, real v26.13→a1 upgrade walk) + deepseek-v4-pro | done | Both: first upgrade can brick offline on a partial deploy (Opus reproduced: empty Plan, PLANVAR error); HTML/JS version skew; dropped reload; early-listener race; t43 mutants broken | scratch ds-review-a1.md |
| 3F | 1 | a1 fixes: v26.14 single-file bridge with the new worker, then the split on top; cache-first navigation; updates apply only on open; boot integrity gate; real upgrade tests | sonnet (high) / worktree | out | — | — |
| 4 | 2 | Schema v6 migration scaffold + v5 snapshot + restore button | sonnet (high) / worktree on the a1 branch | out (started in parallel with #3) | — | — |
| 5 | 3 | M1 engine: schemes double/topback, no trend cut, stack weights, sim gates | sonnet (high) | queued (after #2, #4) | — | — |
| 6 | 3 | M2 friction: set-1 cascade, usual-load chip, off-book day, ease-back | sonnet | queued (after #4) | — | — |
| 7 | 3 | M3 muscles: delt heads, abs target, excluded calves, balance card, rotation volume | sonnet | queued (after #4) | — | — |
| 8 | 4 | M4 blocks + scorecard; S2 pump day; S1 plan additions; S3 warm-ups; S4 polish | sonnet ×2 | queued | — | — |
| 9 | 5 | Full review pass, sim + replay + journeys, beta merge | opus + external reviewers | queued | — | — |
