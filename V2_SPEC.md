# Iron Log 2.0 — implementation spec (engine, friction, muscles, blocks, S1–S4)

Source of scope: `V2_PLAN.md` (§0, §3, §4, §7). Read against `index.html` v26.13 on
`cloud/sprint-1108`. Functions are named, never line-numbered (the M5 split moves them
into `js/NN-*.js` unchanged). Where this spec adds something §4 does not list, it says
**[schema add]**; those are the only deviations, and all are additive.

Conventions used everywhere below:

- `V2()` = `S.settings.v2===true`. V2_PLAN §6: alphas merge to `main` "behind settings.v2
  where behaviour changes". **Gated by `V2()`:** every prescription change (M1 a, b, d;
  `sinceChosenDrop` change), the usual-load chip, the set-1 cascade, the ease-back chip,
  warm-up generation (S3), the block line / scorecard / block stall rule (M4), the
  rotation volume card on Progress (M3). **Not gated:** the v6 migration, the muscle-head
  split and `MUSCLES`/`MG_GUESS` (data; can't be half-applied), the shadow retirement,
  the off-book button, the Plan balance card and its suggestions (opt-in taps), the pump
  day (opt-in), S4 hit targets. At 2.0 final (`V2_PLAN` §6 "retire leftovers") every
  `!V2()` branch is deleted (list in §2b).
- "In place" = mutate `S.active`, then write `input.value` / `textContent` / `refreshPlates()`
  on the existing nodes. Never `viewToday()` / `render()` on the set-logging path (trap 1).
- New `data-act` values are handled in a **new** delegated listener owned by the package
  that adds them (guarded on `TAB`), never by editing another package's listener. Grep the
  sheet / view for collisions first (trap 6).
- Every plan row is built by `newPlanEx()` / `planExFromSession()` (trap 13). Every
  read of tags goes through `tagsOf()` (trap 9). Every plan walk uses `eachPlanEx()`
  (trap 15). Every history edit is followed by `recomputePRs()` (trap 8).
- Tests: UI-driven Playwright through `tools/test/harness.mjs` for anything with UI
  (trap 19), seeded with `settings.v2:true` unless stated; engine properties in t43 style
  through `yearsim.js`.

---------------------------------------------------------------------------------------

## 1. Schema v6 migration

### Data (all additive)

| Where | Field | Value / meaning |
|---|---|---|
| `S.version` | `6` | |
| `settings` | `v2` | boolean, default `false` **[schema add]** (§6 gate) |
| `settings` | `targetFreq` | `null` = auto (computed on read by `targetFreqOf()`, §4); a number 1–7 in steps of 0.5 once the user picks one |
| `settings` | `excludedMuscles` | string[] of `MUSCLES` keys. `defaultState()` → `[]`; migration from <6 → `["calves"]` (owner, §0) |
| `settings` | `blockRotations` | `6` |
| `settings` | `repOutDefault` | **left in stored data, read by nothing** (§4 says "only adds"). Removed from `defaultState()`. |
| routine | `optional` | boolean, `false` unless the pump day (§6) **[schema add]** |
| plan row | `scheme` | `"double"` \| `"topback"`, default `"double"` |
| plan row | `backPct` | number in (0, 0.5), default `0.12` |
| plan row | `pins` | number[] ascending, unique, >0; `[]` = none |
| session exercise | `scheme`, `backPct`, `pins` | copied from the plan row at `makeSessionEx()` |
| session exercise | `presc` | `{w, r}` the engine's prefill before any chip/edit **[schema add]** (needed for the override rate, §5) |
| session exercise | `usual` | `{w, r, why, kind}` \| `null` (§3b) |
| set | `role` | `"top"` \| `"back"` on `topback` exercises only |
| session | `unlogged` | `true` on off-book sessions (§3c); absent otherwise |
| session | `easeBack` | `true` when the ease-back chip was taken (§3d); absent otherwise |
| `S.block` | `{num, startSessId, startTs, rotation, history[]}` | `startTs` **[schema add]**: the anchor survives deleting the anchor session |

### `normalize(s)` — exact steps (append after the existing v5 steps, before `s.version=…`)

All steps are **idempotent and unconditional** (they run on every call, not only when
`version<6`), because an old v26 tab can write a v5-shaped log back over a v6 one (it keeps
unknown fields but sets `version:5`), and the next v6 load must converge to the same state.

```
var from = num(s.version);
if (from < 6) MIGRATED = true;
var rawSettings = s.settings || {};          // capture BEFORE the existing Object.assign line
...existing v5 steps (settings assign, arrays, variants, coachShape)...
var st = s.settings;
// settings
if (typeof st.v2 !== "boolean") st.v2 = false;
if (!Array.isArray(rawSettings.excludedMuscles)) st.excludedMuscles = from < 6 ? ["calves"] : [];
st.excludedMuscles = uniq(st.excludedMuscles.flatMap(k => k==="delts" ? [] : [k]).filter(isMuscle));
if (!(num(st.blockRotations) >= 1)) st.blockRotations = 6; else st.blockRotations = Math.round(num(st.blockRotations));
if (st.targetFreq !== null && !(num(st.targetFreq) >= 1 && num(st.targetFreq) <= 7)) st.targetFreq = null;
// routines and plan rows (live plan AND S.planBackup.routines)
forEachRoutine(s.routines.concat(s.planBackup && Array.isArray(s.planBackup.routines) ? s.planBackup.routines : []), r => {
  if (typeof r.optional !== "boolean") r.optional = false;
  r.variants.forEach(v => v.exercises.forEach(migratePlanRow));
});
function migratePlanRow(e){
  if (e.scheme !== "double" && e.scheme !== "topback") e.scheme = "double";
  if (!(num(e.backPct) > 0 && num(e.backPct) < 0.5)) e.backPct = 0.12;
  e.pins = cleanPins(e.pins);
  retagDelts(e);
}
// history and the active session: only the muscle tags change; sets are never touched
s.sessions.forEach(x => x.exercises.forEach(retagDelts));
if (s.active) s.active.exercises.forEach(retagDelts);
// block
if (!s.block || typeof s.block !== "object") {
  var a = s.sessions[0];                      // newest
  s.block = {num:1, startSessId: a ? a.id : null, startTs: a ? num(a.ts) : 0, rotation:0, history:[]};
} else {
  s.block.num = Math.max(1, Math.round(num(s.block.num)) || 1);
  if (typeof s.block.startSessId !== "string") s.block.startSessId = null;
  s.block.startTs = num(s.block.startTs);
  s.block.rotation = num(s.block.rotation);
  if (!Array.isArray(s.block.history)) s.block.history = [];
}
s.version = 6;
```

`cleanPins(p)`: `Array.isArray(p) ? p : []` → map `num`, keep `>0`, `round(x,2)`, unique,
sort ascending; fewer than 2 values → `[]` (one number is not a stack).

`retagDelts(ex)` (returns nothing; also used by tests):
```
var heads = ["front_delts","side_delts","rear_delts"];
var hasMg = ex.mg === "delts", i2 = Array.isArray(ex.mg2) ? ex.mg2.indexOf("delts") : -1;
if (!hasMg && i2 < 0) return;
var g = guessMuscles(ex.name);                      // the NEW table (§4a)
if (hasMg) ex.mg = heads.includes(g.mg) ? g.mg : deltFallback(ex.name, "main");
if (i2 >= 0) {
  var h = g.mg2.filter(k => heads.includes(k))[0] || deltFallback(ex.name, "helper");
  ex.mg2[i2] = h;
  ex.mg2 = uniq(ex.mg2).filter(k => k !== ex.mg);
}
deltFallback(name, role): /rear|reverse|face/i → "rear_delts"; /front/i → "front_delts";
  /press|arnold|ohp|military|push|dip|fly|pec/i → "front_delts";
  else role==="main" ? "side_delts" : "front_delts".
```
Credit invariant: a v5 exercise credits the delts family exactly what it did before (1.0 or
0.5 per set, now on one head). Nothing else in `mg`/`mg2` changes.

### The one-time raw v5 snapshot

- Key `V5_KEY = "ironlog.v1.v5-backup"`.
- Written **only in `load()`**, after `JSON.parse(raw)` succeeds and **before**
  `normalize(s)`: `if (num(s.version) < 6 && !localStorage.getItem(V5_KEY)) try { localStorage.setItem(V5_KEY, raw) } catch(e) { V5_FAIL = true }`.
  `raw` is the exact string read from `KEY` (not re-serialised). Never written by
  `replaceLog()` (imports), never overwritten, never deleted by the app.
- `V5_FAIL` → after the first render, `toast("Couldn't keep a pre-2.0 copy — export a backup now")`
  (deferred like `MIGRATED`'s write, because `toast` needs the DOM).
- `reloadLog()` → `load()` path obeys the same rule (key exists → nothing written).

### Settings: "Restore pre-2.0 data"

In `viewSettings()`, Data section, directly under the existing "Put back the log from
before the restore" button, shown only while `v5Kept()` (`!!localStorage.getItem(V5_KEY)`,
false on any storage error):

`<button class="btn block" data-act="restore-v5">Restore pre-2.0 data</button>`

Handler `restoreV5()` (new listener, `TAB==="settings"`):
1. `if (refuseMidWorkout()) return;`
2. Parse `V5_KEY`; unreadable or `!Array.isArray(p.sessions)` → `toast("The pre-2.0 copy couldn't be read, so nothing was changed")`, return.
3. `confirmSheet("Restore pre-2.0 data?", "The copy kept when 2.0 first ran has N sessions. This phone has M. Restoring replaces everything on this phone with that copy, so anything logged since is lost. The copy itself stays kept.", "Restore", fn, true)`.
4. `fn`: `localStorage.setItem(BEFORE_KEY, JSON.stringify(S))` (failure → toast "Couldn't keep a copy of this log, so nothing was restored", return) → `replaceLog(p)` (normalize re-migrates it to v6; `recomputePRs`; `writeNow`) → `go("today")` → `toast("Pre-2.0 data restored")`. `V5_KEY` is **not** removed. The gist fewer-sessions guard then applies as for any restore (deliberate).

Also add the `v2` switch to Settings → Session: field row "Iron Log 2.0 (beta)" with
fh "Top set + back-offs, stack weights, blocks and the new logging shortcuts. Off keeps
v26 behaviour.", `.switch` with `data-act="v2"`; tap → toggle, `writeNow()`, `viewPrefs()`.

### Invariants
- Sets are never modified by `normalize()` (no field of any set object changes).
- Session count and order unchanged; every session id, ts, routineId, variantId unchanged.
- `normalize(normalize(x))` deep-equals `normalize(x)`; on a v6 state `MIGRATED` stays false.
- No `"delts"` key survives anywhere (plan, backup plan, history, active, excludedMuscles).

### Tests — new `tools/test/t47-schema-v6.mjs`
1. **v5 → v6 → export round trip (the "no set changes" proof).** Build the v5 fixture
   with the v26.13 build itself: serve `git show v26.13:index.html` (commit `8a4ecde`) on a
   second port, boot it with a synthetic state (3 days, 2 variants on A, 40 sessions incl.
   a deload, warm-ups, rpe, bodyweight + assisted lifts, a timed lift, `out` flags, shadow
   objects, mg/mg2 incl. `"delts"` on Lateral Raise, Face Pull, OHP and a "Landmine Press"
   with `mg:"chest", mg2:["delts"]`, plus an untagged "Cable Y-Raise"), export via
   `payload()`. Import that file into the v6 build through the Settings import sheet (UI),
   export again. Diff session by session: identical except `mg`/`mg2` where `"delts"` was;
   every set object deep-equal **including `pr`**; `sessions.length` equal; per session, the
   sum of credited sets over all muscles (heads summed as one) equal before and after.
2. Snapshot: put the v5 JSON string in `ironlog.v1`, load → `ironlog.v1.v5-backup` equals that
   exact string; reload → unchanged; write a different v5 string to `ironlog.v1`, reload →
   backup still the first string. Import a v5 file via UI → backup key not written when absent.
3. Idempotency: `normalize(clone(v6))` JSON-equal; `MIGRATED===false` on a second boot.
4. Mixed builds: take a v6 state, set `version:5` and re-add `"delts"` on one row (what an
   old tab would leave) → load → equals the original v6 state.
5. Restore button (UI): visible only with the key; tap → confirm text shows both counts →
   Restore → sessions equal the snapshot's count, `before-restore` key set, "Put back…"
   button now shown, `v5-backup` still present; mid-workout → refused toast.
6. `v2` switch toggles `settings.v2` (toggle-everything rule, trap 18).
7. `t31` and `t34` stay green unchanged.

Existing assertions that change (owner of the package that lands the muscle table): `t21`
"still tags the muscle" expects `side_delts`; `t39` "accept: carries muscles" expects
`nw.mg==='rear_delts'`.

---------------------------------------------------------------------------------------

## 2. M1 — the engine

### Shared helpers (new, engine file)

```
function schemeOf(ex){                       // the scheme that actually applies
  return V2() && ex && ex.scheme==="topback" && bwMode(ex)===0 && metricOf(ex)===0 ? "topback" : "double";
}
function pinsOf(ex){ return V2() && ex && Array.isArray(ex.pins) && ex.pins.length>=2 ? ex.pins : []; }
function pinUp(w,p){ for (var i=0;i<p.length;i++) if (p[i] > w+1e-9) return p[i]; return null; }
function pinDown(w,p){ for (var i=p.length-1;i>=0;i--) if (p[i] < w-1e-9) return p[i]; return null; }
function nearestPin(x,c){ /* c non-empty; smallest |c[i]-x|, ties → the heavier */ }

function harderEx(w,ex){                     // one notch harder
  var m=bwMode(ex), p=pinsOf(ex);
  if (!p.length) return harder(w,stepFor(ex),m);
  var n = m===2 ? pinDown(w,p) : pinUp(w,p);
  return n===null ? w : n;                   // w back = the end of the stack
}
function lighterEx(w,ex){                    // one notch easier (step-back, coach stepBack)
  var m=bwMode(ex), p=pinsOf(ex), s=stepFor(ex);
  if (!p.length) return m===2 ? w+s : Math.max(0,w-s);
  var n = m===2 ? pinUp(w,p) : pinDown(w,p);
  return n===null ? w : n;
}
function easierEx(w,ex){                     // deload: about 10% off
  var m=bwMode(ex), p=pinsOf(ex);
  if (!p.length) return easier(w,stepFor(ex),m);
  if (m===2) { var u=pinUp(w,p); return u===null ? w : u; }
  var c=p.filter(x => x < w-1e-9); return c.length ? nearestPin(w*0.9,c) : w;
}
function backOffW(top,ex){                   // planned back-off load
  var t=num(top)*(1-(num(ex.backPct)||0.12)), p=pinsOf(ex);
  if (p.length) { var c=p.filter(x => x < num(top)-1e-9); return c.length ? nearestPin(t,c) : num(top); }
  var s=stepFor(ex), b=Math.round(t/s)*s;
  if (b >= num(top)) b = num(top)-s;
  if (b <= 0) b = num(top);
  var bar=barOf(ex); if (bar>0 && b<bar) b=bar;
  return round(b,2);
}
function harderPhraseEx(w,next,ex){
  return pinsOf(ex).length ? (bwMode(ex)===2 ? "assist down to "+fmt(next) : "up to "+fmt(next))
                           : harderPhrase(stepFor(ex),bwMode(ex));
}
function stepWeight(cur,d,ex){               // the ± stepper on the card (used by §3a)
  var p=pinsOf(ex), w=num(cur);
  if (!p.length) return Math.max(0, round(w + d*stepFor(ex), 2));
  var n = d>0 ? pinUp(w,p) : pinDown(w,p);   // "+" = bigger number, whatever the load type
  return n===null ? w : n;
}
function topSetOf(sets,mode){
  var t=sets.filter(s => s.role==="top"); if (t.length) return t[0];
  var best=null;
  sets.forEach(s => { if (blankW(s,mode)) return;
    if (!best || heavierLoad(num(s.w),num(best.w),mode) || (num(s.w)===num(best.w) && num(s.r)>num(best.r))) best=s; });
  return best;
}
function projectTop(h){ var t=topSetOf(h.sets,h.bw); return t ? Object.assign({},h,{sets:[t]}) : h; }
function exWorkingP(name,ex){ var h=exWorking(name); return schemeOf(ex)==="topback" ? h.map(projectTop) : h; }
```

`exSessions()` entry gains `scheme: e.scheme||"double"` and **loses `tgt`** (its only
reader was `shadowPrescribe`). `exWorking()` additionally drops sessions with
`easeBack:true` (§3d): `exSessions(name).filter(x => !x.deload && !x.easeBack)` — add
`easeBack:!!s.easeBack` to the entry.

### (a) `scheme: "topback"`

- **Which set is the top set.** In a logged session: the first working set with
  `role:"top"`; failing that (history from before 2.0, hand-logged), the heaviest non-blank
  working set, most reps among equals, first among exact ties (`topSetOf`). In the session
  being prefilled: the first working set, which `makeSessionEx()` gives `role:"top"`.
- **Progression reads the top set only.** In `prescribe(name, ex, opts)`:
  `var hist = rangeHist(exWorkingP(name,ex), name, ex);` and, when `opts&&opts.skip`, drop the
  entry whose `sessionId===opts.skip` (used by §3b). Every existing rule then runs on
  one-set exposures unchanged: `workLoad` = top load, `minR` = top reps, the near-miss rule is
  off by construction (`at.length>=Math.max(2,nsets)` is false), `droppedSets` sees one set,
  the step-back and `jumpAwayFrom`/`repsAt` failed-jump memory read top loads and top reps.
  `nsets` still sets the **output** set count.
- **Output.** When `schemeOf(ex)==="topback"` and the result `w!==""`, add
  `back:{w: backOffW(result.w, ex), r: result.r}`. Deload branch: back-offs from the deload
  top (`easierEx`). The top-set target `r` is the prescription; back-offs are prefilled at the
  same `r` (a reserve-friendly target ~12% lighter; never judged).
- **Back-off rounding.** `backOffW()` above: nearest stack pin strictly below the top (ties →
  heavier); with no pins `round(top×(1−backPct)/step)×step`, never ≥ top, never below the
  bar on a barbell, never ≤ 0 (then = top).
- **`droppedSets(sets,w,mode)`** also skips sets with `role==="back"` (belt-and-braces for a
  row switched back to `double`): in the loop, `if (s.role==="back") return;` before the
  `isAt` test.
- **`repOutApplies(ex)`** returns `false` when `ex.scheme==="topback"` (no rep-out label, no
  `out` flag at save: the last set of a top+back-off lift is a back-off).
- **Step-back worked example** (RDL 6–10, step 5, newest first): top 235×5 after top 230×8 →
  `Couldn't reach 6 at 235 — back to 230 and build up`, back-offs 200. At an established
  230: two tops in a row under 6 → `lighterEx(230)` = 225 (≤ MAX_CUT) → "back to 225".
- **Failed-jump memory:** unchanged code on the projected history (the "Building reps before
  235 again (it cost N reps last time)" branch reads top reps only).
- **UI.** `planExMenu()`: after `barRow`, when `bwMode(ex)===0&&metricOf(ex)===0`:
  field row "Top set + back-offs" / fh "One top set, then back-offs about 12% lighter. Only the
  top set decides the next weight." / `<button class="switch" role="switch" data-x="topback">`;
  tap → `ex.scheme = ex.scheme==="topback" ? "double" : "topback"`, `save()`, re-open the menu
  (as the load-type row does). Exercise card meta (`exerciseCard`, §3 owner): replace
  "3 × 6–10 range" with "top + 2 back-offs · 6–10" when `ex.scheme==="topback"&&V2()`;
  row index button shows "T" for the top set (`role==="top"`), numbers for back-offs.
- `+ Set` on a topback exercise copies `role:"back"` from the last working set.

### (b) Remove the trend load cut, keep the badge

In `prescribe()` the block `if(trend(name).state==="down"&&!steppedUpAndMaking(...)){…}`
becomes `if(!V2()&&trend(name).state==="down"&&…)`. Precedence under V2 is: deload week →
RPE hold → dropped sets → near-miss / double / straight (with step-back and failed-jump).

Every caller of the trend family, and what happens:

| Function | Uses | Under V2 |
|---|---|---|
| `prescribe` | `trend`, `trendWin`, `steppedUpAndMaking`, `sinceChosenDrop` | trend block skipped; nothing else reads trend |
| `exerciseCard` | `trend` → SLIPPING / FLAT / CLIMBING chip | unchanged (the badge) |
| `viewProgress` lift list | `trend` → % chip | unchanged |
| `liftSheet` | `trend`, `trendWin`, `prescribe` for "Next time:" | unchanged; its text already asks `prescribe()` |
| `deloadStatus`/`deloadCheck` | `trendLong` | unchanged |
| `coachRuleStall` | `trend(name).state==="up"` skip | unchanged code; under V2 the rule itself is replaced (§5) |
| `coachSummaryText` | `trend` | unchanged |
| `trendAt` | `sinceChosenDrop(exWorking)` | reads `exWorkingP(name, planExByName(name)||{})` so a topback lift's badge reads its top set |
| `sinceChosenDrop` | — | V2: a drop at index i (h[i] lighter than h[i+1], `kind` set and not `"deload"`) is a reset **only if no newer exposure (index < i) is back at a load not lighter than h[i+1]'s**. One light day no longer restarts the trend. |

Dead under V2 (deleted at 2.0 final together with the `!V2()` branch): the trend block,
`steppedUpAndMaking`. `MAX_CUT` stays (step-back).

### (c) Retire the shadow, the "Use" strip and `repOutDefault`

Delete (engine package): `shadowPrescribe`, `repOutOf`, `OUT_JUMP2`, the `sp`/`auto` lines and
the `shadow:` property in `makeSessionEx`, `tgt` in `exSessions`.
Delete (session-screen package, §3 owner): the `.shadow` strip in `exerciseCard`, the
`use-shadow`, `repout-on`, `repout-off` branches of the first `#view` click listener, the
`.callout .shadow*` CSS.
Delete (progress package, §4 owner): `repOutScore`, `repOutCard`, `OUT_GATE_N`,
`OUT_GATE_SHARE`, and the `html+=repOutCard()` line in `viewProgress`.
**Stays readable:** `e.shadow` on logged sessions is inert data, kept in exports;
`convertUnits` keeps converting `e.shadow.w` so old records stay coherent. `repOutApplies`,
`repOutHint`, the `out` flag, the "Set N is a rep-out" hint and `trendScore`'s use of `out`
stay (they are not the shadow). `settings.repOutDefault` stays in stored data, unread.

Tests that retire or change (engine package does all of these):
- `t32-repout.mjs`: delete §3 (decision table), §4 (Use), §5 (no stall line), §7 (closed loop
  with Use), §8 (320 px shadow line), §9 (Argon/shadow). Keep §1, §2, §6; title
  "t32 rep-out label".
- `t36-scorecard.mjs`: delete §1–§3 (rep-out card); keep §4–§5 ("Since you started").
- `t34-datasafety.mjs` §5: rewrite as "lb→kg mid-workout converts `lastW` and `usual.w`"
  (the Keep chip reads 29.5 kg; seed a usual-chip case and assert its text in kg after the switch).
- `t35-year.mjs`: delete the "always tapping Use" run.
- `t41-range-history.mjs`: drop `sp`/`sw`/`sr` and the assertion at "the rep-out method also
  reads Day B's own rep-out".
- HOOK strings: remove `shadowPrescribe:shadowPrescribe,` from `t35`, `t39b`, `t41`, `t42`,
  `t43-invariants`, `t43-trend-flat`, `tools/sprint/yearbase.mjs`, `tools/sprint/stuckdiag.mjs`,
  `tools/review/lib.mjs`; in `tools/review/replay.mjs` drop the `sp` column. `yearbase.mjs`
  drops its "always tap Use" mode.
- `yearsim.js`: `cfg.useShadow` becomes a no-op (keep the `ex.shadow ?` guard — it's null).

### (d) Stack weights (`pins[]`)

- **Entry** (`planExMenu`, any load type): field row "Stack weights" / fh "Only for a machine
  whose weights aren't evenly spaced. The next weight up or down comes from this list."
  `<input class="txt" data-x="pins" inputmode="decimal" placeholder="20, 27.5, 35">`, value
  `ex.pins.join(", ")`. `oninput`: `ex.pins = cleanPins(this.value.split(/[,\s;]+/))`, `save()`.
  (Fewer than 2 numbers stores `[]`.) Blank = fixed step as today. Nothing is learned.
- **Snapping, everywhere a weight moves by a notch:**

| Site | Without pins | With pins |
|---|---|---|
| `prescribe` "up" (double and straight) | `harder(w,step,mode)` | `harderEx(w,ex)`; if it returns `w` (end of the stack): `{w, r:minR+rstep, why:"Top of the stack — go for "+(minR+rstep), kind:"reps"}` |
| `prescribe` step-back at an established load | `w∓step` | `lighterEx(w,ex)`; MAX_CUT check unchanged |
| `prescribe` step-back after a jump | back to `w1` | unchanged (a weight he used) |
| `prescribe` deload week | `easier()` | `easierEx(w,ex)` |
| back-offs | grid | `backOffW()` |
| card ± stepper (weight) | `+stepFor` | `stepWeight(cur,d,ex)` |
| `makeSessionEx` coach `stepBack` | `p.w − stepFor` | `lighterEx(p.w,ex)` (skip if equal) |
| `coachStartW` | floor to step | largest pin ≤ v (0 if none) |
| `coachRuleStall` "step > 8% of load" | `stepFor(row)/W` | `(pinUp(W,p)−W)/W` (no pin above → skip lift) |
| ease-back (§3d), warm-ups (§7) | grid | pins (largest pin ≤ x for warm-ups) |

  The "up" `why` uses `harderPhraseEx(w,next,ex)`: "Hit 15s on every set — up to 35".
- Pins are typed as `w` (what you set the pin to). On assisted work harder = next pin **down**.
- **t43 grid invariant** (inv 2) becomes: if the lift has pins, every prescribed load and
  every back-off is in `pins ∪ {w0}`; else on `w0 + k×step` (unchanged). Inv 6 with pins:
  an up move is ≤ 1 notch; a down move is ≤ 1 notch unless `kind==="deload"`, where it is ≤
  `max(1 notch, MAX_CUT×base)` and lands on a pin. Inv 1 allows `r > top` when `why` starts
  with "Top of the stack" (counted like "Building reps before").

### (e) Gates: simulator, invariants, replay

**Tooling prerequisite (flag):** the review simulator named in V2_PLAN
(`tools/review/sim.mjs`, `sim-page.js`, `metrics.mjs`) is **not on this branch**; it is on
`origin/review/independent` (commit `8b0f0cb`). Restore those three files into
`tools/review/` first. It also has **no 3+/wk schedule**: `VARIANTS` has `base` (logged) and
`stated` (2–3/wk). Add `three: {...BASEV, sched:'three'}` whose `weekDays()` gives 3 or 4
days a week (50/50 on the seeded `U(seed,'wk',w)`), days spread as in `base`.

Sim edits:
- `sim-page.js perform()`: each set uses its own `s.w` (today all sets use `work[0].w`);
  the exposure's W for metrics = the top (first working) set.
- Configs: `classic` runs with `settings.v2=false` (v26.13 behaviour in the same build),
  new `v2` = `classic` with `settings.v2=true`; drop `repout`, `r-*`, `abl-echo`
  (their patch targets are gone); keep `dp`, `lin`, `c-*`.
- `v2-topback`: as `v2` with `scheme:"topback"` on RDL and Leg Press rows.

Gates (100 lifters, paired seeds, both `base` and `three`):
1. `v2` − `dp` progress (pp/yr) ≥ 0 (mean of paired differences; report ± se).
2. Stuck lift-years (M9) for `v2` ≤ 109 **and** ≤ `classic` in the same run.
3. Spiral lift-years (M7) for `v2` ≤ 97 **and** ≤ `classic` in the same run.
4. `v2-topback`: RDL stuck lift-years ≤ `v2`'s.

t43 (`tools/test/t43-invariants.mjs`, `yearsim.js`):
- `yearsim.js`: `T.S.settings.v2 = cfg.v2 !== false` before the loop; each set's reps use
  `capAt(n, Number(s.w), wk)` (its own weight); `log` gains `back: work.slice(1).map(s=>+s.w)`
  and `role`; `cfg.pins` (`{liftName: [..]}`) and `cfg.topback` (lift names) are written onto
  the plan rows before the first session.
- MODES: delete `use`; `illness` → `useShadow:false`; add
  `['pins', {pins: PINS}]` with `PINS = {'Cable Row': stack(65), 'Tricep Pushdown': stack(30),
  'Lat Pulldown': stack(150), 'Low to high cable fly': stack(20)}`, `stack(w0)` = `w0` plus
  alternating +5/+7.5 steps up to 12 values above and down while > 0 (non-uniform on purpose);
  add `['topback', {topback:['RDL','Leg Press']}]`. Env `IRONLOG_V1=1` runs everything with
  `v2:false`.
- Inv 4 becomes **"no trend back-off"**: under V2 no `why` matches
  `/^Sliding|Already backed off|You dropped to/` (0 allowed).
- New inv 8 (topback): every back-off prefill `< top` and `≥ top×(1−backPct) − notch`; no
  topback exposure's `why` matches `/^Only \d+ of \d+ sets/`; inv 3 judges topback lifts on
  `reps[0]` (the top set).
- New inv 9 (pins): no prescribed or back-off load off the pin list.
- MUTANTS: delete `nocapguard`; add `trendcut: ['if(!V2()&&trend(name)', 'if(trend(name)', 'inv 4']`;
  re-point `deloadheavy` at the new deload line (`easierEx(w,ex)`); each mutant must still
  fail its invariant (run all with `IRONLOG_MUTANT=`).
- `yearbase` under-loaded share ≤ 32% (V2_PLAN §5) on the `prescribe` mode with V2.

Real-log replay (`tools/review/replay.mjs`, needs the owner's export, outputs outside the
repo): run twice (v2 false / true) in one build; the row for each lift takes `scheme`,
`backPct`, `pins` from the **current plan row of that name** (`planExByName`) and the rest
from the session as today; write `replay-diff.txt`: every exposure where `w`, `r` or `kind`
differ, with date, lift, old call, new call and what he did next. **Expectation:** RDL rows
with `scheme:"topback"`: every exposure after a top+back-off session gets kind `reps` or
`up` (never "Only N of M" or "Fell short" while the top set is inside the range); any other
changed call is one whose v26.13 `why` matched the trend-cut texts, or a pinned lift — each
listed and explained in the PR.

### Existing suites under V2 at 2.0 final (re-baselined, for the retire-leftovers step)
They run with `v2:false` until then and stay green. When the `!V2()` branches go:
`t26` decline case → `w 180`, why `Same weight — go for 9`; the banner assertion at
"already backed off|back off to" → `Next time: same weight`. `t28` "at most one back-off"
asserts → 0 back-offs. `t30` §6: 15 lb raise → `w 15, sets 4, r 15`, "Same weight — go for
15"; 5 lb dumbbell → `w 5`; bench → `185`, "go for 9"; incline after his own drop →
`w 55`, "Same weight — go for 10".

### Tests to add (engine package)
- `t48-topback.mjs` (UI): toggle in the plan menu (switch state persists); started card shows
  3 rows: `225×8 (T)`, `200×8`, `200×8` for RDL 6–10 after a top 225×8; log top 225×8 + two
  back-offs, finish, start again → "Same weight — go for 9" (never "Only 1 of 3"); top 225×10 →
  230, back-offs 200; the RDL fixture `225×8, 185×8, 135×8` (legacy, no roles) → top 225×8,
  "Same weight — go for 9"; step-back and failed-jump examples above; `role` survives
  save/export; switching the row back to `double` with role-tagged history never says "Only N of M".
- `t49-pins.mjs` (UI): type "35, 20, 27.5, 27.5" → stored `[20,27.5,35]`, field re-reads
  "20, 27.5, 35"; card at 27.5: `+` → 35, `−` → 20; top of range at 27.5 → prefill 35 and why
  "up to 35"; at 35 topping out → "Top of the stack — go for N"; step-back from 35 → 27.5;
  deload → nearest pin to 90% below; assisted row with pins: harder = next pin down; no pins →
  +5 exactly as before; pins with `v2:false` → ignored.
- t43 additions above; `t42` unchanged and green with V2.

---------------------------------------------------------------------------------------

## 3. M2 — fewer taps when you deviate

### (a) Set-1 cascade
**Rule.** When the weight of the **first working set** (first `!warm` in `ex.sets`) changes,
by typing or by its ± stepper, every **later** set that is `!warm && !done` and whose `w` still
equals (string compare) the value set 1 had **just before this change** takes the new value.
Topback: sets with `role==="back"` follow only if they equal `String(backOffW(old, ex))`;
they take `String(backOffW(new, ex))` (skipped when the new value is blank/not a number).
Reps never cascade. A set the user edited (differs from the old value) is left alone. Set 1
being done or not doesn't matter.

**Where.** First `#view` click listener, `data-act="step"` branch, `f==="w"`: compute
`old=st.w` before `st.w=String(stepWeight(st.w,d,ex))`, then `cascadeW(ei,si,old)`. `#view`
input listener, `.set input[data-f="w"]`: `var old=st.w; st.w=inp.value; cascadeW(...)`.
```
function cascadeW(ei,si,old){
  if (!V2()) return;
  var ex=S.active.exercises[ei], sets=ex.sets, first=sets.findIndex(s=>!s.warm);
  if (si!==first) return;
  var nw=sets[si].w, tb=schemeOf(ex)==="topback", okN=String(nw).trim()!==""&&isFinite(num(nw));
  var ob=tb?String(backOffW(num(old),ex)):null, nb=tb&&okN?String(backOffW(num(nw),ex)):null;
  for (var j=si+1;j<sets.length;j++){ var s=sets[j]; if (s.warm||s.done) continue;
    if (tb&&s.role==="back"){ if (nb!==null&&String(s.w)===ob){ s.w=nb; paint(ei,j); } continue; }
    if (String(s.w)===String(old)){ s.w=nw; paint(ei,j); } }
}
paint(ei,j): row=$('.set[data-ei="'+ei+'"][data-si="'+j+'"]'); if(!row) return;
  $('input[data-f="w"]',row).value=S.active.exercises[ei].sets[j].w; refreshPlates(ei,j,row);
```
Per-keystroke typing works because followers track every intermediate value ("6", "", "7",
"70"). `save()` as now. No `viewToday()`.

**Invariants.** DOM identity of every `.set` input in the card is unchanged after a cascade
(trap 1). Done sets never change. Warm-ups never change.

### (b) Usual-load chip
**Trigger (engine, computed at prefill in `makeSessionEx` as `ex.usual = usualOf(name, planEx)`):**
```
function usualOf(name,ex){
  if (!V2()) return null;
  var h=rangeHist(exWorkingP(name,ex),name,ex), m=bwMode(ex);
  if (h.length<2) return null;
  var a=workLoad(h[0].sets,m), b=workLoad(h[1].sets,m);
  if (!heavierLoad(b,a,m)) return null;                  // last exposure not lighter
  if (!h[0].kind || h[0].kind==="deload") return null;   // the app chose it, or can't tell
  var u=prescribe(name,ex,{skip:h[0].sessionId}), p=prescribe(name,ex);
  if (u.w===""||(String(u.w)===String(p.w)&&String(u.r)===String(p.r))) return null;
  return {w:u.w, r:u.r, why:u.why, kind:u.kind};
}
```
"Single": two light sessions in a row make `a===b`, so no chip (it is the new baseline).
`easeBack` sessions are already outside `exWorking`, so an eased day never triggers it.

**UI** (`exerciseCard`, callout `.lastrow`): when `ex.usual` and no working set is done,
render `<button class="revert usual" data-act="usual" data-ei="i">Usual: 65 × 10</button>`
(`entryText({w},mode)+" "+metricJoin(met)+" "+r+metricSuffix(met)`) **instead of** the
"Keep" chip. Tap (`onUsual`): every `!done && !warm` working set gets `w`/`r` (topback:
top gets `w`, back-offs `backOffW(w)`, all get `r`), painted in place; `ex.kind=usual.kind`;
`ex.why=usual.why`; the existing `.why` node's text span and class updated in place; chip
`.remove()`; `save()`; `toast("Back to 65 × 10")`.

**Also:** the existing `revert` (Keep) handler stops calling `viewToday()`; it fills and paints
in place the same way (shared `fillUndone(ei,w,r)` helper) and removes its chip.

### (c) "Trained Day B, didn't log it"
**Data:** a normal session object with no exercises:
`{id:uid(), ts:now, endTs:now, routineId:r.id, key:r.key, name:r.name, variantId:v.id,
variantName:variantLabel(r,vi), deload:inDeloadWeek(), bw:num(settings.bodyweight),
note:"", unlogged:true, exercises:[]}` unshifted onto `S.sessions`.

**UI** (`todayIdle`, inside the hero card after `.daypicks`, only when `nr` has exercises):
`<button class="offbook" data-act="offbook" data-id="{nr.id}" data-vi="{nvi}">Trained {nr.name}, didn't log it</button>`
(quiet text button, 44 px tall). One tap → `offBook(rid,vi)`: refuses if `S.active`; creates
the session; `writeNow()`; `render()`; `toastUndo(r.name+" marked as trained", undo)`.
Undo: remove by id, `gistSessionsMoved(-1)`, `writeNow()`, `render()`, `toast("Unmarked")`.
No `recomputePRs` needed (no sets), but call it anyway on undo for symmetry (trap 8).

**Readers — what happens to an `unlogged` session (by function):**

| Function | Behaviour | Change needed |
|---|---|---|
| `nextRoutine`, `nextVariantIx` | counts (advances the rotation and the week) | none |
| `sessionsPerWeek`, `weeklyFreqHtml`, `volumeInRange().n`, `monthGrid`, `sinceStartCard` counts, `targetFreqOf` | counts toward frequency | none |
| `exSessions`/`exWorking`/`lastPerf`/`lastRawSets`/`bestScore`/`prBoard`/`recomputePRs`/`cycleOf`/`lastNote`/`trend*`/`deloadStatus`/`prescribe`/`usualOf` | invisible (no exercises) | none |
| `setsByMuscle`, `volumeInRange().v`, `sessionVolume` | 0 | none |
| `coachDaySessions` | would read as "every lift skipped" | filter `!s.unlogged` (feeds skipped, long, `coachDayActive`, `coachDayMiss`, `coachBaseline`) |
| `coachMeasure` (day mode `after`) | same | filter `!s.unlogged` |
| `coachRuleVolume` | a week with an unlogged session under-counts volume | return `[]` if any of the 3 weeks has an unlogged session (as for deload) |
| `coachSummaryText` sessions list | "0 working sets" | print `(trained, not logged)`; header adds "(N marked trained, not logged)" |
| block slots, rotation line (§5) | counts | — |
| rotation volume window, scorecard balance, override rate (§4–5) | skipped | by definition there |
| ease-back gap (§3d) | counts as training | — |
| `todayIdle` "Last" row | `0 sets` | show "not logged" instead of the set/volume text |
| `viewProgress` History rows | `0 sets · 0` | show `not logged` |
| `sessionSheet` | empty | sub line "Trained, not logged."; hide **Edit**; keep Delete |
| `gistPush` fewer-sessions guard, `backupDue`, exports, `payload` | counts / exported as is | none (undo adjusts the count) |

### (d) Ease-back chip
**Trigger:** `S.active` just started, `V2()`, and `calDaysAgo(newest session of any kind
incl. unlogged and pump) >= 10`, and `!S.active.easeBack`. Computed at render; nothing stored
until tapped.

**UI** (`todayActive`, first child of `.stack`, above the first exercise card, so it never
moves rows under a thumb mid-set; hidden once any working set is done):
`<div class="banner calm easeback"><div class="bt">12 days since you last trained</div>
<div class="acts"><button class="btn sm" data-act="easeback">Ease back ~10%</button></div></div>`.
Tap: for every exercise, every `!done && !warm` working set: `w = easierEx(num(w), ex)`
(topback: top eased, back-offs `backOffW(newTop)`), painted in place; `ex.why = "Easing back
after 12 days — " + ex.why`; `S.active.easeBack = true`; banner `.remove()`;
`toastUndo("Eased back for today", restore previous w values in place and clear easeBack)`.

**Applies to that session only:** `exWorking` drops `easeBack` sessions, so the next
prescription reads the session before the gap. They still count for PRs, volume, frequency,
blocks.

### Tests — `t50-friction.mjs` (UI, Pixel 5 390×844, touch)
1. Cascade: 3×135 prefill; tap `−` twice on set 1 → all three 125; element handles for the
   three inputs taken before are the same nodes after (`===` via `evaluate`); type "140" into
   set 1 → 140,140,140; edit set 3 to 150 then set 1 to 145 → 145,145,150; tick set 2 then
   change set 1 → set 2 unchanged; warm-up rows unchanged; topback: top 225→235 → back-offs
   200→205; `v2:false` → no cascade.
2. Usual chip: history 65×10,10,9 (kind reps) then 55×10×3 (kind "reps") → card shows
   "Usual: 65 × 10" and no Keep chip; tap → all undone sets 65×10, why text updated, chip
   gone, no re-render (DOM identity); two light sessions → no chip; light session with
   kind "deload" → no chip; legacy session without kind → no chip.
3. Off-book: one tap on Today → `S.sessions[0].unlogged===true`, hero now shows Day C;
   Undo within 10 s → gone, hero back to B; the skipped-lift rule over 4 sessions with one
   unlogged does not count it; Progress History says "not logged"; export/import keeps it.
4. Ease-back: newest session 12 days ago → banner; tap → 185 → 165 (grid), pins → nearest pin;
   finish → next start of that day prescribes from the pre-gap session; newest 9 days ago → no banner.
5. Journeys numbers (in `tools/sprint/journeys.mjs`, new rows): "2c override weight on 3
   sets" = **2** taps; "6 trained, not logged" = **1** tap; journeys 1, 2a, 2b, 3 unchanged
   taps (no extra tap on the normal path).

---------------------------------------------------------------------------------------

## 4. M3 — muscles

### (a) `MUSCLES` and `MG_GUESS`
```
MUSCLES = chest "Chest", back "Back", traps "Traps",
          front_delts "Front delts", side_delts "Side delts", rear_delts "Rear delts",
          biceps, triceps, forearms, quads, hams, glutes, calves "Calves", core "Abs"
```
`MG_GUESS` (order is the spec; only these rows change, everything else keeps its place):
```
[/front\s*raise/i,                                  "front_delts", []],                       // NEW, before the side row
[/upright\s*row|lateral\s*raise|side\s*raise/i,     "side_delts",  []],
[/rear\s*delt|face\s*pull|reverse\s*(fly|flye|pec)/i,"rear_delts", ["back","traps"]],
[/overhead\s*press|\bohp\b|shoulder\s*press|military|arnold/i, "front_delts", ["triceps"]],
[/\bfly\b|flye|pec\s*deck|\bpec\b/i,               "chest", ["front_delts"]],
[/bench|chest\s*press|push.?up|\bdips?\b/i,         "chest", ["triceps","front_delts"]],
[/(incline|decline|floor|dumbbell|\bdb\b)[\w\s-]*press/i, "chest", ["triceps","front_delts"]],
...
[/wrist\s*curl/i,                                   "forearms", []],                          // NEW, before /curl/
[/curl/i, "biceps", ["forearms"]],
```
(The new wrist-curl row exists because the pump day's "Cable Wrist Curl" would otherwise
resolve to biceps.) Migration of stored tags: `retagDelts()` (§1).

### (b) Abs and exclusions
- `core` is the key; its label becomes "Abs". It is a planned target like any muscle.
- `excludedMuscles`: never in `weeklySetsCard`'s "Nothing for …" line, never "low" on the
  balance card (shown as "Calves — by choice"), skipped by `coachRuleVolume`. Sets on an
  excluded muscle still count in history and exports; nothing is hidden from `setsByMuscle`.

### (c) Rotation-native volume (Progress, V2)
- `N` = number of main (non-optional) routines with at least one exercise.
- Main logged sessions `M` (newest first) = sessions with `routineId` of a non-optional
  routine, `!unlogged`, `!deload`, `exercises.length>0`.
- **This rotation** = sessions (any routine incl. pump and freestyle, `!deload`, `!unlogged`)
  with `ts >= M[N-1].ts`. **Previous** = same filter, `M[2N-1].ts <= ts < M[N-1].ts`.
  Pump and freestyle sets inside the window count; unlogged sessions contribute nothing and
  don't use up one of the N.
- Refactor `setsByMuscle(a,b)` into `setsByMuscleIn(sessions)` (same 1 / ½ rule, `tagsOf`) and
  keep `setsByMuscle(a,b)` as a wrapper (the coach and summary use it).
- `weeklySetsCard` under V2 becomes "Sets per rotation": bar = this rotation, marker =
  previous; faint marks at the band in rotation units `9×N/f` and `16×N/f` with
  `f = targetFreqOf()`; footer "One rotation = your last N days (A, B, C). Band 9–16 a week
  at f sessions a week. A set counts 1 for the main muscle, ½ for a helper." Excluded
  muscles omitted from bars; one line "Calves: not tracked, by choice". Fewer than N main
  logged sessions → "Not a full rotation yet" and the bars for what exists.
- `targetFreqOf()`: `settings.targetFreq` if a number; else the mean count of main-routine
  sessions (incl. unlogged and deload) per full Monday week over the last 8 full weeks that
  start on or after the first session's week, rounded to 0.5, clamped [1,7]; no full week → 3.

### (d) Plan balance card (Plan tab, after the "+ Training day / template" row, before "Progression")
```
perRot[m] = Σ over main routines r: (1/|variants(r)|) × Σ over v in r, e in v:
            num(e.sets) × (tagsOf(e).mg===m ? 1 : tagsOf(e).mg2.includes(m) ? 0.5 : 0)
weekly[m] = perRot[m] × targetFreqOf() / N
status    = excluded ? "by choice" : weekly<9 ? "low" : weekly>16 ? "high" : "ok"
```
Header: eyebrow "Plan balance", right side button `data-act="freq"` "at 3.5 a week".
Rows (one per non-excluded `MUSCLES` entry, plan order): name · bar with the 9–16 band shaded
· value `fmt(round(weekly,1))`; "low"/"high" values in bad ink. Excluded: "Calves — by
choice". Footer: "Sets a week from the plan, helpers ½. The pump day isn't counted — it's extra."
`freq` sheet: options 2, 2.5 … 6 and "Auto (from your log: X)" → writes `targetFreq`.
No row is added to the Plan exercise rows (trap 16).

### (e) S1 suggestions as one-tap rows on the balance card
Shown under the rows, each only while it still applies (detected by name in the day's
variants, `normName`), titled "Suggested additions" with one button each:

| id | Button text | Applies to | Change, in **every variant** of the routine with that `key` |
|---|---|---|---|
| `abs` | "+ Cable Crunch on B and C (abs)" | keys B, C | append `newPlanEx("Cable Crunch")` with `sets 3, reps 10, repTop 15, link false` unless present |
| `tri` | "+ Overhead Cable Tricep Extension on B" | key B | append `newPlanEx("Overhead Cable Tricep Extension")` `3, 10, 15` unless present |
| `side` | "Lateral Raise 3 → 4 sets on B" | key B | the row named "Lateral Raise": `sets = 4` if `< 4` |
| `quad` | "+ Leg Extension on C" | key C | append `newPlanEx("Leg Extension")` `3, 10, 15` unless present |
| `rdl` | "Run RDL as top set + back-offs" | any | every row matching `/\brdl\b|romanian/i` with `scheme!=="topback"` → `"topback"` |
| `pump` | "Add the optional Pump day" | — | §6 seed |

After appending, `pairNew(v)`: if the variant's last two rows were both added by S1 (ids
recorded in this apply/earlier applies' undo records) and the last is unlinked, set
`link:true` on the last (B ends "… Overhead Cable Tricep Extension + Cable Crunch", C "… Leg
Extension + Cable Crunch", whichever was tapped first). A missing B or C routine → that
button is not shown. Apply (`planSuggestApply(id)`): refuse while `S.active`; if
`!S.planBackup`, set `S.planBackup = {ts, rest: S.settings.rest, routines: deep copy, kind:"v2-additions"}`
(never overwrite an existing backup); record a per-variant `coachDiff` and offer
`toastUndo("Added …", coachUndoOps(diffs))`; `writeNow()`; `viewPlan()`.
`planSettingsHtml()`: when `S.planBackup.kind==="v2-additions"`, the text reads "Before the
2.0 additions (date). Switching back restores that plan; logged sessions are never touched."
instead of "On the recommended plan".

### (f) Coach volume rule
`coachRuleVolume`: skip `excludedMuscles`; return `[]` when a week has an unlogged session;
otherwise unchanged (calendar weeks; `COACH_MIN_WEEKLY` 6). Re-run `t39` and `t39b` because
heads are thinner than "delts".

### Invariants
- For any session, Σ credited sets over all muscles is unchanged by the migration.
- Every `MUSCLES` key used by `MG_GUESS` exists; `isMuscle("delts")===false`.

### Tests — `t51-muscles.mjs`
1. Guess table: Lateral Raise→side, Front Raise→front, Rear Delt Fly / Reverse Pec Deck / Face
   Pull→rear, Seated DB Shoulder Press→front+triceps, Incline DB Press→chest+triceps+front,
   Pec Deck→chest+front, Cable Wrist Curl→forearms, Cable Crunch / Pallof Press→core,
   Chest-Supported Row→back+biceps, Incline Machine Press→chest, all 14 pump/S1 names.
2. Real-log gate (owner's export, run locally by `tools/review/tags.mjs`, outputs outside the
   repo): for each of the 18 lifts, old tags → new tags, and Σ credited sets per lift before
   = after.
3. Rotation card (UI): seeded A/B/C with a pump session, a freestyle session, an unlogged B
   and a deload week inside the last 9 sessions → numbers equal a hand calculation in the test.
4. Balance card: a scripted plan (two variants on A) → each row equals the formula; band
   colours; calves "by choice"; `freq` sheet changes the numbers.
5. S1 buttons (UI): each applies in both variants of B/C, creates rows via `newPlanEx` (have
   `scheme`, `pins`, `added`), superset pairing as specified, Undo restores exact rows,
   `planBackup.kind==="v2-additions"`, an existing planBackup is not overwritten, refused
   mid-workout; buttons vanish once applied.
6. Weekly card never lists calves in "Nothing for …".

---------------------------------------------------------------------------------------

## 5. M4 — blocks

### Data
`S.block = {num, startSessId, startTs, rotation, history[]}` (normalize, §1).
`history[]` entry (one per closed block, newest last, cap 40):
`{num, startTs, endTs, slots, logged, lifts:[{name, w0, r0, w1, r1, pct, verdict, n}],
override:{changed, judged}, balance:{low:[[m,weekly]], high:[[m,weekly]]}, flat:[names],
stallId, choice: null|"next"|"deload"|"none"}`.
`rotation` is a cache written at each commit, never read for decisions.

### Counting
```
mainIds = S.routines.filter(r => !r.optional).map(r => r.id); N = mainIds.length (≥1)
anchorTs = ts of S.sessions.find(s => s.id===S.block.startSessId) || S.block.startTs
slots = S.sessions.filter(s => s.ts > anchorTs && mainIds.includes(s.routineId) && !s.deload).length
rotation k = Math.min(R, Math.floor(slots / N) + 1),  R = settings.blockRotations
```
- A/B/C need not each appear once: a rotation is any N main-day sessions (the day picks allow
  out-of-order days; a repeated day is still training).
- Week variants: irrelevant (Day A week 1 and week 2 both count as A).
- Pump day, freestyle: don't count. Unlogged: count. Deload sessions: don't count (a deload
  rotation sits between blocks).

### Today
Under V2, the idle eyebrow becomes `"Tuesday, Nov 11 · Rotation 4 of 6"` (no new line, so
Start does not move). While the last history entry has `choice===null` and is < 10 days old:
`" · Block 1 done"` and the scorecard card renders under the day card (before `coachCard()`).

### Close (`blockAfterSession()`, called from `commitSession()` right after
`S.sessions.unshift(a)` and before `coachMeasure/coachRun`; also from the sim hook)
```
if (!V2()) return;  S.block.rotation = k;
if (slots < R*N) return;
var card = blockScorecard(anchorTs, now);           // definitions below
card.flat = card.lifts.filter(l => l.verdict!=="up" && l.n>=4).map(l => l.name);
card.stallId = blockStall(card);                     // ≤ 1 proposal
S.block.history.push(card);
S.block = {num:S.block.num+1, startSessId:a.id, startTs:a.ts, rotation:1, history:S.block.history};
```
After 10 days without a tap, the entry's `choice` becomes `"none"` (set lazily in `todayIdle`).

### Scorecard — every number's definition
Block window = sessions with `anchorTs < ts <= endTs` (`endTs` = the closing session's ts).
- **slots** as above; **logged** = slots that are not unlogged.
- **Per lift**, for each unique lift name in main routines (`eachPlanEx`, skipping optional
  routines), `E = exWorkingP(name, row)` within the window, oldest first, `n = E.length`
  (`n<2` → shown as "—", not judged):
  `w0 = workLoad(E[0].sets,bw)`, `r0 = repsAt(E[0],w0,bw,true)`; `w1`,`r1` likewise for `E[n-1]`;
  `verdict = heavierLoad(w1,w0,bw) ? "up" : heavierLoad(w0,w1,bw) ? "down" : (r1>r0 ? "up" : "flat")`;
  `pct = round((trendScore(E[n-1]) / trendScore(E[0]) − 1) × 100)`.
  Text: `RDL  225×8 → 235×7  +2%` (chip good/flat).
- **Override rate**: over window exposures with `presc` present, `presc.w!==""`, `kind!=="new"`,
  session not `easeBack`: `judged` = count; `changed` = those whose `workLoad` (topback: top
  set load) `!== num(presc.w)`. Text: "You changed the weight on 4 of 31 lifts (13%)."
  Usual-chip taps count as changes.
- **Muscle balance**: `tot = setsByMuscleIn(window sessions, !deload)`;
  `weekly[m] = tot[m] × targetFreqOf() / logged`; low = non-excluded `< 9`, high `> 16`.
  Text: "Every muscle 9–16 a week" or "Under 9 a week: Abs 7.0 · Rear delts 8.2".
- **Buttons**: `data-act="block-next"` "Start block 2" (choice "next"),
  `data-act="block-deload"` "Deload rotation" (choice "deload"; `startDeloadWeek(clamp(round(7×N/targetFreqOf()),5,10))`).
  If `stallId` names an open proposal, it is rendered inside the scorecard with
  `coachCardHtml(p,true)` (its options are the swap / range / set choices, handled by the
  existing `data-co` path) and `coachCard()` skips that id while the scorecard shows.

### Two-block stall rule (`blockStall(card)`)
Under V2, `coachRun` no longer calls `coachRuleStall`. At block close:
```
prev = S.block.history[S.block.history.length-1]  // the block before this one (may be absent)
cands = card.flat ∩ (prev ? prev.flat : [])        // flat (or down) in BOTH blocks, ≥4 exposures each
pick  = the candidate with the lowest card pct (ties: plan order)
if none → return null
build the proposal with the existing ladder, refactored out of coachRuleStall into
coachStallOpts(name) → {stage, opts, why}   // rung 1: +1 set / range −2 / unpair; rung 2 swap
reason: name+" was flat for two blocks: "+prevLift.w0+"×"+prevLift.r0+" at the start of block "+(n-1)+
        ", "+lift.w1+"×"+lift.r1+" at the end of block "+n+"."
p = coachMk({kind:"stall", key:"stall|"+normName(name), ...}); p.stage = stage
return coachRaise(p) ? p.id : null                 // open cap and cooldowns still apply
```
**Spam bound:** at most one stall card per block close; at 3.5 sessions/week a block closes
~every 5.1 weeks → ≤ 10.2 stall cards/yr even before cooldowns (`COACH_COOL` 42/126/365 days
per lift), plus the unchanged 14-day rules. Lifts in only one week variant get ~3 exposures a
block and are not judged (`n≥4`); say so in the scorecard ("judged on 4+ sessions").

### Invariants
- Slots never decrease except by deleting sessions; a deleted anchor falls back to `startTs`.
- No scorecard while `!V2()`; no plan change without a tap.

### Tests
- `t52-blocks.mjs` (UI): scripted 18 main sessions incl. 2 variants, a pump session, a freestyle,
  an unlogged and a deload week → eyebrow reads Rotation 1…6 at the right sessions; after the
  18th the scorecard appears; every number equals a hand calculation written in the test
  (two lifts up, one flat, one with 1 exposure "—", override 4/30, abs low); Start block 2 →
  rotation 1; Deload rotation → `deloadUntil` set by the formula; a lift flat in blocks 1 and 2
  → one stall card inside the scorecard with rung-1 options, accept/undo work through `data-co`;
  flat only once → none; `v2:false` → no line, no card, `coachRuleStall` still runs.
- `t39b-coach-spam.mjs`: add V2 runs (sim hook calls `blockAfterSession()` then
  `coachMeasure(); coachRun(false)`), healthy lifter, both "keep" and "accept": **total cards
  ≤ 12 per year** (gate), stall cards ≤ blocks closed; print per-kind counts.

---------------------------------------------------------------------------------------

## 6. S2 — the pump day

### Data
A routine `{id, key:"P", name:"Pump day", optional:true, variants:[v1, v2]}` built only by
`pumpSeed()` (balance-card suggestion `pump`), rows via `newPlanEx(name)` then overriding
`sets/reps/repTop/link` (like `recPlanEx`). Appended at the end of `S.routines`.

| Variant label | Row | sets × range | link |
|---|---|---|---|
| "Arms & delts" | Overhead Cable Tricep Extension | 3 × 15–20 | – |
| | Bayesian Cable Curl | 3 × 15–20 | ✓ |
| | Cable Lateral Raise | 3 × 15–20 | – |
| | Reverse Pec Deck | 3 × 15–20 | ✓ |
| | Rope Hammer Curl | 3 × 15–20 | – |
| | Cross-Body Tricep Pushdown | 3 × 15–20 | ✓ |
| | Cable Wrist Curl | 3 × 15–20 | – |
| | Cable Shrug | 3 × 15–20 | ✓ |
| "Chest, back & core" | Incline Machine Press | 3 × 12–16 | – |
| | Neutral-Grip Lat Pulldown | 3 × 12–16 | ✓ |
| | Pec Deck | 3 × 15–20 | – |
| | Chest-Supported Row | 3 × 12–16 | ✓ |
| | Cable Crunch | 3 × 15–20 | – |
| | Pallof Press | 3 × 15–20 | ✓ |

(Reading of "12–16 / 15–20": compound-pattern rows 12–16, isolation rows 15–20.) A lift that
also sits on B/C at another range (Overhead Cable Tricep Extension, Cable Crunch) shares one
history and `rangeHist()` keeps each range's exposures apart (v26.1).

### Exclusions (by function)
- `nextRoutine()`: `mains = S.routines.filter(r=>!r.optional)`; `last = S.sessions.find(s =>
  s.routineId && !isOptional(s.routineId))` (an unknown routine id counts as main, as today);
  returns `mains[(i+1)%mains.length]`, `mains[0]` when unknown/none, `null` when `!mains.length`.
- Block slots, `targetFreqOf`, balance card: main routines only.
- `coachRuleSkipped`: skip `r.optional`. `coachRuleLong`, `coachRuleVolume`, volume cards,
  PRs, trends, frequency: count it.
- `nextVariantIx()`: unchanged (the pump day alternates its two menus by itself).

### Today
No change to the hero (it is `nextRoutine()`, never the pump day). The existing `.daypicks`
loop already lists every routine and variant; optional routines render after the main days
and before Freestyle: `P Pump day · Arms & delts`, `P Pump day · Chest, back & core`. Start
stays first on screen (journey 1 asserts it).
Plan tab: the day card shows a `chip tag` "OPTIONAL" after the name; editable like any day.

### Tests (in `t52-blocks.mjs`)
Seed → tap the balance-card "Add the optional Pump day" → routine with the 14 rows above,
`optional:true`, muscles per §4a; Today: hero still Day B after a pump session; skipped-lift
rule never names a pump lift; blocks don't count it; weekly sets do.

---------------------------------------------------------------------------------------

## 7. S3 warm-ups and S4 hit targets

### S3 — generated warm-ups (engine package, `makeSessionEx`, V2)
Eligible: `bwMode===0 && metric===0 && movementClass(name) !== "iso"`, prefill `W>0`, and
the last session carried **no** warm-up sets (otherwise today's behaviour: carry them).
Ramp `[{f:0.5, r:8}, {f:0.75, r:4}]`; each load `x = W×f` snapped down (pins: largest pin ≤ x;
else `floor(x/step)×step`; barbell: at least the bar); drop loads `≤0` or `≥W`; drop
duplicates. Only when `W >= 4×step` (pins: `W >= p[2]`). Rows are
`{w, r, warm:true, done:false}` before the working sets, one tap each to tick; undone ones
vanish at save (existing). Test (t48): RDL 225 → warm 110×8, 165×4; DB curl (iso) → none;
carried warm-ups → carried; 20 lb → none.

### S4 — hit targets (session-screen package)
- `.exnote-add`, `.callout .revert` (incl. `.usual`), `.offbook`: `min-height:44px;
  display:inline-flex; align-items:center`; the chips keep the row height with
  `margin:-9px 0`.
- Outer steppers (weight `−`, reps `+`): `@media (min-width:380px){ .set .grp:nth-of-type(1)
  button:first-child, .set .grp:nth-of-type(2) button:last-child { width:44px } }`. Inner
  steppers and the 5 px dead strip on "×" untouched (trap 23). Assert at 390 and 380: every
  set input ≥ 52 px wide and the `elementFromPoint` dead-strip probe passes; else raise the
  breakpoint. At 320 nothing changes (`t21` overflow asserts).
- Warm-up flip on a ticked set: the `warm` branch returns early with `toast("Untick the set
  first")` when `st.done`.
- Journeys touch audit at 390: the four controls above report ≥ 44 px.

---------------------------------------------------------------------------------------

## 8. Work packages

Prerequisite: the M5 split (ledger #1) has landed; every package then edits the
`js/NN-*.js` file that holds its functions. **Function ownership is exclusive**: a package
edits only the functions it owns; calls into another package's functions go through the
contracts listed. New `data-act`s get the owning package's own listener.

| Pkg | Contents | Owns (edits) | Depends on | Merge order |
|---|---|---|---|---|
| **A Schema** | §1, §4a (`MUSCLES`, `MG_GUESS`, `retagDelts`), `V2()`, settings rows | `defaultState`, `normalize`, `load`, `reloadLog`, `newPlanEx`, `planExFromSession`, `MUSCLES`, `MG_GUESS`, new `retagDelts`, `deltFallback`, `cleanPins`, `V2`, `v5Kept`, `restoreV5`, `viewSettings`; new Settings listener (`restore-v5`, `v2`) | split | 1 |
| **B Engine** | §2 (a–e), §3b/§3d engine halves (`usualOf`, `easeBack` in `exWorking`, `presc`), S3, shadow engine deletion, sim/t43/replay | `prescribe`, `rangeHist`, `droppedSets`, `exSessions`, `exWorking`, `trendAt`, `sinceChosenDrop`, `repOutApplies`, `makeSessionEx`, `planExMenu`, `coachStartW`, deletes `shadowPrescribe`, `repOutOf`, `OUT_JUMP2`; new `schemeOf`, `pinsOf`, `pinUp/Down`, `nearestPin`, `harderEx`, `lighterEx`, `easierEx`, `backOffW`, `harderPhraseEx`, `stepWeight`, `topSetOf`, `projectTop`, `exWorkingP`, `usualOf`; tests t32, t34§5, t35, t36, t41, t42 hook, t43*, yearsim, yearbase, stuckdiag, tools/review/* | A | 2 |
| **C Session screen** | §3a, §3b UI, §3d UI, S4, shadow UI deletion, journeys | `exerciseCard`, `todayActive`, first `#view` click listener (step, revert, warm, delete use-shadow/repout branches, new `usual`, `easeback` branches), `#view` input listener, new `cascadeW`, `fillUndone`, `paint`, `onUsual`, `onEaseBack`; CSS for `.set`, `.callout`, `.exnote*`; `tools/sprint/journeys.mjs`; t50 | A; B's contract (`stepWeight`, `backOffW`, `easierEx`, `schemeOf`, `ex.usual`, `role`) | 3 (after B) |
| **D Today & blocks** | §3c (off-book + readers), §5, §6 runtime | `todayIdle`, `nextRoutine`, `commitSession`, `sessionSheet`, `coachRun`, `coachRuleStall` (refactor → `coachStallOpts`), `coachRuleSkipped`, `coachDaySessions`, `coachMeasure`, `coachSummaryText`, `coachCard`; new `offBook`, `mainRoutines`, `isOptional`, `blockSlots`, `blockAfterSession`, `blockScorecard`, `blockStall`, `blockCardHtml`; new Today listener (`offbook`, `block-next`, `block-deload`); t52, t39b | A, B (`exWorkingP`, `presc`), E (`targetFreqOf`, `setsByMuscleIn`) | 5 (last) |
| **E Muscles & plan** | §4b–f, §6 seed, S1 | `setsByMuscle` (+ new `setsByMuscleIn`), `weeklySetsCard`, `viewProgress`, `sinceStartCard` (read `exWorkingP`), `viewPlan`, `planSettingsHtml`, `coachRuleVolume`; deletes `repOutScore`, `repOutCard`, `OUT_GATE_*`; new `targetFreqOf`, `planBalance`, `planBalanceCard`, `planSuggest*`, `pairNew`, `pumpSeed`; new Plan listener (`freq`, `plan-suggest`); t51 | A, B (`exWorkingP`) | 4 |

Contracts that cross packages (implement exactly these names/shapes):
`V2()`; `schemeOf(ex)`; `pinsOf(ex)`; `stepWeight(cur,d,ex)`; `backOffW(top,ex)`;
`easierEx(w,ex)`; `exWorkingP(name,ex)`; session-ex fields `scheme`, `backPct`, `pins`,
`presc{w,r}`, `usual{w,r,why,kind}|null`; set `role`; session `unlogged`, `easeBack`;
`targetFreqOf()`; `setsByMuscleIn(sessions)` → `{by, untagged}`; `mainRoutines()` (D) used by E
— **E defines a local `isMain(r) = !r.optional`** to avoid waiting on D.

### Acceptance per package
- **A:** t47 all green; t21/t39 updated asserts green; 28/28 existing suites green with
  `v2:false`; replay 102/102 identical (no engine change); on the phone: v5-backup key exists
  after first boot, export taken.
- **B:** t48, t49 green; t43 all invariants 0 violations in every mode incl. `pins`/`topback`,
  every mutant caught; t42, t28, t26, t30 green with `v2:false`; sim gates §2e 1–4 met at
  `base` and `three`; `yearbase` under-loaded ≤ 32%; replay diff written and every changed
  call explained, RDL expectation met.
- **C:** t50 green; journeys: 2c = 2 taps, 6 = 1 tap (with D merged), 1/2a/2b/3 unchanged;
  touch audit ≥ 44 px on the S4 controls; dead-strip probe passes; axe no new violations;
  DOM-identity checks in t50 pass; t21 320 px green.
- **D:** t52 green; t39b ≤ 12 cards/yr healthy (keep and accept) with V2; t39 green;
  nextRoutine unaffected by pump sessions (t24 green); off-book readers per §3c table each
  asserted in t50/t52.
- **E:** t51 green; with S1 applied on the owner's plan every non-excluded muscle reads 9–16
  on the balance card **or the shortfall is reported** (see flag below); t36 §4–5 green;
  Progress renders with no `repOutCard`.

Ownership note on tests: t50 §3 (off-book) belongs to **D** (move it into t52); journeys row
"6 trained, not logged" is added by C but only measured after D merges.

---------------------------------------------------------------------------------------

## 9. Flags — things in V2_PLAN that are wrong, risky or unimplementable as written

1. **The M3 band gate is not met by S1's own numbers.** S1 gives abs 6 sets per rotation;
   at 3.5 sessions/week that is 6×3.5/3 = **7.0 a week** (8.0 at 4/wk), under the 9 floor.
   "The rest unchanged at ~7.5–9" per rotation → 8.75 a week at 3.5 for the 7.5 ones; and §1
   itself counts **rear delts ~6 per rotation** (7.0/wk), which S1 leaves untouched. Either
   Cable Crunch goes to 4 sets on B and C (abs 8/rot → 9.3/wk) plus one rear-delt set, or the
   pump day is counted, or the gate becomes "inside the band or flagged". The card is built
   to show the truth either way; the owner should pick the fix.
2. **The review simulator is not on this branch** (`tools/review/sim.mjs`, `sim-page.js`,
   `metrics.mjs` live on `origin/review/independent`, commit `8b0f0cb`), and it has **no 3+/wk
   schedule** (`base` and `stated` = 2–3/wk only). The M1 gate's "both schedules" needs the
   `three` schedule defined in §2e; the 109 / 97 baselines must be re-measured in the same run.
   Its `perform()` assumes one weight per exposure, so `topback` can't be simulated without
   the edit in §2e. Replay and the 18-lift tag gate need the owner's export in the session.
3. **"Behind settings.v2"** doubles the engine's code paths until 2.0 final. Spec keeps old
   suites on `v2:false` and new ones on `v2:true`; the 2.0 "retire leftovers" step must delete
   the `!V2()` branches and re-baseline t26/t28/t30 (expected values in §2).
4. **Two-block stall rule on lifts in one week variant:** ~3 exposures per block, too few to
   judge; they are skipped (`n≥4`), so such lifts are never declared stalled by blocks.
5. **`topback` on light dumbbells is coarse:** −12% of 15 lb rounds to 10 (−33%). The UI
   offers it on any loaded lift; only RDL is planned for it.
6. **Override rate needs data §4 doesn't list:** the prescribed weight per exposure
   (`presc`). Rates exist only for sessions logged after this ships; the "37% → < 20%" gym
   gate compares against a figure computed differently (R1, from the real log).
7. **§4 "the migration only adds fields"** is not literally true for the delt re-tag (it
   rewrites `mg`/`mg2`); the raw v5 snapshot covers it. Restore re-migrates the snapshot and
   drops anything logged since (by design; the confirm says so).
8. **Ease-back and usual-load chips both touch the first session after a break**; ease-back
   sessions are excluded from progression (`exWorking`), so the usual chip never fires off an
   eased day — intended, but it means a genuinely weaker return is not seen by the engine
   until the next session.

---

## Commander's rulings on §9 (11 Nov)

1. **Volume band per muscle class.** Major muscles (chest, back, quads,
   hamstrings, side delts, biceps, triceps, front delts): 9–16 sets a week.
   Small muscles (abs, rear delts, forearms, traps): 6–12.
   - S1 also offers face pull 3 → 4 sets on A and C as an optional one-tap
     suggestion.
2. **Simulator gate.** The 2.0-a1 worker brings the review simulator onto the
   branch. The 3+/wk gate uses its `stated` schedule.
3. **Real-data gates** read the export from the commander's private scratch
   path. The export is never committed, and committed docs report aggregates
   only.
4. **No `settings.v2` runtime flag.** Alphas stay on the branch. Only 2.0-a1
   (no behaviour change) goes to `main` early, for the phone check. Behaviour
   changes reach `main` together at beta, with `S.planBackup` and the v5
   snapshot as the way back.
5. **Variant-only lifts** get a stall verdict only after ≥ 6 exposures across
   blocks. Otherwise the scorecard reports and does not judge.
6. **`presc`** (the prescribed load and reps snapshot per session exercise)
   is accepted, for the override-rate metric.
