#!/usr/bin/env python3
"""Interleaved A/B throughput comparison of harness binaries.

usage: compare.py ROUNDS SECONDS PATHS name=binary [name=binary ...]

The first binary is the baseline. Each round runs every binary once, back to back, so slow drift on
a shared machine hits all of them alike; the report gives each binary's median MIPS and the median
of the per-round ratios against the baseline.
"""
import json, statistics, subprocess, sys

rounds, seconds, paths = int(sys.argv[1]), sys.argv[2], sys.argv[3]
bins = [a.split("=", 1) for a in sys.argv[4:]]
data = {n: [] for n, _ in bins}
for r in range(rounds):
    for n, b in bins:
        out = subprocess.run([b, "bench", "--seconds", seconds, "--paths", paths], capture_output=True, text=True).stdout
        line = [l for l in out.splitlines() if l.startswith("RESULTS_JSON")][0]
        data[n].append(json.loads(line[len("RESULTS_JSON "):]))
keys = list(data[bins[0][0]][0].keys())
base = bins[0][0]
print(f"{'workload/path':16s} " + " ".join(f"{n:>10s}" for n, _ in bins) + "   " + " ".join(f"{n + '/' + base:>14s}" for n, _ in bins[1:]))
geo = {n: [] for n, _ in bins[1:]}
for k in keys:
    med = {n: statistics.median(d[k] for d in data[n]) for n, _ in bins}
    ratios = {n: statistics.median(data[n][i][k] / data[base][i][k] for i in range(rounds)) for n, _ in bins[1:]}
    for n in ratios: geo[n].append(ratios[n])
    print(f"{k:16s} " + " ".join(f"{med[n]:10.1f}" for n, _ in bins) + "   " + " ".join(f"{ratios[n]:14.3f}" for n, _ in bins[1:]))
for n, g in geo.items():
    gm = 1.0
    for x in g: gm *= x
    print(f"geometric mean of ratios, {n} vs {base}: {gm ** (1 / len(g)):.3f}")
print("RAW_JSON", json.dumps(data))
