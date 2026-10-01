// Host-runnable correctness and throughput harness for the PowerPC interpreter.
//
// It links the interpreter's own translation units (PPCInterpreter{Impl,FPU,PS,HLE,OPC}.cpp)
// against the small stand-ins in stubs.cpp for the rest of the emulator, so what it measures
// and checks is the shipped interpreter code, compiled with whatever dispatch flags the build
// script passes.
//
//   interp_harness test  [--full]     run every vector through each execution path
//   interp_harness bench [--seconds S] [--paths slice,step,full]   run the throughput workloads
//
// Correctness vectors live in vectors.inc, produced by gen_vectors.py.

#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <chrono>
#include <vector>
#include <string>
#include <algorithm>
#include <sys/mman.h>

#include "Cafe/HW/Espresso/PPCState.h"

extern uint8* memory_base;

// ---------------------------------------------------------------------------------------------
// guest memory / CPU helpers
// ---------------------------------------------------------------------------------------------
static PPCInterpreterGlobal_t g_global;

static PPCInterpreter_t* newCPU()
{
	void* p = nullptr;
	posix_memalign(&p, 64, sizeof(PPCInterpreter_t));
	auto* h = (PPCInterpreter_t*)p;
	memset((void*)h, 0, sizeof(*h));
	h->global = &g_global;
	return h;
}

static inline void wr32(uint32 addr, uint32 v)
{
	uint8* p = memory_base + addr;
	p[0] = v >> 24; p[1] = v >> 16; p[2] = v >> 8; p[3] = v;
}
static inline uint32 rd8(uint32 addr) { return memory_base[addr]; }

// ---------------------------------------------------------------------------------------------
// correctness vectors
// ---------------------------------------------------------------------------------------------
struct Ent { uint8_t kind; uint32_t idx; uint64_t val; };
struct Vec
{
	const char* name;
	int nwords;
	uint32_t words[2];
	std::vector<Ent> init;
	size_t ninit;
	std::vector<Ent> exp;
	size_t nexp;
};
#include "vectors.inc"

enum { K_GPR, K_CR, K_CA, K_SO, K_OV, K_LR, K_CTR, K_F0, K_F1, K_MEM, K_IP };

struct Snap
{
	uint32 gpr[32]; uint32 cr; uint8 ca, so, ov; uint32 lr, ctr; uint64 f0[32], f1[32]; uint32 ip;
	uint8 mem[kDataSize];
};

static void snapOf(PPCInterpreter_t* h, Snap& s)
{
	for (int i = 0; i < 32; i++) { s.gpr[i] = h->gpr[i]; s.f0[i] = h->fpr[i].fp0int; s.f1[i] = h->fpr[i].fp1int; }
	s.cr = h->cr; s.ca = h->xer_ca; s.so = h->xer_so; s.ov = h->xer_ov; s.lr = h->spr.LR; s.ctr = h->spr.CTR; s.ip = h->instructionPointer;
	memcpy(s.mem, memory_base + kDataBase, kDataSize);
}

static void applyEnt(Snap& s, const Ent& e)
{
	switch (e.kind)
	{
	case K_GPR: s.gpr[e.idx] = (uint32)e.val; break;
	case K_CR: s.cr = (uint32)e.val; break;
	case K_CA: s.ca = (uint8)e.val; break;
	case K_SO: s.so = (uint8)e.val; break;
	case K_OV: s.ov = (uint8)e.val; break;
	case K_LR: s.lr = (uint32)e.val; break;
	case K_CTR: s.ctr = (uint32)e.val; break;
	case K_F0: s.f0[e.idx] = e.val; break;
	case K_F1: s.f1[e.idx] = e.val; break;
	case K_MEM: s.mem[e.idx - kDataBase] = (uint8)e.val; break;
	case K_IP: s.ip = (uint32)e.val; break;
	}
}

enum class Path { Step, Slice, Full };
static const char* pathName(Path p) { return p == Path::Step ? "step" : p == Path::Slice ? "slice" : "full"; }

