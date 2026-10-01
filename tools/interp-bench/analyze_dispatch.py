#!/usr/bin/env python3
"""Summarise how Clang lowered the interpreter's dispatch.

Reads the assembly (-S output) of PPCInterpreterImpl.cpp and reports, per function:
size in instructions, indirect branches (br xN), jump tables referenced and their entry
counts, and the number of compare-and-branch instructions. A switch that became a jump
table shows up as an LJTI reference plus a table; one that became a compare chain shows
up as a long run of cmp/b.cond with no table.
"""
import re, sys, collections

asm = open(sys.argv[1], errors="replace").read().splitlines()

func_re = re.compile(r"^(_[A-Za-z0-9_$.]+):")
tables = {}            # label -> entry count
cur_label = None
for line in asm:
    m = re.match(r"^([lL]JTI\d+_\d+):", line)
    if m:
        cur_label = m.group(1); tables[cur_label] = 0; continue
    if cur_label:
        s = line.strip()
        if s.startswith((".long", ".word", ".byte", ".short", ".quad")):
            tables[cur_label] += len(s.split(None, 1)[1].split(","))
        elif s.startswith((".data_region", ".end_data_region", ".p2align", ".section")) or s == "":
            pass
        elif not s.startswith(("L", ";", ".")) or s.endswith(":"):
            cur_label = None

funcs = collections.OrderedDict()
name = None
for line in asm:
    m = func_re.match(line)
    if m and not m.group(1).startswith(("_LJTI", "_lJTI")):
        name = m.group(1); funcs[name] = {"insns": 0, "br": 0, "blr": 0, "cmp": 0, "bcond": 0, "tables": set(), "calls": 0}
        continue
    if name is None:
        continue
    s = line.strip()
    if not s or s.startswith((";", ".")) or re.match(r"^L[A-Za-z0-9_$.]+:", s):
        if "LJTI" in s and "@PAGE" in s:
            pass
        continue
    f = funcs[name]
    f["insns"] += 1
    op = s.split()[0]
    if op == "br": f["br"] += 1
    elif op == "blr": f["blr"] += 1
    elif op == "bl": f["calls"] += 1
    elif op in ("cmp", "cmn", "subs", "ccmp", "tst", "tbz", "tbnz", "cbz", "cbnz"): f["cmp"] += 1
    elif op.startswith("b."): f["bcond"] += 1
    for t in re.findall(r"([lL]JTI\d+_\d+)@PAGE", s):
        f["tables"].add(t)

import subprocess
def demangled(names):
    try:
        out = subprocess.run(["c++filt", "-_"], input="\n".join(names), capture_output=True, text=True).stdout.splitlines()
        return dict(zip(names, out))
    except Exception:
        return {n: n for n in names}

want = [n for n in funcs if "PPC" in n and (funcs[n]["insns"] >= 100 or funcs[n]["tables"])]
want.sort(key=lambda n: -funcs[n]["insns"])
dm = demangled(want)
print(f"{'function':90s} {'insns':>7s} {'br':>4s} {'tables':>6s} {'tbl-entries':>12s} {'cmp':>5s} {'b.cc':>5s}")
for n in want[:60]:
    f = funcs[n]
    ent = sorted((tables.get(t, 0) for t in f["tables"]), reverse=True)
    print(f"{dm.get(n, n)[:90]:90s} {f['insns']:7d} {f['br']:4d} {len(f['tables']):6d} {','.join(map(str, ent[:8])) or '-':>12s} {f['cmp']:5d} {f['bcond']:5d}")
print()
print(f"total functions: {len(funcs)}, total jump tables in TU: {len(tables)}")
big = sorted(((c, t) for t, c in tables.items()), reverse=True)[:15]
print("largest jump tables (entries):", [c for c, _ in big])
