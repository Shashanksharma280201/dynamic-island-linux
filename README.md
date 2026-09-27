# Dynamic Island for Linux

A Mac-style **Dynamic Island** for Ubuntu (X11 + GNOME): a small black capsule on
the edge of your screen (right side by default, drag it anywhere along the left or
right edge) that morphs with spring physics to show what's going
on (music, WhatsApp messages, new mail, Claude Code permission prompts,
notifications), lets you **reply right from the island**, and opens a mini
Control Center when you click it. Everywhere outside the island, your desktop
stays fully clickable.

## Features

| Feature | What you see | What you can do |
| --- | --- | --- |
| **Edge capsule** | A slim black capsule docked to the right (or left) edge of the screen; with music playing it shows the album art above a waveform | Click it (or press **Ctrl+I** anywhere) to open the panel. **Drag it** up or down the edge, or across the screen to dock it on the other side; it snaps to the nearer edge and remembers the spot |
| **Now Playing** | Album art + animated waveform while music plays in any MPRIS player: Spotify (app or web), YouTube / YouTube Music in Chrome or Firefox, VLC, Rhythmbox, … | Hover to expand: title, artist, progress bar (click it to seek), previous / play-pause / next, shuffle and repeat |
| **Panel (Controls / Chats / Mail / Notes)** | Opens on click or **Ctrl+I**, with a slim column of icons floating beside it (like a detached dock) that remembers the last section | Click an icon to switch between the Control Center, your WhatsApp chats, your mail inbox and your notes at any time, not only when something new arrives. The gear at the bottom opens Settings. **Ctrl+I** again (or moving the pointer away) closes it |
| **WhatsApp** | New messages pop up as a card per chat. **Chats** lists your recent chats with coloured avatars, a one-line preview, time and unread count, plus a search field. Conversations show bubbles with times, "Today / Yesterday" dividers and coloured sender names in groups | Reply from the card or from the conversation view, search chats, **Mark as Read**, **Open Chats** |
| **Notes** | Your notes, newest first, with a search field | **+** starts a new note (ready to type), click one to open and edit it, the trash icon deletes it. Notes save automatically as you type, as plain Markdown files on this computer |
| **Mail** | New mail pops up as a card. **Mail** lists your recent inbox (unread dot, sender, subject, preview, time), with an account picker when you have several | Open a message to read it (marks it read, like Mail), **Reply** (threaded, saved to Sent), **Mark as Read**, **Open Inbox** |
| **Two activities at once** | The capsule plus a small detached circle below it for the second activity | Hover to expand the main one |
| **Claude Code approvals** | When Claude Code needs permission, the island expands with the tool, the exact command / file / diff, and the working directory | **Allow**, **Deny**, **Always allow** (saves Claude's suggested rule, e.g. `Bash(npm test:*)`), or **Answer in terminal**. Several waiting requests are answered in order, with a `+N` badge |
| **Desktop notifications** | Every app's notifications appear on the island with the app icon; critical ones get a red outline and stay longer | Click to dismiss. Newest shows first, `+N` badge for more. For apps that use GNOME's notification API, their buttons (e.g. "Open log", "Reply") appear and work |
| **Control Center** | macOS-style modules: round Wi-Fi / Bluetooth toggles and large Display / Sound sliders | Drag the sliders, click the volume value to mute, toggle Wi-Fi / Bluetooth, open Settings. Closes by itself shortly after the cursor leaves |
| **Settings window** | Opened from the tray menu or the Control Center, styled like System Settings | Appearance (Glass / Solid), frosted glass on/off, island position, open the notes folder, Ctrl+I shortcut on/off, link WhatsApp, add mail accounts, and the general toggles |
| **Tray menu** | An icon in the top bar | Settings, show notifications on/off, Claude Code approvals on/off, Start at login on/off, Quit |

Other details:

- Works on HiDPI (scaled) displays and multi-monitor setups; the island sits on
  the primary monitor (or the one you choose with `DI_DISPLAY`) and follows
  resolution or monitor changes.
- Only one copy runs at a time.
- Controls for tools that aren't installed (e.g. no Bluetooth adapter) are hidden
  instead of showing wrong values.
- The look follows Apple's design language: dark HUD "glass" material with a
  light rim, system colours (blue for the main action), capsule buttons,
  iMessage-style reply field and message bubbles, SF Symbols-style icons, and
  the Inter typeface (bundled).
- **Frosted glass**: the island blurs what's behind it, like macOS. On KDE
  Plasma the compositor does this live. Elsewhere on X11 (GNOME, Xfce, …) the
  island takes a snapshot of the screen area behind it while it is collapsed,
  every few seconds, and shows it blurred; the snapshot stays in memory and is
  never saved or sent anywhere. Turn it off with **Frosted glass** in Settings,
  or choose **Solid** for an opaque look. Not available on Wayland.
- Cards open inward from the edge the island is docked to and always stay fully
  on screen, even when the island sits near the top or bottom.
- Cards stay open while you hover them or type a reply, then close by themselves.
- **Ctrl+I** is a global shortcut: while the island runs, other apps no longer
  receive Ctrl+I (for example italics in editors). Turn it off in Settings if
  that gets in the way. It works on X11; Wayland doesn't allow global shortcuts
  for apps.
- The island only takes keyboard focus while you're typing (a reply, a search,
  a note), so it never steals focus from the app you're using.

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

