#!/usr/bin/env python3
"""Generate interpreter correctness vectors (vectors.inc).

Each vector is: an initial register/memory state, one PowerPC instruction word, and the state
expected afterwards. Expected values come from the small independent reference model below
(written from the PowerPC architecture description, not from the interpreter source), so a
disagreement means one of the two is wrong and has to be settled against the architecture.

The harness checks the *whole* visible state after each vector (all GPRs, CR, XER flags, LR,
CTR, every FPR, the instruction pointer and a window of data memory), so a stray write is a
failure too. Only the registers a vector names are given non-default values; everything else
is a fixed, distinctive background pattern.

Usage: gen_vectors.py > vectors.inc
"""
import struct, sys

M32 = 0xFFFFFFFF
def s32(x): x &= M32; return x - (1 << 32) if x & 0x80000000 else x
def f2b(f): return struct.unpack("<Q", struct.pack("<d", f))[0]
def b2f(b): return struct.unpack("<d", struct.pack("<Q", b))[0]
def sgl(f): return struct.unpack("<f", struct.pack("<f", f))[0]  # round a double to single precision

CODE = 0x100000        # vector i runs at CODE + i * 0x40
DATA = 0x20000         # data window base the vectors use
DATA_SIZE = 0x100

class State:
    def __init__(self):
        self.gpr = [0x01010101 * (i + 1) & M32 for i in range(32)]
        self.cr = 0x12345678
        self.ca = self.so = self.ov = 0
        self.lr = 0x0BADF00D & ~3
        self.ctr = 0x00C0FFEE
        self.f0 = [f2b(100.0 + i) for i in range(32)]   # ps0 of each FPR
        self.f1 = [f2b(200.0 + i) for i in range(32)]   # ps1 of each FPR
        self.mem = {}                                  # byte addr -> value (DATA window only)
        self.ip = 0
    def copy(self):
        n = State(); n.gpr = self.gpr[:]; n.cr = self.cr; n.ca = self.ca; n.so = self.so; n.ov = self.ov
        n.lr = self.lr; n.ctr = self.ctr; n.f0 = self.f0[:]; n.f1 = self.f1[:]; n.mem = dict(self.mem); n.ip = self.ip
        return n
    def rd(self, a, n):
        v = 0
        for i in range(n): v = (v << 8) | self.mem.get(a + i, 0)
        return v
    def wr(self, a, n, v):
        for i in range(n): self.mem[a + n - 1 - i] = (v >> (8 * i)) & 0xFF

def crbit(st, i): return (st.cr >> (31 - i)) & 1
def setcrbit(st, i, v):
    m = 1 << (31 - i); st.cr = (st.cr | m) if v else (st.cr & ~m & M32)
def setcrf(st, n, lt, gt, eq, so):
    sh = 28 - 4 * n
    st.cr = (st.cr & ~(0xF << sh) & M32) | (((lt << 3) | (gt << 2) | (eq << 1) | so) << sh)
def rc0(st, v):
    v = s32(v); setcrf(st, 0, v < 0, v > 0, v == 0, st.so)
def mask(mb, me):
    def bit(i): return 1 << (31 - i)
    if mb <= me:
        m = 0
        for i in range(mb, me + 1): m |= bit(i)
        return m
    m = M32
    for i in range(me + 1, mb): m &= ~bit(i)
    return m & M32
def rotl(v, n): n &= 31; return ((v << n) | (v >> (32 - n))) & M32 if n else v & M32

# ---------------------------------------------------------------- encoders
def D(op, rt, ra, imm): return (op << 26) | (rt << 21) | (ra << 16) | (imm & 0xFFFF)
def X(op, rt, ra, rb, xo, rc=0): return (op << 26) | (rt << 21) | (ra << 16) | (rb << 11) | (xo << 1) | rc
def M(op, rs, ra, sh, mb, me, rc=0): return (op << 26) | (rs << 21) | (ra << 16) | (sh << 11) | (mb << 6) | (me << 1) | rc
def A(op, frt, fra, frb, frc, xo, rc=0): return (op << 26) | (frt << 21) | (fra << 16) | (frb << 11) | (frc << 6) | (xo << 1) | rc
def SPRF(spr): return ((spr & 31) << 5) | (spr >> 5)

vectors = []
def vec(name, word, st, fn, extra_words=()):
    """Run `fn(state)` on a copy of st to get the expected result."""
    st.ip = CODE + len(vectors) * 0x40
    exp = st.copy(); fn(exp)
    if exp.ip == st.ip: exp.ip += 4          # straight-line instruction unless the model moved it
    vectors.append((name, [word] + list(extra_words), st, exp))

def base():
    return State()

def nextbase(): return CODE + len(vectors) * 0x40

def with_(**kw):
    st = base()
    for k, v in kw.items():
        if k.startswith("r") and k[1:].isdigit(): st.gpr[int(k[1:])] = v & M32
        elif k.startswith("f") and k[1:].isdigit(): st.f0[int(k[1:])] = f2b(v) if isinstance(v, float) else v
        elif k.startswith("g") and k[1:].isdigit(): st.f1[int(k[1:])] = f2b(v) if isinstance(v, float) else v
        else: setattr(st, k, v)
    return st

