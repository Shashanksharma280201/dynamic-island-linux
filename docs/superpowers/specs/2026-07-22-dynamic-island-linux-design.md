# Dynamic Island for Linux — Design

**Date:** 2026-07-22
**Status:** Approved (design)

## Goal

A Mac/iPhone-style **Dynamic Island** for Ubuntu (X11 + GNOME): a frameless,
transparent, always-on-top widget pinned top-center over the GNOME bar. It sits
as a **tiny pill** at rest, **morphs open** with Apple-like spring physics on
hover, and **auto-expands** for real events before settling back.

**Priority order:** (1) animation fidelity / Mac-like feel, (2) real usefulness
via two live providers — media and interactive Claude Code approvals.

## Environment (verified)

- X11 session, Ubuntu GNOME.
- Available: `node` v24, `python3`, `cargo`, `gjs`.
- `playerctl` **not** installed — design avoids depending on it (uses D-Bus directly).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Runtime | **Electron** | Best animation fidelity + fastest iteration; runs constantly but dev machine can afford it |
| UI | React + **Framer Motion** + TypeScript, built with `electron-vite` | `layout` spring animations give Apple-like morph; hot reload |
| Placement | **Top-center**, over the GNOME top bar | Notch-like presence |
| Media source | **MPRIS2 over D-Bus** via `dbus-next` (pure JS) | Covers Spotify + any player; no `playerctl` install |
| Claude integration | **Interactive approve/deny** via `PreToolUse` hook + unix socket | The "wow" feature; real control from the island |
| v1 activity set | Media + Claude approvals + generic fallback | Focused scope |

## Architecture

Two Electron processes + one hook script:

- **Main process** — window management (position, always-on-top, click-through),
  the **activity store** (priority queue), and both providers. The brain.
- **Renderer** (React + Framer Motion) — the visual island. Subscribes to store
  state via IPC; sends user actions (approve/deny, media controls) back.
- **Hook script** (`claude-island-hook.js`) — standalone Node script Claude Code
  runs as a `PreToolUse` hook; talks to the main process over a **unix socket**.

### Window / morph technique

The Electron window is a **fixed, large, fully transparent** pane
(screen-width × ~500px tall, top-aligned). The pill is animated **inside** it via
Framer Motion `layout` springs, so width/height/border-radius morph on the GPU
without ever resizing the OS window (which would be janky).
`setIgnoreMouseEvents(true, { forward: true })` makes transparent regions
click-through; only the pill catches the mouse. A hover/geometry check toggles
passthrough so the rest of the desktop stays clickable.

## Animation & state model

State machine: `idle (pill)` → `hover/expanded` → back; events push a transient
`presented` state that auto-expands then settles. Framer Motion `layout` + a
tuned spring (Apple-ish response/damping) morphs the shape; content cross-fades
on top.

Each activity type is a **presentation**: `Media`, `ClaudeApproval`, and a
generic fallback. Multiple simultaneous activities use iOS-style **priority**: a
Claude approval (needs action) takes over the island; media collapses to a
trailing indicator.

**`--demo` mode** fires synthetic events (fake approval, fake now-playing) so
animations can be perfected without Spotify or Claude running.

## Providers

### Media (MPRIS2 / D-Bus)
- `dbus-next` subscribes to `org.mpris.MediaPlayer2.Player` `PropertiesChanged`
  for metadata + playback status.
- Renders title / artist / album art (`mpris:artUrl`) + play/pause/next/prev,
  wired back through D-Bus methods.
- Handles no-player and multiple-player cases (pick the active one).

### Claude approvals (hook + unix socket)
- Main process runs a unix-socket server (path under `XDG_RUNTIME_DIR`, fallback
  `/tmp`).
- The `PreToolUse` hook reads the tool request JSON from stdin, connects to the
  socket, sends it, and **blocks**.
- The island shows an **Approve / Deny** card (tool name + input summary). The
  user's click returns a decision; the hook emits:
  `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow|deny","permissionDecisionReason":"..."}}`
- **Fallbacks:** island unreachable, or no response within ~30s → hook emits
  `permissionDecision: "ask"` so Claude's normal terminal prompt takes over.
  Nothing breaks when the island is off.

## Project structure

```
dynamic-island-linux/
  package.json
  electron.vite.config.ts
  electron/
    main.ts            # app entry, window, positioning, mouse passthrough
    ipc.ts             # renderer <-> main contract impl
    store.ts           # activity store + priority
    providers/
      media.ts         # MPRIS via dbus-next
      claude.ts        # unix socket server
  renderer/
    index.html
    App.tsx
    island/
      Island.tsx       # state machine + morph container
      states/          # Idle, Compact, Expanded, Media, Approval
    anim/spring.ts     # shared spring config
  hook/
    claude-island-hook.js   # the PreToolUse hook script
    README.md               # install instructions
  shared/
    types.ts           # Activity, Decision, IPC + socket message contracts
```

## Testing

- **Unit (vitest):** activity store / priority logic; MPRIS metadata parsing;
  hook wire-protocol encode/decode; mocked approval round-trip.
- **Visual:** animations verified through `--demo` mode.

## Non-goals (v1)

- Wayland support (X11 only for now).
- Persistent config UI / theming beyond a constants file.
- Providers beyond media + Claude (notifications, timers, downloads = later).
