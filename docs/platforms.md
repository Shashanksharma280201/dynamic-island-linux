# macOS and Windows

The island runs on Linux, macOS and Windows. `main` is the Linux version, and
the `mac` and `windows` branches have everything on `main` plus a module for
the parts that differ on that system (`electron/platform/darwin.ts` and
`electron/platform/win32.ts`). The installers and the one-line install pick
the right one for you.

## macOS

macOS 11 Big Sur or newer, Apple silicon or Intel. To build it from the code,
see [Install on macOS](install.md#install-on-macos).

| | On macOS |
|---|---|
| Island | A floating panel along the screen edge or at the top center, below the camera; no Dock icon (it lives in the menu bar) |
| Now Playing | **Spotify** and **Apple Music**, with controls, seeking, shuffle and repeat. The first time, macOS asks to let Dynamic Island control them (Automation). Browsers and other players aren't shown yet |
| Control Center | **Volume** and **Wi-Fi**. **Bluetooth** shows if [`blueutil`](https://github.com/toy/blueutil) is installed, **brightness** if [`brightness`](https://github.com/nriley/brightness) is (`brew install blueutil brightness`) |
| Other apps' notifications | Not available: macOS doesn't let apps read other apps' notifications |
| Drag actions | Not yet |
| Frosted glass | Not yet (Glass and Solid looks both work) |
| Shortcuts | **⌘I** opens the panel, **⌃⌥Space** talks to the assistant |
| Everything else | The same as on Linux: the assistant (any AI), characters, Documents, CRM, Notes, WhatsApp, Mail, Spotify, voice, Claude Code |

## Windows

Windows 10 or 11, 64-bit. To build it from the code, see
[Install on Windows](install.md#install-on-windows).

| | On Windows |
|---|---|
| Island | A floating bar along the screen edge or at the top center, always on top; it starts with Windows if you turn that on in Settings |
| Now Playing | Any app in Windows' media overlay: **Spotify**, browsers (YouTube and others), Media Player and more, with cover art, controls, seeking, shuffle and repeat where the app allows it |
| Control Center | **Volume** and mute, **Wi-Fi** and **Bluetooth** on and off, and **brightness** on laptop screens (external monitors don't let Windows set it) |
| Other apps' notifications | Not available yet: Windows only lets packaged Store apps read them |
| Drag actions | Not yet |
| Frosted glass | Not yet (Glass and Solid looks both work) |
| Shortcuts | **Ctrl+I** opens the panel, **Ctrl+Alt+Space** talks to the assistant |
| Claude Code | The hook talks to the island over a named pipe; `npm run hook:install` sets it up as on Linux |
| Everything else | The same as on Linux: the assistant (any AI), characters, Documents, CRM, Notes, WhatsApp, Mail, Spotify, voice |

Media and system controls use a small PowerShell helper that ships with the
app (nothing to install).
