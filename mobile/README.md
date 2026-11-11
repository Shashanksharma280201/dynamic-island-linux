# Island Drop for Android

Your computer's Dynamic Island on your phone, and files both ways with a glow.

- **Island**: first, **the island's orb**, as on your computer: the same
  dotted motion, in its colour (or the one you picked), with the mood's ring,
  its name and what it's doing ("2 waiting for you", "At work" and the
  project, "Offline"), and **Hold to talk to** it. Then what's waiting for your answer on the computer (Claude Code
  wanting to run a command or edit a file, its questions and plans, the island
  assistant about to act for you, a trade from your trading engine), with the
  same buttons as the island. Answer here or on the computer, whichever is
  nearer: the other one updates at once. Also what's playing (with controls),
  today's P&L and your Claude Code sessions.
- **Files**: flick photos and files to your computer. Hold one, move it toward
  the side of the phone that faces the computer and let go: it comes out of a
  glow at the edge of the computer's screen and lands in the island. Files the
  computer sends come out of the glow on the phone's side and land here, in
  **Received**.
- **Claude**: talk to Claude Code on your computer, as in the island's Claude
  tab: type, watch what it's doing step by step, read the reply, stop it,
  start over, and see your plan's limits.
- **Inbox**: your computer's WhatsApp chats and mail, to read and answer, and
  its notifications (clear one or all, Do Not Disturb).
