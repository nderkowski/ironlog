"""Aggregate the simulation (REVIEW.md §0.2 thresholds) into the §2 table.
Reads $REVIEW_OUT/sim/<variant>/<config>.jsonl. Bootstrap CIs over lifters.
Usage: python3 tools/review/analyze.py [variants=base,noisy,ticker,flat]"""
import json, os, sys, random, statistics as st

OUT = os.environ.get('REVIEW_OUT', '/tmp/ironlog-review-out')
MAIN = ['leg press', 'incline db press', 'cable row', 'bulgarian split squat', 'db overhead press', 'lat pulldown', 'rdl', 'db row']
VARS = sys.argv[1].split(',') if len(sys.argv) > 1 else ['base', 'noisy', 'ticker', 'flat']
ORDER = ['classic', 'repout', 'dp', 'lin', 'c-trend', 'c-jump', 'c-step', 'c-nodeload', 'r-jump', 'r-step', 'r-nodeload', 'r-echo']
PARENT = {'c-trend': 'classic', 'c-jump': 'classic', 'c-step': 'classic', 'c-nodeload': 'classic',
          'r-jump': 'repout', 'r-step': 'repout', 'r-nodeload': 'repout', 'r-echo': 'repout', 'classic': 'repout'}
rng = random.Random(7)

def load(v, c):
    f = os.path.join(OUT, 'sim', v, c + '.jsonl')
    if not os.path.exists(f): return None
    L = [json.loads(l) for l in open(f) if l.strip()]
    return {x['li']: x for x in L}

def boot_mean(xs, n=2000):
    if len(xs) < 2: return (float('nan'), float('nan'))
    v = sorted(sum(rng.choice(xs) for _ in xs) / len(xs) for _ in range(n))
    return v[int(.025 * n)], v[int(.975 * n) - 1]

def lifter_mean(x, key, lifts):
    v = [x['lifts'][k][key] for k in lifts if k in x['lifts'] and x['lifts'][k].get(key) is not None]
    return sum(v) / len(v) if v else None

def lift_years(D, key, lifts):
    return [x['lifts'][k][key] for x in D.values() for k in lifts if k in x['lifts'] and x['lifts'][k].get(key) is not None]

def pct(v, q):
    s = sorted(v); return s[min(len(s) - 1, int(q * len(s)))]

