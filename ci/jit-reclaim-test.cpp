// Host-side unit test for src/Cafe/HW/Espresso/Recompiler/JitReclaim.h, the rule that decides when invalidated
// recompiler code may be handed back to the arena. Built and run by build-ios-app.yml before the core build; no engine headers involved.
#include "JitReclaim.h"
#include <atomic>
#include <chrono>
#include <cstdio>
#include <thread>
#include <vector>

static int failures = 0;
#define CHECK(cond) do { if (!(cond)) { std::printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); ++failures; } } while (0)

using jitreclaim::Reclaimer;
using jitreclaim::Pending;

static size_t freeAll(Reclaimer& r, std::vector<size_t>* begins = nullptr)
{
	return r.reclaim([&](const Pending& p) { if (begins) begins->push_back(p.begin); });
}

static void testNoHostsFreesAtOnce()
{
	Reclaimer r;
	r.init(1 << 20);
	r.retire(0x1000, 256, nullptr, nullptr, 0);
	CHECK(r.pendingBytes() == 256);
	CHECK(freeAll(r) == 256);
	CHECK(r.pendingBytes() == 0 && r.pendingCount() == 0);
}

static void testRunningHostMustPass()
{
	Reclaimer r;
	r.init(1 << 20);
	const int h = r.registerHost();
	r.quiescent(h);
	r.retire(0x2000, 512, nullptr, nullptr, 0);
	CHECK(freeAll(r) == 0); // host has not left guest code since the retire
	CHECK(r.pendingCount() == 1);
	r.quiescent(h);
	CHECK(freeAll(r) == 512);
}

static void testEveryHostMustPass()
{
	Reclaimer r;
	r.init(1 << 20);
	const int a = r.registerHost(), b = r.registerHost(), c = r.registerHost();
	r.retire(0, 64, nullptr, nullptr, 0);
	r.quiescent(a);
	r.quiescent(b);
	CHECK(freeAll(r) == 0); // c still may be inside
	r.quiescent(c);
	CHECK(freeAll(r) == 64);
}

static void testIdleHostCountsAsPassed()
{
	Reclaimer r;
	r.init(1 << 20);
	const int a = r.registerHost(), b = r.registerHost();
	r.setIdle(b, true);
	r.retire(0, 64, nullptr, nullptr, 0);
	r.quiescent(a);
	CHECK(freeAll(r) == 64); // b is parked in an idle wait
	r.retire(128, 64, nullptr, nullptr, 0);
	r.setIdle(b, false); // woke up: it may run code again, but it had passed only while idle
	r.quiescent(a);
	CHECK(freeAll(r) == 0);
	r.quiescent(b);
	CHECK(freeAll(r) == 64);
}

static void testHostRegisteredAfterRetireDoesNotBlock()
{
	Reclaimer r;
	r.init(1 << 20);
	const int a = r.registerHost();
	r.retire(0, 64, nullptr, nullptr, 0);
	const int late = r.registerHost(); // started after the code became unreachable
	(void)late;
	r.quiescent(a);
	CHECK(freeAll(r) == 64);
}

static void testPinBlocksFree()
{
	Reclaimer r;
	r.init(1 << 20);
	const int h = r.registerHost();
	// a thread calls an HLE function from code at 0x3040 and blocks; the code is invalidated meanwhile
	const uint32_t token = r.pin(0x3040);
	r.retire(0x3000, 0x200, nullptr, nullptr, 0);
	r.quiescent(h); // its host switched to another thread
	CHECK(freeAll(r) == 0); // still parked in the call
	CHECK(r.pinsOnBlock(3) == 1);
	// it resumes on the same host and the call returns; the pin outlives the return until the next quiescent point
	r.unpinLater(h, token);
	CHECK(freeAll(r) == 0);
	CHECK(r.pinsOnBlock(3) == 1);
	r.quiescent(h);
	CHECK(r.pinsOnBlock(3) == 0);
	CHECK(freeAll(r) == 0x200);
}

