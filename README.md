<p align="center">
  <img src="docs/icon.png" width="128" height="128" alt="MuffinEMU icon">
</p>

<h1 align="center">MuffinEMU</h1>

<p align="center">
  Wii U emulation for iPhone and iPad.
</p>

<p align="center">
  <strong>Official website: <a href="https://muffinemu.github.io/MuffinSite-Remastered/">kiddreads.github.io/MuffinEMU</a></strong>
</p>

<p align="center">
  <a href="https://github.com/kiddreads/MuffinEMU/releases/latest"><img src="https://img.shields.io/github/v/release/kiddreads/MuffinEMU?label=release&color=c8894d" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/iOS-15%2B-555" alt="iOS 15+">
  <a href="LICENSE.txt"><img src="https://img.shields.io/badge/license-MPL--2.0-555" alt="License: MPL-2.0"></a>
  <a href="https://kiddreads.github.io/MuffinEMU/"><img src="https://img.shields.io/badge/docs-kiddreads.github.io-555" alt="Documentation"></a>
</p>

<p align="center">
  <a href="https://kiddreads.github.io/MuffinEMU/docs/installation.html">Install</a> ·
  <a href="https://kiddreads.github.io/MuffinEMU/docs/">Documentation</a> ·
  <a href="https://github.com/kiddreads/MuffinEMU/releases">Releases</a> ·
  <a href="https://github.com/kiddreads/MuffinEMU/issues/new/choose">Report a bug</a> ·
  <a href="https://github.com/kiddreads/MuffinEMU/blob/stats/STATS.md">Community stats</a>
</p>

---

MuffinEMU (also written Muffin EMU or Muffin-EMU) is a free, open-source Wii U emulator for iPhone and iPad: a native SwiftUI app on its own Cemu-based core, with a Metal renderer, an on-screen GamePad measured from the real hardware, and JIT where iOS allows it. The official website is [kiddreads.github.io/MuffinEMU](https://kiddreads.github.io/MuffinEMU/), and this repository is its official source code and release page.

## Features

- **Library** — import games from Files, with cover art, sorting and per-game settings.
- **Game formats** — WUA, decrypted games, encrypted disc images with your own `keys.txt`, and encrypted game folders (`title.tmd`, `title.tik` and `.app` files, with optional update and DLC subfolders). DLC and updates install from the app.
- **Renderers** — Metal by default. Vulkan through MoltenVK, with a choice of MoltenVK 1.4.3 or 1.2.8.
- **CPU** — a multi-core interpreter out of the box, and the AArch64 recompiler when a JIT enabler is attached.
- **On-screen GamePad** — laid out from measurements of a real Wii U GamePad, with an optional analog stick, comfort controls, skins and a per-control layout editor. Four more control styles (Zone, Float, Adaptive and Frame) can be chosen in Settings, and the original stays the default. MFi and Bluetooth controllers work alongside it.
- **Displays** — single screen, both screens, or the TV image on an external display.
- **Graphic packs**, save transfer, a persistent shader cache, and an in-app launch log for troubleshooting.
- **Themes** — 31 app icons, each with a matching theme.

## Install

Add the MuffinEMU source to your installer:

| Installer | Build | Source |
|---|---|---|
| SideStore, AltStore, LiveContainer | `MuffinEMU.ipa` | `https://kiddreads.github.io/MuffinEMU/apps.json` |
| TrollStore, jailbroken | `MuffinEMU-fakesigned.ipa` | `https://kiddreads.github.io/MuffinEMU/trollstore.json` |

Other sources, for people who want something other than the release known to work:

| Channel | Installer | Source |
|---|---|---|
| Nightly: the newest build of `main`, untested | SideStore, AltStore, LiveContainer | `https://kiddreads.github.io/MuffinEMU/nightly.json` |
| Nightly | TrollStore, jailbroken | `https://kiddreads.github.io/MuffinEMU/nightly-trollstore.json` |
| **Experimental, for testers:** unfinished test builds of work in progress | SideStore, AltStore, LiveContainer | `https://kiddreads.github.io/MuffinEMU/experimental.json` |
| Experimental, for testers | TrollStore, jailbroken | `https://kiddreads.github.io/MuffinEMU/experimental-trollstore.json` |

Nightly and Experimental builds replace an installed MuffinEMU (same bundle identifier, so games and saves carry over) and can misbehave. Experimental builds never appear in the Stable or Nightly sources. For normal play use the first two.

Both IPAs are attached to every [release](https://github.com/kiddreads/MuffinEMU/releases). The [installation guide](https://kiddreads.github.io/MuffinEMU/docs/installation.html) explains which one to pick, how to turn on JIT, and where `keys.txt` goes.

**Games and keys are not included.** MuffinEMU plays games you have dumped from your own Wii U, and encrypted games need the `keys.txt` from that console.

**JIT.** The recompiler needs a JIT enabler (StikDebug/StikJIT, SideStore or LiveContainer) and *Use the recompiler (JIT)* switched on in Settings. Without both, MuffinEMU runs the interpreter, and Settings shows which one the current launch is using and why.

## Status

MuffinEMU is under active development and releases often. Compatibility is not yet catalogued, so expect some games not to boot or to run slowly.

Known issues:

- **On-screen controls** — the on-screen controls don't respond reliably yet. A fix is on the way.
- **Vulkan** — on A12Z-class iPads the Vulkan renderer fails to find a suitable GPU. Use Metal, the default.
- **Older GPUs** — devices without mesh shader support (A12Z and earlier) skip geometry-shader and RECTS draws, which can leave some effects missing.

## Building

The CI workflow ([`build-ios-app.yml`](.github/workflows/build-ios-app.yml)) is the reference build and publishes every release. To build by hand on a Mac with Xcode, CMake, Ninja and XcodeGen:

```sh
git clone --recursive [https://github.com/kiddreads/MuffinEMU.git](https://github.com/kiddreads/MuffinEMU.git)
cd MuffinEMU
cmake -S . -B build-ios -G Ninja \
  -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_SYSROOT=iphoneos -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=15.0 -DVCPKG_TARGET_TRIPLET=arm64-ios \
  -DBUILD_HEADLESS_DYLIB=ON -DCMAKE_MACOSX_BUNDLE=OFF -DCMAKE_BUILD_TYPE=Release
cmake --build build-ios --target CemuBin
mkdir -p build-ios/out && cp -R "$(find build-ios bin -type d -name Cemu.framework -not -path '*/CMakeFiles/*' | head -n1)" build-ios/out/
cd src/ios && xcodegen generate
xcodebuild -project MuffinEMU.xcodeproj -scheme MuffinEMU -sdk iphoneos -configuration Release CODE_SIGNING_ALLOWED=NO build
