# Iron Log — the commercial question

Written 1 Aug 2026, at the point where the app works and does everything on
[ROADMAP.md](ROADMAP.md) through Slice 3. This is an honest assessment of what
it would take to sell it, what is already an asset, and what the real risks are.

Nothing here is committed to. Slice 4 is still the right *engineering* next
step; this is about whether it should be aimed at a market while it's built.

---

## Start with the uncomfortable part

**Fitness logging is one of the most saturated categories in mobile software.**
Strong, Hevy, Jefit, Boostcamp, FitNotes, Alpha Progression, RP Hypertrophy and
a hundred others already exist, several are very good, and the free tiers are
generous. Hevy in particular gives away most of what a logger needs.

So "a better lifting logger" is not a business. Being 20% nicer than Hevy earns
nothing, because nobody is looking for a logger — they already have one, and
switching means abandoning their history.

Two things follow, and they shape everything below:

- **The logger is table stakes, not the product.** It has to be excellent
  because it's the daily surface, but it is not why anyone would pay.
- **The wedge has to be something the incumbents structurally won't copy** —
  either because it conflicts with their business model, or because it serves a
  niche too small for them and large enough for one person.

## What is genuinely an asset here

Being specific, because vague optimism is how projects like this waste a year.

1. **The progression engine is the actual product.** `prescribe()` decides what
   to do today and says *why*, from history alone, with no counters to drift.
   Most loggers record; this one *coaches*. That is the pitch, and it's already
   built and working.
2. **Weekly sets per muscle with honest half-credit for helpers.** This is the
   core of what RP's Hypertrophy app charges around $35/month for. It's already
   here, and the half-set rule is more honest than the inflation most trackers
   ship.
3. **Deload detection.** Nobody in the mainstream does this automatically. It's
   opinionated, defensible, and the kind of thing an experienced lifter notices
   and tells other lifters about.
4. **Genuinely one-tap logging.** Sounds trivial. Isn't. It's the thing that
   decides whether people still use it in week six, and it survived a real
   Android bug being found and fixed rather than shrugged at.
5. **A credible privacy/no-BS position.** No accounts, no ads, no tracking, your
   data in a file you own. That is a marketing message, not just an
   architecture, and it is one the venture-funded incumbents cannot copy without
   damaging their own model.

## What is missing before money can change hands

In dependency order. Each is a gate, not a nice-to-have.

| Gate | Why it blocks payment | Rough size |
|---|---|---|
| **Accounts + sync** | Nobody pays for something that loses their log when the phone dies. This is Slice 4 and it is unavoidable. | Weeks |
| **A second device / platform** | iPhone users are roughly half the market and cannot currently be served well. | Weeks |
| **Store presence** | Web-only means no discovery. Android can ship the existing PWA via a Trusted Web Activity (Bubblewrap) — cheap. iOS realistically needs Capacitor or a rewrite. | Days (Android), weeks (iOS) |
| **Billing** | Stripe on web keeps ~97%; Play/App Store take 15–30% but are where the users are. | Days |
| **Support surface** | One email address and a changelog. Non-optional once strangers rely on it. | Ongoing |

**Everything above is infrastructure, not product.** None of it makes the app
better at lifting. That is exactly why it is worth being deliberate about
whether to start.

---

## Prioritised plan

### Phase 0 — find out if anyone wants it (cheapest, do this first)

Do **not** build accounts yet. Build nothing. The current PWA is already
shareable via a URL, works offline, and installs to a home screen.

1. Put it in front of 50–100 real lifters. r/weightroom, r/naturalbodybuilding
   and r/fitness have regular "what do you use" threads; a genuinely free,
   no-signup, no-ads tool is welcome there in a way a paid app is not.
2. Add the **only** telemetry that matters and make it opt-in and obvious:
   do people still log a workout in week 4? Retention is the single number that
   decides whether any of this is worth doing.
3. Ask the ten most active users one question: *what would you pay for?*

**Kill criterion, decided in advance:** if week-4 retention is under ~20%, the
product isn't ready and no amount of billing infrastructure fixes that. Ship
more of Slices 1–3's spirit instead, or stop. Setting this number now is what
stops sunk cost from making the decision later.

### Phase 1 — the one feature worth charging for

Assuming Phase 0 says go. Pick **one** and make it excellent:

- **Autoregulated programme generation.** The engine already decides the next
  set. Extend it to decide the next *block*: mesocycle structure, volume
  progression toward a landmark, planned deloads. This is RP's product at a
  fraction of the price, on top of a logger people already like.
- **Or: the honest analytics tier.** Per-muscle volume over time, fatigue
  proxies, stall prediction, exportable reports. Cheaper to build, easier to
  demo, weaker moat.

Recommendation: **the first.** It compounds what already exists and is the
hardest thing for a competitor to bolt on, because it depends on the engine
being trustworthy — which took real work to get right.

### The shortlist behind Phase 1

Ranked by *value per unit of work*, and filtered hard: every one of these makes
the engine smarter or removes a decision at the moment you're holding a bar.
Anything that only adds a screen has been left out.

