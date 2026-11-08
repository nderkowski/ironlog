"""Phase 1 metrics on the real log (R1-R5 of the pre-registration).
Reads $REVIEW_OUT/replay.json (made by replay.mjs). Prints aggregates only, so
the printout can go in REVIEW.md without copying the raw log.
Usage: python3 tools/review/reallog.py"""
import json, os, math, random, collections, statistics as st

OUT = os.environ.get('REVIEW_OUT', '/tmp/ironlog-review-out')
R = json.load(open(os.path.join(OUT, 'replay.json')))
rng = random.Random(1)

def wilson(k, n, z=1.96):
    if not n: return (float('nan'),) * 3
    p = k / n; d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return p, c - h, c + h

def boot(xs, f=st.mean, n=2000):
    if len(xs) < 2: return (float('nan'), float('nan'))
    v = sorted(f([rng.choice(xs) for _ in xs]) for _ in range(n))
    return v[int(.025 * n)], v[int(.975 * n) - 1]

def e1(w, r): return w * (1 + r / 30) if w and r else 0
def num(x):
    try: return float(x)
    except: return 0.0

by = collections.defaultdict(list)
for r in R: by[r['lift']].append(r)          # chronological already
MAIN = ['Leg Press', 'Incline DB Press', 'Cable Row', 'Bulgarian Split Squat', 'DB Overhead Press', 'Lat Pulldown', 'RDL', 'DB Row']

def pr(*a): print(*a)

# ---------- basic shape ----------
pr('exposures', len(R), 'lifts', len(by), 'sessions', len(set(r['sid'] for r in R)))
pr('sets flagged rep-out:', sum(s['out'] for r in R for s in r['done']['sets']),
   '| exposures with a recorded shadow:', sum(1 for r in R if r['saw']['shadow']))
ranged = [r for r in R if r['top'] > r['lo']]
pr('exposures on a rep range:', len(ranged))

# ---------- echo: logged reps exactly equal the target he was shown ----------
judged = [r for r in R if r['saw']['kind'] and r['done']['nAt']]
echo_all = [r for r in judged if all(s['r'] == r['saw']['targetReps'] for s in r['done']['sets'] if num(s['w']) == r['done']['W'])]
p, lo, hi = wilson(len(echo_all), len(judged))
pr(f'\nECHO: every set at W logged exactly at the shown target: {len(echo_all)}/{len(judged)} = {p:.0%} [{lo:.0%},{hi:.0%}]')
sets_at = [(s['r'], r['saw']['targetReps']) for r in judged for s in r['done']['sets'] if num(s['w']) == r['done']['W']]
eq = sum(1 for a, b in sets_at if a == b); pr(f'      sets at W equal to target: {eq}/{len(sets_at)} = {eq/len(sets_at):.0%}')

# ---------- R1 override ----------
pr('\nR1 OVERRIDES (rows after the first exposure of a lift)')
rows = [r for r in R if r['now']['p']['w'] != '' and r['done']['W']]
lo_ = [r for r in rows if num(r['now']['p']['w']) != r['done']['W']]
p, a, b = wilson(len(lo_), len(rows))
pr(f' load override vs replayed engine: {len(lo_)}/{len(rows)} = {p:.0%} [{a:.0%},{b:.0%}]')
heavier = sum(1 for r in lo_ if r['done']['W'] > num(r['now']['p']['w']))
pr(f'   of which heavier than prescribed: {heavier}, lighter: {len(lo_) - heavier}')
rep_rows = [r for r in judged]
ro = [r for r in rep_rows if r['done']['minAt'] != r['saw']['targetReps']]
p, a, b = wilson(len(ro), len(rep_rows))
pr(f' rep override vs shown target (min reps at W != target): {len(ro)}/{len(rep_rows)} = {p:.0%} [{a:.0%},{b:.0%}]')
pr('  by shown decision kind:   n  loadOvr(replay)  repOvr(shown)  hit')
for k in ['up', 'reps', 'hold', 'deload', 'new']:
    g = [r for r in judged if r['saw']['kind'] == k]
    if not g: continue
    gl = [r for r in g if r['now']['p']['w'] != '']
    lov = sum(1 for r in gl if num(r['now']['p']['w']) != r['done']['W'])
    rov = sum(1 for r in g if r['done']['minAt'] != r['saw']['targetReps'])
    hit = sum(1 for r in g if r['done']['minAt'] >= r['saw']['targetReps'])
    pr(f'   {k:7s} {len(g):3d}   {lov}/{len(gl)}            {rov}/{len(g)}         {hit}/{len(g)}')