static void testResumeOnAnotherHost()
{
	Reclaimer r;
	r.init(1 << 20);
	const int a = r.registerHost(), b = r.registerHost();
	const uint32_t token = r.pin(0x5010);
	r.retire(0x5000, 0x100, nullptr, nullptr, 0);
	r.quiescent(a);
	r.quiescent(b);
	CHECK(freeAll(r) == 0);
	// the thread resumes on b and finishes its call; b has passed since the retire, which is exactly the trap:
	// the thread is now running the tail of the old code on b
	r.unpinLater(b, token);
	r.quiescent(a);
	CHECK(freeAll(r) == 0); // a's pass does not release b's deferred pin
	r.quiescent(b); // b leaves that code
	CHECK(freeAll(r) == 0x100);
}

static void testRangeSpanningBlocks()
{
	Reclaimer r;
	r.init(1 << 20);
	const uint32_t token = r.pin(0x7800); // block 7
	r.retire(0x6800, 0x2000, nullptr, nullptr, 0); // blocks 6, 7, 8
	CHECK(freeAll(r) == 0);
	r.retire(0x9000, 0x100, nullptr, nullptr, 0); // block 9, no pin
	CHECK(freeAll(r) == 0x100);
	const int h = r.registerHost();
	r.unpinLater(h, token);
	r.quiescent(h);
	CHECK(freeAll(r) == 0x2000);
}

static void testPoisonAndReset()
{
	Reclaimer r;
	r.init(1 << 20);
	r.retire(0, 64, nullptr, nullptr, 0);
	CHECK(r.poison());
	CHECK(!r.poison());
	CHECK(freeAll(r) == 0);
	r.reset();
	CHECK(!r.poisoned() && r.pendingCount() == 0 && r.hostCount() == 0);
	for (int i = 0; i < jitreclaim::kMaxHosts; i++)
		CHECK(r.registerHost() == i);
	CHECK(r.registerHost() == -1);
	CHECK(r.hostCount() == jitreclaim::kMaxHosts);
}

// Code with a mapping of its own is not in the arena and carries no pin, so it must never be queued for release.
static void testSeparatelyMappedCodeIsNotQueued()
{
	Reclaimer r;
	r.init(1 << 20);
	CHECK(!r.retire(0x1000, 64, nullptr, nullptr, 1));
	CHECK(!r.retire(0x2000, 64, nullptr, nullptr, -1));
	CHECK(r.pendingCount() == 0 && r.pendingBytes() == 0);
	size_t calls = 0;
	CHECK(r.reclaim([&](const Pending&) { calls++; }) == 0);
	CHECK(calls == 0);
	CHECK(r.retire(0x3000, 64, nullptr, nullptr, jitreclaim::kKindArena));
	CHECK(r.pendingCount() == 1);
	CHECK(r.reclaim([&](const Pending&) { calls++; }) == 64 && calls == 1);
}

// Shutdown with the scheduler joined: everything is forgotten and the arena may be reset.
static void testShutdownSchedulerStopped()
{
	Reclaimer r;
	r.init(1 << 20);
	const int h = r.registerHost();
	r.pin(0x1000);
	r.retire(0x1000, 32, nullptr, nullptr, 0);
	r.retire(0x2000, 32, nullptr, nullptr, 0);
	(void)h;
	CHECK(r.shutdown(true));
	CHECK(r.pendingCount() == 0 && r.pendingBytes() == 0);
	CHECK(r.hostCount() == 0 && r.pinsOnBlock(1) == 0 && !r.poisoned());
	r.retire(0x1000, 32, nullptr, nullptr, 0);
	CHECK(freeAll(r) == 32); // no hosts, no pins left: starts over cleanly
}

