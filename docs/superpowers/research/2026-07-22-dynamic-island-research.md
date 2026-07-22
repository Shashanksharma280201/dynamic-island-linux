# Dynamic Island — Research Report (for a Linux/Ubuntu build)

**Date:** 2026-07-22
**Method:** 5 parallel web-research agents (concept/states, iOS technical build,
animation physics, native desktop clones, web clones + Electron X11 click-through).

---

## 1. What it is (concept & origin)

- Introduced on **iPhone 14 Pro (2022)**; now across the line. Replaced the fixed
  notch that housed the **TrueDepth / Face ID** sensors.
- The hardware is **two physical cutouts** (camera hole + sensor pill). iOS fills
  the gap with **true black** on the OLED so it reads as one shape — and because
  two real openings exist, the software can **split** into a left pill + right
  circle to show two things at once.
- Core idea: software **"lives around" the cutout**, morphing to surface live,
  glanceable info. A hardware constraint turned into an interactive UI element.

## 2. States & functionality (Apple's model)

- **Compact** (one activity): `compactLeading` + `compactTrailing` regions
  flanking the cutout; must read as one unit; tap either side → same app.
- **Minimal** (two activities): one stays **attached** to the pill, the second
  **detaches** as a small circle/oval (≤ 45 × 36.67 pt). Each tappable.
- **Expanded** (long-press / auto for priority): four regions —
  `.leading`, `.trailing`, `.center`, `.bottom` — a predictable enlargement of
  the compact layout.
- Interaction: **tap** opens app, **long-press** expands, high-priority events
  (calls, Face ID) auto-expand. Idle = inert black pill.
- Examples: Now Playing (icon + waveform → art + transport), calls, timers,
  Maps directions, Face ID, charging, AirPods battery ring, recording, sports,
  delivery ETA, boarding pass.

## 3. How it's built on iOS

- Not a standalone API — a surface of a **Live Activity**: WidgetKit
  `ActivityConfiguration` + **ActivityKit**, same code → Lock Screen, Dynamic
  Island, and banner. Builder: `DynamicIsland { expanded regions } compactLeading:
  compactTrailing: minimal:` with `.keylineTint`, `.widgetURL`.
- **The pill is a SpringBoard/system-compositor effect**, not app-drawn. Only the
  system renders around the real cutout and owns morph/arbitration/priority. Apps
  only supply SwiftUI content for the regions + a deep link; they **cannot** change
  shape/size/radius, animate freely, or decide when they're shown.
- Morph internals: Core Animation **implicit spring** on an expanding shape.
  Clones reproduce it with **`matchedGeometryEffect`** + `withAnimation(.spring())`.
