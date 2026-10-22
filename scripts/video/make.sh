#!/bin/sh
# Makes the narrated tour video, then the short launch video cut from a clean
# recording (no chapter titles) in 16:9 and square.
#   scripts/video/make.sh [VIDEO_DIR]   (default: video-out)
# Results: VIDEO_DIR/dynamic-island-tour.mp4, VIDEO_DIR/launch/dynamic-island-launch.mp4,
# VIDEO_DIR/launch/dynamic-island-launch-square.mp4 and VIDEO_DIR/launch/cards/social.png.
# Needs: python3 with kokoro-onnx, soundfile (and the voice files, see narrate.py),
# ffmpeg with libass (or FFMPEG=path), xvfb-run, dbus-run-session and xcompmgr.
set -e
cd "$(dirname "$0")/../.."
DIR=$(realpath "${1:-video-out}")
mkdir -p "$DIR"
npm run build
python3 scripts/video/narrate.py "$DIR"
VIDEO_DIR="$DIR" xvfb-run -a -s "-screen 0 2560x1440x24" dbus-run-session -- node scripts/video/tour.cjs
python3 scripts/video/assemble.py "$DIR" "$DIR/dynamic-island-tour.mp4"

mkdir -p "$DIR/clean" "$DIR/launch"
cp "$DIR/scenes.json" "$DIR/clean/"
ln -sfn "$DIR/voice" "$DIR/clean/voice"
TOUR_TITLES=off VIDEO_DIR="$DIR/clean" xvfb-run -a -s "-screen 0 2560x1440x24" dbus-run-session -- node scripts/video/tour.cjs
xvfb-run -a -s "-screen 0 1920x1080x24" node_modules/electron/dist/electron scripts/video/cards.cjs "$DIR/launch" --no-sandbox
python3 scripts/video/launch.py "$DIR/clean" "$DIR/launch"
