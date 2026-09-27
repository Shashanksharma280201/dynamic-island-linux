# Dynamic Island for Linux

A Mac-style **Dynamic Island** for Ubuntu (X11 + GNOME). A frameless, transparent,
always-on-top widget pinned top-center that morphs with spring physics
(Framer Motion), with squircle (continuous-corner) shapes and live activities:

- **Media**: any MPRIS player (Spotify, browsers, VLC, …) with art, progress and controls
- **Claude Code approvals**: approve / deny / always-allow Claude's permission prompts
- **Desktop notifications**: every app's notifications mirrored as transient cards
- **Control Center**: volume, brightness, Wi-Fi and Bluetooth

## Install

Download the `.deb` or `.AppImage` from a release, or build them yourself:

```bash
npm install
npm run package        # → dist/dynamic-island-linux-<version>-x86_64.AppImage and _amd64.deb
```

Then launch **Dynamic Island** once. A status-area (tray) menu lets you:

- turn **Start at login** on or off (writes `~/.config/autostart/dynamic-island-linux.desktop`)
- turn **Claude Code approvals** on or off (installs/removes the hook, see below)
- turn **Show desktop notifications** on or off
- **Quit**

On GNOME the tray needs the AppIndicator extension (enabled by default on Ubuntu).
Without it you can quit with `dynamic-island-linux --quit`.

## Develop

```bash
npm install
npm run dev                # hot-reloading dev build
DI_DEMO=1 npm run dev      # demo: media, then an auto-expanding approval card
DI_DEMO=2 npm run dev      # demo: two activities (compact media + detached circle)
DI_DEMO=3 npm run dev      # demo: notifications (normal + critical)
npm run check              # typecheck + unit tests + build
npm run test:e2e           # real app under Xvfb + private D-Bus (needs xvfb, dbus, gdbus)
```

Environment variables:

| Variable | Meaning |
| --- | --- |
| `DYNAMIC_ISLAND_SOCK` | approval socket (default `$XDG_RUNTIME_DIR/dynamic-island.sock`, else `/tmp/dynamic-island-<uid>.sock`) |
| `DI_DISPLAY` | index of the monitor to show the island on (default: primary) |
| `DI_DEMO` | demo mode `1`, `2` or `3` |
| `DI_DEBUG` | log interactivity transitions |

## Using it

At rest the island is a small pill; with one media player it shows album art and
a waveform. **Hovering** morphs it open; **clicking** opens the Control Center
(it closes by itself shortly after the cursor leaves). Approvals and
notifications expand it automatically; click a notification to dismiss it. When
more items are waiting, a `+N` badge shows how many. The rest of the desktop stays
clickable.

### Claude Code approvals

Turn it on from the tray, or run:

```bash
npm run hook:install       # registers the hook in ~/.claude/settings.json (backs up first)
npm run hook:uninstall     # removes it again
```

It uses Claude's **`PermissionRequest`** hook, which fires only when Claude is
about to ask you for permission, so the island shows exactly the prompts Claude
would show. On the card:

- **Allow** / **Deny** answer the prompt.
- **Always allow …** allows and saves the rule Claude suggested (for example
  `Bash(npm test:*)`), so Claude won't ask again for it in that project.
- **Answer in terminal** dismisses the card and lets Claude show its normal prompt.

It **fails open**: if the island isn't running, or you don't answer within 45s
(`DYNAMIC_ISLAND_TIMEOUT`), the hook prints nothing and Claude's terminal prompt
appears as usual. The hook needs `node` on your `PATH`. See
[`hook/README.md`](hook/README.md).

## How it works

- **Electron main** (`electron/`): a transparent, click-through `dock` window
  across the top of the chosen monitor. Electron's `setIgnoreMouseEvents(..., { forward: true })`
  isn't implemented on Linux, so the main process reads the **global cursor**
  over X11 (`QueryPointer` via the `x11` package), converts the island's rect
  to physical pixels (HiDPI-aware), and makes the window interactive only while
  the cursor is over the island. That same signal drives hover in the renderer.
- **Activity store** (`electron/store.ts`) plus a pure presentation selector
  (`shared/present.ts`): priority first; approvals first-come-first-served,
  everything else newest first.
- **Providers** (`electron/providers/`):
  - `media.ts`: MPRIS over D-Bus, change-driven (`NameOwnerChanged`,
    `PropertiesChanged`, `Seeked`) with a slow safety poll.
  - `claude.ts`: unix socket (mode `0600`) the hook talks to; cancels the card
    when the hook gives up.
  - `notifications.ts`: a D-Bus monitor on `Notify` calls (never replies, so the
    bus keeps it connected), with urgency and icon lookup.
  - `system.ts`: `pactl`, `gdbus` (GNOME) or `brightnessctl`, `nmcli`,
    `bluetoothctl`; polled only while the Control Center is open. Missing tools
    simply hide their control.
- **Renderer** (`renderer/`, React + Framer Motion): idle / compact / minimal /
  expanded presentations, squircle clip, Apple-like springs.
- **Hook** (`hook/`): bridges Claude's `PermissionRequest` hook to the socket.

## Limitations

- **X11 only for full interactivity.** On a Wayland session the app runs through
  XWayland and warns you: it is drawn, but hover/click only register while the
  cursor is over X11 windows. Choose "Ubuntu on Xorg" at login for full support.
  A GNOME Shell extension would be the robust Wayland path.
- The two-activity split is a spring "bud-off" animation rather than a true
  metaball (SVG goo) merge.
