# Install Dynamic Island

The quickest way is the one-line install or a download from the [README](../README.md#download). This page has what comes after: opening an unsigned installer, building it from the code on each system, updating, and uninstalling.

## Opening the downloaded installer

The installers aren't signed yet, so each system asks once:

- **Mac, `.pkg`:** open it. When macOS says it can't verify it, open **System
  Settings → Privacy & Security**, click **Open Anyway**, and install. The
  island starts by itself; its icon is in the menu bar.
- **Mac, `.dmg`:** drag Dynamic Island to Applications, then run this once in
  Terminal, or macOS says the app "is damaged and can't be opened":

  ```bash
  xattr -dr com.apple.quarantine "/Applications/Dynamic Island.app"
  ```

- **Windows:** if SmartScreen warns, click **More info**, then **Run anyway**.

(The Mac app isn't signed with an Apple Developer ID yet; that's why macOS
asks. [mac-signing.md](mac-signing.md) is how to turn that on.) To
check a download, compare it with
[SHA256SUMS.txt](https://github.com/shashanksharma280201/dynamic-island-linux/releases/download/v0.4.0/SHA256SUMS.txt): `sha256sum -c SHA256SUMS.txt
--ignore-missing` (on a Mac, `shasum -a 256 -c SHA256SUMS.txt
--ignore-missing`). To build it from the code instead, see [below](#build-it-from-the-code).

## Requirements on Linux

- **Ubuntu (or another GNOME desktop) on an X11 / Xorg session.** On Wayland it
  runs, but clicking the island only works partially (see [Limitations](troubleshooting.md#limitations)).
  To switch: log out, click the gear icon on the login screen, pick
  **"Ubuntu on Xorg"**. Check your current session with `echo $XDG_SESSION_TYPE`.
- **Node.js 18 or newer** and npm, to build from source.
- Optional, for the Claude features: [Claude Code](https://code.claude.com)
  installed (the `claude` command) and logged in once in a terminal. Plan
  limits need a Claude Pro or Max subscription. Voice needs a microphone.
- Optional, for the Control Center (usually preinstalled on Ubuntu):
  `pactl` (volume), `nmcli` (Wi-Fi), `bluetoothctl` (Bluetooth), and GNOME's
  brightness service or `brightnessctl` (brightness).

## Build it from the code

Pick your computer's system below and run its commands in order, one at a
time. Each system has its own branch of this repository: `main` is the Linux
version, and the `mac` and `windows` branches have everything on `main` plus
what that system needs. The commands below fetch the right branch for you.

| Your computer | Branch | Steps |
|---|---|---|
| Linux: Ubuntu or another GNOME desktop on X11 | `main` | [Install on Linux](#install-on-linux) |
| macOS 11 Big Sur or newer, Apple silicon or Intel | `mac` | [Install on macOS](#install-on-macos) |
| Windows 10 or 11, 64-bit | `windows` | [Install on Windows](#install-on-windows) |

**Just want the app?** Use the one-line install in [Download](../README.md#download), or
pick a ready-made installer from
[Releases](https://github.com/shashanksharma280201/dynamic-island-linux/releases/latest)
(`.deb` or AppImage for Linux, `.dmg` for Mac, `.exe` for Windows). The steps
below build it from the code instead.

Everything works without any accounts. Claude Code, WhatsApp, mail, Spotify
and the AI assistant are all optional and set up later from the island's
Settings.

### Install on Linux

Open a terminal (`Ctrl+Alt+T` on Ubuntu).

**1. Install Git and Node.js 22** (skip if `node -v` already prints v18 or newer):

```bash
sudo apt update && sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

**2. Get the code and its parts** (a few minutes the first time):

```bash
git clone -b main https://github.com/shashanksharma280201/dynamic-island-linux.git dynamic-island
cd dynamic-island
npm install
```

**3. Try it:**

```bash
npm start
```

The island appears on the right edge of the screen. Close it with `Ctrl+C` in
the terminal, or **Quit** in its tray menu (top right).

**4. Install it as an app** so it's in your app launcher:

```bash
npm run package
sudo apt install ./dist/dynamic-island-linux-*-amd64.deb
dynamic-island-linux &
```

**5. Start it at login:** click the island's tray icon (top right) and tick
**Start at login**.

On Wayland, the island shows but clicks only partly work: at the login screen,
click the gear icon and choose **Ubuntu on Xorg**. More options (AppImage,
Claude Code, demos) are in [Quick start](development.md#run-it-from-the-code).

### Install on macOS

Open **Terminal** (Applications → Utilities → Terminal).

**1. Install Git** (macOS asks to install the command line tools; click
**Install**, then wait for it to finish. If it says they're already installed,
go on):

```bash
xcode-select --install
```

**2. Install Node.js 22:** download the **macOS Installer (.pkg)** for the LTS
version from [nodejs.org/en/download](https://nodejs.org/en/download) and open
it. (With Homebrew, `brew install node` works too.) Then check it in a **new**
Terminal window:

```bash
node -v
```

**3. Get the code and its parts** (a few minutes the first time):

```bash
git clone -b mac https://github.com/shashanksharma280201/dynamic-island-linux.git dynamic-island
cd dynamic-island
npm install
```

**4. Try it:**

```bash
npm start
```

The island appears on the right edge of the screen and its icon in the menu
bar (top right). Close it with `Ctrl+C` in Terminal, or **Quit** in the menu
bar icon.

**5. Install it as an app:**

```bash
npm run package
open dist/*.dmg
```

Drag **Dynamic Island** onto **Applications** in the window that opens, then
open it from Launchpad or the Applications folder. If you copy the app to
another Mac (AirDrop, a download) and macOS says it "is damaged and can't be
opened", run this there once:

```bash
xattr -dr com.apple.quarantine "/Applications/Dynamic Island.app"
```

(`npm run package` also makes a `.pkg` in `dist/`, which installs on another
Mac without that step, after one **Open Anyway** in System Settings → Privacy
& Security.)

**6. Start it at login:** click the island's menu bar icon and tick **Start at
login**.

The first time, macOS asks to let Dynamic Island control **Spotify** or
**Music** (for Now Playing) and to use the **microphone** (only when you talk
to the assistant). Click **OK** / **Allow**.

### Install on Windows

Open **Command Prompt**: press the Windows key, type `cmd`, press Enter. (Use
Command Prompt rather than PowerShell; PowerShell can block `npm` with a
"running scripts is disabled" error.)

**1. Install Git and Node.js 22** (skip any you already have):

```bat
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
```

Close Command Prompt and open a **new** one, so it finds them, and check:

```bat
git --version
node -v
```

(No `winget`? Download Git from [git-scm.com](https://git-scm.com/download/win)
and the Node.js LTS **Windows Installer (.msi)** from
[nodejs.org/en/download](https://nodejs.org/en/download), and keep the
default options.)

**2. Get the code and its parts** (a few minutes the first time):

```bat
git clone -b windows https://github.com/shashanksharma280201/dynamic-island-linux.git dynamic-island
cd dynamic-island
npm install
```

**3. Try it:**

```bat
npm start
```

The island appears on the right edge of the screen and its icon in the
taskbar's notification area (bottom right; it may be under the **^** arrow).
Close it with `Ctrl+C` in Command Prompt, or **Quit** in that icon's menu.

**4. Install it as an app:**

```bat
npm run package
explorer dist
```

In the folder that opens, double-click **Dynamic-Island-Setup-….exe** and
follow the installer. If Windows SmartScreen says it protected your PC, click
**More info**, then **Run anyway** (the installer you built isn't signed).
Open **Dynamic Island** from the Start menu afterwards.

**5. Start it at login:** click the island's icon in the notification area and
tick **Start at login**.

### After installing (all systems)

**Update to the latest version.** If you installed it with the one-line
command, run that command again. If you built it from the code, in the
`dynamic-island` folder:

```bash
git pull
npm install
npm run restart
```

`npm run restart` rebuilds the island and swaps the running one for it. If you
installed it as an app, run `npm run package` again and install the new
package over the old one.

**Use Claude Code with the island** (optional): install
[Claude Code](https://code.claude.com), run `claude` once in a terminal to log
in, then in the `dynamic-island` folder:

```bash
npm run hook:install
```

Claude Code's permission prompts now show on the island. `npm run
hook:uninstall` removes it again.

## Uninstall

The easiest way, on every system: click the island's icon in the menu bar
(macOS) or tray (Windows, Linux) and choose **Uninstall Dynamic Island…**, or
open **Settings → General → Uninstall…**. It asks first, then removes:

- the app itself (to the Trash on macOS; on Windows its own uninstaller runs;
  on Linux it asks for your password to remove the `.deb`, or deletes the
  AppImage and the menu entry the one-line install added),
- starting at login,
- the Claude Code approvals and status line it set up (your own Claude Code
  settings are kept),
- and, only if you tick **Also delete my settings, notes, CRM and sign-ins**,
  everything it saved. Files it made in your Documents folder are always kept.

From a terminal, the same thing without questions:

| System | Command |
|---|---|
| macOS | `"/Applications/Dynamic Island.app/Contents/MacOS/Dynamic Island" --uninstall --yes --delete-data` |
| Windows | `"%LOCALAPPDATA%\Programs\DynamicIsland\DynamicIsland.exe" --uninstall --yes --delete-data` |
| Linux (.deb) | `dynamic-island-linux --uninstall --yes --delete-data` |
| Linux (AppImage from the one-line install) | `~/.local/bin/DynamicIsland.AppImage --uninstall --yes --delete-data` |
| From source | `npm start -- --uninstall --yes --delete-data`, then delete the `dynamic-island` folder |

Leave out `--delete-data` to keep your settings and data. You can also remove it
the usual way (drag it to the Trash on macOS, **Settings → Apps → Installed
apps → Dynamic Island → Uninstall** on Windows, `sudo apt remove
dynamic-island-linux` on Linux), but that leaves its settings and the Claude
Code setup behind; Uninstall… removes those too.
