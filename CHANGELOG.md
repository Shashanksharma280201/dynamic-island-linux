# Changelog

What changed in each release of Dynamic Island. Download a release from
[Releases](https://github.com/shashanksharma280201/dynamic-island-linux/releases),
or install it with one command (see the [README](https://github.com/shashanksharma280201/dynamic-island-linux#download)).

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
- macOS: the app is signed properly (no more "damaged" message) and has its own
  menu bar icon.

## 0.1.0 (2026-10-02)

The first release, for Linux, macOS and Windows: the island with Now Playing,
WhatsApp and mail (with replies), desktop notifications, the Control Center
panel, Claude Code approvals and plan limits, talking or typing to Claude Code,
any AI provider, Documents, the CRM and Spotify.