# ---------------------------------------------------------------- integer arithmetic
def ip4(st): pass

def add_like(name, xo, calc, oe=False, rc=False, a=0, b=0, ca_in=0, ca_used=False):
    # calc(a, b, ca) -> (result, carry_out or None, overflow or None)
    st = with_(r3=a, r4=b, ca=ca_in)
    def f(s):
        r, co, ov = calc(a & M32, b & M32, ca_in)
        s.gpr[5] = r & M32
        if co is not None: s.ca = co
        if oe:
            s.ov = ov; s.so |= ov
        if rc: rc0(s, r)
    vec(name, X(31, 5, 3, 4, xo | (0x200 if oe else 0), 1 if rc else 0), st, f)

def sov_add(a, b, r): return 1 if ((~(a ^ b)) & (a ^ r)) & 0x80000000 else 0
def c_add(a, b, ci=0): r = a + b + ci; return r & M32, r >> 32, sov_add(a, b, r & M32)
def c_addn(a, b, ci=0): return c_add(a, b, ci)

for nm, a, b in (("pos", 5, 7), ("carry", 0xFFFFFFFF, 1), ("ovf", 0x7FFFFFFF, 1), ("neg", 0x80000000, 0x80000000)):
    add_like(f"add_{nm}", 266, lambda a, b, c: (a + b, None, sov_add(a, b, (a + b) & M32)), a=a, b=b)
    add_like(f"add._{nm}", 266, lambda a, b, c: (a + b, None, 0), rc=True, a=a, b=b)
    add_like(f"addo_{nm}", 266, lambda a, b, c: (a + b, None, sov_add(a, b, (a + b) & M32)), oe=True, a=a, b=b)
    add_like(f"addc_{nm}", 10, lambda a, b, c: c_add(a, b), a=a, b=b)
    add_like(f"adde_{nm}_ci0", 138, lambda a, b, c: c_add(a, b, c), a=a, b=b, ca_in=0)
    add_like(f"adde_{nm}_ci1", 138, lambda a, b, c: c_add(a, b, c), a=a, b=b, ca_in=1)
    # subf rD = rB - rA ; subfc: carry out of ~rA + rB + 1
    add_like(f"subf_{nm}", 40, lambda a, b, c: (b - a, None, 0), a=a, b=b)
    add_like(f"subfo_{nm}", 40, lambda a, b, c: (b - a, None, 1 if ((a ^ b) & (b ^ ((b - a) & M32))) & 0x80000000 else 0), oe=True, a=a, b=b)
    add_like(f"subfc_{nm}", 8, lambda a, b, c: c_add((~a) & M32, b, 1), a=a, b=b)
    add_like(f"subfe_{nm}_ci0", 136, lambda a, b, c: c_add((~a) & M32, b, c), a=a, b=b, ca_in=0)
    add_like(f"subfe_{nm}_ci1", 136, lambda a, b, c: c_add((~a) & M32, b, c), a=a, b=b, ca_in=1)

# one-operand: neg, addze, addme, subfze, subfme (rA only)
def un_like(name, xo, calc, a, ca_in=0, oe=False, rc=False):
    st = with_(r3=a, ca=ca_in)
    def f(s):
        r, co, ov = calc(a & M32, ca_in)
        s.gpr[5] = r & M32
        if co is not None: s.ca = co
        if oe: s.ov = ov; s.so |= ov
        if rc: rc0(s, r)
    vec(name, X(31, 5, 3, 0, xo | (0x200 if oe else 0), 1 if rc else 0), st, f)
for a in (0, 1, 0x7FFFFFFF, 0x80000000, 0xFFFFFFFF):
    un_like(f"neg_{a:x}", 104, lambda a, c: ((-a) & M32, None, 1 if a == 0x80000000 else 0), a)
    un_like(f"nego_{a:x}", 104, lambda a, c: ((-a) & M32, None, 1 if a == 0x80000000 else 0), a, oe=True)
    un_like(f"neg._{a:x}", 104, lambda a, c: ((-a) & M32, None, 0), a, rc=True)
    for ci in (0, 1):
        un_like(f"addze_{a:x}_c{ci}", 202, lambda a, c: c_add(a, 0, c), a, ci)
        un_like(f"addme_{a:x}_c{ci}", 234, lambda a, c: c_add(a, M32, c), a, ci)
        un_like(f"subfze_{a:x}_c{ci}", 200, lambda a, c: c_add((~a) & M32, 0, c), a, ci)
        un_like(f"subfme_{a:x}_c{ci}", 232, lambda a, c: c_add((~a) & M32, M32, c), a, ci)

# multiply / divide
def sx(x): return s32(x)
for a, b in ((7, 6), (0xFFFFFFFF, 5), (0x80000000, 2), (0x12345678, 0x9ABCDEF0), (0x7FFFFFFF, 0x7FFFFFFF)):
    add_like(f"mullw_{a:x}_{b:x}", 235, lambda a, b, c: ((sx(a) * sx(b)) & M32, None, 0), a=a, b=b)
    add_like(f"mullw._{a:x}_{b:x}", 235, lambda a, b, c: ((sx(a) * sx(b)) & M32, None, 0), rc=True, a=a, b=b)
    add_like(f"mullwo_{a:x}_{b:x}", 235, lambda a, b, c: ((sx(a) * sx(b)) & M32, None, 0 if -(1 << 31) <= sx(a) * sx(b) < (1 << 31) else 1), oe=True, a=a, b=b)
    add_like(f"mulhw_{a:x}_{b:x}", 75, lambda a, b, c: (((sx(a) * sx(b)) >> 32) & M32, None, 0), a=a, b=b)
    add_like(f"mulhwu_{a:x}_{b:x}", 11, lambda a, b, c: (((a * b) >> 32) & M32, None, 0), a=a, b=b)
