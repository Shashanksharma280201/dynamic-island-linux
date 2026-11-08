# Ubuntu, the island's way

Three things that make Ubuntu feel like one product with the island:
Ubuntu in the island's look, a command bar, and system actions the
assistant can take (each one asking first).

## Ubuntu in the island's look

Settings → Desktop → **Make Ubuntu match the island**, then **Apply**:

- Light or dark follows the island (Settings → General → Light or dark), and
  so does the accent colour, using Ubuntu's own Yaru accent themes (Blue,
  Purple, Magenta, Red, Olive, Sage, Bark; Orange is Ubuntu's own). Change
  either later and Ubuntu follows.
- **The Dock at the bottom**, like macOS's: only as wide as its icons, and
  out of the way when a window needs the room (Ubuntu Dock's own settings).
- **Window buttons on the left**, if you like (off at first).

- **GNOME extensions** that finish the look, each from
  [extensions.gnome.org](https://extensions.gnome.org) (the version for your
  GNOME, installed with GNOME's own `gnome-extensions`; **Get it** in
  Settings → Desktop):
  - [Blur my Shell](https://github.com/aunetx/blur-my-shell): the top bar,
    the overview and the Dock blur what's behind them, like macOS's glass.
    On once it's installed.
  - [Just Perfection](https://gitlab.gnome.org/jrahmatzadeh/just-perfection):
    hides the top bar's clock, so the island has the top centre to itself.
    Off until you turn it on.

  A newly installed extension starts after you log out and back in (on
  Xorg, Alt+F2 then `r` restarts GNOME at once). The download is listed in
  Settings → Privacy, and **Pause AI and the web** stops it.

- **The login screen and boot splash**, with your password (Settings →
  Desktop → **Apply…**; Ubuntu asks once): the login screen in the
  island's accent, light or dark (GDM's own settings in
  `/etc/dconf/db/gdm.d/90-dynamic-island`, and Yaru's login theme in that
  accent where Ubuntu has one), and a boot splash with the island's orb,
  breathing while Ubuntu starts (a Plymouth theme in
  `/usr/share/plymouth/themes/island`; the boot image is rebuilt, which
  takes a minute). They don't follow later changes on their own, since each
  needs your password: **Apply again**. **Undo** puts back the login theme
  and the splash that were there. One small script does it, through
  `pkexec`, and it refuses anything but these.

Everything else is plain `gsettings`, so nothing needs your password, and
**Undo** puts back exactly what was there before (kept when you applied),
the list of extensions GNOME runs included. Settings says what it changed,
and what this desktop doesn't have.

## The command bar

Press **Ctrl+Alt+K** (change it in Settings → Keyboard shortcuts) from any
app, and type:

| Type | You get |
|---|---|
| An app's name, or part of it (“fire”, “vsc”) | The app, with its icon; Enter opens it |
| A file's name | Files you opened lately (GNOME's list) |
| Words from your notes | Notes from your second brain; Enter opens them |
| A setting (“wallpaper”, “privacy”) | That page of Settings |
| A sum (`2^10 / 4`, `1,250 * 3`) | The answer; Enter copies it |
| “dark mode”, “light”, “dnd”, “volume 40”, “mute”, “lock”, “wallpaper misty forest” | That change, at once |
| Anything else | **Ask** the buddy (out loud, looking at your screen) or **Ask Claude** |

Arrows pick, Enter goes, Escape closes. It opens on the screen you're on.

## System actions for the assistant

The **System** package (Settings → Packages) lets the assistant, and the
buddy through it, open an app, set the volume, go light or dark, turn on
Do Not Disturb or lock the screen. Every one of them asks you first on the
island (and on your phone).

## Wayland

These work on Ubuntu 22.04 with “Ubuntu on Xorg”, which the island needs
today. When you move past 22.04 (Wayland only from 25.10), a small GNOME
Shell extension will give the island its place on screen there; see the
[plan](research/island-brain-and-buddy.md#f-ubuntu-as-an-ai-os).
