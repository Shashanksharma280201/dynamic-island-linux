"""Speaks each scene's narration (scenes.json) with the Kokoro voice model and
writes VIDEO_DIR/tts/<scene>.wav, plus VIDEO_DIR/scenes.json with each length.

    pip install kokoro-onnx soundfile
    python3 scripts/video/narrate.py VIDEO_DIR

Needs kokoro-v1.0.onnx and voices-v1.0.bin (github.com/thewh1teagle/kokoro-onnx
releases) in VIDEO_DIR/voice/.
"""
import json
import os
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

d = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
scenes = json.load(open(os.path.join(here, "scenes.json")))
k = Kokoro(os.path.join(d, "voice", "kokoro-v1.0.onnx"), os.path.join(d, "voice", "voices-v1.0.bin"))
os.makedirs(os.path.join(d, "tts"), exist_ok=True)
for s in scenes:
    audio, rate = k.create(s["say"], voice="af_heart", speed=1.0, lang="en-us")
    sf.write(os.path.join(d, "tts", f"{s['id']}.wav"), audio, rate)
    s["dur"] = round(len(audio) / rate, 2)
json.dump(scenes, open(os.path.join(d, "scenes.json"), "w"), indent=1)
print(f"{sum(s['dur'] for s in scenes):.0f} s of narration")
