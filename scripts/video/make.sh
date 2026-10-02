#!/bin/sh
# Makes the narrated tour video: voice, screen recording, then captions and audio.
#   scripts/video/make.sh [VIDEO_DIR]   (default: video-out), result: VIDEO_DIR/dynamic-island-tour.mp4
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
