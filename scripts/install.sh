#!/usr/bin/env bash
# Installs (or updates) Dynamic Island from its latest GitHub release, on Linux
# or macOS. Run it with:
#
#   curl -fsSL https://raw.githubusercontent.com/shashanksharma280201/dynamic-island-linux/main/scripts/install.sh | bash
#
# It downloads the installer for this computer, checks it against the
# release's SHA256SUMS.txt, installs it and starts it:
#   - Ubuntu, Debian and other Linux with apt: the .deb, through apt (asks for
#     your password).
#   - Other Linux: the AppImage, in ~/.local/bin, with an app menu entry.
#   - macOS (Apple silicon or Intel): the app, in /Applications.
#
# Options, as environment variables in front of `bash`:
#   DI_VERSION=v0.2.0   install that release instead of the latest
#   DI_FORMAT=appimage  on Linux, use the AppImage even where apt is available
#   DI_NO_LAUNCH=1      install only, don't start it
#
# To remove it later: open the island's menu and choose Uninstall Dynamic
# Island…, or run the app with --uninstall (see the README).
set -euo pipefail

REPO="${DI_REPO:-shashanksharma280201/dynamic-island-linux}"
# Overridable for tests (a local stand-in for GitHub).
API="${DI_API:-https://api.github.com}"
ASSETS="${DI_ASSETS:-https://raw.githubusercontent.com/$REPO/main/assets}"

say() { printf '\033[1m==>\033[0m %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
fail() {
  printf '\033[31mError:\033[0m %s\n' "$*" >&2
  exit 1
}

# Download URLs of the release's files, one per line.
release_urls() {
  local api="$API/repos/$REPO/releases/latest"
  if [ -n "${DI_VERSION:-}" ]; then api="$API/repos/$REPO/releases/tags/$DI_VERSION"; fi
  curl -fsSL -H 'Accept: application/vnd.github+json' "$api" |
    grep -o '"browser_download_url": *"[^"]*"' |
    sed 's/.*"\(http[^"]*\)"$/\1/'
}

# The first URL whose file name matches a pattern (extended regex).
pick() { printf '%s\n' "$URLS" | grep -E -e "$1" | head -n 1 || true; }

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi
}

# Download one file of the release into $TMP and check its checksum.
fetch() {
  local url="$1" name
  name="$(basename "$url")"
  say "Downloading $name"
  curl -fL --progress-bar -o "$TMP/$name" "$url"
  local sums
  sums="$(pick '/SHA256SUMS\.txt$')"
  if [ -z "$sums" ]; then
    note "This release has no SHA256SUMS.txt, so the download can't be checked."
  else
    curl -fsSL -o "$TMP/SHA256SUMS.txt" "$sums"
    local want got
    want="$(grep -E " \*?$name\$" "$TMP/SHA256SUMS.txt" | cut -d' ' -f1 || true)"
    [ -n "$want" ] || fail "$name is not listed in the release's SHA256SUMS.txt."
    got="$(sha256 "$TMP/$name")"
    [ "$want" = "$got" ] || fail "$name doesn't match its checksum (expected $want, got $got). Try again; if it keeps failing, download it from the releases page."
    note "Checksum OK."
  fi
  FILE="$TMP/$name"
}

# Run a command as root (through sudo unless we already are root).
as_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi
}

# Whether FUSE 2 (what AppImages mount themselves with) is installed.
has_fuse2() {
  if command -v ldconfig >/dev/null 2>&1 && ldconfig -p 2>/dev/null | grep -q 'libfuse\.so\.2'; then return 0; fi
  local f
  for f in /lib*/libfuse.so.2* /usr/lib*/libfuse.so.2* /lib/*/libfuse.so.2* /usr/lib/*/libfuse.so.2*; do
    [ -e "$f" ] && return 0
  done
  return 1
}

