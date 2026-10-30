# Island Drop for Android

Flick photos and files from your phone to your computer's Dynamic Island.
Hold a file, move it toward the side of the phone that faces the computer,
and let go: it comes out of a glow at the edge of the computer's screen and
lands in the island.

The app only sends. It talks plain HTTP to the island's **Phone Drop** server
on your Wi-Fi (or Tailscale), with the token from the island's pairing QR
(protocol: `shared/drop.ts` in this repository).

## Install

Download `island-drop.apk` from the latest
[Island Drop (Android)](https://github.com/Shashanksharma280201/dynamic-island-linux/actions/workflows/android.yml)
run (open the run, then **Artifacts**), open it on your phone and install it
(allow "install unknown apps" once).

Then on the computer: **Settings → Phone Drop**, turn it on, **Show QR**, and
scan it from the app.

## Use it

- **Photos** lists your latest photos and videos; **Files** has what you add
  with **+** (PDFs, zips, anything; the app keeps a copy until you remove it).
- **Hold** a file until it lifts, then move it toward the edge that faces your
  computer (phone on the right of the screen: toward the left edge). That edge
  of the computer lights up. Let go near the edge, or flick, and it's sent.
  Let go anywhere else and it goes back.
- **Tap** a file, then **Send** to send it without the gesture.

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
| `src/gesture.ts` | Which edge a dragged file is heading for, and when letting go sends it (pure) |
| `src/link.ts` | Finds the computer at its addresses, the nudges while you drag, the upload with progress |
| `src/files.ts` | Recent photos and videos, the files you add, thumbnails for the computer's glow |
| `src/ui/` | Pairing (QR or link), the grid, the lifted file, the glow and the white wash |

The pure parts are tested from the island's test suite (`tests/dropPhone.test.ts`).

## Privacy

- Files go straight to your computer; nothing passes through a server.
- The pairing token is kept in Android's encrypted storage. **Unpair** forgets
  it; **Forget paired phones** on the computer makes every paired phone scan
  again.
- The camera is only used to scan the pairing QR; photo access only lists
  your photos here.
