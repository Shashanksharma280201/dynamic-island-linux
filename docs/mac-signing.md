# Signing the Mac app with an Apple Developer ID

Until the Mac app is signed with an Apple **Developer ID** and notarized by
Apple, macOS won't open it from a browser download: it says the app "is
damaged and can't be opened". That's why the releases come with a `.pkg`
(one **Open Anyway** for the package) and why the one-line install command is
the easiest way on a Mac.

Once the five secrets below are set, the
[Release workflow](../.github/workflows/release.yml) signs the app with your
certificate, sends it to Apple to notarize, and checks that Gatekeeper accepts
it. Then the `.dmg` opens like any app from the internet, and the release no
longer needs the `.pkg`. Nothing else changes: the one-line install keeps
working, and the install test checks a browser download on three Macs.

You don't need Xcode for any of this, though it's the quickest way to make the
certificate (step 2).

## 1. Join the Apple Developer Program

At [developer.apple.com/programs](https://developer.apple.com/programs/),
enroll as an individual (or as your company). It costs $99 a year. Apple
checks your details; it can take a day or two.

## 2. Make a Developer ID Application certificate

Only the account holder can make one. Either:

- **With Xcode:** open **Xcode → Settings → Accounts**, add your Apple ID,
  select your team and click **Manage Certificates…**, then **+** and
  **Developer ID Application**.
- **Without Xcode:** open **Keychain Access → Certificate Assistant → Request a
  Certificate From a Certificate Authority…**, enter your email, choose
  **Saved to disk**. Then at
  [developer.apple.com/account/resources/certificates](https://developer.apple.com/account/resources/certificates/list)
  click **+**, pick **Developer ID Application**, upload that request, download
  the certificate and double-click it.

## 3. Export it

In **Keychain Access**, open **login → My Certificates**, right-click
**Developer ID Application: Your Name (TEAMID)**, choose **Export…**, save it
as a `.p12` file and give it a password.

## 4. An app-specific password and your Team ID

- At [account.apple.com](https://account.apple.com), under **Sign-In and
  Security → App-Specific Passwords**, make one (call it "notarize"). Apple
  uses it to let the release workflow send the app for notarization.
- Your **Team ID** (10 letters and digits) is under **Membership details** at
  [developer.apple.com/account](https://developer.apple.com/account), and in
  the certificate's name.

## 5. Add the secrets

In the repository on GitHub: **Settings → Secrets and variables → Actions →
New repository secret**, add:

| Name | Value |
|---|---|
| `MAC_CERT_P12` | The `.p12` file as text: run `base64 -i DeveloperID.p12 \| pbcopy` and paste |
| `MAC_CERT_PASSWORD` | The password you gave the `.p12` |
| `APPLE_ID` | Your Apple ID's email |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password from step 4 |
| `APPLE_TEAM_ID` | Your Team ID |

Then delete the `.p12` file you exported (the certificate stays in your
Keychain).

## 6. Release

Run the Release workflow as usual. The Mac build log says "Signing with team
… Developer ID certificate, then notarizing", and fails, rather than
publishing, if Gatekeeper wouldn't accept the result. Notarizing usually takes
a few minutes.

The first time the signed version opens Settings (or reads a saved key),
macOS may ask once: "Dynamic Island wants to use your confidential information
stored in dynamic-island-linux Safe Storage". That's the key the island
encrypts your passwords and API keys with, saved by the earlier, differently
signed version. Enter your Mac password and click **Always Allow**. Unsigned
builds can ask this after an update too; with a Developer ID it stays allowed
across updates.

What the signed app may do is in
[assets/entitlements.mac.plist](https://github.com/shashanksharma280201/dynamic-island-linux/blob/mac/assets/entitlements.mac.plist)
on the `mac` branch: the microphone (talking to the assistant, dictation) and
Apple Events (Now Playing from Spotify and Music). The `mac` branch's CI runs
the app with those settings on every push.
