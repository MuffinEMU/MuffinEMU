// Stand-ins for the parts of the emulator the interpreter files call into but the harness has
// no use for. Nothing here changes how an instruction executes.
#include <cstdint>
#include <string_view>

uint64 s_loggingFlagMask = 0;
uint8* memory_base = nullptr;

uint8* memory_getPointerFromVirtualOffset(uint32 offset) { return memory_base + offset; }
uint8* memory_getPointerFromVirtualOffsetAllowNull(uint32 offset) { return memory_base + offset; }
uint8* memory_getPointerFromPhysicalOffset(uint32 offset) { return memory_base + offset; }
uint32 memory_virtualToPhysical(uint32 offset) { return offset; }
uint32 memory_physicalToVirtual(uint32 offset) { return offset; }
uint32 memory_getVirtualOffsetFromPointer(void* ptr) { return (uint32)((uint8*)ptr - memory_base); }

bool cemuLog_log(LogType, std::string_view) { return false; }
bool cemuLog_log(LogType, std::u8string_view) { return false; }

// ---- values the interpreter reads from the rest of the CPU core ----------------------------
// The next five are copied from PPCInterpreterMain.cpp, which pulls in the whole config system
// and so cannot be built on its own.
uint64 ppcMainThreadDECCycleValue = 0;
uint64 ppcMainThreadDECCycleStart = 0;

uint64 PPCInterpreter_getMainCoreCycleCounter() { static uint64 c; return ++c; }

void PPCInterpreter_jumpToInstruction(PPCInterpreter_t* cpuInterpreter, uint32 newIP)
{
	cpuInterpreter->instructionPointer = (uint32)newIP;
}

void PPCInterpreter_setDEC(PPCInterpreter_t* hCPU, uint32 newValue)
{
	hCPU->sprExtended.DEC = newValue;
	ppcMainThreadDECCycleStart = PPCInterpreter_getMainCoreCycleCounter();
	ppcMainThreadDECCycleValue = newValue;
}

uint32 PPCInterpreter_getXER(PPCInterpreter_t* hCPU)
{
	uint32 xerValue = hCPU->spr.XER;
	xerValue &= ~(1 << XER_BIT_CA);
	xerValue &= ~(1 << XER_BIT_SO);
	xerValue &= ~(1 << XER_BIT_OV);
	if (hCPU->xer_ca) xerValue |= (1 << XER_BIT_CA);
	if (hCPU->xer_so) xerValue |= (1 << XER_BIT_SO);
	if (hCPU->xer_ov) xerValue |= (1 << XER_BIT_OV);
	return xerValue;
}

void PPCInterpreter_setXER(PPCInterpreter_t* hCPU, uint32 v)
{
	const uint32 XER_MASK = 0xE0FFFFFF;
	hCPU->spr.XER = v & XER_MASK;
	hCPU->xer_ca = (v >> XER_BIT_CA) & 1;
	hCPU->xer_so = (v >> XER_BIT_SO) & 1;
	hCPU->xer_ov = (v >> XER_BIT_OV) & 1;
}

// From PPCScheduler.cpp, with the recompiler off (the interpreter-only configuration).
void (*attemptEnterAddr)(PPCInterpreter_t* hCPU, uint32 enterAddress) = PPCInterpreter_jumpToInstruction;
void PPCCore_attemptToEnterAddr(PPCInterpreter_t* hCPU, uint32 enterAddress)
{
	hCPU->instructionPointer = enterAddress;
	attemptEnterAddr(hCPU, enterAddress);
}

// ---- hooks that only matter when a debugger, GPU or recompiler is attached ----------------
std::unique_ptr<GDBServer> g_gdbstub;
void GDBServer::HandleTrapInstruction(PPCInterpreter_t*) {}
void debugger_enterTW(PPCInterpreter_t*, bool) {}
void PPCRecompiler_attemptEnter(PPCInterpreter_t*, uint32) {}
void LatteBufferCache_notifyDCFlush(MPTR, uint32) {}
namespace coreinit { void codeGenHandleICBI(uint32) {} }
