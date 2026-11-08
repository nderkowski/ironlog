# Iron Log — what the evidence says about progression

Written Nov 2026 to decide what `prescribe()` should become. Compiled from
abstracts and summaries (full text read only for Plotkin 2022 and ACSM 2009),
so treat effect sizes as reported, not re-derived. Citations marked
*unverified* could not be traced to a DOI.

## Nick's log, for context

21 sessions, Jul–Nov 2026, 102 exercise-sessions:

- Each lift is trained about once every 9 days (A/B/C rotation).
- 48% of exercises are logged with every set exactly on the prescribed target,
  and 67% with identical reps on every set. The log mostly echoes the
  prescription back.
- Load jumps of 20–33% on isolation lifts (curl 25→30, split squat 20→25,
  raise 15→20) were completed at 8 reps. The sets had reserve the log never
  recorded.
- 28% of exercises had every set ticked within 5 s, i.e. logged after the fact.

## Summary

**No trial compares automatic progression algorithms for hypertrophy.** What
the evidence does establish:

- **Load progression and rep progression grow muscle about equally.** One RCT,
  Plotkin 2022.
- **Sets ended about 1–2 RIR grow muscle about as well as sets to failure.**
- **Weekly set volume matters.**

Everything else is mostly strength data on barbell lifts.

| Method | Evidence | Fit here |
|---|---|---|
| Linear (add load at target) | ACSM 2009 suggests +2–10% after beating the target by 1–2 reps in two consecutive sessions. It is "Category B" and rests on one source. | Coarse dumbbell and machine steps; two sessions is about 18 days at this frequency. |
| Double progression | **No direct trial.** A practitioner convention. Indirect support: Plotkin 2022 (rep vs load progression similar), Schoenfeld 2017 (load range barely matters near failure). | Computable, but under-progresses when logged reps are capped at the target, which is the core problem in this log. |
| RPE/RIR autoregulation | Zourdos 2016 (the RIR-based RPE scale). Small strength RCTs: Helms 2018, Graham & Cleather 2021. Hickmott 2022 meta-analysis: no significant 1RM difference. Almost no hypertrophy or machine data. | Needs ratings, and ratings are noisy (next row). |
| RIR accuracy | Halperin 2022: people underpredict reps left by ~1 rep, with high heterogeneity. Zourdos 2021: error ~5 reps when calling 5 RIR, ~2 reps at 1 RIR, worse with more reps per set. Little improvement with experience (Steele 2017; Remmert 2023 *unverified*; Refalo 2023 bench *unverified*). | Worst exactly where this log lives: 12–20 reps, far from failure. |
| APRE / last-set rep-out | Mann 2010 (RCT, n=23 athletes, 6 weeks, strength). Huang 2025 network meta-analysis ranked APRE first for 1RM. | The objective capacity signal this log lacks. Hypertrophy and 12–20-rep data: none. Rep-to-1RM equations are unreliable above ~10 reps (Reynolds 2006). |
| Velocity-based | Weakley 2021 (review); phone apps validated only on barbell lifts (Renner 2024). | Not feasible for dumbbells, cables or machines. |
| Proximity to failure | Robinson 2024: hypertrophy rises closer to failure, strength doesn't. Refalo 2023: failure vs non-failure trivial (ES 0.19). Refalo 2024: failure and 1–2 RIR gave equal quad growth. | **The most relevant result.** The log suggests many sets end at 4+ RIR. |
| Volume / adding sets | Schoenfeld 2017 and Pelland 2026: dose-response with diminishing returns; indirect sets ≈ 0.5. Enes 2024: progressive sets helped strength, with only a possible small hypertrophy benefit. | A separate lever from load. MEV/MRV landmarks are practitioner convention only. |
| Periodization | Moesgaard 2022: periodized vs not ES 0.13 (not significant); linear vs undulating ES 0.05. | Low priority. |
| Deload / plateau rules | Coleman 2024: a 1-week break gave no hypertrophy benefit. Bell 2023 is a Delphi study of coaches (expert opinion). **No validated plateau rule exists.** | Any stall rule is a heuristic; keep it conservative and label it. |

## What it implies for the algorithm

1. **Choosing load vs rep progression is low-stakes.** The rule's real job is
   to keep sets hard as you get stronger.
2. **For this lifter, the limit is effort and measurement, not the scheme.**
   A log capped at the target can't show the reps that would trigger a load
   increase.
3. **Measure capacity, don't infer it.** A last-set rep-out is more objective
   than RIR ratings. Its evidence is strength in barbell athletes, so for
   hypertrophy and machines it is plausible but untested. Validate it in
   shadow mode before it drives prescriptions.