def summarize(D):
    xs = list(D.values())
    allk = sorted({k for x in xs for k in x['lifts']})
    S = {}
    S['M1'] = st.median(x['M1'] for x in xs)
    S['obs'] = st.median(x['obs'] for x in xs)
    S['M2'] = st.median(lifter_mean(x, 'progress', MAIN) for x in xs)
    ly = lift_years(D, 'stallWk', MAIN); S['M3'] = st.median(ly)
    gs = sorted(x['g'] for x in xs); cut = gs[max(0, len(gs) // 10 - 1)]
    slow = {k: x for k, x in D.items() if x['g'] <= cut}
    S['M3slow'] = st.median(lift_years(slow, 'stallWk', MAIN))
    S['M4a'] = st.median(lifter_mean(x, 'cuts', MAIN) for x in xs)
    S['M4a_all'] = st.median(lifter_mean(x, 'cuts', allk) for x in xs)
    dd = lift_years(D, 'drawdown', MAIN); S['M4b'] = st.median(dd); S['M4b90'] = pct(dd, .9)
    S['M5'] = st.median(lifter_mean(x, 'hit', MAIN) for x in xs)
    S['M6'] = st.median(lifter_mean(x, 'osc', allk) for x in xs)
    for key in ['spiral', 'hold8', 'stuck']:
        S[key] = sum(1 for v in lift_years(D, key, allk) if v) / len(lift_years(D, key, allk))
        S[key + '_main'] = sum(1 for v in lift_years(D, key, MAIN) if v) / len(lift_years(D, key, MAIN))
    S['deloads'] = st.mean(x['deloads'] for x in xs)
    return S

def passes(S, DP=None):
    f = {
        'M2': S['M2'] >= .5 and (DP is None or S['M2'] >= DP['M2'] - .05),
        'M3': S['M3'] <= 8 and S['M3slow'] <= 12,
        'M4a': S['M4a'] <= 3 and S['M4a_all'] <= 3,
        'M4b': S['M4b'] <= 15 and S['M4b90'] <= 25,
        'M5': .6 <= S['M5'] <= .9,
        'M6': S['M6'] <= 1,
        'M7': S['spiral'] <= .05,
        'M8': S['hold8'] <= .05,
        'M9': S['stuck'] <= .05,
    }
    return f

def paired(A, B, key='M1'):
    ks = sorted(set(A) & set(B))
    d = [A[k][key] - B[k][key] for k in ks]
    return sum(d) / len(d), boot_mean(d)

for v in VARS:
    D = {c: load(v, c) for c in ORDER}
    D = {c: x for c, x in D.items() if x}
    if not D: continue
    print(f'\n### Variant: {v}  (n lifters = {len(next(iter(D.values())))})\n')
    print('| config | M1 gain % (median) | ΔM1 vs DP, pp [95% CI] | obs e1RM %/yr | M2 progress | M3 stall wk (slow) | M4a cuts/yr (all lifts) | M4b drawdown % (p90) | M5 hit | M6 osc/yr | M7 spiral | M8 hold≥8 | M9 stuck | deload wks/yr | fails |')
    print('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|')
    SUM = {c: summarize(x) for c, x in D.items()}
    DP = SUM.get('dp')
    for c in ORDER:
        if c not in D: continue
        S = SUM[c]
        dv = '—'
        if 'dp' in D and c != 'dp':
            m, (lo, hi) = paired(D[c], D['dp']); dv = f'{m:+.2f} [{lo:+.2f}, {hi:+.2f}]'
        fl = passes(S, DP if c != 'dp' else None)
        fails = ','.join(k for k, ok in fl.items() if not ok) or 'none'
        print(f"| {c} | {S['M1']:.1f} | {dv} | {S['obs']:.1f} | {S['M2']:.0%} | {S['M3']:.1f} ({S['M3slow']:.1f}) | {S['M4a']:.2f} ({S['M4a_all']:.2f}) | {S['M4b']:.1f} ({S['M4b90']:.1f}) | {S['M5']:.0%} | {S['M6']:.2f} | {S['spiral']:.1%} | {S['hold8']:.1%} | {S['stuck']:.1%} | {S['deloads']:.2f} | {fails} |")
    print('\nAblations: each rule vs its engine with the rule on (paired, same lifters). Δ = with rule − without.\n')
    print('| rule switched off | engine | ΔM1 pp [95% CI] | Δ M3 stall wk | Δ M4a cuts | Δ M9 stuck | verdict |')
    print('|---|---|---|---|---|---|---|')
    names = {'c-trend': 'trend back-off', 'c-jump': 'failed-jump memory', 'c-step': 'step-down', 'c-nodeload': 'deload week',
             'r-jump': 'failed-jump memory', 'r-step': 'step-down', 'r-nodeload': 'deload week', 'r-echo': 'target-echo +1',
             'classic': 'rep-out method'}
    for c, par in PARENT.items():
        if c not in D or par not in D: continue
        m, (lo, hi) = paired(D[par], D[c])
        Sp, Sc = SUM[par], SUM[c]
        dst, dcu, dsk = Sp['M3'] - Sc['M3'], Sp['M4a_all'] - Sc['M4a_all'], Sp['stuck'] - Sc['stuck']
        helps = lo > 0 or (dst < -0.5 or dcu < -0.25 or dsk < -0.01) and m > -0.5
        print(f"| {names[c]} | {par} | {m:+.2f} [{lo:+.2f}, {hi:+.2f}] | {dst:+.1f} | {dcu:+.2f} | {dsk:+.1%} | {'justified' if helps else 'not shown to help'} |")
    # coach
    for c in ['classic', 'repout']:
        if c not in D: continue
        xs = [x for x in D[c].values() if x.get('coach')]
        if not xs: continue
        cards = [x['coach']['cards'] for x in xs]; st_ = sum(x['coach']['stall'] for x in xs); fp = sum(x['coach']['fp'] for x in xs)
        pl = [x['coach']['plateau'] for x in xs if x['coach']['plateau']]
        miss = sum(1 for p in pl if p['missed']); lat = [p['detectedDay'] - 140 for p in pl if p['detectedDay'] is not None]
        kinds = {}
        for x in xs:
            for k, n in x['coach']['kinds'].items(): kinds[k] = kinds.get(k, 0) + n
        print(f"\nCoach ({c}): cards/lifter-yr median {st.median(cards)} (p90 {pct(cards,.9)}); by kind {kinds}; "
              f"stall cards {st_}, false positives {fp} ({fp/max(1,st_):.0%}); injected plateaus {len(pl)}, missed within 16 wk {miss} ({miss/max(1,len(pl)):.0%}); "
              f"latency days median {st.median(lat) if lat else '—'}")

# ---------- §3: where the failure modes live (per lift, base variant) ----------
if 'base' in VARS:
    print('\n### Failure modes by lift (base variant; % of lifter-years with the event, cuts = mean per lift-year)\n')
    D = {c: load('base', c) for c in ['classic', 'repout', 'dp', 'lin']}
    D = {c: x for c, x in D.items() if x}
    lifts = sorted({k for x in D['classic'].values() for k in x['lifts']})
    print('| lift | ' + ' | '.join(f'{c} cuts / spiral / stuck / hold≥8' for c in D) + ' |')
    print('|---|' + '---|' * len(D))
    for k in lifts:
        row = []
        for c, x in D.items():
            ms = [v['lifts'][k] for v in x.values() if k in v['lifts'] and v['lifts'][k].get('cuts') is not None]
            if not ms: row.append('—'); continue
            row.append(f"{sum(m['cuts'] for m in ms)/len(ms):.1f} / {sum(1 for m in ms if m['spiral'])/len(ms):.0%} / "
                       f"{sum(1 for m in ms if m['stuck'])/len(ms):.0%} / {sum(1 for m in ms if m['hold8'])/len(ms):.0%}")
        print(f'| {k} | ' + ' | '.join(row) + ' |')
    # responder tertiles: does the engine's edge (or deficit) depend on how fast he adapts?
    print('\n### ΔM1 vs DP by responder tertile (base)\n')
    dp = D['dp']; gs = sorted(x['g'] for x in dp.values()); t1, t2 = gs[len(gs)//3], gs[2*len(gs)//3]
    for c in ['classic', 'repout', 'lin']:
        if c not in D: continue
        out = []
        for lo_, hi_, nm in [(0, t1, 'slow'), (t1, t2, 'median'), (t2, 9, 'fast')]:
            ks = [k for k, x in dp.items() if lo_ <= x['g'] < hi_ and k in D[c]]
            d = [D[c][k]['M1'] - dp[k]['M1'] for k in ks]
            m = sum(d)/len(d); lo, hi = boot_mean(d)
            out.append(f'{nm} {m:+.2f} [{lo:+.2f}, {hi:+.2f}]')
        print(f'- {c}: ' + '; '.join(out))