// Shutdown with the scheduler still active: nothing is forgotten, nothing is ever released again, and the caller
// is told not to reset the arena.
static void testShutdownPoisonsWhenSchedulerActive()
{
	Reclaimer r;
	r.init(1 << 20);
	const int h = r.registerHost();
	const uint32_t token = r.pin(0x1000);
	r.retire(0x1000, 32, nullptr, nullptr, 0);
	CHECK(!r.shutdown(false));
	CHECK(r.poisoned());
	CHECK(r.hostCount() == 1 && r.pinsOnBlock(1) == 1 && r.pendingCount() == 1 && r.pendingBytes() == 32);
	r.unpinLater(h, token);
	r.quiescent(h);
	CHECK(freeAll(r) == 0); // even though everything would now be safe
	r.retire(0x8000, 32, nullptr, nullptr, 0); // retired from now on is not looked at either
	r.quiescent(h);
	CHECK(freeAll(r) == 0);
	CHECK(r.pendingCount() == 2);
	// a later init (next title) starts from scratch
	r.init(1 << 20);
	CHECK(!r.poisoned() && r.pendingCount() == 0 && r.hostCount() == 0);
}

// A host thread that has exited must not hold back ranges retired after it last ran.
static void testDeregisteredHostDoesNotStall()
{
	Reclaimer r;
	r.init(1 << 20);
	const int a = r.registerHost(), b = r.registerHost();
	r.retire(0, 64, nullptr, nullptr, 0);
	r.quiescent(a);
	CHECK(freeAll(r) == 0); // b has not passed
	r.deregisterHost(b);
	CHECK(freeAll(r) == 64);
	r.retire(128, 64, nullptr, nullptr, 0);
	r.quiescent(a);
	CHECK(freeAll(r) == 64); // b stays out of the count
}

static void testDeregisterDropsDeferredPins()
{
	Reclaimer r;
	r.init(1 << 20);
	const int h = r.registerHost();
	const uint32_t token = r.pin(0x4010);
	r.unpinLater(h, token);
	CHECK(r.pinsOnBlock(4) == 1);
	r.deregisterHost(h);
	CHECK(r.pinsOnBlock(4) == 0);
	// a call that never returned still pins, deregistration does not touch it
	r.pin(0x5010);
	r.deregisterHost(r.registerHost());
	CHECK(r.pinsOnBlock(5) == 1);
}

static void testDeregisteredSlotIsReused()
{
	Reclaimer r;
	r.init(1 << 20);
	for (int i = 0; i < jitreclaim::kMaxHosts; i++)
		CHECK(r.registerHost() == i);
	CHECK(r.registerHost() == -1);
	r.deregisterHost(3);
	CHECK(r.registerHost() == 3); // a host thread that comes and goes does not use up the table
	CHECK(r.registerHost() == -1);
	CHECK(r.hostCount() == jitreclaim::kMaxHosts);
	// the new owner of the slot counts again
	r.retire(0, 64, nullptr, nullptr, 0);
	for (int i = 0; i < jitreclaim::kMaxHosts; i++)
		if (i != 3)
			r.quiescent(i);
	CHECK(freeAll(r) == 0);
	r.quiescent(3);
	CHECK(freeAll(r) == 64);
}