def sdiv(a, b):
    q = abs(sx(a)) // abs(sx(b))
    return -q if (sx(a) < 0) != (sx(b) < 0) else q
for a, b in ((100, 7), (0xFFFFFF9C, 7), (100, 0xFFFFFFF9), (0x80000000, 2), (7, 100), (0, 5)):
    add_like(f"divw_{a:x}_{b:x}", 491, lambda a, b, c: (sdiv(a, b) & M32, None, 0), a=a, b=b)
    add_like(f"divwu_{a:x}_{b:x}", 459, lambda a, b, c: ((a // b) & M32, None, 0), a=a, b=b)
    add_like(f"divw._{a:x}_{b:x}", 491, lambda a, b, c: (sdiv(a, b) & M32, None, 0), rc=True, a=a, b=b)

# immediate arithmetic
def simm(x): return x - 0x10000 if x & 0x8000 else x
for ra, imm in ((0, 5), (0, 0xFFFF), (3, 0x7FFF), (3, 0x8000)):
    st = with_(r3=0x7FFF8000)
    vec(f"addi_r{ra}_{imm:x}", D(14, 5, ra, imm), st, lambda s, ra=ra, imm=imm: s.gpr.__setitem__(5, ((s.gpr[ra] if ra else 0) + simm(imm)) & M32) or ip4(s))
    vec(f"addis_r{ra}_{imm:x}", D(15, 5, ra, imm), st, lambda s, ra=ra, imm=imm: s.gpr.__setitem__(5, ((s.gpr[ra] if ra else 0) + (simm(imm) << 16)) & M32) or ip4(s))
for a, imm in ((0xFFFFFFFF, 1), (5, 0xFFFF), (0x80000000, 0x8000)):
    st = with_(r3=a)
    def addic(s, a=a, imm=imm, rc=False):
        r, co, _ = c_add(a, simm(imm) & M32); s.gpr[5] = r; s.ca = co
        if rc: rc0(s, r)
    vec(f"addic_{a:x}_{imm:x}", D(12, 5, 3, imm), st, addic)
    vec(f"addic._{a:x}_{imm:x}", D(13, 5, 3, imm), st, lambda s, f=addic: f(s, rc=True))
    def subfic(s, a=a, imm=imm):
        r, co, _ = c_add((~a) & M32, simm(imm) & M32, 1); s.gpr[5] = r; s.ca = co
    vec(f"subfic_{a:x}_{imm:x}", D(8, 5, 3, imm), st, subfic)
for a, imm in ((6, 7), (0x10000, 0xFFFF), (0xFFFFFFFF, 2)):
    vec(f"mulli_{a:x}_{imm:x}", D(7, 5, 3, imm), with_(r3=a), lambda s, a=a, imm=imm: s.gpr.__setitem__(5, (sx(a) * simm(imm)) & M32))

# logical immediates (rS in rt slot, rA destination)
for nm, op, calc, rc in (("ori", 24, lambda a, i: a | i, 0), ("oris", 25, lambda a, i: a | (i << 16), 0),
                         ("xori", 26, lambda a, i: a ^ i, 0), ("xoris", 27, lambda a, i: a ^ (i << 16), 0),
                         ("andi.", 28, lambda a, i: a & i, 1), ("andis.", 29, lambda a, i: a & (i << 16), 1)):
    for a, i in ((0xF0F0F0F0, 0xFF00), (0xFFFFFFFF, 0x8001), (0, 0xFFFF)):
        def f(s, calc=calc, a=a, i=i, rc=rc):
            r = calc(a, i) & M32; s.gpr[5] = r
            if rc: rc0(s, r)
        vec(f"{nm}_{a:x}_{i:x}", D(op, 3, 5, i), with_(r3=a), f)

# register logical / shift: rS=r3, rA(dest)=r5, rB=r4
def lg(name, xo, calc, rc=False):
    for a, b in ((0xF0F0F0F0, 0x0FF00FF0), (0xFFFFFFFF, 0), (0x80000000, 0x7FFFFFFF)):
        def f(s, a=a, b=b):
            r = calc(a, b) & M32; s.gpr[5] = r
            if rc: rc0(s, r)
        vec(f"{name}{'.' if rc else ''}_{a:x}_{b:x}", X(31, 3, 5, 4, xo, 1 if rc else 0), with_(r3=a, r4=b), f)
for rc in (False, True):
    lg("and", 28, lambda a, b: a & b, rc); lg("or", 444, lambda a, b: a | b, rc); lg("xor", 316, lambda a, b: a ^ b, rc)
    lg("nand", 476, lambda a, b: ~(a & b), rc); lg("nor", 124, lambda a, b: ~(a | b), rc); lg("eqv", 284, lambda a, b: ~(a ^ b), rc)
    lg("andc", 60, lambda a, b: a & ~b, rc); lg("orc", 412, lambda a, b: a | ~b, rc)
def shl(a, b): n = b & 0x3F; return 0 if n >= 32 else (a << n) & M32
def shr(a, b): n = b & 0x3F; return 0 if n >= 32 else a >> n
for b in (0, 1, 31, 32, 33, 63, 0x41):
    lg_a = 0x80000001
    vec(f"slw_{b}", X(31, 3, 5, 4, 24), with_(r3=lg_a, r4=b), lambda s, b=b: s.gpr.__setitem__(5, shl(lg_a, b)))
    vec(f"srw_{b}", X(31, 3, 5, 4, 536), with_(r3=lg_a, r4=b), lambda s, b=b: s.gpr.__setitem__(5, shr(lg_a, b)))
    def sraw(s, b=b, a=lg_a):
        n = b & 0x3F
        if n >= 32: r = M32 if a & 0x80000000 else 0; ca = 1 if (a & 0x80000000) else 0
        else:
            r = (s32(a) >> n) & M32; ca = 1 if (a & 0x80000000) and (a & ((1 << n) - 1)) else 0
        s.gpr[5] = r; s.ca = ca
    vec(f"sraw_{b}", X(31, 3, 5, 4, 792), with_(r3=lg_a, r4=b), sraw)
for a in (0x80000001, 0x7FFFFFF0, 0xFFFFFFF0):
    for sh in (0, 1, 4, 31):
        def srawi(s, a=a, sh=sh):
            r = (s32(a) >> sh) & M32
            s.ca = 1 if (a & 0x80000000) and sh and (a & ((1 << sh) - 1)) else 0
            s.gpr[5] = r
        vec(f"srawi_{a:x}_{sh}", X(31, 3, 5, sh, 824), with_(r3=a), srawi)
def cntlz(a): return 32 if a == 0 else 32 - a.bit_length()
for a in (0, 1, 0x80000000, 0x00F00000, 0xFFFFFFFF):
    vec(f"cntlzw_{a:x}", X(31, 3, 5, 0, 26), with_(r3=a), lambda s, a=a: s.gpr.__setitem__(5, cntlz(a)))
for a in (0x7F, 0x80, 0x12345680, 0xFFFF8000, 0x00007FFF):
    vec(f"extsb_{a:x}", X(31, 3, 5, 0, 954), with_(r3=a), lambda s, a=a: s.gpr.__setitem__(5, (a & 0xFF) - 0x100 & M32 if a & 0x80 else a & 0xFF))
    vec(f"extsh_{a:x}", X(31, 3, 5, 0, 922), with_(r3=a), lambda s, a=a: s.gpr.__setitem__(5, ((a & 0xFFFF) - 0x10000) & M32 if a & 0x8000 else a & 0xFFFF))
    vec(f"extsh._{a:x}", X(31, 3, 5, 0, 922, 1), with_(r3=a), lambda s, a=a: (s.gpr.__setitem__(5, ((a & 0xFFFF) - 0x10000) & M32 if a & 0x8000 else a & 0xFFFF), rc0(s, s.gpr[5])))

# rotates
for a, sh, mb, me in ((0x12345678, 8, 0, 31), (0x12345678, 4, 24, 31), (0x80000001, 1, 0, 0), (0xF0000000, 28, 28, 3), (0xDEADBEEF, 0, 16, 23)):
    for rc in (0, 1):
        def rlwinm(s, a=a, sh=sh, mb=mb, me=me, rc=rc):
            r = rotl(a, sh) & mask(mb, me); s.gpr[5] = r
            if rc: rc0(s, r)
        vec(f"rlwinm{'.' if rc else ''}_{a:x}_{sh}_{mb}_{me}", M(21, 3, 5, sh, mb, me, rc), with_(r3=a), rlwinm)
    def rlwimi(s, a=a, sh=sh, mb=mb, me=me):
        m = mask(mb, me); s.gpr[5] = (rotl(a, sh) & m) | (0x55AA55AA & ~m & M32)
    vec(f"rlwimi_{a:x}_{sh}_{mb}_{me}", M(20, 3, 5, sh, mb, me), with_(r3=a, r5=0x55AA55AA), rlwimi)
    def rlwnm(s, a=a, sh=sh, mb=mb, me=me):
        s.gpr[5] = rotl(a, (sh + 32) & 31) & mask(mb, me)
    vec(f"rlwnm_{a:x}_{sh}_{mb}_{me}", M(23, 3, 5, 4, mb, me), with_(r3=a, r4=sh + 32), rlwnm)

# compares (crfD = 3 for signed, 6 for unsigned to exercise field indexing)
for a, b in ((5, 7), (7, 5), (7, 7), (0x80000000, 1), (1, 0x80000000), (0xFFFFFFFF, 0)):
    for so in (0, 1):
        def cmp_(s, a=a, b=b, unsigned=False):
            x, y = (a, b) if unsigned else (s32(a), s32(b))
            setcrf(s, 6 if unsigned else 3, x < y, x > y, x == y, s.so)
        vec(f"cmp_{a:x}_{b:x}_so{so}", X(31, 3 << 2, 3, 4, 0), with_(r3=a, r4=b, so=so), cmp_)
        vec(f"cmpl_{a:x}_{b:x}_so{so}", X(31, 6 << 2, 3, 4, 32), with_(r3=a, r4=b, so=so), lambda s, f=cmp_: f(s, unsigned=True))
for a, imm in ((5, 7), (0xFFFFFFFE, 0xFFFF), (0x80000000, 0x7FFF)):
    vec(f"cmpi_{a:x}_{imm:x}", D(11, 3 << 2, 3, imm), with_(r3=a), lambda s, a=a, imm=imm: setcrf(s, 3, s32(a) < simm(imm), s32(a) > simm(imm), s32(a) == simm(imm), s.so))
    vec(f"cmpli_{a:x}_{imm:x}", D(10, 6 << 2, 3, imm), with_(r3=a), lambda s, a=a, imm=imm: setcrf(s, 6, a < imm, a > imm, a == imm, s.so))

# ---------------------------------------------------------------- SPR / CR
vec("mflr", X(31, 5, 8, 0, 339), with_(lr=0x1234560), lambda s: s.gpr.__setitem__(5, 0x1234560))
vec("mfctr", X(31, 5, 9, 0, 339), with_(ctr=0xCAFE), lambda s: s.gpr.__setitem__(5, 0xCAFE))
vec("mtlr", X(31, 3, 8, 0, 467), with_(r3=0x4444444), lambda s: setattr(s, "lr", 0x4444444))
vec("mtctr", X(31, 3, 9, 0, 467), with_(r3=0x77), lambda s: setattr(s, "ctr", 0x77))
vec("mfcr", X(31, 5, 0, 0, 19), with_(cr=0xA5A5A5A5), lambda s: s.gpr.__setitem__(5, 0xA5A5A5A5))
for fxm in (0xFF, 0x80, 0x01, 0xA5):
    def mtcrf(s, fxm=fxm):
        m = 0
        for i in range(8):
            if fxm & (0x80 >> i): m |= 0xF << (28 - 4 * i)
        s.cr = (s.cr & ~m) | (0xDEADBEEF & m)
    vec(f"mtcrf_{fxm:x}", (31 << 26) | (3 << 21) | (fxm << 12) | (144 << 1), with_(r3=0xDEADBEEF), mtcrf)
for nm, xo, fn in (("crand", 257, lambda a, b: a & b), ("cror", 449, lambda a, b: a | b), ("crxor", 193, lambda a, b: a ^ b),
                   ("crnor", 33, lambda a, b: 1 - (a | b)), ("crandc", 129, lambda a, b: a & (1 - b)), ("creqv", 289, lambda a, b: 1 - (a ^ b)),
                   ("crnand", 225, lambda a, b: 1 - (a & b)), ("crorc", 417, lambda a, b: a | (1 - b))):
    for cr in (0x5A5A5A5A, 0xA5A5A5A5):
        vec(f"{nm}_{cr:x}", (19 << 26) | (9 << 21) | (3 << 16) | (30 << 11) | (xo << 1), with_(cr=cr),
            lambda s, fn=fn: setcrbit(s, 9, fn(crbit(s, 3), crbit(s, 30))))

# ---------------------------------------------------------------- loads / stores
# base register r3 = DATA, rB r4 = 0x10, memory pre-filled with a recognisable pattern
def memst(base_=DATA, **kw):
    st = with_(r3=base_, r4=0x10, **kw)
    for i in range(DATA_SIZE): st.mem[DATA + i] = (0xA0 + i * 7) & 0xFF
    return st
def bytes_at(st, a, n): return st.rd(a, n)
LD = (("lwz", 32, 4, 0), ("lbz", 34, 1, 0), ("lhz", 40, 2, 0), ("lha", 42, 2, 1))
for nm, op, n, sext in LD:
    for off in (0, 0x24, -0x10):
        def f(s, n=n, sext=sext, off=off):
            ea = (DATA + 0x40 + off) & M32
            v = s.rd(ea, n)
            if sext and v & (1 << (8 * n - 1)): v -= 1 << (8 * n)
            s.gpr[5] = v & M32
        vec(f"{nm}_off{off & 0xFFFF:x}", D(op, 5, 3, off), memst(DATA + 0x40), f)
for nm, op, n in (("lwzu", 33, 4), ("lbzu", 35, 1), ("lhzu", 41, 2)):
    st = memst()
    def f(s, n=n):
        ea = DATA + 0x20; s.gpr[5] = s.rd(ea, n); s.gpr[3] = ea
    vec(f"{nm}", D(op, 5, 3, 0x20), st, f)
for nm, xo, n, sext in (("lwzx", 23, 4, 0), ("lbzx", 87, 1, 0), ("lhzx", 279, 2, 0), ("lhax", 343, 2, 1)):
    def f(s, n=n, sext=sext):
        v = s.rd(DATA + 0x10, n)
        if sext and v & (1 << (8 * n - 1)): v -= 1 << (8 * n)
        s.gpr[5] = v & M32
    vec(nm, X(31, 5, 3, 4, xo), memst(), f)
def bswap(v, n): return int.from_bytes(v.to_bytes(n, "big"), "little")
vec("lwbrx", X(31, 5, 3, 4, 534), memst(), lambda s: s.gpr.__setitem__(5, bswap(s.rd(DATA + 0x10, 4), 4)))
vec("lhbrx", X(31, 5, 3, 4, 790), memst(), lambda s: s.gpr.__setitem__(5, bswap(s.rd(DATA + 0x10, 2), 2)))
for nm, op, n in (("stw", 36, 4), ("stb", 38, 1), ("sth", 44, 2)):
    for off in (0, 0x24):
        vec(f"{nm}_off{off:x}", D(op, 6, 3, off), memst(r6=0xDEADBEEF), lambda s, n=n, off=off: s.wr(DATA + off, n, 0xDEADBEEF & ((1 << (8 * n)) - 1)))
for nm, op, n in (("stwu", 37, 4), ("stbu", 39, 1), ("sthu", 45, 2)):
    vec(nm, D(op, 6, 3, 0x20), memst(r6=0x8899AABB), lambda s, n=n: (s.wr(DATA + 0x20, n, 0x8899AABB & ((1 << (8 * n)) - 1)), s.gpr.__setitem__(3, DATA + 0x20)))
for nm, xo, n in (("stwx", 151, 4), ("stbx", 215, 1), ("sthx", 407, 2)):
    vec(nm, X(31, 6, 3, 4, xo), memst(r6=0x8899AABB), lambda s, n=n: s.wr(DATA + 0x10, n, 0x8899AABB & ((1 << (8 * n)) - 1)))
vec("stwbrx", X(31, 6, 3, 4, 662), memst(r6=0x01020304), lambda s: s.wr(DATA + 0x10, 4, 0x04030201))
vec("sthbrx", X(31, 6, 3, 4, 918), memst(r6=0x0102), lambda s: s.wr(DATA + 0x10, 2, 0x0201))
vec("lmw", D(46, 29, 3, 0x20), memst(), lambda s: [s.gpr.__setitem__(29 + i, s.rd(DATA + 0x20 + 4 * i, 4)) for i in range(3)])
vec("stmw", D(47, 29, 3, 0x20), memst(), lambda s: [s.wr(DATA + 0x20 + 4 * i, 4, s.gpr[29 + i]) for i in range(3)])

# ---------------------------------------------------------------- branches (IP checked relative to the vector base)
def br_vec(name, word, st, fn):
    vec(name, word, st, fn)
def bx(li, aa=0, lk=0): return (18 << 26) | (li & 0x3FFFFFC) | (aa << 1) | lk
def sext_li(li): li &= 0x3FFFFFC; return li - (1 << 26) if li & (1 << 25) else li
for li in (0x40, -0x40 & 0x3FFFFFC):
    for lk in (0, 1):
        def f(s, li=li, lk=lk):
            if lk: s.lr = s.ip + 4
            s.ip = (s.ip + sext_li(li)) & M32
        vec(f"b_{li:x}_lk{lk}", bx(li, 0, lk), base(), f)
def bcx(bo, bi, bd, lk=0): return (16 << 26) | (bo << 21) | (bi << 16) | (bd & 0xFFFC) | lk
def cond_ok(s, bo, bi):
    ctr_ok = (bo & 4) or ((s.ctr != 0) != bool(bo & 2))
    c_ok = (bo & 16) or (crbit(s, bi) == bool(bo & 8))
    return ctr_ok and c_ok
def bc_sem(bo, bi, target_fn, lk, use_ctr_dec):
    def f(s):
        if use_ctr_dec and not (bo & 4): s.ctr = (s.ctr - 1) & M32
        if cond_ok(s, bo, bi):
            t = target_fn(s)
            if lk: s.lr = s.ip + 4
            s.ip = t & M32
        else:
            s.ip += 4
    return f
for bo, bi, cr, ctr in ((12, 2, 0x20000000, 5), (12, 2, 0, 5), (4, 2, 0x20000000, 5), (4, 2, 0, 5), (16, 0, 0, 5), (16, 0, 0, 1),
                        (18, 0, 0, 1), (18, 0, 0, 5), (8, 2, 0x20000000, 1), (8, 2, 0x20000000, 5), (20, 0, 0, 5)):
    for lk in (0, 1):
        vec(f"bc_{bo}_{bi}_cr{cr:x}_ctr{ctr}_lk{lk}", bcx(bo, bi, 0x30, lk), with_(cr=cr, ctr=ctr), bc_sem(bo, bi, lambda s: s.ip + 0x30, lk, True))
        vec(f"bcbwd_{bo}_{bi}_cr{cr:x}_ctr{ctr}_lk{lk}", bcx(bo, bi, -0x20, lk), with_(cr=cr, ctr=ctr), bc_sem(bo, bi, lambda s: s.ip - 0x20, lk, True))
        vec(f"bclr_{bo}_{bi}_cr{cr:x}_ctr{ctr}_lk{lk}", (19 << 26) | (bo << 21) | (bi << 16) | (16 << 1) | lk, with_(cr=cr, ctr=ctr, lr=nextbase() + 0x100), bc_sem(bo, bi, lambda s: s.lr & ~3, lk, True))
        vec(f"bcctr_{bo}_{bi}_cr{cr:x}_lk{lk}", (19 << 26) | ((bo | 4) << 21) | (bi << 16) | (528 << 1) | lk, with_(cr=cr, ctr=nextbase() + 0x200), bc_sem(bo | 4, bi, lambda s: s.ctr & ~3, lk, False))

# ---------------------------------------------------------------- floating point
def fpr_ps(**kw): return with_(**kw)
FPV = (1.5, -2.25, 4.0, 0.0, -0.0, 1e30, 3.0)
def fa(name, op, xo, fn, single, pairs=((1.5, 2.25), (-3.0, 0.5), (8.0, -2.0)), three=False, frcs=None):
    for a, b in pairs:
        c = 3.0
        def f(s, a=a, b=b):
            r = fn(a, b, c)
            if single: r = sgl(r)
            s.f0[1] = f2b(r)
        st = with_(f2=a, f3=b, f4=c)
        vec(f"{name}_{a}_{b}", A(op, 1, 2, 3, 4 if three else 0, xo), st, f)
fa("fadd", 63, 21, lambda a, b, c: a + b, False); fa("fsub", 63, 20, lambda a, b, c: a - b, False)
fa("fdiv", 63, 18, lambda a, b, c: a / b, False, pairs=((9.0, 3.0), (-1.5, 0.5)))
fa("fadds", 59, 21, lambda a, b, c: a + b, True); fa("fsubs", 59, 20, lambda a, b, c: a - b, True)
fa("fdivs", 59, 18, lambda a, b, c: a / b, True, pairs=((9.0, 3.0), (-1.5, 0.5)))
for a, c in ((1.5, 2.0), (-3.0, 0.5)):
    vec(f"fmul_{a}_{c}", A(63, 1, 2, 0, 3, 25), with_(f2=a, f3=c), lambda s, a=a, c=c: s.f0.__setitem__(1, f2b(a * c)))
    vec(f"fmuls_{a}_{c}", A(59, 1, 2, 0, 3, 25), with_(f2=a, f3=c), lambda s, a=a, c=c: s.f0.__setitem__(1, f2b(sgl(a * c))))
for nm, xo, fn in (("fmadd", 29, lambda a, c, b: a * c + b), ("fmsub", 28, lambda a, c, b: a * c - b),
                   ("fnmadd", 31, lambda a, c, b: -(a * c + b)), ("fnmsub", 30, lambda a, c, b: -(a * c - b))):
    vec(nm, A(63, 1, 2, 3, 4, xo), with_(f2=1.5, f3=0.25, f4=4.0), lambda s, fn=fn: s.f0.__setitem__(1, f2b(fn(1.5, 4.0, 0.25))))
vec("fmadds", A(59, 1, 2, 3, 4, 29), with_(f2=1.5, f3=0.25, f4=4.0), lambda s: s.f0.__setitem__(1, f2b(sgl(1.5 * 4.0 + 0.25))))
vec("frsp", A(63, 1, 0, 3, 0, 12), with_(f3=1.1), lambda s: s.f0.__setitem__(1, f2b(sgl(1.1))))
vec("fmr", A(63, 1, 0, 3, 0, 72), with_(f3=-7.5), lambda s: s.f0.__setitem__(1, f2b(-7.5)))
vec("fneg", A(63, 1, 0, 3, 0, 40), with_(f3=7.5), lambda s: s.f0.__setitem__(1, f2b(-7.5)))
vec("fabs", A(63, 1, 0, 3, 0, 264), with_(f3=-7.5), lambda s: s.f0.__setitem__(1, f2b(7.5)))
for a, b in ((1.0, 2.0), (2.0, 1.0), (2.0, 2.0)):
    vec(f"fcmpu_{a}_{b}", (63 << 26) | (5 << 23) | (2 << 16) | (3 << 11), with_(f2=a, f3=b), lambda s, a=a, b=b: setcrf(s, 5, a < b, a > b, a == b, 0))
# float load/store
FMEM = (0x3FF8000000000000, 0xC002000000000000)  # 1.5, -2.25 as doubles
def fmem():
    st = with_(r3=DATA)
    for i in range(DATA_SIZE): st.mem[DATA + i] = 0
    st.wr(DATA + 0x10, 8, FMEM[0]); st.wr(DATA + 0x18, 4, 0x40100000)   # 8 bytes double 1.5 ; a single 2.25
    return st
vec("lfd", D(50, 1, 3, 0x10), fmem(), lambda s: s.f0.__setitem__(1, FMEM[0]))
vec("lfs", D(48, 1, 3, 0x18), fmem(), lambda s: s.f0.__setitem__(1, f2b(2.25)))
vec("stfd", D(54, 2, 3, 0x20), with_(r3=DATA, f2=-2.25), lambda s: s.wr(DATA + 0x20, 8, FMEM[1]))
vec("stfs", D(52, 2, 3, 0x28), with_(r3=DATA, f2=-2.25), lambda s: s.wr(DATA + 0x28, 4, 0xC0100000))
# paired single (rounded to single like the hardware)
def ps2(name, xo, fn, op=4, three=False):
    a0, a1, b0, b1, c0, c1 = 1.5, -2.5, 0.25, 4.0, 2.0, -0.5
    def f(s):
        s.f0[1] = f2b(sgl(fn(a0, b0, c0))); s.f1[1] = f2b(sgl(fn(a1, b1, c1)))
    vec(name, A(op, 1, 2, 3, 4 if three else 0, xo), with_(f2=a0, g2=a1, f3=b0, g3=b1, f4=c0, g4=c1), f)
ps2("ps_add", 21, lambda a, b, c: a + b); ps2("ps_sub", 20, lambda a, b, c: a - b)
ps2("ps_madd", 29, lambda a, b, c: a * c + b, three=True); ps2("ps_msub", 28, lambda a, b, c: a * c - b, three=True)
vec("ps_mul", A(4, 1, 2, 0, 4, 25), with_(f2=1.5, g2=-2.5, f4=2.0, g4=-0.5), lambda s: (s.f0.__setitem__(1, f2b(3.0)), s.f1.__setitem__(1, f2b(1.25))))
vec("ps_merge00", A(4, 1, 2, 3, 0, 528), with_(f2=1.5, g2=-2.5, f3=0.25, g3=4.0), lambda s: (s.f0.__setitem__(1, f2b(1.5)), s.f1.__setitem__(1, f2b(0.25))))
vec("ps_merge11", A(4, 1, 2, 3, 0, 624), with_(f2=1.5, g2=-2.5, f3=0.25, g3=4.0), lambda s: (s.f0.__setitem__(1, f2b(-2.5)), s.f1.__setitem__(1, f2b(4.0))))
vec("ps_merge01", A(4, 1, 2, 3, 0, 560), with_(f2=1.5, g2=-2.5, f3=0.25, g3=4.0), lambda s: (s.f0.__setitem__(1, f2b(1.5)), s.f1.__setitem__(1, f2b(4.0))))
vec("ps_merge10", A(4, 1, 2, 3, 0, 592), with_(f2=1.5, g2=-2.5, f3=0.25, g3=4.0), lambda s: (s.f0.__setitem__(1, f2b(-2.5)), s.f1.__setitem__(1, f2b(0.25))))
vec("ps_mr", A(4, 1, 0, 3, 0, 72), with_(f3=0.25, g3=4.0), lambda s: (s.f0.__setitem__(1, f2b(0.25)), s.f1.__setitem__(1, f2b(4.0))))
vec("ps_neg", A(4, 1, 0, 3, 0, 40), with_(f3=0.25, g3=4.0), lambda s: (s.f0.__setitem__(1, f2b(-0.25)), s.f1.__setitem__(1, f2b(-4.0))))

# ---------------------------------------------------------------- emit
def hexs(v): return f"0x{v:X}ull"
bg = State()
out = ["// Generated by gen_vectors.py. Do not edit.",
       "static const uint32_t kBgGpr[32] = {" + ",".join(f"0x{v:X}u" for v in bg.gpr) + "};",
       f"static const uint32_t kBgCr = 0x{bg.cr:X}u, kBgLr = 0x{bg.lr:X}u, kBgCtr = 0x{bg.ctr:X}u;",
       "static const uint64_t kBgF0[32] = {" + ",".join(hexs(v) for v in bg.f0) + "};",
       "static const uint64_t kBgF1[32] = {" + ",".join(hexs(v) for v in bg.f1) + "};", f"static const uint32_t kCodeBase = 0x{CODE:X}, kDataBase = 0x{DATA:X}, kDataSize = 0x{DATA_SIZE:X};", "static const Vec kVectors[] = {"]
for name, words, init, exp in vectors:
    d = State()  # background
    def diff(a, b):
        ents = []
        for i in range(32):
            if a.gpr[i] != b.gpr[i]: ents.append((0, i, b.gpr[i]))
        if a.cr != b.cr: ents.append((1, 0, b.cr))
        if a.ca != b.ca: ents.append((2, 0, b.ca))
        if a.so != b.so: ents.append((3, 0, b.so))
        if a.ov != b.ov: ents.append((4, 0, b.ov))
        if a.lr != b.lr: ents.append((5, 0, b.lr))
        if a.ctr != b.ctr: ents.append((6, 0, b.ctr))
        for i in range(32):
            if a.f0[i] != b.f0[i]: ents.append((7, i, b.f0[i]))
            if a.f1[i] != b.f1[i]: ents.append((8, i, b.f1[i]))
        for addr in sorted(set(a.mem) | set(b.mem)):
            if a.mem.get(addr, 0) != b.mem.get(addr, 0): ents.append((9, addr, b.mem.get(addr, 0)))
        if a.ip != b.ip: ents.append((10, 0, b.ip))
        return ents
    # state differences from the background, then expected differences from init
    ini = diff(d, init); ini = [e for e in ini if e[0] != 10]
    # init memory beyond background (background has none)
    ex = diff(init, exp)
    w = ",".join(f"0x{x:08X}" for x in words)
    out.append(f'  {{"{name}", {len(words)}, {{{w}}}, {{' + ",".join(f"{{{k},{i},{hexs(v)}}}" for k, i, v in ini) + f'}}, {len(ini)}, {{' + ",".join(f"{{{k},{i},{hexs(v)}}}" for k, i, v in ex) + f'}}, {len(ex)}}},')
out.append("};")
print("\n".join(out))
sys.stderr.write(f"{len(vectors)} vectors\n")
