# Development

How to run Dynamic Island from the code, test it, package it and release it, and how it works inside.

## Run it from the code

### Get the code and install dependencies

```bash
git clone https://github.com/shashanksharma280201/dynamic-island-linux.git
cd dynamic-island-linux
npm install
```

### Run it

```bash
npm start
```

This builds the app and launches it. The island appears on the right edge of the
screen (drag it to move it, or pick Left/Right in Settings); play some music or send a notification (`notify-send "Hello" "World"`)
to see it react.

For development with hot reload, use `npm run dev` instead.

### Try the demos

No music playing? The demo modes show every state with fake data:

```bash
DI_DEMO=1 npm run dev   # music, then a Claude approval card pops up
DI_DEMO=2 npm run dev   # two activities: compact pill + detached circle
DI_DEMO=3 npm run dev   # a normal and a critical notification
DI_DEMO=4 npm run dev   # WhatsApp messages (fake account) and a mail you can reply to
```

### Updating it

```bash
git pull
npm install       # only needed when dependencies changed
npm run restart
```

`npm run restart` rebuilds the island and replaces the one that's already
running (for example the one started at login), so there's no need to log out
or restart the computer. It runs in the background: you can close the
terminal. `npm start` does the same but stays attached to the terminal, which
is handy for seeing its logs. For an installed package, run
`dynamic-island-linux --replace`.

### Stopping it

- Click **Quit** in the tray menu, or
- press `Ctrl+C` in the terminal where you ran `npm start` / `npm run dev`, or
- for an installed package, run `dynamic-island-linux --quit`.

The tray icon on GNOME needs the AppIndicator extension, which Ubuntu enables by
default.

## Build the .deb and AppImage

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
sudo apt install ./dist/dynamic-island-linux-*-amd64.deb
```

Then open **Dynamic Island** from the app launcher, or run `dynamic-island-linux`.

Or run the AppImage directly:

```bash
chmod +x dist/dynamic-island-linux-*-x86_64.AppImage
./dist/dynamic-island-linux-*-x86_64.AppImage
```

When installed this way, turn on Claude Code approvals and Start at login from
the tray menu (the hook still needs `node` on your `PATH`).

## Tests

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
typing replies on the keyboard, and the settings window. A third suite tests
the Claude features: plan limits through the real status line script, commands
typed with the real keyboard and run by a fake `claude`, approvals, Stop, the
capsule orb and answer card, and Settings. A fourth suite tests Spotify
against a local stand-in for Spotify's sign-in and Web API: setup, PKCE
sign-in, browsing, playing inside a playlist, Now Playing controls, likes, the
no-device fallback and token refresh. Another suite tests the agent with API
providers against a local stand-in AI server, and one tests Documents: adding
files, merge / pages / page numbers / Word to PDF through the real print
window, the agent correcting a Word file as tracked changes, recipes, asking
before the Trash, and a real drag and drop from another app onto the island.
The CRM suite adds a contact, logs a call, ticks off a follow-up, moves a
deal to Won, imports a Google Contacts file (and undoes it), exports, lets the
agent log a call and add a follow-up (undone in one go), checks that deleting
asks first, and waits for a reminder card.
To include voice (synthesized speech
through a fake microphone into real Whisper), install `espeak-ng` and point
`E2E_STT_MODELS` at a folder containing `Xenova/whisper-tiny`; otherwise that
part is skipped. Run it with `E2E_SCALE=2` to test a HiDPI display. CI runs all of this
on every push and pull request.

**Releasing.** Bump the version on `main` (`npm version 0.3.0
--no-git-tag-version`), add its section to `CHANGELOG.md`, merge `main` into
`mac` and `windows`, then run the **Release** workflow from the Actions tab
with the tag (`v0.3.0`). It builds the installers on Linux, macOS and Windows,
names them, publishes them as a pre-release with `SHA256SUMS.txt` and notes
from the changelog, then installs it with the one-line scripts on all three
systems, checks that it starts, and uninstalls it again. Only then does it
become the latest release, the one people download. Then point the release
links at the top of this README and in [Download](../README.md#download) at the new
version.

## Videos

The tour and the one minute launch video in `docs/media/` are recorded from
the real app with made-up data, on a virtual screen. `scripts/video/make.sh`
records them again after a change: it narrates the tour (`scenes.json`),
records it, then records clean footage and cuts the launch video around the
moments the recorder marked (`launch.json`), in 16:9 and square. It needs
`kokoro-onnx` and `soundfile` for the voice, ffmpeg with libass, `xvfb-run` and
`xcompmgr`.

## Project layout

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
  claudeCode.ts      runs Claude Code (claude -p, stream-json) for island commands
  claudeIpc.ts       the Claude tab's IPC and the Ctrl+Alt+Space shortcut
  stt.ts             speech models: download once, serve over island-model://
  spotify.ts         Spotify Web API: PKCE sign-in, library, search, playback
  backdrop.ts        frosted glass: snapshot of the screen behind the island
  agent/             the island's own agent: providers (Claude, OpenAI-compatible), tools, prompt
  packages/          what the agent can do, per package (notes, chats, mail, music, documents)
  docs/              documents: read, PDF operations, Word corrections, sheets,
                     conversions, compare, and the workspace (docsIpc.ts wires the tab)
  crm/               the CRM: store (one JSON file, backups, undo) and import / export
                     (crmIpc.ts wires the tab)
  dragSource.ts      drag actions: what a system's drag watcher reports (X11 below; macOS and
                     Windows in electron/platform/ on their branches)
  dragWatch.ts       drag actions: notices a file drag anywhere (X11 XFixes + pointer)
  dragRing.ts        the ring's window under the pointer, as a drop target
  dragJobs.ts        runs what was picked; imageOps.ts converts images on a canvas
renderer/            React UI (island shapes, cards, animations); renderer/settings/ is the settings window
shared/              pure logic shared by both sides (presentation rules, protocol, types)
hook/                Claude Code PermissionRequest hook + installer
scripts/             install.sh / install.ps1 (the one-line installers), video/ (the tour)
e2e/                 end-to-end test harness
tests/               unit tests (vitest)
CHANGELOG.md         what changed in each release
```