// The property itself, under real concurrency. Slot s of a fake arena holds "code". Runner threads behave like PPC
// core host threads: between quiescent points they fetch an entry from the table and then execute that slot,
// sometimes making an "HLE call" that parks for a while (pin, sleep, unpin-later) before finishing the slot.
// A retirer thread invalidates slots (table entry cleared first, then retire), reclaims, and reuses freed slots.
// A slot must never be found freed by a thread that is executing it.
static void testStress()
{
	constexpr int kSlots = 64;
	constexpr size_t kSlotBytes = 4096;
	enum { LIVE = 0, FREED = 1 };
	Reclaimer r;
	r.init(kSlots * kSlotBytes);
	static std::atomic<int> state[kSlots];
	static std::atomic<bool> table[kSlots];
	for (int i = 0; i < kSlots; i++)
	{
		state[i] = LIVE;
		table[i] = true;
	}
	std::atomic<bool> stop{false};
	std::atomic<int> violations{0};
	std::atomic<uint64_t> executed{0}, freedCount{0};

	auto runner = [&](unsigned seed) {
		const int host = r.registerHost();
		unsigned x = seed * 2654435761u + 1;
		auto next = [&]() { x = x * 1664525u + 1013904223u; return x >> 8; };
		struct Parked { int slot; uint32_t token; uint64_t resumeAt; };
		std::vector<Parked> parked; // guest threads switched out in the middle of an HLE call made from a slot
		uint64_t step = 0;
		auto check = [&](int s) { if (state[s].load() != LIVE) violations.fetch_add(1); };
		while (!stop.load())
		{
			step++;
			r.quiescent(host); // between runs: scheduler / interpreter loop
			// a parked thread resumes here (possibly long after its slot was invalidated), finishes its call and
			// runs the epilogue of the slot it called from
			for (size_t i = 0; i < parked.size();)
			{
				if (parked[i].resumeAt > step) { i++; continue; }
				check(parked[i].slot);
				r.unpinLater(host, parked[i].token);
				if (next() % 2) std::this_thread::sleep_for(std::chrono::microseconds(60));
				check(parked[i].slot);
				parked.erase(parked.begin() + i);
			}
			const int s = (int)(next() % kSlots);
			if (!table[s].load())
				continue;
			// executing slot s
			for (int i = 0; i < 20; i++)
			{
				check(s);
				executed.fetch_add(1, std::memory_order_relaxed);
			}
			if (next() % 8 == 0)
				std::this_thread::sleep_for(std::chrono::microseconds(80)); // preempted by the OS mid-run
			check(s);
			if (next() % 4 == 0)
			{
				// HLE call that blocks: pin, then the guest thread is switched out while this host moves on
				parked.push_back({s, r.pin((size_t)s * kSlotBytes + 100), step + 1 + next() % 40});
			}
			else
			{
				for (int i = 0; i < 20; i++)
					check(s);
			}
		}
	};
	std::thread t1(runner, 1), t2(runner, 2), t3(runner, 3);
	std::thread retirer([&]() {
		unsigned x = 12345;
		auto next = [&]() { x = x * 1664525u + 1013904223u; return x >> 8; };
		std::vector<int> waiting;
		while (!stop.load())
		{
			const int s = (int)(next() % kSlots);
			if (table[s].load())
			{
				table[s].store(false); // jump table reset ...
				r.retire((size_t)s * kSlotBytes, 256, (void*)(intptr_t)s, nullptr, 0); // ... then retire
			}
			r.reclaim([&](const Pending& p) {
				const int slot = (int)(intptr_t)p.a;
				state[slot].store(FREED);
				freedCount.fetch_add(1);
				// the memory stays garbage for a moment before new code is written into it
				std::this_thread::sleep_for(std::chrono::microseconds(150));
				state[slot].store(LIVE);
				table[slot].store(true);
			});
			std::this_thread::sleep_for(std::chrono::microseconds(50));
		}
	});
	std::this_thread::sleep_for(std::chrono::milliseconds(600));
	stop = true;
	t1.join(); t2.join(); t3.join(); retirer.join();
	CHECK(violations.load() == 0);
	CHECK(freedCount.load() > 0); // the test is meaningless if nothing was ever released
	std::printf("  stress: %llu steps, %llu ranges released, %d violations\n",
		(unsigned long long)executed.load(), (unsigned long long)freedCount.load(), violations.load());
}

int main()
{
	testNoHostsFreesAtOnce();
	testRunningHostMustPass();
	testEveryHostMustPass();
	testIdleHostCountsAsPassed();
	testHostRegisteredAfterRetireDoesNotBlock();
	testPinBlocksFree();
	testResumeOnAnotherHost();
	testRangeSpanningBlocks();
	testPoisonAndReset();
	testSeparatelyMappedCodeIsNotQueued();
	testShutdownSchedulerStopped();
	testShutdownPoisonsWhenSchedulerActive();
	testDeregisteredHostDoesNotStall();
	testDeregisterDropsDeferredPins();
	testDeregisteredSlotIsReused();
	testStress();
	if (failures)
	{
		std::printf("jit_reclaim_test: %d check(s) failed\n", failures);
		return 1;
	}
	std::printf("jit_reclaim_test: all checks passed\n");
	return 0;
}