static void setupVector(PPCInterpreter_t* h, size_t idx, const Vec& v)
{
	const uint32 base = kCodeBase + (uint32)idx * 0x40;
	memset((void*)h, 0, sizeof(*h));
	h->global = &g_global;
	h->PSE = 1; h->LSQE = 1; // the slim interpreter always behaves as if paired-single mode is on; make the full one match
	for (int i = 0; i < 32; i++) { h->gpr[i] = kBgGpr[i]; h->fpr[i].fp0int = kBgF0[i]; h->fpr[i].fp1int = kBgF1[i]; }
	h->cr = kBgCr; h->spr.LR = kBgLr; h->spr.CTR = kBgCtr;
	memset(memory_base + kDataBase, 0, kDataSize);
	Snap s; snapOf(h, s);
	for (size_t i = 0; i < v.ninit; i++)
	{
		const Ent& e = v.init[i];
		switch (e.kind)
		{
		case K_GPR: h->gpr[e.idx] = (uint32)e.val; break;
		case K_CR: h->cr = (uint32)e.val; break;
		case K_CA: h->xer_ca = (uint8)e.val; break;
		case K_SO: h->xer_so = (uint8)e.val; break;
		case K_OV: h->xer_ov = (uint8)e.val; break;
		case K_LR: h->spr.LR = (uint32)e.val; break;
		case K_CTR: h->spr.CTR = (uint32)e.val; break;
		case K_F0: h->fpr[e.idx].fp0int = e.val; break;
		case K_F1: h->fpr[e.idx].fp1int = e.val; break;
		case K_MEM: memory_base[e.idx] = (uint8)e.val; break;
		}
	}
	for (int i = 0; i < v.nwords; i++) wr32(base + 4 * i, v.words[i]);
	wr32(base + 4 * v.nwords, 0x48000000); // b . - lets a block-cache slice run past a straight-line instruction harmlessly
	h->instructionPointer = base;
}

