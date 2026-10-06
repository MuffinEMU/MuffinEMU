# The on-screen pad, taken from the GamePad itself

The measurements behind MuffinEMU's on-screen GamePad. The implementation is `src/ios/App/GamePadGeometry.swift`.
Browsable version: <https://muffinemu.github.io/MuffinEMU/gamepad-layout/>

This is the layout MuffinEMU's on-screen pad uses. It is measured from the Wii U GamePad's
front illustration at **0.425 mm per pixel**, checked against Nintendo's published
dimensions.

| check | from the image | Nintendo |
|---|---|---|
| body width | 600 px x 0.425 = **255.0 mm** | 255 mm |
| body height | 314 px x 0.425 = **133.5 mm** | 134 mm |
| screen | 324 x 185 px = 137.7 x 78.6 mm, **158 mm diagonal** | 6.2 in = 157.5 mm |

Everything is expressed in **D = one face-button diameter = 10.625 mm**, the unit
`ControllerGeometry` already uses. The body turns out to be exactly 24 D wide.

## The hardware, in D

| | D | mm | note |
|---|---|---|---|
| face button diameter | 1.000 | 10.625 | A/B/X/Y |
| Y - A half pitch | 0.960 | 10.2 | the diamond is tighter than the screenshot's 1.240 |
| X - B half pitch | 0.950 | 10.0938 |  |
| d-pad width | 2.280 | 24.225 | a solid cross, not four circles |
| d-pad height | 2.240 | 23.8 |  |
| d-pad arm width | 0.760 | 8.075 |  |
| stick dish | 1.960 | 20.825 |  |
| stick cap | 1.120 | 11.9 |  |
| stick arm length | 2.790 | 29.646 | stick centre to cluster centre, at 69.87 deg |
| + / - diameter | 0.680 | 7.225 | both on the right, + above - |
| HOME diameter | 1.040 | 11.05 |  |
| body | 24.000 | 255 | exactly 24 face buttons |
| screen | 12.922 | 137.3 | normalised to exactly 16:9 |

The stick arm is the strongest number in the set: **29.65 mm at 69.87 deg**, up and
outboard, and the two halves agree on it to within 0.1 mm. It is what the laws below
protect ahead of everything else.

Two facts the shipping layout has differently, both of them the hardware being right:

- **The d-pad is a solid cross**, 2.280 x 2.240 D with 0.760 D arms.
- **+ and - are both on the right**, stacked under A/B/X/Y, + above -. One per side is a
  convention on-screen pads invented; the GamePad never did it.

Not measured: **L / R / ZL / ZR**. They are on the top edge and do not appear in a front
view. Their pill size is kept from the earlier layout; their position is placed,
centred above their own stick, which is where they sit on the hardware. They are the only
placed geometry in the file and they are marked as such at their definition.

## The four laws

**1. Size.** `D = 10.625 mm expressed in points`, capped by what the container can hold.
A point is 0.166 mm on an iPhone and 0.192 mm on an iPad, so this needs points-per-inch,
which UIKit does not expose - see the next section. The result is the headline: **the
clusters are only 61 mm tall, so life-size fits nearly everywhere.** It is the 255 mm body
that never fits, not the controls.

**2. Arrangement.** The hardware arm angle is preserved in preference to keeping the
buttons big: D shrinks first, and only if D would fall under the 44 pt touch floor does
the arm rake outboard, which buys height without changing the stick-to-cluster distance.
No device in landscape needs the rake.

Height and width are judged **together**, as two whole candidates rather than one applied
after the other. Keeping +/- in their hardware slot costs 2.55 D of height but makes each
cluster 0.45 D narrower, so evaluating them in sequence gives an answer that depends on
which came first. Each candidate is costed complete and the better one wins.

**3. Placement.** Clusters are rigid and pinned to the safe-area edges. **The bezel
between them is the only thing that stretches.** Nothing is ever squeezed, and the two
clusters must always clear each other by at least **0.6 D** - the invariant below. What
moves is the low-priority hardware: +/- to the elbow where their real slot will not fit,
TV/POWER and if necessary HOME to the pause menu.

**4. Mode.** Decided by one question: would a framed picture be at least as big as the
GamePad's own 6.2 in screen (137.3 mm)? Below that, the shell is nostalgia bought with a
smaller picture than the real hardware had, which is the wrong trade.

| mode | when | what it looks like |
|---|---|---|
| `framed` | framed picture >= 137.3 mm wide | the GamePad, bezel and all, picture in the LCD's place, nothing overlapping |
| `overlay` | below that | picture full-bleed, controls floating over its outer thirds |
| `stacked` | portrait | picture along the top, both clusters on the bottom corners |
| `shell` | external display | the picture leaves; the iPad is nothing but a GamePad |

## Working out how big the screen physically is

Life-size means nothing without points-per-inch, and UIKit does not expose it: `UIScreen.scale`
is points per *pixel*, and there is no API for pixels per inch. A hardcoded model table
alone is not good enough either - the first device that ships after this is written would
render a pad 24% wrong with nothing in the logs to say so.

So `DeviceMetrics` works it out at launch, from four sources, most authoritative first:

| source | what it is |
|---|---|
| `calibrated` | the user sized an outline against a bank card. Beats everything - it is a measurement of the actual glass |
| `model` | an exact `hw.machine` match. Authoritative for every device shipped so far |
| `panel` | the native pixel resolution matches a panel we know. Catches a new model reusing an existing display |
| `derived` | reasoned from idiom, native scale and pixel count. Apple has only shipped a handful of native densities and they separate cleanly |

The derivation: an iPad is 264 ppi unless it is a mini, and the mini is the only iPad whose
short side comes in under 1536 px; a 3x phone is 460 unless it is 1080 px wide, which only
the minis are; a 2x phone is 326.

