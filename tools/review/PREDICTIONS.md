# Dated predictions: his log on and around 3 January 2027

*Made 2026-11-08 by the independent review (`REVIEW.md`), from his real log up to 6 Nov 2026. His future export scores them.*

## How they were made

- **Engine:** the closed loop of `sim.mjs` / `predict.mjs` runs the real engine, E-classic (his live configuration, rep-out default off), for 9 weeks from 9 Nov 2026.
- **Lifters:** 400 simulated lifters calibrated to him (REVIEW §2.1).
- **What is read:** for each lift, the working load and the **minimum** reps at that load, at the exposure nearest 2027-01-03 (within ±14 days).
- **Intervals:** the 10th–90th percentile across lifters.

**Assumptions, any one of which voids a miss:**
- He loads what the app prescribes. Today he overrides the load 37% of the time.
- He trains about 1.4 sessions a week, as logged.
- He takes the last set of each ranged lift as a rep-out. The minimum reps usually come from that set.
- He stays on his current plan, not `REC_PLAN`.

## Main lifts

**v26 and v26.1 predict identically for all 8 main lifts.** The v26.1 change acts only on lifts planned at two ranges.

| Lift | Working load, lb (median, 80% interval) | Min reps at that load (median, 80% interval) | Most likely single outcome |
|---|---|---|---|
| Leg Press | 190 (190–195) | 10 (8–11) | 190 × 10 |
| Incline DB Press | 55 (55–55) | 9 (7–10) | 55 × 9 |
| Cable Row | 65 (65–70) | 9 (7–11) | 70 × 8 |
| Bulgarian Split Squat | 25 (25–25) | 8 (5–9) | 25 × 8 |
| DB Overhead Press | 45 (45–45) | 8 (6–9) | 45 × 8 |
| Lat Pulldown | 155 (155–155) | 10 (8–12) | 155 × 10 |
| RDL | 225 (225–225) | 5 (3–7) | 225 × 4 (the run-it-back hold, REVIEW §3.1-2) |
| DB Row | 65 (65–65) | 8 (6–10) | 65 × 8 |

**In plain terms:** eight weeks at his current frequency moves almost nothing. One step at most on Leg Press, Cable Row and Lat Pulldown, and the rest hold their load while reps climb or stall.

## Where the proposed change acts: lateral raise ("Lateral Riase")

| Row | v26 (current) | v26.1 (proposed) |
|---|---|---|
| Day A, 12–20 | 15 (15–15) × 12 (12–14) | 15 (15–15) × 14 (12–16) |
| Day B, 8–12 | 15 (15–20) × 10 (4–15) | **20 (15–20) × 6 (3–10)** |

**What changes.** Under v26.1, Day B reads its own last session (15×16 on 4 Nov), so it steps to 20. The model expects him to fall short there, after which failed-jump memory holds or steps back. Day A climbs reps unhindered.

## Scoring

**Unit of scoring:** each row, compared with his logged session nearest 2027-01-03.

**A row is a hit** when both are true:
- the working load is inside the load interval;
- the minimum reps at that load are inside the reps interval.

With 80% intervals, about 8 of 10 rows should hit if the model is right. Fewer than 5 of 10 hits, among sessions where he followed the prescribed load, would mean the lifter model is wrong for him.

**Rows to exclude:** any where he overrode the prescribed load. Such a row scores the model's assumption, not the engine.