static int runTests(bool withFull)
{
	PPCInterpreter_t* h = newCPU();
	size_t nvec = sizeof(kVectors) / sizeof(kVectors[0]);
	int failures = 0, runs = 0;
	std::vector<Path> paths = {Path::Step, Path::Slice};
	if (withFull) paths.push_back(Path::Full);
	for (Path path : paths)
	{
		int pathFail = 0;
		for (size_t i = 0; i < nvec; i++)
		{
			const Vec& v = kVectors[i];
			setupVector(h, i, v);
			Snap want; snapOf(h, want);
			for (size_t k = 0; k < v.nexp; k++) applyEnt(want, v.exp[k]);
			switch (path)
			{
			case Path::Step: PPCInterpreterSlim_executeInstruction(h); break;
			case Path::Slice: h->remainingCycles = 1; PPCInterpreterSlim_executeTimeslice(h); break;
			case Path::Full: PPCInterpreterFull_executeInstruction(h); break;
			}
			Snap got; snapOf(h, got);
			runs++;
			std::string diff;
			auto note = [&](const char* what, uint64 w, uint64 g, int idx = -1)
			{
				if (diff.size() > 400) return;
				char b[160];
				if (idx >= 0) snprintf(b, sizeof b, " %s[%d] want %llx got %llx;", what, idx, (unsigned long long)w, (unsigned long long)g);
				else snprintf(b, sizeof b, " %s want %llx got %llx;", what, (unsigned long long)w, (unsigned long long)g);
				diff += b;
			};
			for (int r = 0; r < 32; r++) if (want.gpr[r] != got.gpr[r]) note("gpr", want.gpr[r], got.gpr[r], r);
			if (want.cr != got.cr) note("cr", want.cr, got.cr);
			if (want.ca != got.ca) note("xer.ca", want.ca, got.ca);
			if (want.so != got.so) note("xer.so", want.so, got.so);
			if (want.ov != got.ov) note("xer.ov", want.ov, got.ov);
			if (want.lr != got.lr) note("lr", want.lr, got.lr);
			if (want.ctr != got.ctr) note("ctr", want.ctr, got.ctr);
			for (int r = 0; r < 32; r++)
			{
				if (want.f0[r] != got.f0[r]) note("f.ps0", want.f0[r], got.f0[r], r);
				if (want.f1[r] != got.f1[r]) note("f.ps1", want.f1[r], got.f1[r], r);
			}
			if (want.ip != got.ip) note("ip", want.ip, got.ip);
			for (uint32 b = 0; b < kDataSize; b++) if (want.mem[b] != got.mem[b]) { note("mem", want.mem[b], got.mem[b], (int)b); break; }
			if (!diff.empty())
			{
				pathFail++;
				printf("FAIL [%s] %s:%s\n", pathName(path), v.name, diff.c_str());
			}
		}
		printf("path %-5s: %zu vectors, %d failed\n", pathName(path), nvec, pathFail);
		failures += pathFail;
	}
	printf("TOTAL: %d checks, %d failed\n", runs, failures);
	return failures ? 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// throughput workloads (guest loops assembled here)
// ---------------------------------------------------------------------------------------------
static uint32 eD(int op, int rt, int ra, int imm) { return (op << 26) | (rt << 21) | (ra << 16) | (imm & 0xFFFF); }
static uint32 eX(int op, int rt, int ra, int rb, int xo, int rc = 0) { return (op << 26) | (rt << 21) | (ra << 16) | (rb << 11) | (xo << 1) | rc; }
static uint32 eM(int rs, int ra, int sh, int mb, int me) { return (21 << 26) | (rs << 21) | (ra << 16) | (sh << 11) | (mb << 6) | (me << 1); }
static uint32 eA(int op, int frt, int fra, int frb, int frc, int xo) { return (op << 26) | (frt << 21) | (fra << 16) | (frb << 11) | (frc << 6) | (xo << 1); }
static uint32 eBC(int bo, int bi, int disp, int lk = 0) { return (16 << 26) | (bo << 21) | (bi << 16) | (disp & 0xFFFC) | lk; }
static uint32 eB(int disp, int lk = 0) { return (18 << 26) | (disp & 0x03FFFFFC) | lk; }
static uint32 eBLR() { return 0x4E800020; }
static uint32 eMFLR(int rt) { return eX(31, rt, 8, 0, 339); }
static uint32 eMTLR(int rs) { return eX(31, rs, 8, 0, 467); }

struct Workload
{
	const char* name;
	const char* what;
	std::vector<uint32> code;   // placed at kLoopBase; ends in bdnz back to the first word
	void (*init)(PPCInterpreter_t*);
};

static const uint32 kLoopBase = 0x400000;
static const uint32 kBufBase = 0x800000;     // 64 KiB data buffer
static const uint32 kFuncBase = 0x410000;     // helper function for the call workloads
static const uint32 kStackTop = 0xA00000;

static void initCommon(PPCInterpreter_t* h)
{
	memset((void*)h, 0, sizeof(*h));
	h->global = &g_global;
	h->spr.CTR = 0xFFFFFFFFu;
	h->gpr[1] = kStackTop;
	h->gpr[3] = kBufBase; h->gpr[4] = kBufBase + 0x8000; h->gpr[5] = 0x41C64E6D;
	h->gpr[6] = 12345;
	for (int i = 0; i < 32; i++) { h->fpr[i].fp0 = 1.0 + i * 0.25; h->fpr[i].fp1 = 2.0 + i * 0.25; }
	h->instructionPointer = kLoopBase;
	for (uint32 i = 0; i < 0x10000; i += 4) wr32(kBufBase + i, 0x3FF00000u + i); // doubles in the buffer stay finite
}

static std::vector<Workload> makeWorkloads()
{
	std::vector<Workload> w;
	// integer ALU: arithmetic, logic and rotates, one branch per nine instructions
	w.push_back({"alu", "add/xor/rlwinm/and/or/subf/slw, bdnz", {
		eX(31, 7, 7, 6, 266),          // add    r7,r7,r6
		eX(31, 7, 8, 6, 316),          // xor    r8,r7,r6
		eM(8, 9, 3, 0, 28),            // rlwinm r9,r8,3,0,28
		eD(14, 6, 6, 1),               // addi   r6,r6,1
		eX(31, 9, 10, 7, 28),          // and    r10,r9,r7
		eX(31, 10, 7, 7, 444),         // or     r7,r10,r7
		eX(31, 11, 6, 7, 40),          // subf   r11,r6,r7
		eX(31, 11, 12, 6, 24),         // slw    r12,r11,r6
		eBC(16, 0, -32),               // bdnz   loop
	}, initCommon});
	// memory: 8-byte copy loop with wrap inside a 64 KiB buffer
	w.push_back({"memcpy", "lwz/lwz/stw/stw + pointer wrap, bdnz", {}, initCommon});
	w.back().code = {
		eD(32, 7, 3, 0), eD(32, 8, 3, 4),          // lwz r7,0(r3) ; lwz r8,4(r3)
		eD(36, 7, 4, 0), eD(36, 8, 4, 4),          // stw r7,0(r4) ; stw r8,4(r4)
		eD(14, 3, 3, 8), eD(28, 3, 3, 0xFFFF),     // addi r3,r3,8 ; andi. r3,r3,0xFFFF
		eD(25, 3, 3, 0x80),                        // oris r3,r3,0x80 -> kBufBase
		eD(14, 4, 4, 8),                           // addi r4,r4,8
		eD(28, 4, 4, 0xFFFF), eD(25, 4, 4, 0x80),  // andi. ; oris
		eBC(16, 0, -40),
	};
	// branches and calls: LCG, data-dependent branch, call+return
	w.push_back({"branchy", "mullw/andi./beq, bl+blr leaf, bdnz", {}, initCommon});
	w.back().code = {
		eX(31, 6, 6, 5, 235),              // mullw r6,r6,r5
		eD(14, 6, 6, 12345),               // addi r6,r6,12345
		eD(28, 6, 7, 1),                   // andi. r7,r6,1
		eBC(12, 2, 8),                     // beq +8 (skip next)
		eD(14, 8, 8, 1),                   // addi r8,r8,1
		eB(int(kFuncBase) - int(kLoopBase) - 5 * 4, 1), // bl func
		eD(14, 9, 9, 3),                   // addi r9,r9,3
		eBC(16, 0, -28),
	};
	// float: double precision multiply-add traffic with loads/stores
	w.push_back({"float", "lfd/fmadd/fadd/fmul/fsub/stfd, bdnz", {}, initCommon});
	w.back().code = {
		eD(50, 1, 3, 0), eD(50, 2, 3, 8),          // lfd f1,0(r3) ; lfd f2,8(r3)
		eA(63, 3, 1, 3, 2, 29),                    // fmadd f3,f1,f2,f3
		eA(63, 4, 3, 1, 0, 21),                    // fadd f4,f3,f1
		eA(63, 5, 4, 0, 2, 25),                    // fmul f5,f4,f2
		eA(63, 7, 5, 1, 0, 20),                    // fsub f7,f5,f1
		eD(54, 5, 3, 16),                          // stfd f5,16(r3)
		eA(59, 6, 1, 2, 0, 21),                    // fadds f6,f1,f2
		eBC(16, 0, -32),
	};
	// paired single
	w.push_back({"paired", "ps_madd/ps_add/ps_mul/ps_merge, bdnz", {}, initCommon});
	w.back().code = {
		eA(4, 3, 1, 3, 2, 29),                     // ps_madd f3,f1,f3,f2
		eA(4, 4, 3, 1, 0, 21),                     // ps_add f4,f3,f1
		eA(4, 5, 4, 0, 2, 25),                     // ps_mul f5,f4,f2
		eA(4, 6, 5, 4, 0, 528),                    // ps_merge00 f6,f5,f4
		eA(4, 7, 6, 1, 0, 20),                     // ps_sub f7,f6,f1
		eBC(16, 0, -20),
	};
	// call-heavy "game-like" code: prologue/epilogue, saved LR, stack traffic, compares
	w.push_back({"calls", "stwu/mflr/stw lr, nested bl, lwz/mtlr/blr, cmpw/blt", {}, initCommon});
	w.back().code = {
		eD(37, 1, 1, -32),                         // stwu r1,-32(r1)
		eMFLR(0), eD(36, 0, 1, 36),                // mflr r0 ; stw r0,36(r1)
		eD(36, 31, 1, 28),                         // stw r31,28(r1)
		eD(14, 31, 3, 0),                          // mr r31,r3 (addi r31,r3,0)
		eB(int(kFuncBase) - int(kLoopBase) - 5 * 4, 1), // bl func
		eX(31, 0, 6, 31, 0),                       // cmpw cr0,r6,r31
		eBC(12, 0, 8),                             // blt +8
		eD(14, 6, 6, 1),                           // addi r6,r6,1
		eD(32, 31, 1, 28),                         // lwz r31,28(r1)
		eD(32, 0, 1, 36), eMTLR(0),                // lwz r0,36(r1) ; mtlr r0
		eD(14, 1, 1, 32),                          // addi r1,r1,32
		eBC(16, 0, -52),
	};
	return w;
}

static void loadWorkload(PPCInterpreter_t* h, const Workload& w)
{
	w.init(h);
	for (size_t i = 0; i < w.code.size(); i++) wr32(kLoopBase + 4 * (uint32)i, w.code[i]);
	// shared leaf: add r8,r8,r6 ; xor r9,r9,r8 ; blr
	wr32(kFuncBase, eX(31, 8, 8, 6, 266)); wr32(kFuncBase + 4, eX(31, 8, 9, 9, 316)); wr32(kFuncBase + 8, eBLR());
}

struct Result { std::string workload, path; double mips; double sec; double insns; };

static double nowSec() { return std::chrono::duration<double>(std::chrono::steady_clock::now().time_since_epoch()).count(); }

static double runOnce(PPCInterpreter_t* h, const Workload& w, Path path, double seconds, double& insnsOut, double& secOut)
{
	loadWorkload(h, w);
	const int kQuantum = 20000;
	double insns = 0;
	const double t0 = nowSec();
	double t;
	do
	{
		for (int rep = 0; rep < 50; rep++)
		{
			if (path == Path::Slice)
			{
				h->remainingCycles = kQuantum;
				PPCInterpreterSlim_executeTimeslice(h);
				insns += kQuantum - h->remainingCycles;
			}
			else
			{
				for (int i = 0; i < kQuantum; i++)
				{
					if (path == Path::Step) PPCInterpreterSlim_executeInstruction(h);
					else PPCInterpreterFull_executeInstruction(h);
				}
				insns += kQuantum;
			}
		}
		t = nowSec();
	} while (t - t0 < seconds);
	insnsOut = insns; secOut = t - t0;
	return insns / (t - t0) / 1e6;
}

static int runBench(double seconds, const std::string& pathList)
{
	PPCInterpreter_t* h = newCPU();
	auto workloads = makeWorkloads();
	std::vector<Path> paths;
	if (pathList.find("slice") != std::string::npos) paths.push_back(Path::Slice);
	if (pathList.find("step") != std::string::npos) paths.push_back(Path::Step);
	if (pathList.find("full") != std::string::npos) paths.push_back(Path::Full);
	std::vector<Result> results;
	printf("%-9s %-6s %10s %8s\n", "workload", "path", "MIPS(med)", "min..max");
	for (auto& w : workloads)
	{
		for (Path p : paths)
		{
			std::vector<double> m;
			double insns = 0, sec = 0;
			runOnce(h, w, p, 0.15, insns, sec); // warm up: decode blocks, fault pages in
			for (int rep = 0; rep < 5; rep++) m.push_back(runOnce(h, w, p, seconds, insns, sec));
			std::sort(m.begin(), m.end());
			double med = m[m.size() / 2];
			printf("%-9s %-6s %10.1f %8.1f..%.1f\n", w.name, pathName(p), med, m.front(), m.back());
			results.push_back({w.name, pathName(p), med, sec, insns});
		}
	}
	// machine-readable line for diffing runs
	printf("RESULTS_JSON {");
	for (size_t i = 0; i < results.size(); i++)
		printf("%s\"%s/%s\":%.1f", i ? "," : "", results[i].workload.c_str(), results[i].path.c_str(), results[i].mips);
	printf("}\n");
	return 0;
}

int main(int argc, char** argv)
{
	// 1 GiB of address space, lazily backed, so guest addresses used by the vectors and loops are plain offsets
	void* m = mmap(nullptr, 1ull << 30, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANON | MAP_NORESERVE, -1, 0);
	if (m == MAP_FAILED) { perror("mmap"); return 2; }
	memory_base = (uint8*)m;
	std::string mode = argc > 1 ? argv[1] : "test";
	bool full = false; double seconds = 0.4; std::string paths = "slice,step";
	for (int i = 2; i < argc; i++)
	{
		if (!strcmp(argv[i], "--full")) full = true;
		else if (!strcmp(argv[i], "--seconds") && i + 1 < argc) seconds = atof(argv[++i]);
		else if (!strcmp(argv[i], "--paths") && i + 1 < argc) paths = argv[++i];
	}
	if (mode == "test") return runTests(full);
	if (mode == "bench") return runBench(seconds, full ? paths + ",full" : paths);
	fprintf(stderr, "usage: %s test|bench [--full] [--seconds S]\n", argv[0]);
	return 2;
}