`Measurement.detail` is one line for the launch log, so a wrong pad is diagnosable from a
log alone. When `source == .derived` the device is one nobody has taught the app about, and
`PadCalibrationView` will make it exact: the user holds any bank card against the screen and
sizes an outline to match. ISO/IEC 7810 ID-1 is 85.60 mm wide, so that is one reliable ruler
in everybody's pocket, and it works on hardware nobody has seen yet.

Exercised off-device on twelve probes - known models, unknown models on known panels, wholly
unknown devices of each class, a calibration that wins, and an absurd calibration that is
rejected - all twelve correct.

## What every configuration resolves to

| device | mode | D (pt) | vs life-size | button | +/- | picture (pt) | picture (mm) |
|---|---|---|---|---|---|---|---|
| iPhone SE (3rd gen) | `overlay` | 55.0 | 81% | 8.6 mm | elbow | 666.7x375 | 103.9 x 58.4 |
| iPhone 13 mini | `overlay` | 49.7 | 75% | 8.0 mm | elbow | 602.7x339 | 96.5 x 54.3 |
| iPhone 15 / 16 | `overlay` | 54.5 | 85% | 9.0 mm | elbow | 661.3x372 | 109.6 x 61.6 |
| iPhone 16 Pro | `overlay` | 55.8 | 87% | 9.2 mm | elbow | 677.3x381 | 112.2 x 63.1 |
| iPhone 16 Pro Max | `overlay` | 61.4 | 96% | 10.2 mm | elbow | 744.9x419 | 123.4 x 69.4 |
| iPad mini (A17 Pro) | `overlay` | 68.2 | 100% | 10.6 mm | hardware | 1133x637.3 | 176.6 x 99.3 |
| iPad (A16) / Air 11" | `framed` | 55.2 | 100% | 10.6 mm | hardware | 715x402.2 | 137.6 x 77.4 |
| iPad Pro 11" (M4) | `framed` | 55.2 | 100% | 10.6 mm | hardware | 745x419.1 | 143.4 x 80.6 |
| iPad Pro 11" (2020, A12Z) | `framed` | 55.2 | 100% | 10.6 mm | hardware | 729x410.1 | 140.3 x 78.9 |
| iPad Pro 12.9" (2020, A12Z) **<-- target** | `framed` | 55.2 | 100% | 10.6 mm | hardware | 901x506.8 | 173.4 x 97.5 |
| iPad Pro 12.9" (2020) portrait | `stacked` | 55.2 | 100% | 10.6 mm | hardware | 1024x576 | 197 x 110.8 |
| iPad Air 13" | `framed` | 55.2 | 100% | 10.6 mm | hardware | 901x506.8 | 173.4 x 97.5 |
| iPad Pro 13" (M4) | `framed` | 55.2 | 100% | 10.6 mm | hardware | 911x512.4 | 175.3 x 98.6 |
| iPad Pro 11" Split View 1/2 | `stacked` | 55.2 | 100% | 10.6 mm | elbow | 583x327.9 | 112.2 x 63.1 |
| iPad Pro 11" Slide Over | `stacked` | 45.1 | 82% | 8.7 mm | hardware | 375x210.9 | 72.2 x 40.6 |
| iPad Pro 13" portrait | `stacked` | 55.2 | 100% | 10.6 mm | hardware | 1032x580.5 | 198.6 x 111.7 |
| iPhone 16 Pro Max portrait | `stacked` | 52.9 | 82% | 8.8 mm | hardware | 440x247.5 | 72.9 x 41 |
| iPad Pro 13" + external display | `shell` | 55.2 | 100% | 10.6 mm | hardware | 911x512.4 | 175.3 x 98.6 |

Reading that table:

- **The iPad Pro 12.9 in (2020) - the A12Z this port actually targets - is life-size and
  framed**, with a 173 x 98 mm picture against the hardware's own 137 x 77 mm. A GamePad
  with a screen 26% bigger than the real one and controls that are exactly right.
- **Every iPad in landscape is life-size**, the mini included, with + and - in their real place.
- **iPhones land at 75-96%**, all clear of the 44 pt floor, none needing the rake.
- **The two narrowest panes** - Slide Over and a phone in portrait - are the only cases
  where the width, not the height, sets the size. They come out at 82% and the clusters
  still clear each other by 27 pt.

Full resolved coordinates are in `muffin_pad_layout.json`; the hardware measurements they
derive from are in `hardware_measurements.json`, with `hardware_measurements_check.png`
showing every measured circle drawn back over the source art.

## Verification

Swift and Python are checked against each other on **every configuration and every
control**: 336 controls across 18 configurations, comparing mode, unit, +/- placement,
picture rect, and each control's centre and size. **Zero discrepancies.**

The same pass asserts, with **exact shapes** rather than bounding boxes - the d-pad tested
as its two real arms, not as the square that contains them:

- nothing lands outside a safe area
- no two controls overlap
- **the two clusters clear each other by at least 0.6 D** - tightest anywhere is 27 pt
- nothing covers the picture in framed mode
- every face button is at or above 44 pt in landscape
- both clusters stay level, as they are on the hardware
- every picture is exactly 16:9

## Files

| file | what it is |
|---|---|
| `GamePadGeometry.swift` | the constants, the resolver and `DeviceMetrics` - now at `src/ios/App/GamePadGeometry.swift` |
| `index.html` | the same thing as a browsable page with a device picker - opens by double-clicking, no server needed |
| `resolve_reference.py` | the same laws in Python - the cross-check, and what drew the mockups |
| `mock_*.png` | all 17 landscape and portrait configurations rendered |
| `muffin_pad_layout.json` | resolved coordinates, all 18 configurations |
| `hardware_measurements.json` | the source measurements, in pixels and mm |
