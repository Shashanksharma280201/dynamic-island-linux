# Changelog

What changed in each release of Dynamic Island. Download a release from
[Releases](https://github.com/shashanksharma280201/dynamic-island-linux/releases),
or install it with one command (see the [README](https://github.com/shashanksharma280201/dynamic-island-linux#download)).

## Unreleased

**Phone Drop: files from your phone, with a glow**

- Flick photos and files from your Android phone to this computer with the new
  **Island Drop** app: hold a file and move it toward the side of the phone
  that faces your computer. That edge of the screen lights up, white with a
  ring of colour; let go and the file comes out of the light, a band of colour
  sweeps across the screen, and the file flies into the island, which shows it
  to open, show in its folder, undo or drag out.
- Turn it on in **Settings → Phone Drop** and pair with its QR. Only paired
  phones can send; files are saved to Downloads (or the Desktop, or a folder
  you pick) and never over another file. Big files carry on in the island
  with a progress bar.
- The app's APK is built by GitHub Actions (**Island Drop (Android)**).

**Connected: your trading engine on the island**

- A new **Connected** package shows a service you run (the first one is the
  [Day-Trading](https://github.com/Shashanksharma280201/Day-Trading) engine)
  right on the island: today's P&L on the capsule, every trade it wants to make
  as a card with **Buy / Skip** and a countdown, and its own tab with open
  positions, today's trades and **Stop trading today**.
- Only your click (or the approval shortcut) answers a card. No answer before
  the countdown ends means no; the island's assistant can read what it shows
  but can't answer for you.
- Set it up in **Settings → Connected** (address and token, tried before
  they're kept; the token is encrypted). The same section shows a QR to pair
  the Day-Trading Android app with the same engine.
- Everything shown comes from the service, so it can change what you see
  without a new island release (protocol in Day-Trading's
  `docs/island-protocol.md`).

**Drag actions on macOS and Windows**

- Drag actions now work on a Mac and on Windows too: drag a file in any app,
  hold still (or press Option / Alt), and the ring opens under the pointer.
- On a Mac the ring opens with its actions at once, and needs no permission:
  it notices drags through the system's drag pasteboard.
- On Windows it opens for drags that show Windows' drag image under the
  pointer, from File Explorer, browsers and most apps.
- Fixed: a drop with a Windows path (`C:\Users\…`) was ignored.

## 0.4.0 (2026-10-22)

**Drag actions**

- Drag any file, in any app, and hold still for a moment (or press **Alt**): a
  ring of six actions opens under the pointer. **Convert** (PDF, Word, Excel,
  CSV, Markdown, text, PNG, JPEG, WebP), **Edit** with Claude, **Capture** an
  image, **Ask Claude** to summarize, translate or explain it, **Shrink** a
  photo or PDF, and **Copy text**. Let go on one and it runs.
- The island shows it working, then the file it made: **Open**, **Show in
  folder**, **Undo**, or drag it straight out of the island. Results are new
  files next to the original; nothing is overwritten.
- Move away or let go in the middle and the drag carries on as usual.
- **Settings → Drag actions** (hold still, Alt or either; how long; where
  results go) and a switch in the tray menu. Linux with X11 for now.

## 0.3.0 (2026-10-15)

**Installing on a Mac**

- A Mac said the downloaded app "is damaged and can't be opened". The Mac
  downloads now include a `.pkg`: open it, click **Open Anyway** once in
  System Settings → Privacy & Security, and it installs and starts the island.
  The one-line install command is still the easiest way on a Mac, and the
  README says how to use the `.dmg` too. (The app isn't signed with an Apple
  Developer ID yet; once it is, the `.dmg` opens normally.)

**Claude Code, live from your terminals**

- Every Claude Code session you run in a terminal shows on the island while it
  works: your character with an orb for what it's doing and a step count, or
  how many sessions are working. A card pops up when one needs you, and when
  one finishes, with its last answer, how long it took and what it changed
  (**+12 −3**). **Open terminal** brings its window to the front.
- New **Sessions** tab: every session with its status and changes; open one to
  see its steps and the diff of every file it touched.
- Answer Claude's **questions** on the island, one at a time, picking options or
  typing your own answer, and read its **plan** before you let it start.
- If you had approvals on, the island adds the new session hook by itself.
- **Codex, Gemini CLI and Cursor Agent** sessions can show too: turn each on in
  Settings → Claude. Their steps read the same way ("Running npm test",
  "Editing app.ts").

**Fixes**

- After you used the icons beside the panel and closed it, an invisible strip
  under the island could keep catching clicks meant for the app below. Gone.
- Typing in a card no longer leaves the island's content shifted.

**Notifications**

- **Clear all**: when several notifications wait on the island, a pill says how
  many and clears them all at once, with **Undo**.
- New **Notifications** tab with everything that arrived, grouped by app, kept
  between restarts. Dismiss one (× or swipe), clear an app, or clear all.
- **Do Not Disturb** in the tab, the Control Center and the tray: nothing pops
  up, and the resting island shows a moon with how many are waiting.

**Easier to use**

- **Show me around:** a one-minute tour on the island with example cards. It's
  offered the first time, and is in the tray menu and Settings any time.
- Cards that close by themselves show a thin countdown. It stops while you
  hover, and the pin keeps the card until you close it.
- **Change any shortcut** in Settings → Keyboard shortcuts: click it and press
  the new keys. Keys another shortcut (or another app) already uses are refused,
  with why.
- **Shortcuts** in the Control Center lists them all, as they're set now.
- **Open on hover** (Settings → General): rest on the island and the panel
  opens, no click needed.
- **Island lives on** (Settings → General): the main display, the display with
  the pointer (it follows you between screens), or a monitor you pick. A
  monitor is found again after you replug it.

**Dictate anywhere**

- Press **Ctrl+Alt+D** in any app and speak: what you said is typed into that
  app (terminals included) when you stop talking, or press it again. Speech is
  recognised on this computer. A pill under the island shows your voice as you
  speak. Turn it off or change the keys in Settings.

**Claude Code, continued**

- Answer Claude's questions from the keyboard without leaving your app:
  **Ctrl+Alt+1…9** picks an option, **Ctrl+Alt+Y** moves on or sends.
- If a request waits on the island too long, Claude asks in the terminal
  instead, and the island now says so as the card goes.
- **Attach the window you were in:** the paperclip in the Claude tab adds a
  screenshot of the app you opened the island from (and its title) to your
  next message, so Claude can see what you mean.

**Services and your week**

- New **Services** tab: GitHub, Vercel, Stripe, Resend, Notion, Cal.com and
  n8n, each with its own card. A failed deploy, CI breaking on your pull
  request, a review request, a new payment or a failed workflow pops up on the
  island. Set them up in Settings → Services; keys are stored encrypted.
- **Weekly recap:** on Monday mornings, last week with your coding agents at a
  glance, with an image to share. From the tray any time, too.

**Your character**

- **Wardrobe:** 13 outfits (beanie, cap, crown, headphones, glasses,
  sunglasses, bow tie, party hat, flower, Santa hat, witch hat, top hat, scarf)
  and a **Seasonal** one that changes with the date, plus a body colour. Pick
  them in Settings → Character, or right-click the island.
- **On your desktop too:** the character can sit on the desktop, acting out
  what's going on (working along with Claude, waving when something needs you,
  dancing to music, dozing when it's quiet). Drag it anywhere; click it to open
  the island.
- **Your own sounds:** put a file named after a sound (done.mp3, ask.wav…) in
  the sounds folder (Settings → General → Sounds) and it plays instead.

**Looks**

- Dotted "thinking orbs" show what's going on: on the capsule and the cards
  while Claude works (a different motion for searching, editing, running),
  around your character while you talk, and wherever something is loading.

## 0.2.0 (2026-10-08)

**A livelier island**

- The island opens and closes with springs you can interrupt halfway, and its
  content swaps without blinking.
- **Peek:** rest the pointer on the island and it shows one line about what's
  going on (Claude's current step, the song playing, or "Ask Orbit anything").
  Keep resting and the full card opens.
- Characters show their mood with a coloured ring, breathe when idle, follow
  your pointer with their eyes and bob along to music. Boop one in the Claude
  tab; boop it three times quickly and it gets dizzy. It says hello once a day.
- **Mochi is now called Puff.** Your settings move over by themselves.
- In the panel, the selected tab slides between icons, and a new tab slides in
  from the direction you went.
- Optional sounds, off by default: Settings → General → Sounds.

**Claude Code**

- Answer permission requests from any app: **Ctrl+Alt+Y** allows, **Ctrl+Alt+N**
  denies, **Ctrl+Alt+A** always allows. Requests waiting behind the first one
  peek out below the card.
- Claude's steps roll by in the peek ("Reading 3 files", "Editing styles.css
  +12 −3"), the capsule counts them, and the working card lists the last few.

**Files**

- Drag files onto the island and it opens a pocket; drop them and the character
  swallows them while they're added to Documents.

**Install and uninstall**

- One command installs or updates it on Linux, macOS and Windows, and checks
  the download first. See [Download](https://github.com/shashanksharma280201/dynamic-island-linux#download).
- **Uninstall** from the island's menu, Settings → General, or `--uninstall`:
  removes the app, starting at login, the Claude Code setup and, if you choose,
  all your data.
- Every release has a `SHA256SUMS.txt` to check the files against.
- Windows: the installer no longer quits without installing now and then on
  Windows 11 24H2 and later.
- Ubuntu 24.04: the .deb sets up the AppArmor profile the app needs there.
- macOS: the app is signed properly (no more "damaged" message) and has its own
  menu bar icon.

## 0.1.0 (2026-10-02)

The first release, for Linux, macOS and Windows: the island with Now Playing,
WhatsApp and mail (with replies), desktop notifications, the Control Center
panel, Claude Code approvals and plan limits, talking or typing to Claude Code,
any AI provider, Documents, the CRM and Spotify.
