# Dynamic Island for Linux

A Mac-style **Dynamic Island** for Ubuntu (X11 + GNOME). A frameless, transparent,
always-on-top widget pinned top-center that morphs with spring physics
(Framer Motion), with squircle (continuous-corner) shapes and live activities:
**media playback** and **interactive Claude Code approvals**.

## Run

```bash
npm install
DI_DEMO=1 npm run dev      # demo: media, then an auto-expanding approval card
DI_DEMO=2 npm run dev      # demo: two activities (compact media + detached circle)
npm run build && npm start # normal run
npm test                   # unit tests
```

At rest the island is a small pill top-center; **hovering** morphs it open; real
events (a Claude approval, a track change) auto-expand it and it settles back.
The rest of the desktop stays clickable.

## Interactivity model (X11)

Electron's `setIgnoreMouseEvents(..., { forward: true })` is **not implemented on
Linux**, so hover/click can't be driven from the renderer. Instead the main
process reads the **global cursor** via the `x11` package (`QueryPointer`) and
toggles click-through when the cursor is over the island's reported rectangle.
No `xdotool` or other system package is required.

## Providers

### Media
Reads any **MPRIS** player over D-Bus (Spotify, browsers, …) — no `playerctl`
needed. Compact view shows album art + an animated waveform; expanded adds
title/artist and play-pause / next / previous.

### Claude Code approvals
Approve or deny Claude's tool calls **from the island**:

```bash
node hook/install.cjs   # registers the hook in ~/.claude/settings.json (backs up first)
```

It uses the **`PermissionRequest`** hook, which fires **only when Claude actually
needs permission** — so the island shows exactly the prompts Claude would show,
with no per-tool spam. It **fails open**: if the island isn't running or you don't
respond within 45s, it emits nothing and Claude's normal terminal prompt takes
over. See [`hook/README.md`](hook/README.md).

## Architecture

- **Electron main** — transparent always-on-top window (`type:'dock'`,
  `--enable-transparent-visuals`), global-cursor interactivity loop, a priority
  activity store, and both providers (MPRIS over D-Bus, Claude approvals over a
  unix socket).
- **Renderer** (React + Framer Motion) — the morphing island with compact /
  minimal / expanded presentations, squircle corners, and Apple spring values.
- **Hook** (`hook/claude-island-hook.cjs`) — bridges Claude's `PermissionRequest`
  hook to the socket.

## Limitations & roadmap

- **X11 only** (Wayland's Mutter ignores the always-on-top/dock hints; a GNOME
  Shell extension would be the robust Wayland path).
- Gooey "metaball" merge for the two-activity split is not yet implemented
  (deferred — the SVG goo filter traps pointer events and needs careful layering).