This builds the app and launches it. The island appears on the right edge of the
screen (drag it to move it, or pick Left/Right in Settings); play some music or send a notification (`notify-send "Hello" "World"`)
to see it react.

For development with hot reload, use `npm run dev` instead.

### 3. Try the demos (optional)

No music playing? The demo modes show every state with fake data:

```bash
DI_DEMO=1 npm run dev   # music, then a Claude approval card pops up
DI_DEMO=2 npm run dev   # two activities: compact pill + detached circle
DI_DEMO=3 npm run dev   # a normal and a critical notification
DI_DEMO=4 npm run dev   # WhatsApp messages (fake account) and a mail you can reply to
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

### 5. Connect WhatsApp (optional)

1. Open **Settings…** from the tray menu and turn on **Show WhatsApp messages and
   reply from the island**.
2. Click **Restart now** (the island needs one restart the first time).
3. A QR code appears in the WhatsApp section. On your phone open WhatsApp →
   **Settings → Linked devices → Link a device** and scan it. Or type your phone
   number to get an 8-character code to enter on the phone instead.
4. It shows **Connected as …**. New messages now pop up on the island; click
   **Reply** to answer.

The login is remembered, so you only link once. **Unlink** in Settings logs the
island out (it also disappears from Linked devices on your phone).

### 6. Add a mail account (optional)

1. Open **Settings…** from the tray menu, then **Add account** under Mail.
2. Type your email address. For Gmail, Yahoo, iCloud and Fastmail the server
   settings fill in automatically; for anything else enter your provider's IMAP
   and SMTP servers.
3. Enter an **app password**. With 2-step verification on (Gmail requires it),
   your normal password won't work; create one at
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   (Gmail) or in your provider's security settings.
4. Click **Test**, then **Save**. The dot next to the account turns green when it's
   connected.

New mail arrives instantly (IMAP IDLE). Replies are sent over SMTP as a proper
reply in the same thread and saved to your Sent folder. You can add several
accounts; each card then shows which account it's for.

### 7. Start it automatically at login (optional)

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
| `DI_DEMO` | Demo mode `1`, `2`, `3` or `4` (see above) |
| `DI_DEBUG` | Log when the island becomes clickable / click-through (polling mode) |
| `DI_INPUT` | `poll` forces the cursor-polling fallback instead of the X11 input shape |
| `DYNAMIC_ISLAND_SOCK` | Socket shared with the Claude hook (default `$XDG_RUNTIME_DIR/dynamic-island.sock`, else `/tmp/dynamic-island-<uid>.sock`) |
| `DYNAMIC_ISLAND_TIMEOUT` | Seconds the Claude hook waits for your answer (default `45`) |
| `DI_USER_DATA` | Use a different profile folder (settings, WhatsApp login, notes) |
| `DI_BACKDROP` | `off` disables the frosted-glass screen snapshot |

Settings are saved in `~/.config/dynamic-island-linux/config.json`. Notes are
plain Markdown files in `~/.config/dynamic-island-linux/notes/` (one `.md`
file per note; the first line is its title), so you can back them up, sync
them or edit them with any editor. Settings has an **Open Folder** button. Mail
passwords are encrypted with your desktop keyring (GNOME Keyring); if no keyring
is available, Settings warns you that they are only obfuscated.

### Privacy and security notes

- **WhatsApp** runs WhatsApp Web inside the island as a linked device, using the
  open-source [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
  library (the same engine as whatsapp-connector). It is not an official
  WhatsApp API; normal personal use is fine, but WhatsApp can restrict accounts
  that automate bulk messaging. Its login lives in the island's profile folder.
- To drive WhatsApp Web, the island opens a Chrome DevTools debugging port on
  `127.0.0.1` (random port) **only while WhatsApp is enabled**. Like any
  whatsapp-web.js setup, other programs running on the same computer could
  connect to it, so don't enable WhatsApp on a shared multi-user machine.
- Messages and mail are shown on the island and never sent anywhere else.
- Notes never leave your computer.
- The frosted-glass snapshot is a small, low-resolution image of the strip of
  screen behind the island, kept only in memory. It is taken only while the
  island is collapsed, so the island never captures itself or your open panel.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Hovering or clicking the island does nothing | Start it from a terminal (`npm start`) and look for the line `[island] input: …, session: …, scale: …`. If `session` is `wayland`, log in with "Ubuntu on Xorg". If it says `cursor-polling`, the X11 input shape couldn't be set; try `DI_INPUT=poll npm start` to force the fallback, and share that line in an issue. |
| The island has a black box around it | Transparency needs a compositor; GNOME has one built in. On other desktops, enable compositing. |
| No music shown | The player must support MPRIS. Check with `gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus --method org.freedesktop.DBus.ListNames` and look for `org.mpris.MediaPlayer2.*`. |
| A Control Center control is missing | The matching tool isn't installed (`pactl`, `nmcli`, `bluetoothctl`, `brightnessctl`), or there's no such hardware. |
| Claude still asks in the terminal | Make sure the island is running, the hook is installed (tray menu or `npm run hook:install`), and Claude Code was restarted. Set `DYNAMIC_ISLAND_DEBUG_LOG=/tmp/hook.log` to log what the hook does. |
| No tray icon | Enable the "AppIndicator and KStatusNotifierItem Support" GNOME extension. |
| WhatsApp says "Couldn't start" | Check your internet connection, then toggle WhatsApp off and on in Settings. If the QR never appears after a WhatsApp update, update the app (`npm update whatsapp-web.js`). |
| Ctrl+I does nothing | Another app may already own Ctrl+I (Settings then says so), or you're on Wayland. You can still click the island. |
| WhatsApp shows "Disconnected" | The island was unlinked from your phone. Toggle WhatsApp off and on and scan the QR again. |
| Mail account shows a red dot | Read the error shown next to the account. Usually it is a wrong password: use an app password, not your normal one. |
| Can't type in the reply box | Your window manager refused keyboard focus for the island. Please open an issue with your desktop environment. |

## Development

```bash
npm run dev          # hot-reloading dev build
npm run check        # typecheck + unit tests + build
npm test             # unit tests only
npm run test:e2e     # the real app under Xvfb with a private D-Bus session
```

`npm run test:e2e` needs `xvfb`, `dbus` and `gdbus` (`sudo apt install xvfb dbus libglib2.0-bin`).
It drives the real Electron app: a fake music player (including seek, shuffle
and repeat), real Claude hook round-trips, real pointer movement, notifications
and GNotification buttons, the Control Center and `--quit`. A second suite tests
messaging: a scripted fake WhatsApp, a real local IMAP + SMTP server for mail,
typing replies on the keyboard, and the settings window. Run it with `E2E_SCALE=2` to test a HiDPI display. CI runs all of this
on every push and pull request.

### Project layout

```
electron/            main process
  main.ts            startup, wiring, lifecycle
  window.ts          transparent always-on-top window: a column along the docked screen edge
  interactivity.ts   cursor loop: click-through except over the island
  store.ts           list of current activities
  tray.ts            tray menu
  providers/         media (MPRIS), claude (socket), notifications, system controls,
                     whatsapp (whatsapp-web.js), mail (IMAP IDLE + SMTP)
  messages.ts        turns WhatsApp messages / mail into cards, routes replies
  transient.ts       cards that close by themselves (held while hovered or replying)
  settings.ts        settings window + its IPC; config.ts / secrets.ts store settings
  notes.ts           notes as Markdown files (atomic writes)
  backdrop.ts        frosted glass: snapshot of the screen behind the island