4. **Size increments from the measured capacity, after one confirming
   session, not two.** Don't trust e1RM above ~10 reps. Isolation work at
   12–20 reps needs a rep-count rule, not a 1RM rule.
5. **Frequency isn't a growth problem once weekly volume is equated**
   (Pelland 2026). Weekly sets per muscle may be under the ≥10 that ACSM 2026
   associates with hypertrophy. That's a volume question, separate from
   progression.
6. **Any stall or deload rule is a heuristic.** Say so in the UI.
7. **Caveats on the whole evidence base:** small samples (n≈20–40), 6–12
   weeks, strength often standing in for hypertrophy, mostly barbell lower
   body and bench, almost nothing on dumbbells, cables or machines at 12–20
   reps.

## Citations

- Plotkin et al. 2022, *PeerJ* 10:e14142 — https://doi.org/10.7717/peerj.14142
- ACSM 2009, *Med Sci Sports Exerc* 41:687–708 — https://pubmed.ncbi.nlm.nih.gov/19204579/
- ACSM 2026 position stand, *Med Sci Sports Exerc*, doi 10.1249/mss.0000000000003897 — https://pmc.ncbi.nlm.nih.gov/articles/PMC12965823 (authorship not verified)
- Robinson et al. 2024, *Sports Med* 54:2209–2231 — https://doi.org/10.1007/s40279-024-02069-2
- Refalo et al. 2023, *Sports Med* 53:649–665 — https://doi.org/10.1007/s40279-022-01784-y
- Refalo et al. 2024, *J Sports Sci* 42:85–101 — https://pubmed.ncbi.nlm.nih.gov/38393985/
- Halperin et al. 2022, *Sports Med* 52:377–390 — https://pubmed.ncbi.nlm.nih.gov/34542869/
- Zourdos et al. 2021, *J Strength Cond Res* 35(2S):S158–S165 — https://pubmed.ncbi.nlm.nih.gov/30747900/
- Steele et al. 2017, *PeerJ* 5:e4105 — https://doi.org/10.7717/peerj.4105
- Zourdos et al. 2016, *J Strength Cond Res* 30:267–275 — https://openrepository.aut.ac.nz/items/efef3b25-6701-4fb5-bb82-55fcd2a26027/full
- Helms et al. 2018, *Front Physiol* 9:247 — https://doi.org/10.3389/fphys.2018.00247
- Graham & Cleather 2021, *J Strength Cond Res* 35:2451–2456 — https://research.stmarys.ac.uk/id/eprint/3067
- Hickmott et al. 2022, *Sports Med Open* — https://pubmed.ncbi.nlm.nih.gov/35038063/
- Huang et al. 2025, *J Exerc Sci Fit* 23(4):360–369 — https://doi.org/10.1016/j.jesf.2025.07.006
- Mann et al. 2010, *J Strength Cond Res* 24:1718–1723 — https://read.qxmd.com/read/20543732/
- Reynolds, Gordon & Robergs 2006, *J Strength Cond Res* 20:584–592 — https://www.unm.edu/~rrobergs/478RMStrengthPrediction.pdf
- Weakley et al. 2021, *Strength Cond J* 43(2):31–49 — https://doi.org/10.1519/SSC.0000000000000560
- Renner, Mitter & Baca 2024, *PLoS One* 19:e0313919 — https://doi.org/10.1371/journal.pone.0313919
- Schoenfeld, Ogborn & Krieger 2017, *J Sports Sci* 35:1073–1082 — https://pubmed.ncbi.nlm.nih.gov/27433992/
- Schoenfeld et al. 2017, *J Strength Cond Res* 31:3508–3523 — https://pubmed.ncbi.nlm.nih.gov/28834797/
- Pelland et al. 2026, *Sports Med* 56:481–505 — https://doi.org/10.1007/s40279-025-02344-w
- Enes et al. 2024, *Med Sci Sports Exerc* 56:553–563 — https://pubmed.ncbi.nlm.nih.gov/37796222/
- Moesgaard et al. 2022, *Sports Med* 52:1647–1666 — https://pubmed.ncbi.nlm.nih.gov/35044672/
- Coleman et al. 2024, *PeerJ* 12:e16777 — https://pubmed.ncbi.nlm.nih.gov/38274324/
- Bell et al. 2023, *Sports Med Open* — https://doi.org/10.1186/s40798-023-00633-0
- Remmert, Laurson & Zourdos 2023, *Perceptual and Motor Skills* — *unverified*
- Refalo et al. 2023, *J Strength Cond Res* (bench RIR accuracy) — *unverified*