## How it works

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
- **Claude commands** start `claude -p "<what you said>" --output-format
  stream-json` in your project folder and resume the same session for
  follow-ups. Its streamed events drive the orb and the live reply. Approvals
  come back through the same hook as terminal sessions.
- **Voice**: the island records 16 kHz audio, stops when you've been quiet for
  about 1.4 s, trims the silence and runs Whisper in a Web Worker
  (onnxruntime-web, WebAssembly, several threads).
- **Plan limits**: a small status line script (`hook/claude-island-status.cjs`)
  receives Claude Code's `rate_limits` and forwards them over the island's
  socket, then prints your previous status line.
- **Orbit's swirl** is [thinking-orbs](https://libraries.dev/orbs) by Jakub Antalik (MIT). The characters are original drawings.
- **Documents**: PDFs are changed with [pdf-lib](https://pdf-lib.js.org) and
  read with Mozilla's [pdf.js](https://mozilla.github.io/pdf.js/); Word files
  are read with [mammoth](https://github.com/mwilliamson/mammoth.js) and
  written with [docx](https://docx.js.org); spreadsheets use
  [ExcelJS](https://github.com/exceljs/exceljs). Corrections edit the Word
  file's XML directly (`w:del` and `w:ins`), keeping each run's formatting,
  which is how Word itself records tracked changes. New PDFs are printed from
  HTML by Chromium; with LibreOffice installed, Office files are converted by
  LibreOffice in the background with its own temporary profile.
- **CRM**: people, deals, follow-ups and the timeline live in one JSON file,
  written through a temporary file and renamed (a crash never leaves half a
  file), with a copy kept each day for a week; a damaged file falls back to
  the newest copy. Every change records what it replaced, grouped per click
  or per agent answer, which is what **Undo** puts back.
- **Drag actions**: the island asks the X server (XFixes) to tell it when any
  app takes the `XdndSelection`, which every app does when a drag starts, then
  follows the pointer until the button goes up. When it holds still, a
  transparent window with the ring is shown under it, and the pointer is
  nudged by a pixel so the dragging app notices the new window and treats it as
  a drop target (XDND). The ring learns the files' types as the drag enters it,
  and their paths when you let go on an action, exactly like any drop.
  Images are converted by Chromium on a canvas in a hidden, sandboxed page
  with no network.
- **Notes** are read and written by the main process in the profile folder;
  each save writes a temporary file and renames it, so a crash never leaves a
  half-written note.
