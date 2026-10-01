#!/bin/bash
# Build the interpreter harness for one dispatch configuration.
#   build.sh VARIANT OUTFILE [extra compiler flags...]
# VARIANT: default   the shipped configuration (block cache + threaded dispatch on arm64)
#          nocache   threaded dispatch only (block cache compiled out)
#          plain     neither: one switch per instruction, the pre-optimisation shape
#          custom    only the extra flags given
set -eo pipefail
VARIANT=$1; OUT=$2; shift 2
case "$VARIANT" in
  default) DEFS=() ;;
  nocache) DEFS=(-DPPC_INTERPRETER_DISABLE_BLOCK_CACHE) ;;
  plain)   DEFS=(-DPPC_INTERPRETER_DISABLE_BLOCK_CACHE -DPPC_INTERPRETER_DISABLE_THREADED_DISPATCH) ;;
  custom)  DEFS=() ;;
  *) echo "unknown variant $VARIANT"; exit 2 ;;
esac
BREW=$(brew --prefix)
IDIR=src/Cafe/HW/Espresso/Interpreter
WORK=$(mktemp -d)
FLAGS=(-std=c++20 -O3 -DNDEBUG -DARCH_ARM64 -DCEMU_PLATFORM_MACOS -DEMULATOR_HASH=interpbench
       -DEMULATOR_VERSION_MAJOR=0 -DEMULATOR_VERSION_MINOR=0 -DEMULATOR_VERSION_PATCH=0 -DVK_NO_PROTOTYPES -w
       -I src -I src/Cafe -I src/Common -I src/Cafe/HW/Espresso/Interpreter -I tools/interp-bench -I . -isystem "$BREW/include"
       -include tools/interp-bench/prefix.h -include src/Common/precompiled.h)
pids=()
for f in "$IDIR/PPCInterpreterImpl.cpp" "$IDIR/PPCInterpreterFPU.cpp" "$IDIR/PPCInterpreterPS.cpp" \
         "$IDIR/PPCInterpreterHLE.cpp" "$IDIR/PPCInterpreterOPC.cpp" \
         tools/interp-bench/stubs.cpp tools/interp-bench/interp_harness.cpp; do
  o="$WORK/$(basename "$f").o"
  clang++ "${FLAGS[@]}" "${DEFS[@]}" "$@" -c -o "$o" "$f" &
  pids+=($!)
done
rc=0; for p in "${pids[@]}"; do wait "$p" || rc=1; done
[ $rc -eq 0 ] || { echo "compile failed"; exit 1; }
clang++ -o "$OUT" "$WORK"/*.o -L"$BREW/lib" -lfmt 2> "$WORK/link.err" || {
  echo "link failed; unresolved symbols:"; grep -A1 "Undefined symbols\|^  \"" "$WORK/link.err" | grep '^  "' | sed 's/^  "\(.*\)", referenced from:/\1/' | sort -u | xcrun c++filt -_
  exit 1; }
rm -rf "$WORK"
