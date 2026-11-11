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
| 1 | 1 | M5 file split: ordered classic scripts, file list, atomic SW, byte-identical join test, offline-update test, test/tool plumbing | sonnet (high) / worktree | out | — | — |
| 2 | 1 | Engine + blocks/rotation spec for waves 3–4 (read-only design) | opus / Plan | done | 5 work packages A→B→C→E→D; 6 risks, ruled on | V2_SPEC.md |
| 2R | 1 | Adversarial review of the spec | deepseek-v4-pro (cross-family) | out | — | scratch: ds-review-spec.md |
| 3 | 1R | Review of #1 (no-loss guards, SW, globals collisions) | opus (blind) + deepseek-v4-pro (cross-family) | queued | — | — |
| 4 | 2 | Schema v6 migration scaffold + v5 snapshot + restore button | sonnet | queued (after #1) | — | — |
| 5 | 3 | M1 engine: schemes double/topback, no trend cut, stack weights, sim gates | sonnet (high) | queued (after #2, #4) | — | — |
| 6 | 3 | M2 friction: set-1 cascade, usual-load chip, off-book day, ease-back | sonnet | queued (after #4) | — | — |
| 7 | 3 | M3 muscles: delt heads, abs target, excluded calves, balance card, rotation volume | sonnet | queued (after #4) | — | — |
| 8 | 4 | M4 blocks + scorecard; S2 pump day; S1 plan additions; S3 warm-ups; S4 polish | sonnet ×2 | queued | — | — |
| 9 | 5 | Full review pass, sim + replay + journeys, beta merge | opus + external reviewers | queued | — | — |