pr('  by lift (main):          n  loadOvr  repOvr')
for L in MAIN:
    g = [r for r in by[L] if r['saw']['kind']]
    gl = [r for r in g if r['now']['p']['w'] != '']
    pr(f'   {L:22s} {len(g):2d}   {sum(1 for r in gl if num(r["now"]["p"]["w"]) != r["done"]["W"])}/{len(gl)}     '
       f'{sum(1 for r in g if r["done"]["minAt"] != r["saw"]["targetReps"])}/{len(g)}')

# ---------- shown 'up' decisions: did he take the step? ----------
# lastW is the first set's load last time (warm-up ramps included), so read the step from the
# previous exposure's working load instead.
ups = []
for L, v in by.items():
    for i in range(1, len(v)):
        if v[i]['saw']['kind'] == 'up':
            ups.append((v[i - 1]['done']['W'], v[i]['done']['W']))
took = sum(1 for a, b in ups if b > a); same = sum(1 for a, b in ups if b == a); less = sum(1 for a, b in ups if b < a)
pr(f'\n shown "add load": he went heavier {took}, same {same}, lighter {less} (n={len(ups)})')

# ---------- R2 hit rate ----------
hit = [r for r in judged if r['done']['minAt'] >= r['saw']['targetReps']]
p, a, b = wilson(len(hit), len(judged))
pr(f'\nR2 HIT RATE (every set at W >= shown target): {len(hit)}/{len(judged)} = {p:.0%} [{a:.0%},{b:.0%}]')
hitp = [r for r in judged if r['now']['p']['w'] != '' and r['done']['W'] == num(r['now']['p']['w'])]
h2 = [r for r in hitp if r['done']['minAt'] >= r['now']['p']['r']]
p, a, b = wilson(len(h2), len(hitp))
pr(f'   at the replayed load, vs replayed reps: {len(h2)}/{len(hitp)} = {p:.0%} [{a:.0%},{b:.0%}]')

# ---------- R3 response to each decision ----------
def progressed(a, b):
    if b['done']['W'] > a['done']['W']: return True
    if b['done']['W'] < a['done']['W']: return False
    ma = st.mean(s['r'] for s in a['done']['sets'] if num(s['w']) == a['done']['W'])
    mb = st.mean(s['r'] for s in b['done']['sets'] if num(s['w']) == b['done']['W'])
    return mb > ma
pr('\nR3 NEXT EXPOSURE PROGRESSED (load up, or same load and more mean reps), after the decision he was shown:')
resp = collections.defaultdict(list); allp = []
for L, v in by.items():
    for i in range(1, len(v) - 1):
        resp[v[i]['saw']['kind']].append(progressed(v[i], v[i + 1]))
    for i in range(1, len(v)):
        allp.append(progressed(v[i - 1], v[i]))
for k, xs in resp.items():
    p, a, b = wilson(sum(xs), len(xs)); pr(f'   after {k or "first":7s}: {sum(xs)}/{len(xs)} = {p:.0%} [{a:.0%},{b:.0%}]')
p, a, b = wilson(sum(allp), len(allp)); pr(f'   M2 on the real log, all exposures: {sum(allp)}/{len(allp)} = {p:.0%} [{a:.0%},{b:.0%}]')
pm = [progressed(v[i - 1], v[i]) for L in MAIN for v in [by[L]] for i in range(1, len(v))]
p, a, b = wilson(sum(pm), len(pm)); pr(f'   main lifts only: {sum(pm)}/{len(pm)} = {p:.0%} [{a:.0%},{b:.0%}]')

# ---------- longest stall and slope on the real log ----------
pr('\nREAL-LOG STRENGTH (main lifts): best e1RM at W, first 3 vs last 3 exposures; longest run without a new best')
gains = []
for L in MAIN:
    v = by[L]
    sc = [max(e1(r['done']['W'], s['r']) for s in r['done']['sets'] if num(s['w']) == r['done']['W']) for r in v]
    days = [(r['ts'] - v[0]['ts']) / 864e5 for r in v]
    best = 0; run = 0; longest = 0; t0 = days[0]
    for d, x in zip(days, sc):
        if x > best + 0.01: best = x; t0 = d
        longest = max(longest, d - t0)
    g = (st.mean(sc[-3:]) / st.mean(sc[:3]) - 1) * 100
    gains.append(g)
    # slope %/yr by OLS of e1RM on day
    mx, my = st.mean(days), st.mean(sc)
    sl = sum((x - mx) * (y - my) for x, y in zip(days, sc)) / sum((x - mx) ** 2 for x in days) / my * 36500
    pr(f'   {L:22s} n={len(v)}  first3 {st.mean(sc[:3]):6.1f}  last3 {st.mean(sc[-3:]):6.1f}  {g:+5.1f}%   OLS {sl:+6.0f}%/yr   longest no-new-best {longest/7:4.1f} wk')
pr(f'   median change first3->last3: {st.median(gains):+.1f}%  (span ~15 weeks)')

