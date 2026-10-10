# Mario Kart 8 compatibility

[![MuffinEMU](https://img.shields.io/badge/MuffinEMU-Compatibility%20report-E5652E?style=for-the-badge&labelColor=1d1d1f)](../../README.md) [Back to the README](../../README.md) · [All compatible games](../../COMPATIBILITY.md)

**Title IDs:** base 00050000-1010EC00 (US), 1010ED00 (EU), 1010EB00 (JP); updates 0005000E-same low word; DLC 0005000C-same low word.

> [!NOTE]
> Sources: desktop Cemu wiki (rated Perfect), Cemu's bundled MK8 profiles, device logs and project notes up to 7.5 and main at c542124d. Nothing here was re-tested on a device for this document.

| Area | Status | Evidence | Fix / next step |
|---|---|---|---|
| Boot | works (Metal) | Fix list on main since 7.2; one 7.5 Vulkan boot log reached about 489 presented frames | None |
| Menus | works | Same log; no menu-specific report | Confirm on Metal after the Vulkan fixes |
| Race, 1P | partly | Course loads on Metal were fixed in 7.2, so races start; no frame-rate log on record | Device test A below |
| Race, split-screen 2-4P, multiple controllers | unknown | `InputManager::load_gc_controllers` binds every connected controller to its own slot (Pro Controller or Wii Remote type); no MK8 multiplayer log exists. Wiki lists a 4P flicker in the left quadrants on desktop | Device test B below |
| GamePad screen and touch | unknown | MK8 uses the GamePad for the map and horn only; on-screen pad and external display routing exist (7.3, 8.0 fix) but MK8 was not checked | Device test C below |
| TV and GamePad dual display | unknown | Same as above | Device test C below |
| Audio | unknown | No MK8 audio report; M4A recording was added in 8.x | Listen during a race, note crackle |
| Performance and thermal | partly | Vulkan ran about 15 fps on the 7.5 log; Metal numbers not on record; thermal gating exists for every device | Collect a performance overlay reading |
| Shader stutter and caches | partly | Async compile is the iOS default; desktop caches import (`000500001010ec00_shaders.bin` converts on first run); wiki: initial stutter, solved by a precompiled cache | Import a desktop cache for your region |
| Memory, 3-6 GB devices | partly | 7.2 fixed an out-of-memory crash decoding textures on course load; `9f3b5051` now survives a failed decode; low tier is under 4.5 GiB with a 128 MB buffer cache and launch refusal under about 340 MB free | Test a course load on a 3-4 GB device |
| DLC and updates (v4.2, DLC packs) | works (import path) | Import classifies 0005000E and 0005000C titles and matches them to the base game (`IOSDlcUpdateImport`); wiki: updates and DLC install normally | Install v4.2 and both DLC packs, confirm the Cups show |
| Online (Pretendo) | broken without a linked account | Error 102-1021 until a real account.dat with a linked ID is imported (7.5 notes); wiki also requires a Wii U dump for online | None possible without the user's own console data |
| MK TV | unknown | Needs a network account and the online service | Same as online |
| amiibo | unknown | The core has `nn_nfp`, but no app screen for loading an amiibo dump was found | Next step: needs an NFC dump loader before MK8 costumes can unlock |
| Saving | unknown (expected to work) | Save data lives in the app's MLC folder like any title; nothing MK8-specific reported | Check the save survives a force quit |
| Metal vs Vulkan | Metal works, Vulkan partly | Metal is default; position invariance already covers all three MK8 IDs (fixed in 7.x). Vulkan 7.5 hit a GPU page fault about 10 s in; fixes `ffd474e9`, `ca9059ec` merged afterwards but not tested on the device | Retest Vulkan after the fixes (test D) |
| Mii faces | partly | Wiki: Mii faces need the Mii data title (0005001B-10056000), fixed in Cemu 2.7 | Check against the shipped core version |
| Shadows and text | unknown | Wiki lists broken kart shadows on desktop and missing dialog text without Cemuhook | Compare against the same scene on Metal |

## Profile decision

The three bundled profiles (`bin/gameProfiles/default/000500001010{ec,ed,eb}00.ini`) contain only the game name. That is deliberate: Cemu removed the forced single-core setting from them (commit 2cc26761), and the wiki says MK8 needs no non-default settings. The settings the wiki prefers (Vulkan Async Compile, Low GPU buffer cache accuracy, multi-core) are either global settings or already how MuffinEMU behaves by default (async shaders on, cores chosen per device). No evidence supports a profile key, so none was added and nothing is keyed to a device model. Do not add a Metal buffer-cache or accuracy key until a device log shows an MK8 problem it fixes.

## Device test steps

<details>
<summary>Show the steps (A to E)</summary>


- **A.** Metal, 1P: launch the US game with the update installed, play one Cup race, open the per-game Performance overlay option. Note fps in the menus, in the race, and on lap 1 versus lap 3.
- **B.** Pair two controllers (or more) before launch; start a 2P race and then 4P. Note which slot each controller controls and whether any quadrant flickers.
- **C.** Plug in an external display and test each "this device shows" mode: the map should appear on the GamePad view and touch should respond.
- **D.** Switch the game to Vulkan in its per-game settings and repeat A for about a minute; a GPU error ends the game with the stop screen and writes a crash log.
- **E.** Send log.txt from each run; it contains the DEVICE line, memory use and any VIDEO STALL block.

</details>