renderer/            React UI (island shapes, cards, animations); renderer/settings/ is the settings window
shared/              pure logic shared by both sides (presentation rules, protocol, types)
hook/                Claude Code PermissionRequest hook + installer
e2e/                 end-to-end test harness
tests/               unit tests (vitest)
```

### How it works

- **Window and clicks.** The app is one transparent window: a column along the
  docked screen edge. Its X11 *input shape* (SHAPE extension) is set to just the
  island's rectangle, so the X server itself sends clicks on the island to the
  app and everything else straight through to the desktop, with no polling.
  While you drag, the whole column takes input, and crossing the middle of the
  screen moves the column to the other edge. If the input shape can't be set,
  it falls back to reading the cursor position about 25 times a second and
  toggling click-through.
- **What to show.** Every source adds "activities" with a priority (approvals
  10, notifications 5, music 1). A pure function in `shared/present.ts` picks the
  presentation: idle, compact, minimal (two activities) or expanded.
- **Music** comes from MPRIS over D-Bus and updates when players report changes.
- **Claude approvals** arrive from the hook over a private unix socket (only your
  user can connect); your click is sent back to the waiting hook.
- **Notifications** are observed on D-Bus as they are sent to the notification
  daemon, so your normal notification popups still work. Buttons of apps that
  use GNOME's GNotification API are triggered the same way GNOME Shell does it
  (`org.freedesktop.Application.ActivateAction`).
- **WhatsApp** runs whatsapp-web.js against a hidden window of the island itself
  (Electron is Chromium), so no separate browser is needed.
- **Mail** keeps an IMAP IDLE connection per account and sends replies over SMTP.
- **Control Center** uses standard command-line tools, and only checks them
  while the panel is open.
- **Frosted glass** (without KDE): Electron's `desktopCapturer` grabs the
  screen, the part behind the island's column is cropped and downscaled, and
  the island draws it under a CSS blur, aligned so it lines up with the real
  desktop.
- **Notes** are read and written by the main process in the profile folder;
  each save writes a temporary file and renames it, so a crash never leaves a
  half-written note.

## Limitations

- **Full interactivity needs X11.** On Wayland the app runs through XWayland and
  shows a warning; it's drawn, but hover and click only register while the
  cursor is over X11 windows. A GNOME Shell extension would be the proper
  Wayland solution.
- The island window can't take keyboard focus, so there's no way to type a
  reason when denying a Claude request (the hook itself supports one).
- The two-activity split uses a spring animation rather than a liquid "goo" merge.
- **Replying to any notification isn't possible in general.** Standard Linux
  notifications have no way for another program to press their buttons; only
  apps using GNOME's GNotification API expose them. WhatsApp and mail replies
  work through their own built-in integrations instead.
- Mail uses IMAP/SMTP with a password or app password. Outlook.com / Microsoft
  365 accounts that only allow OAuth sign-in aren't supported yet.
- The WhatsApp integration is tested automatically against a scripted fake;
  the real WhatsApp Web connection has to be tried with a real phone.