- **Metaball / gooey merge** (the liquid split/fuse) = **blur + alpha-threshold**,
  not a native API: Gaussian-blur the *group*, then threshold alpha so nearby
  shapes bridge. Reproduced via SVG `feGaussianBlur`+`feColorMatrix`, AGSL/Skia
  shaders (Sina Samaki's Compose clone is canonical).
- Corners: **continuous curvature / superellipse ("squircle")** —
  `cornerCurve = .continuous` / `RoundedRectangle(style:.continuous)`, ~superellipse
  n≈4–5. Plain `border-radius` cannot match it (G1 vs G2 continuity).
- Constraints: ActivityKit payload ≤ 4 KB, throttled snapshot updates (not a
  render loop), sandboxed, 8 h active / 4 h lingering.

## 4. Animation / motion parameters (reproducible)

- **iOS springs (authoritative, system-wide):** `.spring()` = response 0.55,
  dampingFraction 0.825. iOS 17 presets (duration/bounce model): `.smooth`
  (0.5 / 0.0 → damping ~1.0, no overshoot), `.snappy` (0.5 / 0.15 → ~0.85),
  `.bouncy` (0.5 / 0.30 → ~0.70). **DI morph feel ≈ between `.smooth` and `.snappy`.**
- **Framer Motion DI morph (community):** `type:'spring', stiffness 300–500,
  damping 25–35, mass 0.8–1`. Or Apple-style directly: `{ duration: 0.5, bounce: 0.15 }`.
  react-spring: `tension 300–400, friction 28–34`.
- **Gooey SVG filter:** `feGaussianBlur stdDeviation 8–10` → `feColorMatrix` alpha
  row `0 0 0 A B` with A≈18–19, B≈−7 to −9. Needs **opaque bg**; **traps pointer
  events** (mark `aria-hidden`, keep interactive content outside the filter group).
- **Squircle corners:** `figma-squircle` / `squircle.js` (60% smoothing = iOS);
  future CSS `corner-shape: superellipse()`.
- **Choreography:** ~0.5 s spring; collapse slightly snappier. **Staggered
  cross-fade** off one progress value — outgoing opacity over [0,0.6], incoming
  over [0.4,1] (short overlap, not a hard cut); fixed-height container avoids shift.
- **CSS-only springs:** convert to `linear(...)` via kvin.me/css-springs or Jake
  Archibald's generator (perceptual duration ~0.4–0.5 s, bounce ~5–15%).

## 5. Prior art

### Native desktop
- **macOS:** NotchNook (lo.cafe), **boring.notch** (GPL, best feature ref),
  DynamicLake, **NotchDrop** (MIT, cleanest code), MediaMate, Notchy, DynamicNotch.
  Technique: **`NSPanel` `.nonactivatingPanel`** floating over the notch, geometry
  from `NSScreen.safeAreaInsets` / `auxiliaryTop{Left,Right}Area`, `panel.level`
  above menu bar; media via private **MediaRemote** framework.
- **Linux:** **NexNotch** (GJS **GNOME Shell extension**, X11+Wayland, <0.1% CPU,
  <15 MB) is the closest prior art — draws a **Clutter/St actor into the shell
  stage via `Main.layoutManager.addChrome(...)`**, sidestepping all windowing
  hacks. Also `dynamic-island@xuanhong` (GJS). Frameworks: **AGS/Astal** (Wayland
  layer-shell, built-in MPRIS), **Eww** (Rust/GTK, X11+Wayland).

### Web (Framer Motion)
- Emil Kowalski / animations.dev (reference motion treatment), amelie-schlueter/
  dynamic-island-web, nithinpjohn/Dynamic-island-notifications
  (`spring stiffness 400 damping 30`, `borderRadius 999 → 24`, `layout` prop
  morph), anaclumos/dynamic-island (uses `figma-squircle`).
  Universal technique: container + children `layout` prop, `AnimatePresence`,
  one spring, animate `borderRadius` as a value.

## 6. THE BLOCKER — Electron X11 click-through (root cause of "not hoverable/clickable")

- **`setIgnoreMouseEvents(true, { forward: true })`'s `forward` flag is NOT
  implemented on Linux/X11** (Electron #16777, open since 2019). Once mouse events
  are ignored, the renderer gets **no** `mousemove`/`mouseleave`/`:hover` → our
  `onMouseEnter` never fires → the island stays permanently click-through. That is
  exactly the bug observed.
- `electron-transparency-mouse-fix` lists **Linux as "Broken"** for the same reason.

### Fix options (X11)
1. **Global cursor polling in main process:** every ~40 ms compare
   `screen.getCursorScreenPoint()` to the island hit-box; toggle
   `setIgnoreMouseEvents(false/true)`. **Caveat:** `getCursorScreenPoint()` is
   itself **broken on Electron v29+ Linux** (#42519, returns wrong coords). Mitigate
   by (a) pinning Electron **v28.3.3**, or (b) reading the cursor natively via
   **`xdotool getmouselocation`** / `XQueryPointer` (unaffected by the regression).
2. **X11 SHAPE input region** (`XShapeCombineRegion(..., ShapeInput, region)`):
   only the island rectangle catches input; everything else is genuinely
   click-through and **hover works natively with no polling**. Cleanest; needs a
   small native addon / helper. Update region on resize.

### Also required on Linux
- Launch with **`--enable-transparent-visuals`** (and sometimes `--disable-gpu`)
  or the alpha channel fails on some drivers.
- Always-on-top over the GNOME bar is unreliable via `alwaysOnTop` alone (it's just
  an EWMH *request*). Use **`type: 'dock'`** + `setAlwaysOnTop(true, 'screen-saver')`
  + `setVisibleOnAllWorkspaces`; `focusable: false` helps pin above the panel
  (tradeoff: no keyboard focus). Wayland ignores these — X11 session is the
  predictable target (we are on X11).

## 7. Implications for our build

- The current Electron approach is viable **on X11** once click-through is fixed
  via cursor polling (native pointer read) or an X11 SHAPE input region.
- For animation fidelity (the stated priority), Electron + Framer Motion + SVG goo
  + squircle beats the GNOME-extension route (Clutter animations). The GNOME
  extension (NexNotch-style) is more robust and lighter but worse for Mac-exact
  motion — a possible future/companion delivery mode, not the animation showcase.
- Model the island like SpringBoard: a compositor-style overlay that **providers
  feed via constrained IPC** (media, Claude approvals) — matches what we already have.

## Sources
See inline citations in the five agent briefs; primary references:
Apple HIG Live Activities & ActivityKit docs; WWDC23 "Meet ActivityKit" /
"Animate with springs"; swiftwithmajid DynamicIsland; sinasamaki.com/dynamic-island;
css-tricks Gooey Effect; squircle.js.org; animations.dev; Electron issues
#16777 / #42519 / #1335; NexNotch, NotchDrop, boring.notch repos;
freedesktop MPRIS spec.
