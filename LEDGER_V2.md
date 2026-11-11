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
| 3F | 1 | a1 fixes: v26.14 single-file bridge with the new worker, then the split on top; cache-first navigation; updates apply only on open; boot integrity gate; real upgrade tests | sonnet (high) / worktree | done → in review | v26.14 = v26.13 + updater; split rebuilt on it with integrity gate; t47 226/0 (real v26.13→v26.14→split paths, partial deploys, skew, no mid-workout reload, duplicate-name guard); flake fixed (15/15) | cloud/v26.14 @ 61ecf6d; cloud/2.0-a1 @ d3d852a (tag 2.0-a1) |
| 3R2 | 1 | Re-review updater + full suites on v26.14 | deepseek-v4-pro + runall | done (pre-fix v26.14: 29 suites, 1,218 checks, 0 failed) | 2 blockers (external gate can be missing; foreground reload loses an open sheet/draft), 2 major (DONE marker trusted; bfcache), 1 minor → fixes out to the updater worker | scratch ds-review-2614.md |
| 3F2 | 1 | Updater re-review fixes (inline gate, no update while busy, cache check, pageshow) | sonnet (same worker) | done | v26.14 t48 85; split t47 251, t48 85; both full runall green | cloud/v26.14 @ c5b5a29; cloud/2.0-a1 @ 424a562 (tag moved) |
| I1 | 3 | Integrate A+B+E onto the rebuilt split | sonnet (high) | done, rebased (34 suites green) | 33 suites 0 failed (t47 226, t49 128, t50 148, t53 107); yearbase 31.3%; journeys clean; sim +0.057; replay 3/102 as before. RDL top+back-off suggestion now live | worktree-agent-a6e7f897422538886 @ 70dfad2 (local) |
| 4 | 2 | Schema v6 migration scaffold + v5 snapshot + restore button | sonnet (high) / worktree on the a1 branch | done → in review | t48 103/103; 3 assertions re-pointed (delts→head, v5→v6), accepted | worktree-agent-a39952b1dade06539 @ ed223a0 |
| 4R | 2 | Review A: code (DeepSeek) + real-export migration check (local, aggregates only) | deepseek-v4-pro + sonnet | done | Real export: 8/8 pass (306 sets, 0 changed; credit identical; 0 prescription diffs). DeepSeek: 3 accepted (mixed-tag dup, reverse-curl fallback, block NaN), 1 rejected (settings.v2 — ruled out) | — |
| 4F | 2 | A review fixes | haiku (exact spec) | done | t48 107/107, t21 43/43, t24 68/68 | worktree-agent-a39952b1dade06539 @ 28439f2 |
| 5 | 3 | Package B engine: double/topback, no trend cut, stack weights, presc, sim + replay gates | sonnet (high) / worktree on A | done → in review | vs DP: base +0.057±0.018, stated +0.093±0.021 (v26.13: −0.060/−0.143). hold8 112/spiral 98 vs limits 109/97 — accepted (=cost of the trend-cut removal, 0.2% of lift-years). yearbase behind 31.3%, flips 14.75→11.45. Replay: 3/102 changed, all hold→reps (2 RDL topback). t49 106/0, t43 55/0, 7 mutants caught | worktree-agent-aedd6e3d99467f9ff @ 9480c24 |
| 5R | 3 | Review B code | deepseek-v4-pro | done | 2 blockers (straight-set rows never step back; topback→double reads back-offs as working sets), 1 major (pin back-off below bar), 1 minor; usualOf → package C | scratch ds-review-pkgB.md |
| 5F | 3 | B review fixes | sonnet (same worker, has context) | done | straight-set step-back; back-off sets skipped on double rows; scheme switch starts at top load × low; pins ≥ bar; end-of-stack target. Sim unchanged (≥ DP both schedules), yearbase behind 31.3% | worktree-agent-aedd6e3d99467f9ff @ 7e12973 |
| 6 | 3 | Package C workout screen: set-1 cascade, usual-load chip, ease-back, S3 warm-ups, S4 targets (off-book day is D) | sonnet (high) / worktree on B | done → in review | t51 134 (390/320/430); override on 3 sets 6→2 taps; DOM identity held on every logging tap; <44px eff 64→60 (90 with ramps on) | worktree-agent-a1b91921f03ea0d2c @ 90b1a0c |
| 6R | 3 | Review C code | deepseek-v4-pro | done | 1 blocker (warm toggle re-render, pre-existing), 4 accepted (cascade on commit, touched flag, warm-up floor, usual guards), 3 rejected (420px breakpoint by design; 'kg' was a misread of metricOf; DB per-hand) | scratch ds-review-pkgC.md |
| 6F | 3 | C review fixes + plausibility guard | sonnet (same worker) | done | t51 165; warm flip in place; cascade on commit, touched flag, 0.5–1.5× guard; warm-ups floor; usual guards | worktree-agent-a1b91921f03ea0d2c @ 46787ed |
| I2 | 4 | Integrate C onto 70dfad2 | sonnet (integration worker) | done | 35 suites 0 failed (t51 165, t53 107, t47 251); yearbase 31.3%/5.7%; journeys clean | worktree-agent-a6e7f897422538886 @ 4ec1000 (local) |
| R14 | 1 | v26.14 independent full run; merged into cloud/sprint-1108 | commander | done | 29 suites, 1,233 checks, 0 failed | cloud/sprint-1108 @ 4d7914d |
| 7 | 3 | Package E muscles & plan: balance card, S1 suggestions, rotation volume, pump seed | sonnet (high) / worktree on A | done, ready to merge | t50 107/107. Real plan: card maths right (helpers ½); fixes: ask frequency instead of assuming 1/wk; find rows by muscle not name ("Lateral Riase" typo hid a suggestion) | worktree-agent-aaba9b28c2ec16973 @ cc50225 (t50 148/148) |
| 7R | 3 | Review E code | deepseek-v4-pro | done | 0 blockers; 4 accepted (untagged count, phantom rotation, empty-state line, S1 pairing after reload), 1 rejected (weekStarts order — verified oldest-first) | scratch ds-review-pkgE.md |
| 8 | 4 | Package D: off-book, pump day, rotation blocks + scorecard, stall on blocks, coachRuleVolume | sonnet (high) / worktree on 70dfad2 | built; t39 re-seed + rebase onto 4ec1000 out | t52 183 (16 mutants caught); t39b 3.0–3.3 cards/yr healthy; t39 §6/§9 assumed old stall rule → ruled: re-seed via two blocks | worktree-agent-aed8b61287f25ed20 @ 9a121f3 |
| 8R | 4 | Review D code | deepseek-v4-pro | done | 0 blockers; accepted: immutable block anchor, off-book undo no wholesale snapshot restore, empty-balance text, caption; #1 (rangeHist) rejected — single-range change doesn't filter; worker must prove with a test | scratch ds-review-pkgD.md |
| 8F | 4 | D rework: t39 re-seeded via blocks, review fixes, rebased onto A+B+E+C | sonnet | done | ALL 2.0 packages in one build; every suite rc=0 (t52 210, t39 176, t51 165, t47 251); yearbase 31.3/5.7; t39b 3.0–3.3 cards/yr | worktree-agent-aed8b61287f25ed20 @ 03324e5 |
| 9 | 5 | End-to-end acceptance on real data (upgrade from v26.14, a gym week by taps, screens, sim, replay) | opus (blind) | out | — | — |
| 10 | 5 | Docs + gym test plan for the 2.0 beta | sonnet | out | — | — |
