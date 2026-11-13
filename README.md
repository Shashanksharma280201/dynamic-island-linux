# Dynamic Island

[![CI](https://github.com/shashanksharma280201/dynamic-island-linux/actions/workflows/ci.yml/badge.svg)](https://github.com/shashanksharma280201/dynamic-island-linux/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/shashanksharma280201/dynamic-island-linux)](https://github.com/shashanksharma280201/dynamic-island-linux/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Dynamic Island for your desktop: a small capsule on the edge of your screen
that shows what's going on (music, messages, mail, notifications, your Claude
Code sessions) and lets you act on it without leaving what you're doing.
Linux, macOS and Windows. Free and open source.

[![Watch the tour](docs/media/dynamic-island-tour.jpg)](docs/media/dynamic-island-tour.mp4)

**[Watch the 1 minute video](docs/media/dynamic-island-launch.mp4?raw=true)**, or the
[4 minute tour](docs/media/dynamic-island-tour.mp4?raw=true). Both are recorded from
the real app with made-up data.

## This is the Windows branch

It has everything on `main`, plus what Windows needs (`electron/platform/win32.ts`). See [what's different on Windows](docs/platforms.md#windows), and [Install on Windows](docs/install.md#install-on-windows) to build it from the code.

## Download

**[Dynamic Island v0.10.1](https://github.com/shashanksharma280201/dynamic-island-linux/releases/tag/v0.10.1)**
([what's new](CHANGELOG.md)). Install it with one command, and run the same
command again later to update.

On **Linux or a Mac**, in Terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/shashanksharma280201/dynamic-island-linux/main/scripts/install.sh | bash
```

On **Windows**, in PowerShell:

```powershell
irm https://raw.githubusercontent.com/shashanksharma280201/dynamic-island-linux/main/scripts/install.ps1 | iex
```

Or download the installer:

| Your computer | Download |
|---|---|
| Linux | [.deb](https://github.com/shashanksharma280201/dynamic-island-linux/releases/download/v0.10.1/dynamic-island-linux-0.10.1-amd64.deb) for Ubuntu and Debian, or the [AppImage](https://github.com/shashanksharma280201/dynamic-island-linux/releases/download/v0.10.1/dynamic-island-linux-0.10.1-x86_64.AppImage) |
| Mac with Apple silicon | [.pkg](https://github.com/shashanksharma280201/dynamic-island-linux/releases/download/v0.10.1/dynamic-island-mac-MSeries-0.10.1-arm64.pkg) (or the [.dmg](https://github.com/shashanksharma280201/dynamic-island-linux/releases/download/v0.10.1/dynamic-island-mac-MSeries-0.10.1-arm64.dmg)) |
| Mac with Intel | [.pkg](https://github.com/shashanksharma280201/dynamic-island-linux/releases/download/v0.10.1/dynamic-island-mac-intel-0.10.1-x64.pkg) (or the [.dmg](https://github.com/shashanksharma280201/dynamic-island-linux/releases/download/v0.10.1/dynamic-island-mac-intel-0.10.1-x64.dmg)) |
| Windows 10 or 11 | [.exe](https://github.com/shashanksharma280201/dynamic-island-linux/releases/download/v0.10.1/dynamic-island-windows-0.10.1-x64.exe) |

The installers aren't signed yet, so your system asks once before opening
them: [here's how](docs/install.md#opening-the-downloaded-installer). To build
it from the code instead, see [Install](docs/install.md).

## What it does

- **Now Playing**: album art and a waveform on the capsule, with play, pause, skip and seek for Spotify, YouTube and any media player.
- **Messages and mail**: WhatsApp messages and new mail pop up as cards, and you reply right there.
- **Island OS: your computer as one AI**: a model on this computer answers first (Ollama), the cloud only with your yes, and every answer says where it ran and what it cost. **Today** shows your day by hour from the sources you turn on (GitHub, your terminal, calendar, screen time, Codex and Gemini, mail and chats) and answers “what did I do last week?” with sources. **Agents** research your notes, watch for things (“tell me when PR #43 is reviewed”) and keep your people, promises and projects up to date. **Call notes** are made out on this computer, the audio deleted. And [The Agency](https://github.com/msitarzewski/agency-agents)'s specialist agents start in Claude with one click, and Anthropic's [Agent Skills](https://github.com/anthropics/skills) install into Claude Code. Today and Agents are on the phone app too. [The guide](docs/island-os.md).
- **A second brain**: one memory for you and every AI you use, as plain notes on your computer. Claude Code, Codex and Gemini CLI know who you are, every session gets a five-line note, and your projects get pages. [How it works](docs/brain.md).
- **Ubuntu, the island's way**: a command bar (Ctrl+Alt+K) for apps, files, notes, sums and system changes, and Ubuntu in the island's look in one click (and back). [How it works](docs/desktop.md).
- **A buddy for your screen**: press Ctrl+Alt+B and ask “where do I change this?”; it answers out loud and points at the spot, step by step. [How it works](docs/buddy.md).
- **Wallpaper by asking**: “set my background to misty mountains” or “make it a video of rain” finds one on the web and sets it; videos and animations play live. [How it works](docs/wallpaper.md).
- **Claude Code, live**: every session in your terminals shows what it's doing and what it changed. Allow its permission prompts, answer its questions and read its plans from any app.
- **Drag actions**: drag any file and hold still, and a ring opens to convert it, shrink it, copy its text or ask Claude about it.
- **Phone Drop**: flick a photo or file from your Android phone toward the screen; it comes out of a glow at the edge and lands in the island.
- **An assistant**: Claude, ChatGPT, Gemini, DeepSeek, OpenRouter or Ollama, and it asks before it sends or changes anything.
- **Documents and a CRM**: merge, split and convert files, have Word files corrected as tracked changes, and keep a simple CRM.
- **Notifications**: every app's notifications on the island, a notification center, and Do Not Disturb.
- **An orb**: Orbit, Bolt or Puff, a dotted orb in its own colour, shows what's going on. Put it on your desktop too, and get a recap of your week every Monday.
- **Control Center**: volume, brightness, Wi-Fi and Bluetooth, one click away.

Everything is optional and works without accounts. Your settings, notes,
documents and CRM stay on your computer. See [all features](docs/features.md).

<p align="center">
  <img src="docs/media/island-os-today.png" width="32%" alt="Today: your day by hour from your sources, what's next, and a question answered on this computer with numbered sources">
  <img src="docs/media/island-os-agents.png" width="32%" alt="Agents: research over your notes, monitors that tell you once, and the jobs that tend your brain">
  <img src="docs/media/island-os-skills.png" width="32%" alt="Agent Skills: Anthropic's pdf skill installed into Claude Code, with its licence">
</p>
<p align="center"><sub>Island OS: Today, Agents and Agent Skills (made-up data, from <code>scripts/video/island-os-shots.cjs</code>)</sub></p>

## Get started

Once installed, the island sits at the top center of your screen. Drag it
anywhere along the left or right edge, or back to the top center, and click it (or press
**Ctrl+I**) to open the panel. Then connect what you use, from **Settings**:

- [Your second brain](docs/brain.md), so every AI you use knows you and your work
- [Claude Code](docs/setup.md#connect-claude-code), to follow your sessions and answer their prompts on the island
- [An AI provider](docs/setup.md#use-any-ai) for the assistant
- [WhatsApp](docs/setup.md#connect-whatsapp), [mail](docs/setup.md#add-a-mail-account) and [Spotify](docs/setup.md#connect-spotify)
- [Documents](docs/setup.md#work-with-documents), [drag actions](docs/setup.md#drag-actions) and the [CRM](docs/setup.md#your-own-crm)

## Works on

| System | Version |
|---|---|
| Linux | Ubuntu or another GNOME desktop on X11. It runs on Wayland too, [with limits](docs/troubleshooting.md#limitations). |
| macOS | 11 Big Sur or newer, Apple silicon or Intel ([what's different](docs/platforms.md#macos)) |
| Windows | 10 or 11, 64-bit ([what's different](docs/platforms.md#windows)) |

## Documentation

- [Install](docs/install.md): installers, building from the code, updating, uninstalling
- [Features](docs/features.md): everything the island does
- [Your second brain](docs/brain.md): the shared memory for your AI tools
- [The buddy](docs/buddy.md): ask about your screen, out loud, and it points
- [Ubuntu, the island's way](docs/desktop.md): the command bar, the look, system actions
- [Wallpaper](docs/wallpaper.md): photos, videos and animations as your background
- [macOS and Windows](docs/platforms.md): what's different there
- [Set it up](docs/setup.md): Claude Code, AI providers, WhatsApp, mail, Spotify, documents, drag actions, the CRM
- [Configuration, privacy and security](docs/configuration.md)
- [Troubleshooting and limitations](docs/troubleshooting.md)
- [Development](docs/development.md): running it from the code, tests, how it works, releasing
- [What's new](CHANGELOG.md)

## Contributing

Bug reports, ideas and pull requests are welcome: see
[CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities privately, as
[SECURITY.md](SECURITY.md) describes, and follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## License

[MIT](LICENSE) © 2026 Shashank Sharma. Bundled work keeps its own license:
the Inter typeface (SIL Open Font License), [thinking-orbs](https://libraries.dev/orbs)
by Jakub Antalik (MIT), the isometric kit from [Anatomy](https://github.com/wheresryan22/anatomy)
by Ryan (MIT; `mobile/src/iso/`), and the libraries in `package.json` (MIT,
Apache-2.0 and BSD). [The Agency](https://github.com/msitarzewski/agency-agents)
by AgentLand Contributors (MIT) and Anthropic's [Agent Skills](https://github.com/anthropics/skills)
(each skill under its own licence, many Apache-2.0) aren't bundled: the island
downloads them when you ask, and credits them where they appear.

Dynamic Island is an independent project, not made by or affiliated with
Apple. "Dynamic Island" names the iPhone feature that inspired it.
