"""Before/after for an engine change: the same configs and variants simulated
on two builds (two $REVIEW_OUT trees), same lifters (common random numbers).
Usage: python3 tools/review/compare.py <before_out> <after_out> [lift]"""
import json, os, sys, random, statistics as st

B, A = sys.argv[1], sys.argv[2]
LIFT = sys.argv[3] if len(sys.argv) > 3 else 'lateral riase'
MAIN = ['leg press', 'incline db press', 'cable row', 'bulgarian split squat', 'db overhead press', 'lat pulldown', 'rdl', 'db row']
rng = random.Random(3)

def load(root, v, c):
    f = os.path.join(root, 'sim', v, c + '.jsonl')
    return {x['li']: x for x in map(json.loads, open(f))} if os.path.exists(f) else None

def boot(d, n=2000):
    v = sorted(sum(rng.choice(d) for _ in d) / len(d) for _ in range(n)); return v[50], v[1949]

print('| variant | engine | ΔM1 after−before pp [95% CI] | M7 spiral (all lifts) before → after | cuts/lift-yr (all) before → after |'
      f' {LIFT}: cuts/yr, spiral, stuck before → after |')
print('|---|---|---|---|---|---|')
for v in ['base', 'noisy', 'ticker', 'flat']:
    for c in ['classic', 'repout']:
        b, a = load(B, v, c), load(A, v, c)
        if not b or not a: continue
        ks = sorted(set(a) & set(b)); d = [a[k]['M1'] - b[k]['M1'] for k in ks]
        def ly(D, key, lifts=None):
            return [x['lifts'][k].get(key) or 0 for x in D.values() for k in (lifts or x['lifts']) if k in x['lifts'] and x['lifts'][k].get('cuts') is not None]
        sp = lambda D: sum(1 for z in ly(D, 'spiral') if z) / len(ly(D, 'spiral'))
        cu = lambda D: sum(ly(D, 'cuts')) / len(ly(D, 'cuts'))
        L = lambda D, key: [x['lifts'][LIFT].get(key) or 0 for x in D.values() if LIFT in x['lifts'] and x['lifts'][LIFT].get('cuts') is not None]
        lc = lambda D: sum(L(D, 'cuts')) / len(L(D, 'cuts'))
        ls = lambda D, key: sum(1 for z in L(D, key) if z) / len(L(D, key))
        lo, hi = boot(d)
        print(f"| {v} | {c} | {sum(d)/len(d):+.2f} [{lo:+.2f}, {hi:+.2f}] | {sp(b):.1%} → {sp(a):.1%} | {cu(b):.2f} → {cu(a):.2f} | "
              f"{lc(b):.1f} → {lc(a):.1f}, {ls(b,'spiral'):.0%} → {ls(a,'spiral'):.0%}, {ls(b,'stuck'):.0%} → {ls(a,'stuck'):.0%} |")
