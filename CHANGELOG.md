# Changelog

What changed in each release of Dynamic Island. Download a release from
[Releases](https://github.com/shashanksharma280201/dynamic-island-linux/releases),
or install it with one command (see the [README](https://github.com/shashanksharma280201/dynamic-island-linux#download)).

## Unreleased

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