# ---------- R4 noise floor ----------
pr('\nR4 NOISE FLOOR (consecutive exposures at the same W)')
dr, de = [], []
for L, v in by.items():
    for i in range(1, len(v)):
        a, b = v[i - 1], v[i]
        if a['done']['W'] and a['done']['W'] == b['done']['W'] and a['top'] == b['top'] and a['lo'] == b['lo']:
            ma = st.mean(s['r'] for s in a['done']['sets'] if num(s['w']) == a['done']['W'])
            mb = st.mean(s['r'] for s in b['done']['sets'] if num(s['w']) == b['done']['W'])
            dr.append(mb - ma)
            ea = max(e1(a['done']['W'], s['r']) for s in a['done']['sets'] if num(s['w']) == a['done']['W'])
            eb = max(e1(b['done']['W'], s['r']) for s in b['done']['sets'] if num(s['w']) == b['done']['W'])
            de.append((eb / ea - 1) * 100)
def te(d): return st.stdev(d) / math.sqrt(2)
pr(f'   pairs n={len(dr)}; mean delta reps {st.mean(dr):+.2f}; SD(delta) {st.stdev(dr):.2f}')
t = te(dr); pr(f'   reps: TE = SD/sqrt2 = {t:.2f} reps; MDC95 = 1.96*sqrt2*TE = {1.96*math.sqrt(2)*t:.2f} reps')
lo_, hi_ = boot(dr, lambda x: st.stdev(x) / math.sqrt(2)); pr(f'         TE 95% CI [{lo_:.2f},{hi_:.2f}]')
t = te(de); pr(f'   e1RM: TE = {t:.2f}%; MDC95 = {1.96*math.sqrt(2)*t:.2f}%')
lo_, hi_ = boot(de, lambda x: st.stdev(x) / math.sqrt(2)); pr(f'         TE 95% CI [{lo_:.2f},{hi_:.2f}]%')
pr('   NB: no rep-outs, and he mostly stops at the target, so reps are censored from above: this TE UNDERSTATES'
   ' capacity noise, and the MDC95 is a lower bound. Rules flagged against it are flagged conservatively.')

# ---------- R5 forecast skill ----------
pr('\nR5 ROLLING-ORIGIN FORECAST of min reps at W, next exposure (only exposures done at the replayed load)')
E, N, NE = [], [], []
for L, v in by.items():
    for i in range(2, len(v)):
        r = v[i]; p = r['now']['p']
        if p['w'] == '' or r['done']['W'] != num(p['w']) or r['done']['minAt'] is None: continue
        y = r['done']['minAt']; prev = v[i - 1]
        E.append(abs(p['r'] - y))
        N.append(abs(prev['done']['minAt'] - y))
        # Epley-adjusted naive: last exposure's best e1RM at W, solved for reps at today's W
        ea = max(e1(prev['done']['W'], s['r']) for s in prev['done']['sets'] if num(s['w']) == prev['done']['W'])
        NE.append(abs(max(1, round(30 * (ea / r['done']['W'] - 1))) - y))
d = [a - b for a, b in zip(E, N)]; d2 = [a - b for a, b in zip(E, NE)]
pr(f'   n={len(E)}  MAE engine {st.mean(E):.2f}  naive(same as last) {st.mean(N):.2f}  naive(Epley-adjusted) {st.mean(NE):.2f}')
pr(f'   engine - naive: {st.mean(d):+.2f}  95% CI {tuple(round(x,2) for x in boot(d))}')
pr(f'   engine - Epley-naive: {st.mean(d2):+.2f}  95% CI {tuple(round(x,2) for x in boot(d2))}')
ex = sum(1 for a in E if a == 0); pr(f'   engine exact: {ex}/{len(E)} — but logged reps echo the target (see ECHO), so this is partly self-fulfilling')

# ---------- replay diff: what he saw vs what today's engine says ----------
pr('\nREPLAY DIFF (today\'s prescribe() vs the stored decision he saw), exposures after a lift\'s first')
cmp = [r for r in R if r['saw']['kind'] and r['now']['p']['kind'] != 'new']
dk = [r for r in cmp if r['saw']['kind'] != r['now']['p']['kind']]
dr_ = [r for r in cmp if r['saw']['targetReps'] != r['now']['p']['r']]
pr(f'   n={len(cmp)}; decision kind differs {len(dk)}, target reps differ {len(dr_)}, either {len(set(map(id, dk)) | set(map(id, dr_)))}')
early = [r for r in dk if r['date'] <= '2026-08-09']
pr(f'   of the kind changes, {len(early)} fall in the first 16 days (straight-set era / range set-up)')
for r in dk:
    if r['date'] > '2026-08-09':
        pr(f"     {r['date']} {r['lift']}: saw {r['saw']['kind']} {r['saw']['targetReps']} -> now {r['now']['p']['kind']} {r['now']['p']['w']}x{r['now']['p']['r']}")
