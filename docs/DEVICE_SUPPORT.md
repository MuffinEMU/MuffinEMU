# Device support

MuffinEMU is built for every iPhone and iPad that runs its minimum iOS, not for one device.
The app reads what the device is and can afford once, at launch (`DeviceCapabilities`), and
every device-dependent default is derived from that. Nothing in the engine or the app carries a
number that was measured on a single model.

## Support matrix

| | |
|---|---|
| Minimum OS | iOS / iPadOS 15.0 (`project.yml`: `IPHONEOS_DEPLOYMENT_TARGET`) |
| Required hardware | 64-bit (`arm64`) with Metal (`UIRequiredDeviceCapabilities`) |
| Devices | iPhone 6s and later, iPhone SE (all), iPad Air 2 and later, iPad mini 4 and later, iPad (5th gen) and later, every iPad Pro, iPod touch (7th gen) |
| Orientation | Landscape (`project.yml`). On iPad the window can be resized live (Split View, Stage Manager) and the layout follows its size. |
| Renderer | Metal (default) or Vulkan through MoltenVK |
| Recompiler (JIT) | Needs a JIT enabler attached (StikJIT, SideStore, LiveContainer); without one the interpreter runs. iOS 26 and later uses dual-mapped JIT, and on devices with TXM (A15 and later, M2 and later on iOS 26.6; every A13 and later, M-series on iOS 27) the TXM path is used. |

Everything below is chosen at runtime. Nothing is keyed to a chip name except the TXM check,
which is a hardware fact.

## What is derived from the device

The snapshot (`src/Common/DeviceCapabilities.h`, filled in by `src/ios/Bridge/IOSDeviceCaps.cpp`)
holds: model identifier, chip family, Metal GPU family, `maxBufferLength`,
`recommendedMaxWorkingSetSize`, BC and ASTC-HDR support, mesh shader support, physical memory,
memory available at launch, performance and efficiency core counts, and screen class.
It is logged as one `DEVICE ...` line at the start of the crash log, the launch log, `log.txt`
and the device report, so reports from different devices compare line for line.

Memory tiers, from `hw.memsize`:

| Tier | RAM | Examples |
|---|---|---|
| low | under 4.5 GiB | 2, 3 and 4 GB iPhones and iPads |
| standard | 4.5 to 7 GiB | 6 GB: iPad Pro 2020, iPhone 14 to 16 |
| high | 7 GiB and up | 8 and 16 GB M-series iPads, 8 GB iPhones |

| Budget | low | standard | high |
|---|---|---|---|
| GPU buffer cache | 128 MB | 164 MB | 256 MB |
| Upload staging chunk | 16 MB | 32 MB | 64 MB |
| Texture readback ring | 32 MB | 32 MB | 64 MB |
| First JIT arena rung | 256 MB | 512 MB | 512 MB |
| Three emulated cores | never | offered, off by default | offered, off by default |
| Start a game with less than | about 340 MB free | about 390 MB free | about 510 MB free |

The buffer cache is also capped at the device's `maxBufferLength`. The texture-eviction marks
keep their 600 and 400 MB floors but are capped to a share of the memory the device actually has
free, and the low-memory card fires at 160 MB or 3% of launch headroom, whichever is larger.
A game that cannot fit is refused at launch with a message instead of being ended by iOS partway
through the boot.

Default Resolution is Balanced, and High on an A17 Pro or later and on M-series chips with 7 GiB
or more. Every setting but Battery saver keeps at least 720 lines on the short side of the
screen where the panel has them (an iPhone at half scale would otherwise be under 720).

BC textures are used natively where the GPU reports support, and transcoded to ASTC otherwise.
Mesh shaders need Apple7 (A14, M1) or later; on anything older geometry shaders are not
available and the Graphics settings say so.