**Tier 1 — build these next, in this order.**

1. **Volume landmarks per muscle (MEV / MAV / MRV).** You already count weekly
   sets. The next step is saying whether that count is below maintenance, in the
   productive range, or past recovery — and letting next week's set count follow
   from it. This is the entire loop RP charges for, you are most of the way
   there, and it turns a report into a decision. *Small, because the data
   already exists.*
2. **Automatic warm-up ramps.** You know today's working weight, the bar, and
   the plates in the user's gym. Generating "45×5, 95×5, 135×3, 185×1" is
   arithmetic you already do — and warm-ups already carry forward as a concept.
   Removes typing at exactly the moment attention is lowest. *Very small.*
3. **Readiness check-in.** One tap before a session: slept badly / sore / normal
   / great. Modulates the day's prescription the way RPE modulates the next
   one. RPE handles autoregulation *within* a session; this is the missing half
   *between* sessions, and it's a single question. *Small, high leverage.*
4. **Auto-regulated rest.** Rest longer after an RPE 9 set, shorter after a 7.
   The data is already collected and the timer already exists. *Tiny.*

**Tier 2 — real value, more work.**

5. **Mesocycle planning.** The Phase 1 headline: blocks with planned volume
   ramps and scheduled deloads, rather than reacting session to session. This is
   where "logger" fully becomes "coach". Depends on 1 for its volume targets.
6. **Stall-aware exercise rotation.** The app already knows which lifts have
   gone flat after a back-off. Suggesting a variation at that point is a small
   addition to a signal you already compute, and nobody mainstream does it.
7. **Pain / niggle flagging.** Mark a lift as painful; the engine backs it off,
   keeps it out of the deload maths, and proposes alternatives that hit the same
   muscle. Genuinely differentiating, and the muscle tags make the substitution
   possible. Everyone has felt this need; almost no app serves it.

**Tier 3 — nice, not differentiating.**

8. Strength standards ("your bench is X for your bodyweight").
9. Session density and duration trends — you already store start and end times.
10. Bodyweight tracking with a trend line, so the bodyweight-lift maths stops
    relying on one manually-updated number.

**Deliberately not on the list**, and worth recording so it doesn't get
relitigated: exercise demo videos, a social feed, an exercise database, food
and macro tracking, and wearable integrations. Each is a large ongoing
commitment, each is served better by an existing app, and none of them make the
progression engine better — which is the only thing here worth paying for.

### Phase 2 — infrastructure, only now

Accounts, sync, TWA to Play Store, billing. In that order. This is the boring
part and should be as small as it can possibly be: one table of users, one blob
of state per user, last-write-wins with a conflict warning. **Do not build a
real-time sync engine.** The data is tens of KB and one person edits it.

### Phase 3 — distribution

The hardest part, and the one most solo developers underestimate. Options that
actually work for a one-person fitness app:

- **Content, not ads.** Paid acquisition in fitness is brutally expensive; you
  cannot outbid MyFitnessPal. Writing honestly about *why* the progression rules
  are what they are attracts exactly the audience who would pay for them.
- **The privacy angle as a wedge.** "Your training log, in a file you own, no
  subscription, no ads" is a real position with a real audience in 2026.
- **Niche down harder than feels comfortable.** "Intermediate lifters running
  hypertrophy blocks who want autoregulation without a coach" is a better target
  than "people who lift".

---

## Pricing

Recommendation: **one-time purchase, around $15–25**, with sync included.

Reasoning, since this cuts against industry default:

- It matches the product's existing personality. "No ads, no subscription, your
  data is yours" is coherent, memorable, and something the incumbents can't say.
- Subscription churn management is a job. A solo developer does not want that
  job on top of building.
- The ongoing cost is a sync blob measured in kilobytes. That is nearly free to
  host, so a subscription would be hard to justify honestly.

The counter-argument, stated fairly: subscriptions make far more revenue per
user and are what investors and most successful fitness apps rely on. If the
goal is a real business rather than a profitable side project, revisit this. If
the goal is "a good app that pays for itself and some", one-time is right.

## Risks, plainly

- **The market is saturated and discovery is the binding constraint**, not
  product quality. Most well-built indie fitness apps fail here.
- **Sync makes you a data controller.** GDPR, deletion requests, breach
  liability. Real obligations that arrive with the first paying customer.
- **The no-server ethos is both the charm and the blocker.** Monetising it
  requires giving up the thing that makes it distinctive. Worth sitting with
  before starting — it may be that the right answer is to keep it free, keep it
  yours, and let it be excellent.
- **iOS is a genuine wall.** A PWA on iOS is a second-class citizen, and roughly
  half the addressable market is there.

## The honest recommendation

**Do Phase 0 and nothing else until it answers.** The app is good. Whether it is
a *business* is a question about distribution and retention, and both are
answerable in a few weeks for roughly zero cost, before committing to the months
of infrastructure that monetisation actually requires.

If Phase 0 comes back weak, that is not a failure. A tool that one person uses
every week and that beats every commercial option *for them* is already a
success — it just isn't a company.