- **More**: **Trading** (P&L, trades to answer, positions, today's trades,
  Stop trading / Close everything), **Notes** (read, write, edit; **To my brain** sends one to your second brain's inbox, once you allow it in the island's Settings), **Music**
  (what's playing, Spotify search, playlists, where it plays), **Controls**
  (volume, brightness, mute, Wi-Fi, Bluetooth, Do Not Disturb), **CRM**
  (follow-ups, people, log a call, deals), **Documents** (convert, merge PDFs,
  page numbers, send to the phone), **Services** (GitHub, Vercel, Stripe…) and
  this app's **Settings**.
- **Notifications** on the phone for everything waiting, with **Allow** and
  **Deny** (or **Buy** / **Skip**) buttons right on them.
- **Light and dark**: **More → Settings → Appearance**: System (follows the
  phone), Light or Dark.

On the island screen, **Hold to talk to your buddy** makes the phone the
buddy's microphone: it records only while you hold, your computer makes it
out, and the buddy answers out loud there.

## Staying connected

- The app reconnects by itself the moment the phone's Wi-Fi changes or comes
  back.
- If the computer's address changes (routers hand them out again), the app
  first tries every address it knows for it, then looks for it across this
  Wi-Fi, and keeps the new address. Each time it connects, the computer tells
  it all the addresses it has now (Wi-Fi, Tailscale), so it can follow it
  from one to the other.
- **More → Settings** starts with **Fig. 1, the link**: an isometric drawing
  of your computer and phone on one bench, joined by a glass tube. A capsule
  runs along it while files go (toward the computer when you send, toward
  the phone when it sends), the lamp is green when they can reach each other
  (amber while looking, red when they can't), and the gauge reads the round
  trip in milliseconds. Tap it to test the link.
- **More → Settings → Connection** shows the route (Wi-Fi or Tailscale), the
  address, the last round trip, **Test the connection** and **Find my
  computer again**.

The link drawing is built with the isometric kit from
[Anatomy](https://github.com/wheresryan22/anatomy) by Ryan (MIT), ported to
react-native-svg in `src/iso/`.

Everything runs on the computer itself, through the island's own functions:
a note you write is saved there, a message you send goes from its WhatsApp,
Claude runs there. Whatever changes (Claude's reply, new mail, the trading
view) reaches the phone as it happens.

It talks plain HTTP to the island's **Phone Drop** server on your Wi-Fi (or
Tailscale), with the token from the island's pairing QR (protocol:
`shared/drop.ts` and `shared/phone.ts` in this repository).

## Install

Download `island-drop.apk` from the
[latest release](https://github.com/Shashanksharma280201/dynamic-island-linux/releases/latest)
(its checksum is in `SHA256SUMS.txt` there), open it on your phone and
install it (allow "install unknown apps" once). The newest build of the
code is also on the latest
[Island Drop (Android)](https://github.com/Shashanksharma280201/dynamic-island-linux/actions/workflows/android.yml)
run (open the run, then **Artifacts**).

Then on the computer: **Settings → Phone Drop**, turn it on, **Show QR**, and
scan it from the app.

## Use it

- **Island** shows what's waiting first. Each card has the buttons the island
  has (**Allow**, **Deny**, **Always allow this** where Claude offers it; a
  trade's own **Buy** / **Skip** with its countdown; a question's choices).
  When nothing is waiting it says so. Pull down to refresh.
- **Files → Photos** lists your latest photos and videos; **Files** has what
  you add with **+** (files of any kind, or **A folder**, sent with
  everything in it); **Received** has what your computer sent (tap to open
  or share; it's also in your gallery's **Island Drop** album when it's a
  photo or video; a folder opens to list its files).
- Up to 500 files go at once either way, hidden files (`.env`) too. A folder
  arrives as the same folder, its folders inside it kept, renamed "Name (2)"
  if one by that name is already there.
- **Hold** a file until it lifts, then move it toward the edge that faces your
  computer (phone on the right of the screen: toward the left edge). That edge
  of the computer lights up. Let go near the edge, or flick, and it's sent.
  Let go anywhere else and it goes back. **Tap** a file, then **Send**, to send
  it without the gesture.
- **Share** from any app (Gallery, Files, a browser, WhatsApp): pick **Island Drop**
  in the share sheet and what you shared opens already lifted, ready to flick.
  A link or text arrives on the computer as a `.txt` file.
- **From the computer**: drag a file to the edge of the computer's screen
  where the phone is (it lights up and says **Send to <your phone>**) and let
  go, or click the tray icon, **Send a file to <your phone>…** (or **Send a
  folder…**). The phone's edge that faces the computer glows, the file comes
  out of it and drops into **Received**. Many files (a folder) come out as
  one card that counts them in.
- **More → Settings**: stay connected in the background (a quiet ongoing notification
  keeps the link open so approvals and files reach you within seconds; turn
  it off and they arrive when you open the app), show the computer's own
  notifications on the phone too, unpair.

Notifications for approvals are private on the lock screen: unlock to see
what's asked and answer. Only your tap answers; the app never decides on its
own, and an approval that expires or is answered on the computer disappears.

## Widgets and the lock screen

- **Island** (4 by 1): the orb in its colour, with its mood's ring, what it's
  doing ("2 waiting for you", "At work" and the project) and which computer.
- **Island · Dots** (2 by 2, any size): the same in black and white dot
  matrix, in the style of Nothing phones: the orb as a grid of dots lit from
  the top left, what it's doing in dot letters, and a red dot when something
  needs you. It looks at home on any phone, and fits a Nothing lock screen.
- Add them from **More → Settings → Widgets**, or press and hold an empty spot
  on the home screen, **Widgets**, **Island Drop**. On Nothing OS 3 and later,
  press and hold the lock screen, **Customise**, to put Island · Dots there.
  Tapping either opens the app.
- **On any lock screen**: with **Stay connected** on, the quiet ongoing
  notification is the island in one line ("Orbit · 2 waiting for you"), with
  no project names. On Android 16 it's a Live Update, with a chip in the
  status bar counting what waits.
- **Glyph lights** (Nothing phones): press and hold an approval's
  notification and turn on **Essential** to keep a Glyph light on until you
  answer. Settings shows how on a Nothing phone.

The widgets change when the island does while the app is connected (with
Stay connected, in the background too); offline, they say so, faded.

## Build it yourself

Push a change under `mobile/` and GitHub Actions builds the APK. Or with
Node 22:

```bash
cd mobile
npm install
npx tsc --noEmit                 # typecheck
npx eas-cli@latest build -p android --profile preview   # Expo's cloud build (free account)
```

With Android Studio (or the Android SDK and JDK 17) installed you can build
locally instead: `npx expo prebuild --platform android` then
`cd android && ./gradlew assembleRelease`.

## What's where

| Part | What it does |
| --- | --- |
| `src/protocol.ts` | The pairing link and the island's answers (pure) |
| `src/islandTypes.ts` | What the island sends (a copy of `shared/phone.ts`; a test keeps them the same) |
| `src/gesture.ts` | Which edge a dragged file is heading for, and when letting go sends it (pure, runs on the UI thread too) |
| `src/link.ts` | Finds the computer, the live link (server-sent events), answers, media controls, uploads and downloads with progress |
| `src/notify.ts` | Notification channels, one notification per approval with its buttons, the computer's notifications |
| `src/files.ts`, `src/received.ts` | Recent photos, the files you add, what the computer sent |
| `src/ui/` | The tabs (Island, Claude, Files, Inbox, More) and their screens, approval cards, the lifted file and its flick (Reanimated, gesture handler), the glow, files arriving |
| `src/ui/kit.tsx` | What every screen is made of: `useCall` (an island function, kept live by its pushes), the page, cards, rows, the segmented control, the composer, the slider |
| `modules/share-intake` | A small native module: what other apps share, copied into the app |
| `modules/live-link` | A small native module: the foreground service that keeps the link open in the background, and its one line on the lock screen |
| `modules/island-widget` | A small native module: the home and lock screen widgets (Island, Island · Dots), drawn from what the app last saw |
| `src/summary.ts` | The island in a few words, for the Island tab, the widgets and the lock screen (pure) |

The pure parts are tested from the island's test suite (`tests/dropPhone.test.ts`).

## Privacy

- Files and answers go straight between your phone and your computer;
  nothing passes through a server.
- The pairing token is kept in Android's encrypted storage. **Unpair** forgets
  it; **Forget paired phones** on the computer makes every paired phone scan
  again.
- The camera is only used to scan the pairing QR; photo access only lists
  your photos here.
- Approval notifications are hidden on the lock screen. The ongoing
  notification shows only what the island is doing there, with no project
  names; the widgets show the project when it's at work, so leave them off
  the lock screen if that's private.
