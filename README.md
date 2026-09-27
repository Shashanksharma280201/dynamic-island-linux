# Dynamic Island for Linux

A Mac-style **Dynamic Island** for Ubuntu (X11 + GNOME): a small black pill at the
top center of your screen that morphs with spring physics to show what's going
on (music, Claude Code permission prompts, notifications) and opens a mini
Control Center when you click it. Everywhere outside the island, your desktop
stays fully clickable.

## Features

| Feature | What you see | What you can do |
| --- | --- | --- |
| **Idle pill** | A tiny black pill when nothing is happening | Click it to open the Control Center |
| **Now Playing** | Album art + animated waveform while music plays in any MPRIS player (Spotify, Firefox/Chrome, VLC, Rhythmbox, …) | Hover to expand: title, artist, progress bar with elapsed/remaining time, and previous / play-pause / next buttons |
| **Two activities at once** | The pill plus a small detached circle for the second activity | Hover to expand the main one |
| **Claude Code approvals** | When Claude Code needs permission, the island expands with the tool, the exact command / file / diff, and the working directory | **Allow**, **Deny**, **Always allow** (saves Claude's suggested rule, e.g. `Bash(npm test:*)`), or **Answer in terminal**. Several waiting requests are answered in order, with a `+N` badge |
| **Desktop notifications** | Every app's notifications appear on the island with the app icon; critical ones get a red outline and stay longer | Click to dismiss. Newest shows first, `+N` badge for more |
| **Control Center** | Volume, brightness, Wi-Fi and Bluetooth | Drag the sliders, click the speaker icon to mute, toggle Wi-Fi / Bluetooth. Closes by itself shortly after the cursor leaves |
| **Tray menu** | An icon in the top bar | Show notifications on/off, Claude Code approvals on/off, Start at login on/off, Quit |

Other details:

- Works on HiDPI (scaled) displays and multi-monitor setups; the island sits on
  the primary monitor (or the one you choose with `DI_DISPLAY`) and follows
  resolution or monitor changes.
- Only one copy runs at a time.
- Controls for tools that aren't installed (e.g. no Bluetooth adapter) are hidden
  instead of showing wrong values.

## Requirements

- **Ubuntu (or another GNOME desktop) on an X11 / Xorg session.** On Wayland it
  runs, but clicking the island only works partially (see [Limitations](#limitations)).
  To switch: log out, click the gear icon on the login screen, pick
  **"Ubuntu on Xorg"**. Check your current session with `echo $XDG_SESSION_TYPE`.
- **Node.js 18 or newer** and npm, to build from source and for the Claude Code hook.
- Optional, for the Control Center (usually preinstalled on Ubuntu):
  `pactl` (volume), `nmcli` (Wi-Fi), `bluetoothctl` (Bluetooth), and GNOME's
  brightness service or `brightnessctl` (brightness).

## Quick start

### 1. Get the code and install dependencies

```bash
git clone https://github.com/shashanksharma280201/dynamic-island-linux.git
cd dynamic-island-linux
npm install
```

### 2. Run it

```bash
npm start
```

This builds the app and launches it. The island appears at the top center of the
screen; play some music or send a notification (`notify-send "Hello" "World"`)
to see it react.

For development with hot reload, use `npm run dev` instead.

### 3. Try the demos (optional)

No music playing? The demo modes show every state with fake data:

```bash
DI_DEMO=1 npm run dev   # music, then a Claude approval card pops up
DI_DEMO=2 npm run dev   # two activities: compact pill + detached circle
DI_DEMO=3 npm run dev   # a normal and a critical notification
```

### 4. Connect Claude Code (optional)

To approve Claude Code's permission prompts from the island, either tick
**Claude Code approvals** in the tray menu, or run:

```bash
npm run hook:install      # adds the hook to ~/.claude/settings.json (backs it up first)
```

Restart any running Claude Code sessions. From now on, whenever Claude asks for
permission, the island expands with the request. To remove it:
`npm run hook:uninstall` (or untick it in the tray menu).

The hook **fails open**: if the island isn't running, or you don't answer within
45 seconds, Claude shows its normal terminal prompt as usual. It never blocks
Claude. More detail in [`hook/README.md`](hook/README.md).

### 5. Start it automatically at login (optional)

Tick **Start at login** in the tray menu. This writes
`~/.config/autostart/dynamic-island-linux.desktop`; untick it to remove.

### Stopping it

- Click **Quit** in the tray menu, or
- press `Ctrl+C` in the terminal where you ran `npm start` / `npm run dev`, or
- for an installed package, run `dynamic-island-linux --quit`.

The tray icon on GNOME needs the AppIndicator extension, which Ubuntu enables by
default.

## Install as an app (.deb or AppImage)

Build the packages:

```bash
npm install
npm run package
```

This creates, in `dist/`:

- `dynamic-island-linux-<version>-amd64.deb`
- `dynamic-island-linux-<version>-x86_64.AppImage`

Install the `.deb`:

```bash
sudo apt install ./dist/dynamic-island-linux-0.1.0-amd64.deb
```

Then open **Dynamic Island** from the app launcher, or run `dynamic-island-linux`.

Or run the AppImage directly:

```bash
chmod +x dist/dynamic-island-linux-0.1.0-x86_64.AppImage
./dist/dynamic-island-linux-0.1.0-x86_64.AppImage
```

When installed this way, turn on Claude Code approvals and Start at login from
the tray menu (the hook still needs `node` on your `PATH`).

## Configuration

Environment variables (set them before starting the app):

| Variable | Meaning |
| --- | --- |
| `DI_DISPLAY` | Index of the monitor to show the island on (default: primary monitor) |
| `DI_DEMO` | Demo mode `1`, `2` or `3` (see above) |
| `DI_DEBUG` | Log when the island becomes clickable / click-through |
| `DYNAMIC_ISLAND_SOCK` | Socket shared with the Claude hook (default `$XDG_RUNTIME_DIR/dynamic-island.sock`, else `/tmp/dynamic-island-<uid>.sock`) |
| `DYNAMIC_ISLAND_TIMEOUT` | Seconds the Claude hook waits for your answer (default `45`) |

The "Show desktop notifications" choice is saved in
`~/.config/dynamic-island-linux/config.json`.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Hovering or clicking the island does nothing | You're probably on Wayland (`echo $XDG_SESSION_TYPE`). Log in with "Ubuntu on Xorg". |
| The island has a black box around it | Transparency needs a compositor; GNOME has one built in. On other desktops, enable compositing. |
| No music shown | The player must support MPRIS. Check with `gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.ListNames` and look for `org.mpris.MediaPlayer2.*`. |
| A Control Center control is missing | The matching tool isn't installed (`pactl`, `nmcli`, `bluetoothctl`, `brightnessctl`), or there's no such hardware. |
| Claude still asks in the terminal | Make sure the island is running, the hook is installed (tray menu or `npm run hook:install`), and Claude Code was restarted. Set `DYNAMIC_ISLAND_DEBUG_LOG=/tmp/hook.log` to log what the hook does. |
| No tray icon | Enable the "AppIndicator and KStatusNotifierItem Support" GNOME extension. |

## Development

```bash
npm run dev          # hot-reloading dev build
npm run check        # typecheck + unit tests + build
npm test             # unit tests only
npm run test:e2e     # the real app under Xvfb with a private D-Bus session
```

`npm run test:e2e` needs `xvfb`, `dbus` and `gdbus` (`sudo apt install xvfb dbus libglib2.0-bin`).
It drives the real Electron app: a fake music player, real Claude hook
round-trips, real pointer movement, notifications, the Control Center and
`--quit`. Run it with `E2E_SCALE=2` to test a HiDPI display. CI runs all of this
on every push and pull request.

### Project layout

```
electron/            main process
  main.ts            startup, wiring, lifecycle
  window.ts          transparent always-on-top window across the top of a monitor
  interactivity.ts   cursor loop: click-through except over the island
  store.ts           list of current activities
  tray.ts            tray menu
  providers/         media (MPRIS), claude (socket), notifications, system controls
renderer/            React UI (island shapes, cards, animations)
shared/              pure logic shared by both sides (presentation rules, protocol, types)
hook/                Claude Code PermissionRequest hook + installer
e2e/                 end-to-end test harness
tests/               unit tests (vitest)
```

### How it works

- **Window and clicks.** The app is one transparent, click-through window across
  the top of the screen. Electron can't forward mouse events on Linux, so the
  main process reads the global cursor position over X11 about 25 times a
  second and makes the window clickable only while the cursor is over the
  island (converted to physical pixels for HiDPI). That same signal drives hover.
- **What to show.** Every source adds "activities" with a priority (approvals
  10, notifications 5, music 1). A pure function in `shared/present.ts` picks the
  presentation: idle, compact, minimal (two activities) or expanded.
- **Music** comes from MPRIS over D-Bus and updates when players report changes.
- **Claude approvals** arrive from the hook over a private unix socket (only your
  user can connect); your click is sent back to the waiting hook.
- **Notifications** are observed on D-Bus as they are sent to the notification
  daemon, so your normal notification popups still work.
- **Control Center** uses standard command-line tools, and only checks them
  while the panel is open.

## Limitations

- **Full interactivity needs X11.** On Wayland the app runs through XWayland and
  shows a warning; it's drawn, but hover and click only register while the
  cursor is over X11 windows. A GNOME Shell extension would be the proper
  Wayland solution.
- The island window can't take keyboard focus, so there's no way to type a
  reason when denying a Claude request (the hook itself supports one).
- The two-activity split uses a spring animation rather than a liquid "goo" merge.
