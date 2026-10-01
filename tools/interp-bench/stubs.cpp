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
