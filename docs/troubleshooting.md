# Troubleshooting

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
| Spotify: "INVALID_CLIENT: Invalid redirect URI" | The Redirect URI in your Spotify app must be exactly `http://127.0.0.1:43117/callback` (not `localhost`). |
| Spotify: "Controlling playback needs Spotify Premium" | Spotify only allows playback control for Premium accounts. |
| Spotify: "Nothing is playing on any device" | Spotify only plays on an open Spotify app. Press play and pick a device in **Connect to a device**: open Spotify on your phone and it appears there, or choose **Play in your browser** to use the Web Player (log in once in the browser). Installing Spotify for Linux (`snap install spotify`) lets the island start it for you. |
| "Claude Code isn't installed" | The island couldn't find `claude`. Check `which claude` in a terminal and enter that path in Settings → Claude Code. |
| Claude says it isn't logged in | Run `claude` in a terminal once and log in; the island uses the same login. |
| No plan limits shown | Turn on **Show my plan limits**, then send any message in Claude Code (limits arrive with Claude's first reply). They're only available on Claude Pro / Max, not with an API key. |
| The mic does nothing / "No microphone found" | Check the input device in GNOME Settings → Sound. The first use downloads the speech model, so it needs internet once. |
| Speech is transcribed badly | Switch Settings → Claude Code → Speech recognition to **Accurate**, and speak close to the mic. |
| Ctrl+Alt+Space does nothing | Another app owns it (Settings says so). Use the mic button instead. |
| Island Drop says it can't reach your computer | Both need the same Wi-Fi (guest networks often keep devices apart), or Tailscale on both. Check **Settings → Phone Drop** says *Ready on port 8790*. A firewall may block it: `sudo ufw allow 8790/tcp` on Ubuntu; Windows asks once to allow Dynamic Island on private networks. If the computer's address changed, scan the QR again. |
| Can't type in the reply box | Your window manager refused keyboard focus for the island. Please open an issue with your desktop environment. |

## Limitations

- **Drag actions** work on Linux with X11, macOS and Windows. On Wayland apps
  can't see other apps' drags, so they're off there. On Windows the ring opens
  for drags that show Windows' drag image (File Explorer, browsers and most
  apps). **Edit** works for Word, spreadsheets and text files; editing PDFs and
  images is planned.

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
- Claude runs are tested automatically against a fake `claude` that speaks the
  same streaming protocol; voice is tested with synthesized speech.
- Voice understands English (the Whisper `.en` models).
