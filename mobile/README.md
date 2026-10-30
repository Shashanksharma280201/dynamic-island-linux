# Island Drop for Android

Your computer's Dynamic Island on your phone, and files both ways with a glow.

- **Island**: what's waiting for your answer on the computer (Claude Code
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
- **Activity**: the computer's notifications.
- **Notifications** on the phone for everything waiting, with **Allow** and
  **Deny** (or **Buy** / **Skip**) buttons right on them.

It talks plain HTTP to the island's **Phone Drop** server on your Wi-Fi (or
Tailscale), with the token from the island's pairing QR (protocol:
`shared/drop.ts` and `shared/phone.ts` in this repository).

## Install

Download `island-drop.apk` from the latest
[Island Drop (Android)](https://github.com/Shashanksharma280201/dynamic-island-linux/actions/workflows/android.yml)
run (open the run, then **Artifacts**), open it on your phone and install it
(allow "install unknown apps" once).

Then on the computer: **Settings → Phone Drop**, turn it on, **Show QR**, and
scan it from the app.

## Use it

- **Island** shows what's waiting first. Each card has the buttons the island
  has (**Allow**, **Deny**, **Always allow this** where Claude offers it; a
  trade's own **Buy** / **Skip** with its countdown; a question's choices).
  When nothing is waiting it says so. Pull down to refresh.
- **Files → Photos** lists your latest photos and videos; **Files** has what
  you add with **+**; **Received** has what your computer sent (tap to open
  or share; it's also in your gallery's **Island Drop** album when it's a
  photo or video).
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
  go, or click the tray icon, **Send a file to <your phone>…**. The phone's
  edge that faces the computer glows, the file comes out of it and drops into
  **Received**.
- **Settings**: stay connected in the background (a quiet ongoing notification
  keeps the link open so approvals and files reach you within seconds; turn
  it off and they arrive when you open the app), show the computer's own
  notifications on the phone too, unpair.

Notifications for approvals are private on the lock screen: unlock to see
what's asked and answer. Only your tap answers; the app never decides on its
own, and an approval that expires or is answered on the computer disappears.

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
| `src/ui/` | The tabs, approval cards, the lifted file and its flick (Reanimated, gesture handler), the glow, files arriving |
| `modules/share-intake` | A small native module: what other apps share, copied into the app |
| `modules/live-link` | A small native module: the foreground service that keeps the link open in the background |

The pure parts are tested from the island's test suite (`tests/dropPhone.test.ts`).

## Privacy

- Files and answers go straight between your phone and your computer;
  nothing passes through a server.
- The pairing token is kept in Android's encrypted storage. **Unpair** forgets
  it; **Forget paired phones** on the computer makes every paired phone scan
  again.
- The camera is only used to scan the pairing QR; photo access only lists
  your photos here.
- Approval notifications are hidden on the lock screen.
