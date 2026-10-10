# MuffinEMU Audit

[![MuffinEMU](https://img.shields.io/badge/MuffinEMU-Audit%20design-E5652E?style=for-the-badge&labelColor=1d1d1f)](../README.md) [Back to the README](../README.md)

A standalone diagnostic app that exercises the MuffinEMU core on a real device with pathological test
scenes, asks the person holding the device what they saw and heard, and writes a structured report
that an agent or a person can read ("test X failed, the user reported Y, and these logs occurred on
this path"). It is meant to be rerun after every major core change and to find failures nobody wrote
a test for.

This document is the design (architecture, probe protocol, report schema, questionnaire, diff,
catalogue format) and the roadmap. Phase 1 is what is in the repository now; section 13 says exactly
what has and has not been verified.

- [1. Decisions at a glance](#1-decisions-at-a-glance)
- [2. Architecture options and the choice](#2-architecture-options-and-the-choice)
- [3. Packaging and build](#3-packaging-and-build)
- [4. What is where](#4-what-is-where)
- [5. Probe protocol](#5-probe-protocol)
- [6. Core hooks](#6-core-hooks)
- [7. Running a test](#7-running-a-test)
- [8. The report](#8-the-report)
- [9. Questionnaire model](#9-questionnaire-model)
- [10. Diff model](#10-diff-model)
- [11. Test catalogue format](#11-test-catalogue-format)
- [12. The first suite](#12-the-first-suite)
- [13. Phase 1: delivered, verified, not verified](#13-phase-1-delivered-verified-not-verified)
- [14. Roadmap](#14-roadmap)
- [15. Risks](#15-risks)

## 1. Decisions at a glance

| Question | Decision |
|---|---|
| Where do the tests run? | In a real Wii U program (`audit.rpx`, devkitPPC + wut) that goes through GX2, Latte, the renderer, AX, VPAD and coreinit like a game. A host-side check of the framebuffer judges what it drew. |
| How does the host know what the guest is doing? | Two channels: `MUFFINAUDIT` lines the guest prints with `OSReport` (they land in the core log in order with everything else), and a fixed mailbox in guest memory the host reads and writes through core hooks. |
| What judges a frame? | The core reads the presented frame back (Metal) and gives the app a summary and a 128x72 thumbnail; the app compares regions and statistics with the catalogue's expectations. A person answers only what automation cannot judge. |
| Separate app or a target in MuffinEMU? | Separate: `tools/audit-app`, bundle id `com.kiddreads.MuffinEMUAudit`, display name "MuffinEMU Audit". Shares no code, settings or UserDefaults with MuffinEMU and installs next to it. |
| Which core does it test? | The one built from a chosen MuffinEMU ref (`muffinemu_ref`, default `main`), built fresh by the audit workflow with `-DMUFFIN_AUDIT_HOOKS=ON`. The shipping build never contains the hooks. |
| How are tests defined? | As data: `Catalogue/suite-*.json` in the app bundle. Adding a file adds a suite. A new guest scene is a function in `guest/tests_*.c` plus one table entry. |
| How are reports compared? | `tools/audit-app/audit_diff.py known-good.json current.json`. |

## 2. Architecture options and the choice

### 2.1 Guest-side test programs (chosen, primary)

A real Wii U homebrew program exercises the emulation path a game does. This is the only option that tests
GX2 command encoding, Latte's interpretation of it, texture decoding, render-target management, AX, VPAD
and coreinit timing together, which is where the black-surface regression lives: it was not a renderer bug
in isolation but an interaction between what the guest asked for (copies between targets of different sizes
and mips) and what the core did with it.

Feasibility on GitHub runners: already demonstrated. `build-bench-rpx.yml` builds `cpubench.rpx`, `gpubench.rpx`
and `rainbow.rpx` in the pinned `devkitpro/devkitppc` container with wut, including GX2 shaders compiled with
CafeGLSL's `glslcompiler`. The audit workflow's `guest` job is the same recipe with the same pinned digest,
wut commit and compiler checksum, so nothing new has to be trusted. Phase 1 therefore delivers **guest RPX
tests, not a host-side renderer harness**.

The cost is that the guest is real code that has to be right: a wrong assumption about a GX2 layout produces a
false finding. The catalogue is written to keep that risk visible (section 12 lists which expectations rest on
an assumption) and the guest uses byte-order-neutral data wherever the layout is uncertain.

### 2.2 Host-side automated checking (chosen, used with 2.1)

The core reads back what the guest presented and the app judges it. This is what lets most tests run with no
human: clears, blends, depth, formats, copies, flicker, tearing. Implemented for Metal in phase 1
(`IOSAuditMetal.cpp`). Vulkan readback is phase 2.

The readback point is the scan-buffer texture view `LatteRenderTarget_copyToBackbuffer` hands to
`Renderer::HandleScreenshotRequest`, once per presented view, right after the frame was drawn to the layer.
That is before the output shader scales and filters it, so it tests what the guest drew, independent of the
device's screen size. Drawable-level checks (scaling, filters, post-processing, compositing over the UI) are
phase 2.

The core already has a screenshot path at that point, and it is not used: `MetalRenderer::HandleScreenshotRequest`
encodes a blit into a staging buffer and then reads the buffer on the CPU without committing or waiting for the
command buffer. The audit hook does the same blit but commits and waits (`Flush(true)`) before reading. That
costs a GPU stall per captured frame, which is why capture is armed only while a checkpoint is being judged and
why timing tests run with no capture.

### 2.3 Host-side direct renderer tests (not in phase 1)

Feeding synthetic Latte command streams straight to the renderer would cover the renderer in isolation and
make it possible to exercise states a real guest rarely produces. It is a supplement to 2.1, not a
substitute: a renderer that passes synthetic streams can still fail on what GX2 really emits, which is what
the black-surface regression was. Phase 3 (section 14).

### 2.4 Packaging

A separate app with its own project, bundle id and workflow (section 3).

## 3. Packaging and build

```
tools/audit-app/                 the app, its catalogue, schemas, tools and tests
  project.yml                    XcodeGen project: MuffinEMUAudit (NOT a target of MuffinEMU's project)
  Sources/{Model,Analysis,Engine,Support,UI}
  Catalogue/                     suite-*.json and anomaly-patterns.json (a folder reference in the bundle)
  guest/                         audit.rpx sources, probe protocol header, shaders
  schema/                        report.schema.json, suite.schema.json
  Tests/                         Swift logic tests, C++ frame-statistics test, diff-tool test
  audit_diff.py validate_*.py check_protocol.py run-host-checks.sh
src/ios/Bridge/IOSAudit*.{h,cpp}  the core hooks, compiled only with MUFFIN_AUDIT_HOOKS
.github/workflows/build-audit-ipa.yml
```

**Workflow** (`build-audit-ipa.yml`, "Build MuffinEMU Audit IPA"):

- `workflow_dispatch` with input `muffinemu_ref` (default `main`) and `prerelease` (default true); `pull_request`
  when the PR carries the `audit-ipa` label (artifacts only); `push` to `feature/audit-ipa` so the workflow can
  be validated before it exists on the default branch (GitHub offers `workflow_dispatch` only for workflows on
  the default branch).
- Jobs: `plan` (which ref), `checks` (host checks, no SDK needed), `typecheck-ios` (the whole app against the iOS
  SDK in about a minute), `guest` (audit.rpx), then `ipa`: check out the ref, build its core with the hooks, build
  the app, stamp the build identity into Info.plist, package, verify, upload.
- Output: artifact `MuffinEMU-Audit-<sha7>` (`MuffinEMU-Audit-<sha7>.ipa` for SideStore/AltStore/LiveContainer,
  `MuffinEMU-Audit-<sha7>-fakesigned.ipa` for TrollStore; `<sha7>` is the tested MuffinEMU commit) and, on a manual
  run, a pre-release `audit-<sha>`.
- It cannot publish a numbered release, move the `nightly` tag or touch `docs/*.json` or the SideStore source: the
  build job has read-only permissions, the only write is the pre-release job, `ci/generate-sidestore-source.py`
  lists only non-prerelease `vX.Y` tags and `nightly`, and `build-ios-app.yml` is not involved.
- A ref that predates the hooks fails fast with a message saying so. Auditing a ref older than the hooks (a
  known-good build from before this work) needs the hook overlay in phase 2.

**The flag.** `MUFFIN_AUDIT_HOOKS` (CMake option, default OFF; defines `MUFFIN_AUDIT_HOOKS=1` for every target).
With it off, the three edits to shared files preprocess to nothing and the new files compile to nothing. The
edits are `src/CMakeLists.txt` (the option and a source list), `MetalRenderer.cpp` (a declaration and three lines
at the top of `HandleScreenshotRequest`) and `iOSAudioAPI.mm` (three call sites). Nothing in `CemuBridge.mm`,
`MetalRenderer.h` or the Latte code changed, so the branches active in those files are not disturbed.

**Identity.** The workflow stamps `AuditMuffinRef`, `AuditMuffinSha`, `AuditMuffinVersion`,
`AuditCoreFingerprint`, `AuditToolsSha`, `AuditGuestBuild`, `AuditWorkflowRun` and `AuditBuiltAt` into Info.plist
and the app copies them into every report (`build` object, section 8).

**Disposable.** The app keeps no state between runs except exported reports: the core's data folder is deleted
at start, there is no migration code, and a new MuffinEMU revision means a new build.

## 4. What is where

| Piece | Files | Role |
|---|---|---|
| Guest | `guest/audit.c`, `tests_render.c`, `tests_av.c`, `audit_protocol.h`, `shaders/` | Scenes, the mailbox, the frame loop, the built-in sequence |
| Core hooks | `src/ios/Bridge/IOSAuditHooks.{h,cpp}`, `IOSAuditMetal.cpp`, `IOSAuditFrameStats.h` | Guest memory access, snapshot, readback, pacing, audio measurement |
| Runner | `Engine/AuditRunner.swift`, `TestExecution.swift`, `GuestSession.swift`, `HostActions.swift`, `InputScript.swift` | Boot, drive, watch, judge, record |
| Plumbing | `Engine/CoreDriver.swift`, `GuestLink.swift`, `LogCapture.swift` | The C API, the mailbox, the log |
| Judging (pure Swift) | `Analysis/*.swift` | Frame analysis, anomaly detection, checks, verdicts, pacing, planner, report writer |
| Data | `Model/Catalogue.swift`, `Report.swift`, `JSONValue.swift` | Catalogue and report types |
| Screens | `UI/AuditSession.swift`, `Views.swift` | Setup, run, questionnaire, reports, share |
| Tools | `audit_diff.py`, `validate_catalogue.py`, `validate_report.py`, `check_protocol.py` | Diff and validation |

## 5. Probe protocol

Version 1. Specified by `guest/audit_protocol.h`; `check_protocol.py` fails CI when `GuestLink.swift` disagrees.

### 5.1 Why two channels

The log is ordered with everything the core prints, which is what makes "which test, phase and checkpoint was
running when this line appeared" answerable, and it needs no hook. But parsing a log is a poor way to send
commands or to read state at 50 Hz. The mailbox is a fixed structure in the guest's `.bss`: the guest announces
its address once on the log, and the host reads and writes it through `cemu_audit_guest_read/write` (limited to
the guest's data range, 0x10000000 to 0x50000000, and answering false while no title runs).

### 5.2 Log markers (guest to host)

`OSReport` lines, found anywhere in a log line (the core prefixes its own timestamp):

```
MUFFINAUDIT HELLO <protocol> <build> mailbox=0x<addr> tv=<w>x<h>
MUFFINAUDIT TEST_BEGIN <id> <token> seed=<n> <params>
MUFFINAUDIT PHASE <id> <token> <name>
MUFFINAUDIT CHECKPOINT <id> <token> <name> frame=<n>
MUFFINAUDIT NOTE <id> <token> <free text>
MUFFINAUDIT SELF <id> <token> <pass|fail|info> <free text>
MUFFINAUDIT TEST_END <id> <token> <ok|error|aborted> checksum=<hex> frames=<n> errors=<n>
MUFFINAUDIT BYE
```

The host writes its own tags into the same stream with `cemu_bridge_log_line("AUDIT> BEGIN <id> token=..")`, so
the core's `log.txt` carries the test ids too, not only the report's slices.

The core's log reaches the app through the bridge's tail of `log.txt`, which polls every 250 ms. Lines therefore
arrive up to 250 ms after they were written: their order is exact, their timestamps (`tNs`) have that resolution,
and the runner cuts each test's slice between that test's own `AUDIT> BEGIN` and `AUDIT> END` tags, which sit in the
log in the order things happened, instead of at the moment the app noticed the test had ended. The mailbox, the
frames and the snapshots are read directly and are not subject to the delay.

### 5.3 Mailbox (both ways)

512 bytes, big-endian 32-bit words and NUL-terminated strings. Key offsets (full table in the header):

| Offset | Field | Direction |
|---|---|---|
| 0x000 | magic `MAUD`, written last during the guest's start-up | guest |
| 0x008 | state: 0 boot, 1 idle, 2 running, 3 checkpoint, 4 fatal | guest |
| 0x010 | frames presented | guest |
| 0x014 | run token of the current or last test | guest |
| 0x018 | checkpoint sequence (bumped at every checkpoint) | guest |
| 0x01C | last test result: 1 ok, 2 error, 3 aborted, 4 unknown test | guest |
| 0x030..0x054 | input the guest read: hold mask, sticks x1000, touch, counters | guest |
| 0x05C, 0x060 | audio state and sweep step | guest |
| 0x080 / 0x0B0 / 0x0E0 | checkpoint name / test id / last message | guest |
| 0x100 | command: 1 run, 2 continue, 3 abort, 4 exit, 5 ping | host |
| 0x104 | command sequence (written last; the guest acts when it differs from 0x02C, the acknowledged sequence) | host |
| 0x108..0x110 | run token, duration, seed | host |
| 0x120 / 0x150 | test id / parameters `key=value;key=value` | host |

### 5.4 Flow of one test

```
host                                 guest
 |  write id, params, token, seed      |
 |  cmd = RUN, cmdSeq++ --------------->|  state RUNNING, TEST_BEGIN on the log
 |                                      |  draws scene frames (PHASE lines)
 |                                      |  CHECKPOINT: state = CHECKPOINT, checkpointSeq++,
 |<------- sees checkpointSeq change ---|  keeps presenting the same scene
 |  arm frame capture, read N frames    |
 |  judge them against the catalogue    |
 |  cmd = CONTINUE, cmdSeq++ ---------->|  leaves the checkpoint
 |                                      |  ...more phases, checkpoints...
 |<------- state IDLE + result ---------|  TEST_END on the log
```

The guest waits at a checkpoint for up to 30 s for the host and then reports the timeout as its own error
(`SELF fail`). `ABORT` ends the running test; the host sends it on its own timeout and on the user's Stop.

### 5.5 Runs without the app

If no command has ever arrived 8 s after `HELLO`, the guest plays a built-in sequence (orientation, clears, blends,
depth, formats, copies, feedback, lifecycle, flicker, motion, audio) with default parameters, holding each
checkpoint for 1.5 s, and logs every step as `MUFFINAUDIT` lines. That is the "reproduce outside the tool" recipe:
load `audit.rpx` (attached to the workflow run as `audit-rpx`) in MuffinEMU or any other Wii U emulator and
compare what is drawn and logged.

## 6. Core hooks

`src/ios/Bridge/IOSAuditHooks.h` (plain C, imported by the app's bridging header). API version 1
(`cemu_audit_api_version()`), refused by the app on mismatch.

| Function | Purpose |
|---|---|
| `cemu_audit_now_ns` | The clock every timestamp uses (monotonic ns). |
| `cemu_audit_set_log_profile` | 0 probe lines only, 1 audit (adds GX2, texture cache, sound, input, API errors, readback), 2 verbose. |
| `cemu_audit_guest_read/write` | Mailbox access. |
| `cemu_audit_snapshot_json` | One JSON object of core state, see below. |
| `cemu_audit_capture_arm/cancel/pending/pop` | Frame readback queue. |
| `cemu_audit_frame_timing_enable/drain` | A timestamp per TV present, taken on the GPU thread. |
| `cemu_audit_audio_reset/get` | Audio output measurement. |

**State snapshot** (`tNs`, `titleRunning`, and these objects; counters are cumulative, the app reports the delta over each test):

- `latte`: frameCounter, flipCounter, drawCallCounter, textureBindCounter, flipRequestCount, gx2InitCalled, tvBufferUsesSRGB, drcBufferUsesSRGB, activeShaderHasError
- `gpuThread` (from `LatteWait`): waitReason and kind, timeouts, gpuPresumedLost, gpuError and code, pm4Count, queriesInFlight, readbacksPending, executingCommandBuffers, erroredCommandBuffers, cbSubmitted, cbRetired, cbErrorStreak, cbLastErrorCode, presentedFrames, drawableFailures, tvDrawableWidth and height, tvLayerAttached
- `gpuMemory`: device, host-mapped, texture count and MB, staging, index, snapshot, buffer cache, xfb, readback MB, texturesEvicted, evictionPasses
- `perf` (from `PerfTelemetry`): ppc and GPU idle/sync/drawable-wait ns, Metal GPU ns and command buffers, presents, shader and pipeline compiles and sync compiles, JIT blocks, invalidations and arena failures, plus the published summary (host and guest fps, vsync rate, busy percentages, bottleneck)
- `renderer`: api, vramUsedMB, vramTotalMB, padWindowActive
- `memory`: availableBytes (what iOS would still allow), footprintBytes
- `audio`: callbacks, frames, validFrames, underrun callbacks and frames, feedRejects, silentCallbacks, discontinuities, maxStep, peak, longestZeroRun, channels, rms

**Frame readback** delivers, per captured frame, a summary (mean colour, black and white fractions, luma range, a
64-bit hash of every pixel) and a thumbnail (default 128x72, box-filtered). The statistics code is pure C++
(`IOSAuditFrameStats.h`) and unit-tested on a Mac. Supported source formats: RGBA8, BGRA8 (both with sRGB
variants) and RGB10A2; others are reported as `unsupported_format` and the affected expectations are
inconclusive (a warning), never a pass.

**Audio measurement** runs on the device's render callback (`iOSAudioAPI.mm`): it counts callbacks the ring buffer
could not fill (underruns, with the frames padded with silence), blocks the emulated AX could not queue
(overruns), callbacks that were entirely zero, sample-to-sample jumps above 12000 (clicks), the largest jump, the
peak, the longest run of zero frames and the RMS level. This measures what reaches the device, so "the tone was
there and clean" is checkable without a person; the person still answers whether it sounded right.

## 7. Running a test

`AuditRunner` (one per run):

1. Capture the device capabilities line (`cemu_device_caps_line`) and the core's device report, initialise the
   core with the settings every audit run gets (no clock ladder, no accuracy mode, one emulated CPU core, real-time
   clock, log profile 1).
2. Plan: selected suites, `quick` tags in quick mode, unattended tests repeated in a seed-decided new order per pass
   in soak mode. The test tagged `calibration` goes first whenever a frame-judged test is selected.
3. For each test: boot or reuse the guest (register the render surface on the main thread, boot on a background
   task, wait for `HELLO` and the mailbox magic), tag the log, snapshot, send `RUN`, then loop every 20 ms: drain
   the log, read the mailbox, sample the snapshot every 0.5 s, drain present timestamps, handle checkpoints, run the
   input script, watch for a stalled picture, enforce the timeout.
4. At a checkpoint: arm capture for the views and frame count the catalogue asks for, wait for the frames, evaluate
   each expectation, keep a PNG of the last frames when anything failed, answer `CONTINUE`.
5. At the end: final snapshot, whole-test checks, anomaly scan (log patterns, counters, memory growth, pacing,
   stalled picture), questionnaire, verdict, record. The report is rewritten after every test, so a run that dies
   part-way leaves a usable report with `verdict: incomplete`.
6. A latched GPU error, a dead title, an unreadable mailbox or an unanswered `ABORT` makes the next test restart the
   guest instead of running into the wreckage.

Orientation: the `orientation` test draws a marker in each corner; the app reads which way the screen came out and
maps every later expectation through it, so a flipped output is reported once as a finding instead of failing
everything.

The app keeps the screen awake for the length of a run and must stay in the foreground: iOS suspends GPU work for a backgrounded app, which stops the guest and fails the test in progress. Every run records the thermal state at start and end. In a long soak, tests that pass after the first forty are recorded without per-frame detail, snapshots and most of the log, and the report file is rewritten every tenth test after the first hundred.

## 8. The report

`Documents/MuffinAuditReports/<yyyyMMdd-HHmmss>-<sha7>-<device>/` (visible in the Files app under
"MuffinEMU Audit"), shareable as a zip from the Reports tab:

```
report.json   machine-readable, schema/report.schema.json (schema id muffinaudit.report/1)
report.md     the same, for people
logs/         the complete log slice of every test
frames/       PNG thumbnails of the frames of failed checkpoints
```

**Top level** of `report.json`: `schema`, `reportId`, `createdAt`, `finishedAt`, `tool`, `build`, `device`, `config`,
`summary`, `findings`, `tests`, `anomalies`, `notes`.

- `build`: `muffinRef`, `muffinSha`, `muffinVersion`, `coreFingerprint`, `hooksBuildInfo`, `auditAppVersion`,
  `auditAppBuild`, `auditToolsSha`, `guestBuild`, `workflowRun`, `builtAt`. "Build and core identifiers".
- `device`: machine (`hw.machine`), OS, the core's device report and capabilities line verbatim, chip, tier, Apple
  GPU family, `bcTextures` (native BC or transcoded), Metal 3, memory, cores, screen, thermal state, low power mode,
  whether JIT is permitted. "The device capabilities line" is here on every device.
- `config`: mode, suites, seed, renderer, CPU mode reported by the core, cores running, attended, repeat/soak, log
  profile, whether frame readback was available.
- `summary`: verdict (`pass`, `fail`, `incomplete`), counts, duration, `affectedSubsystems` (failed tests and
  anomalies per dotted subsystem name), anomaly counts.
- `findings`: one per test that failed or could not complete, written to be read on its own. Fields: `testId`,
  `result`, `reason`, `sentence` ("Test rt_copy failed: ... The user reported: ... On this path the log shows: ..."),
  `subsystems`, `failedExpectations`, `failedChecks`, `userReported`, `logHighlights`, `path`, `reproduce`.
- `tests[]`: one record per run of a test (soak repeats a test; `iteration` says which pass):
  - `result` (`pass`, `fail`, `skip`, `error`) and `reason`
  - `configuration`: guest test, parameters, seed, renderer, CPU mode; `stimulus` and `expected` from the catalogue
  - `path`: the probe markers in order (phases, checkpoints, self-checks, notes), which is "the path exercised"
  - `checkpoints[]`: each with the frames captured (summary and hash per frame) and every expectation with
    `expected`, `measured`, numeric `values`, `severity` and `pass`
  - `checks[]` (audio windows, memory growth, pacing) and `scriptSteps[]` (input script)
  - `answers[]`: each answer with the question, the answer, whether it counts as a problem, its timestamp (`tNs` and
    wall clock), the test and run token, and `logContext`, the log lines from just before the test ended to the moment
    of the answer
  - `userFlags[]`: moments the person tapped "Flag a glitch" during the test, each with the log around it
  - `performance`: present-interval statistics (count, mean, p50, p95, p99, max, fps, long and very long frames, lost
    timestamps), reported fps, memory footprint start/end/peak, lowest headroom, thermal state
  - `snapshotBefore`, `snapshotAfter`, `snapshotDelta`: the core state, cumulative and as a delta ("relevant core state")
  - `logSlice`: start and end, line count, dropped lines, the lines (bounded; the full slice is `logs/...txt`), each
    tagged `guest`, `host` or untagged (the core's own)
  - `anomalies[]`: what the audit detected on its own during this test
  - `reproduction`: seed, parameters, the mailbox command that starts exactly this test, and the outside-the-tool recipe
- `anomalies[]` at the top level: every anomaly of the run.

All timestamps `tNs` are nanoseconds on the core's monotonic clock, so a log line, a frame, a snapshot and an
answer can be ordered against each other exactly.

**Automatically detected anomalies** come from four places: core log lines matching `Catalogue/anomaly-patterns.json`
(page fault, drawable acquisition failures, command-buffer errors, shader compile failures, out of memory, assertions,
unsupported operations, ...), counters that should not move (GPU error, errored command buffers, drawable failures,
audio underruns), memory (low headroom, steady growth across a test), and timing (stutter, lost timestamps). Severity
`fail` fails the test; `warn` and `info` are recorded.

**Verdict rules.** A test is `error` when it could not run to completion (guest would not start, hung, title died,
cancelled), `fail` when any `fail`-severity expectation, check or script step failed, a question marked as a problem
has severity `fail`, an anomaly of severity `fail` was detected, or the guest reported an error itself; otherwise
`pass` (warnings are counted in the reason). An expectation that cannot be judged (no frame captured, unreadable
format) is `warn` with `inconclusive`, so a missing capture never reads as either a pass or a rendering failure.

## 9. Questionnaire model

Questions are part of a test's catalogue entry and are asked after the test, in the app, with the stimulus
repeated above them. Types: `yesno` (with `bad: yes|no`), `scale` (1 to 5 with `badBelow`), `choice` (with
`options` and `badOptions`), `text`. Each has a severity (default `fail`; `warn` and `info` are recorded without
failing the test) and a subsystem.

Every answer is stored against the exact test that just ran (test id and run token), with the time it was given
and the log context (section 8). The questions of the first suite include: "Did you see black spots or flicker?",
"Did the colours look correct?", "Did the animation look smooth?", "Did the audio sound clean? Any pops, crackles
or silence?" (a choice: clean, pops or clicks, crackling, dropouts or silence, distorted or wrong pitch, no sound).

Unattended soak runs ask nothing; the automatic checks judge them.

While a test runs, the run screen has a **Flag a glitch** button. Each tap is timestamped on the same clock and
stored with the surrounding log lines, because the moment someone saw a glitch is more useful to an agent than
their memory of it afterwards.

## 10. Diff model

```
tools/audit-app/audit_diff.py KNOWN_GOOD.json CURRENT.json [--markdown out.md] [--json out.json]
        [--fail-on regression|change|never] [--fps-drop-pct 10] [--p99-rise-pct 25] [--memory-rise-pct 15] [--measure-shift 8]
```

Tests are matched by id. Compared, in this order:

1. **Like for like?** Device, OS, renderer, CPU mode, pad surface, attended, frame readback and catalogue hash are
   compared first; any difference is listed under "Not like for like", because then a change is not necessarily a
   regression. The build difference (ref, commit, version, core fingerprint, guest and app build) is listed as context.
2. **Verdicts.** pass to fail/error is a regression, fail to pass an improvement; other moves, changes of pass rate in
   a soak, and "still failing for a different reason" are changes.
3. **Expectations and checks**, by name: a flip is a regression or improvement; if both sides have the same verdict
   but a measured value moved by more than `--measure-shift` (a colour channel, an audio level) it is changed
   behaviour. That is how "it still passes but looks different" is found.
4. **The listener's answers**, by question: a new problem report is a regression.
5. **Anomalies**, by id and subsystem: new ones (a new `fail` anomaly on a passing test is a regression) and
   resolved ones.
6. **Performance**: frame rate drop, 99th-percentile frame time rise, more very long frames, peak memory rise, less
   headroom.
7. **Core counters** that started moving or multiplied (texture evictions, command-buffer errors, pipeline
   compiles on the GPU thread, audio underruns, ...).

Exit status: 0 nothing regressed, 1 regression (or any change with `--fail-on change`), 2 not comparable.
The JSON output (`muffinaudit.diff/1`) carries the same lists for an agent: `regressions`, `improvements`,
`changes`, `newAnomalies`, `resolvedAnomalies`, `performance`, `counters`, `context`, `notComparable`.

## 11. Test catalogue format

A suite is one file, `Catalogue/suite-<name>.json`, schema `muffinaudit.suite/1`
(`schema/suite.schema.json`; `validate_catalogue.py` checks it in CI and also checks it against the guest source).

```jsonc
{
  "schema": "muffinaudit.suite/1",
  "suite": "black-surface",              // lowercase, digits, dashes
  "title": "Black-surface regression",
  "order": 10,
  "tests": [
    {
      "id": "bs.rt_copy",                 // unique across all suites
      "title": "Render-target copies: sizes and mip levels",
      "subsystems": ["render.copy", "render.mip"],   // the report rolls failures up by these
      "kind": "guest",                    // or "host"
      "guest": { "test": "rt_copy",       // a name in the guest's test table
                 "params": { "hold": "30" },   // key=value passed to the guest; every key must be read by the guest
                 "durationMs": 0,         // 0 = the test's own default
                 "seedMode": "random" },  // fixed (default) or random (derived from the run's seed)
      "requires": { "minTier": 1, "apis": ["metal"], "pad": true, "attended": true },
      "estimatedSec": 12, "timeoutSec": 90,
      "tags": ["quick", "soak", "calibration"],
      "stimulus": "What is shown.",
      "expected": "What correct looks like.",
      "reproduce": "How to see it outside the tool.",
      "checkpoints": [ { "name": "copy_cells",           // or "churn_*"
                         "capture": { "views": ["tv"], "count": 1 },   // no "capture" = hold and release only
                         "expect": [ /* expectations */ ] } ],
      "checks": [ /* whole-test checks */ ],
      "script": [ /* input script steps */ ],
      "questionnaire": [ /* questions */ ],
      "soak": { "weight": 2, "paramVariants": [ { "size": "128" }, { "size": "512" } ] }
    }
  ]
}
```

**Expectations** (evaluated on the captured frame(s); rects are `[x, y, w, h]` from 0 to 1, y measured from the top
as the guest draws; `tol` is the allowed channel difference; `severity` `fail` (default), `warn` or `info`):

| type | fields | passes when |
|---|---|---|
| `region_color` | rect, rgb, tol | the mean colour of the rect (inset 15%) is within tol of rgb |
| `quadrants` | rect, tl, tr, bl, br, tol | each asserted quarter of the rect has its colour (null = not asserted) |
| `not_black` | rect?, maxBlackFraction | at most that share of the rect is black |
| `mean_color` | rgb, tol | the whole frame's mean colour |
| `orientation` | | always informational; measures how the screen came out |
| `frames_identical` | maxDistinct | across the burst there are at most that many distinct frame hashes |
| `frame_counter` | maxTornFraction, maxBackwards | the frame numbers drawn at the top and bottom agree and increase |

Add `"view": "pad"` to judge the GamePad frame.

**Checks** (whole test): `audio_window` (step 1 to 4; minRms, maxUnderrunFrames, maxDiscontinuities, minPeak,
maxPeak), `memory_growth` (maxGrowthMB), `frame_pacing` (minFps, maxP99Ms, maxLongFraction), `guest_clean`.

**Script steps** (input): `press`, `stick`, `touch`, `release`, `await_physical`, `wait`; the app injects the input
through the bridge and compares with what the guest reports in the mailbox.

**Adding things.**

- A test of something the guest already draws: add an entry to `tests` with new expectations.
- A new suite: add `suite-<name>.json`; it is in the next build (the folder is a folder reference).
- A new guest scene: a `BOOL TestX(Ctx *ctx)` in `guest/tests_render.c` (scenes are `SceneFn`s, presented with
  `HoldScene(ctx, "checkpoint name", frames, bg, scene, user)`), a line in the test table, then the catalogue entry.
  Keep scenes deterministic and draw through `DrawRect`/`DrawTexRect` (screen space, y down).
- A new failure signature: a line in `Catalogue/anomaly-patterns.json`.

## 12. The first suite

`suite-black-surface.json`, 19 tests, aimed at the black-surface regression and everything that looks like it. "Auto"
is judged by the app from readback, counters and the mailbox; "Person" is the questionnaire.

| Test | Covers | Auto | Person |
|---|---|---|---|
| `bs.orientation` | which way the screen came out, corner markers | orientation, not black | corners correct? black/flicker? |
| `bs.clear_colours` | clears to 7 colours | whole-frame colour, not black | black/flicker? colours correct? |
| `bs.clear_colours_pad` | TV and GamePad clears (needs the pad surface) | both frames' colours | pad correct? |
| `bs.blend_alpha` | 8 blend set-ups incl. textured alpha | colour of each cell | blends smooth? |
| `bs.depth_test` | LESS, GREATER, ALWAYS, NEVER, depth write off, both orders | 24 regions | clean overlaps? |
| `bs.texture_formats` | 19 formats: RGBA8/sRGB/16/16F/32F, RG8, R8, 565, 5551, 4444, 10:10:10:2, BC1 to BC5, sRGB BC1 to BC3 (BC transcoded where the GPU has no native BC) | 19 cells x 4 quadrants | any black cell? colours right? |
| `bs.rt_copy` | GX2CopySurface: same size, from mip 1 and 2, source smaller than destination, source larger, into mip 1 | 6 cells; the small-into-large case asserted, large-into-small only required not to be black | any square black? |
| `bs.rt_copy_fuzz` | random sizes, mip counts, levels and formats from the seed; every iteration's parameters logged | result not black | garbage or flashes? |
| `bs.rt_feedback` | render to target, sample into another and back x6, with D32F, D16, D24S8, D24X8 depth buffers | 4 cells x 4 quadrants | any column black or smeared? |
| `bs.texture_churn` | create, use and discard textures far faster than a game; eviction under pressure; a never-freed canary | 64 grid cells, canary, control rectangle at every check; guest errors; memory settling | flashes? |
| `bs.texture_churn_heavy` | the same at 256 MB resident (tier 1 and up) | as above | as above |
| `bs.rt_lifecycle` | create, draw and destroy six targets up to 1280x720, 30 times | 6 cells at 3 checks; memory growth | flashes? |
| `bs.flicker_static` | a static scene over time | 40 frames early and 40 late must be bit-identical | flicker, shimmering lines? |
| `bs.motion_counter` | tearing and frame order: frame number drawn top and bottom | numbers agree and increase in 40 frames | smooth? |
| `bs.frame_pacing` | present intervals on the GPU thread, no readback | fps, p99, long frames (warnings) | smooth? |
| `bs.audio_sweep_lpcm16` | tone, sweep up, sweep down through one AX voice, TV and GamePad mix | underruns, clicks, level, peak per window | clean? pitch smooth? |
| `bs.audio_sweep_lpcm8` | the same from an 8-bit PCM voice to the TV | as above | as above |
| `bs.input_echo` | 14 buttons, 2 stick clicks, both sticks in 5 directions, 4 touch points through the core's input path; then 6 s for a real button or touch | mailbox vs what was injected | did the echo follow you? |
| `bs.lifecycle_reboot` | boot and stop the guest 5 times | each boot reaches frames; memory after each stop | |

Assumptions the catalogue rests on (a mismatch here means check the assumption before the core):

- **Orientation.** Expectations are written in the guest's own screen space and mapped through what the orientation
  test measures, so they hold whichever way the screen comes out.
- **Byte order.** The packed formats (565, 5551, 4444, 10:10:10:2) carry white and black only, and the compressed
  blocks are built with equal bytes in every 16-bit word, so neither channel order nor 16-bit byte order can change the
  answer. 16-bit and 32-bit component formats are written in the guest's big-endian byte order, as GX2 expects.
- **BC formats on linear surfaces.** The guest uploads BC data into `GX2_TILE_MODE_LINEAR_ALIGNED` surfaces (so it needs
  no tiling code) and takes the row size from `GX2CalcSurfaceSizeAndAlignment`. If the core does not accept linear
  compressed surfaces, the four BC cells are the ones to look at first.
- **Copies between different sizes** are not defined by the hardware; only "source smaller than destination" is
  asserted (its overlapping region), the rest is required not to be black.
- **Touch position.** The mapping from the injected point to the guest's calibrated coordinates is the most
  layout-dependent part of input; it is a warning, while "the guest saw a touch" is a failure.
- **Sampling RGB10A2 and sRGB.** sRGB expectations apply the sRGB-to-linear curve to the decoded 565 colours with a
  tolerance of 20 because decoders round differently.

## 13. Phase 1: delivered, verified, not verified

**Delivered**

- The app (runner, questionnaire, per-test log tagging, state snapshots, JSON and Markdown report writer, share and
  export, flag-a-glitch), the catalogue with the first suite, the schemas, the diff script, the host checks.
- The guest program with 15 tests, the probe protocol and the built-in sequence: real GX2/AX/VPAD guest programs, **not** a
  host-side renderer harness (section 2.1 explains why guest RPX builds were feasible).
- The core hooks, behind `MUFFIN_AUDIT_HOOKS`.
- The separate workflow.

**Verified** (by CI and by checks run while writing it)

- The Swift logic, the catalogue, the protocol constants, the C++ frame statistics and the diff tool have unit tests that
  run on a Mac in the `checks` job (over 500 checks, including the real catalogue and a sample report written by the real
  writer and validated against the report schema).
- The guest sources type-check against the real wut headers at the pinned commit.
- The app type-checks against the iOS SDK in the `typecheck-ios` job.
- The workflow builds the core with the hooks, audit.rpx and the IPAs; see the pull request for the run.

**Not verified** (needs a device and a person; the pull request says so too)

- No run of the app on a device has been done by the author of phase 1. Whether every guest test runs to its end, whether
  the frame readback returns what the scene drew, and whether the catalogue's expectations (colours, tolerances, the
  assumptions above) hold on a correct core are all untested. Expect the first real run to need some expectation tuning,
  and treat a finding from it as a hypothesis until it is cross-checked: load `audit.rpx` in desktop Cemu and compare.
- The frame readback path (`IOSAuditMetal.cpp`) commits and waits inside `HandleScreenshotRequest`; it has not been
  exercised under load.
- The pre-release publishing step is identical to the bench workflow's but has not run.

## 14. Roadmap

**Phase 2: make the first runs trustworthy and widen the net**

- First device runs on an A12Z iPad and a recent iPhone; tune expectations; record a known-good report per device class as
  the diff baseline.
- Vulkan (MoltenVK) readback, so the same suite runs on both renderers and the diff can compare them.
- Drawable-level capture: scaling, upscale and downscale filters, letterboxing, gamma, stretch, the GamePad surface
  composited next to the TV, overlay and UI over the game, flipped output.
- Hook overlay: a script that applies the hooks to an older MuffinEMU ref, so a known-good build from before the hooks can be
  audited.
- More guest scenes: video playback (H.264 through the core's decoder), 3D scenes with real vertex and geometry shaders,
  shader variants (alpha test, clip planes, stream-out, multiple render targets, MSAA resolve), compositing of several
  scan-buffer updates per frame, occlusion queries, tessellation, more formats and sizes (non-power-of-two, 3D and cube
  textures, array slices), mip chains uploaded from the CPU, stencil.
- Audio: sample-accurate checks (correlate the tone with the expected waveform), more formats (ADPCM), channel layouts,
  microphone input.
- Timing: frame-pacing against the display's refresh on ProMotion devices, vsync on and off, `GX2SetSwapInterval` values.
- A Swift screen for the diff, and a read-only view of a report with thumbnails in the app.

**Phase 3: find what nobody thought to test**

- Structured fuzzing in the guest: random GX2 state combinations from a seed (formats, sizes, blend and depth state, draw
  order), logged so any frame can be reproduced; the copy fuzz in phase 1 is the pattern.
- Differential mode: run the same seed on two cores and report the first frame where they differ.
- Direct renderer tests with synthetic Latte command streams (section 2.3).
- Long soaks with memory and GPU counters charted over hours, jetsam and thermal correlation, automatic bisection of a soak
  failure down to the test and iteration.
- Anomaly pattern learning: new log lines that appear only in failing runs are proposed as patterns.

**Phase 4: make it routine**

- Scheduled audits of main and of release candidates, reports archived, the diff posted on the pull request.
- A device farm profile (several devices, one report each, one combined diff).

## 15. Risks

- **Unverified on device.** See section 13. The largest risk is a wrong assumption in a guest scene or an expectation
  producing a false failure. Mitigations: byte-order-neutral data, the orientation calibration, inconclusive results are
  warnings, every finding carries its path and log so it can be checked, the built-in sequence lets the same scenes run on
  another emulator.
- **The readback stalls the GPU thread per captured frame**, so a capture run is slower than real time and `frame_pacing`
  is measured in a test with no capture. Forty-frame bursts are short but they do change timing while they run.
- **Guest memory access from the host.** The hooks refuse anything outside the guest's data range and any access while no
  title runs, but they read and write guest memory from another thread without the scheduler's lock; the mailbox is
  written payload first and sequence number last, and only ever touches 32-bit aligned words.
- **The log ring holds 1024 lines and is fed by a 250 ms tail.** The app drains it every 20 ms and counts what it lost (`droppedLines`); a burst of
  thousands of lines between drains (verbose logging during a heavy test) still loses some. Profile 1 is chosen to stay
  quiet.
- **Hooks drift.** The hooks read core internals (`LatteWait`, `PerfTelemetry`, `LatteGPUState`, `g_renderer`). A core change
  that renames them breaks the audit build, not the shipping build, and the audit workflow's compile is the alarm.
- **An audit core is not the shipping core.** The hooks add work on the GPU and audio threads only while capture or timing is
  armed, but they are compiled in; results describe the core plus the hooks. The report says so in `hooksBuildInfo`.
- **Memory pressure tests can get the app killed.** The heavy churn test is limited to tier 1 and up; a jetsam is visible as
  a missing report tail (the report is rewritten after every test, so everything before it survives).
- **Expectation tolerances are a judgement.** They are in the catalogue, in one place, and the diff reports a value that moved
  even when both runs passed.