# Start the island in the background, if there's a desktop to show it on.
launch() {
  if [ -n "${DI_NO_LAUNCH:-}" ]; then return; fi
  if [ "$(id -u)" -eq 0 ]; then
    note "Not starting it as root: run it from your own account."
    return
  fi
  if [ -z "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
    note "No desktop session here: start it from the app menu when you're logged in."
    return
  fi
  say "Starting Dynamic Island"
  # --replace: a running (older) island closes and the new one takes over.
  nohup "$@" --replace </dev/null >/dev/null 2>&1 &
}

install_deb() {
  local url
  url="$(pick '-amd64\.deb$')"
  [ -n "$url" ] || fail "This release has no .deb. Try DI_FORMAT=appimage."
  fetch "$url"
  # apt reads the file as an unprivileged user: let it.
  chmod 755 "$TMP"
  chmod 644 "$FILE"
  say "Installing with apt (it may ask for your password)"
  as_root apt-get install -y "$FILE"
  launch dynamic-island-linux
  say "Done. Open Dynamic Island from the app menu, or run: dynamic-island-linux"
}

install_appimage() {
  local url data bin apps icons app exec
  url="$(pick '-x86_64\.AppImage$')"
  [ -n "$url" ] || fail "This release has no AppImage."
  fetch "$url"
  bin="${XDG_BIN_HOME:-$HOME/.local/bin}"
  data="${XDG_DATA_HOME:-$HOME/.local/share}"
  apps="$data/applications"
  icons="$data/icons/hicolor/512x512/apps"
  app="$bin/DynamicIsland.AppImage"
  say "Installing to $app"
  mkdir -p "$bin" "$apps" "$icons"
  mv -f "$FILE" "$app"
  chmod +x "$app"
  # AppImages need FUSE 2; without it they can still run by unpacking themselves.
  exec="\"$app\""
  if ! has_fuse2; then
    exec="env APPIMAGE_EXTRACT_AND_RUN=1 \"$app\""
    export APPIMAGE_EXTRACT_AND_RUN=1
    note "FUSE 2 isn't installed, so the AppImage unpacks itself each time it starts (slower)."
    note "For faster starts install it, e.g. on Fedora: sudo dnf install fuse-libs"
  fi
  # An app menu entry and its icon (Uninstall… removes them again).
  curl -fsSL -o "$icons/dynamic-island-linux.png" "$ASSETS/icon.png" || note "Couldn't download the icon; the menu entry uses a generic one."
  cat >"$apps/dynamic-island-linux.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Dynamic Island
Comment=Mac-style Dynamic Island for Linux
Exec=$exec
Icon=dynamic-island-linux
Terminal=false
Categories=Utility;
StartupWMClass=dynamic-island-linux
EOF
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$apps" >/dev/null 2>&1 || true
  launch "$app"
  say "Done. Open Dynamic Island from the app menu, or run: $app"
}

install_linux() {
  [ "$(uname -m)" = x86_64 ] || fail "Dynamic Island for Linux is built for 64-bit Intel and AMD processors (x86_64); this computer is $(uname -m)."
  if [ "${DI_FORMAT:-}" != appimage ] && command -v apt-get >/dev/null 2>&1; then
    install_deb
  else
    install_appimage
  fi
}

install_mac() {
  local arch pattern url mnt app dest
  arch="$(uname -m)"
  # A Terminal running under Rosetta reports x86_64 on Apple silicon.
  if [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || echo 0)" = 1 ]; then arch=arm64; fi
  case "$arch" in
    arm64) pattern='-arm64\.dmg$' ;;
    x86_64) pattern='-x64\.dmg$' ;;
    *) fail "Unknown Mac processor: $arch." ;;
  esac
  url="$(pick "$pattern")"
  [ -n "$url" ] || fail "This release has no installer for this Mac ($arch)."
  fetch "$url"
  mnt="$TMP/mount"
  mkdir -p "$mnt"
  hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$mnt" "$FILE" >/dev/null
  MOUNTED="$mnt"
  app="$(find "$mnt" -maxdepth 1 -name '*.app' -print | head -n 1)"
  [ -n "$app" ] || fail "The disk image has no app in it."
  dest=/Applications
  if [ ! -w "$dest" ]; then
    dest="$HOME/Applications"
    mkdir -p "$dest"
  fi
  # Close the island if it's running, so the new version replaces it cleanly.
  if pgrep -f 'Dynamic Island.app/Contents/MacOS/' >/dev/null 2>&1; then
    say "Closing the running island"
    osascript -e 'quit app "Dynamic Island"' >/dev/null 2>&1 || true
    sleep 2
    pkill -f 'Dynamic Island.app/Contents/MacOS/' 2>/dev/null || true
  fi
  say "Installing to $dest/Dynamic Island.app"
  rm -rf "$dest/Dynamic Island.app"
  ditto "$app" "$dest/Dynamic Island.app"
  hdiutil detach "$mnt" -quiet || true
  MOUNTED=""
  # Downloaded by curl, not a browser, so macOS doesn't hold it for the
  # "Open Anyway" check; make sure of it.
  xattr -dr com.apple.quarantine "$dest/Dynamic Island.app" 2>/dev/null || true
  if [ -z "${DI_NO_LAUNCH:-}" ]; then
    say "Starting Dynamic Island"
    open "$dest/Dynamic Island.app"
  fi
  say "Done. It's in $dest; its icon is in the menu bar."
}

main() {
  command -v curl >/dev/null 2>&1 || fail "curl is needed. On Ubuntu: sudo apt install curl"
  TMP="$(mktemp -d)"
  MOUNTED=""
  trap '[ -n "$MOUNTED" ] && hdiutil detach "$MOUNTED" -quiet 2>/dev/null; rm -rf "$TMP"' EXIT
  say "Looking up the ${DI_VERSION:-latest} release of Dynamic Island"
  URLS="$(release_urls)" || fail "Couldn't reach GitHub to find the release${DI_VERSION:+ $DI_VERSION}."
  [ -n "$URLS" ] || fail "The release${DI_VERSION:+ $DI_VERSION} has no files."
  case "$(uname -s)" in
    Linux) install_linux ;;
    Darwin) install_mac ;;
    *) fail "This script is for Linux and macOS. On Windows, see the README for the PowerShell command." ;;
  esac
}

# Everything runs from here, so a half-downloaded script never runs halfway.
main "$@"
