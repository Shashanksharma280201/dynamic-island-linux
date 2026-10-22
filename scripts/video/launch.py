"""Cuts the launch video from a clean tour recording (TOUR_TITLES=off): one
short clip per beat of launch.json, taken around a moment the recorder marked
(marks.json), with its own narration and captions, between a title card and an
end card (cards.cjs). Makes a 16:9 and a square (1:1) version.

    python3 scripts/video/launch.py CLEAN_DIR OUT_DIR

CLEAN_DIR holds screen.mkv and marks.json from the clean recording, and voice/
(see narrate.py). OUT_DIR must already hold cards/ from cards.cjs; it gets
tts/, the clips, and dynamic-island-launch.mp4 and
dynamic-island-launch-square.mp4. Needs ffmpeg (FFMPEG=path) with libass.
"""
import json
import os
import re
import subprocess
import sys

import soundfile as sf
from kokoro_onnx import Kokoro

clean, out = sys.argv[1], sys.argv[2]
ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
here = os.path.dirname(os.path.abspath(__file__))
beats = json.load(open(os.path.join(here, "launch.json")))
marks = {}
for m in json.load(open(os.path.join(clean, "marks.json"))):
    marks.setdefault(m["name"], m["t"])  # the first time it happened
FADE = 0.35  # crossfade between beats
LEAD = 0.25  # narration starts this long into its beat
SCALE = 2  # the recording is the 1280 x 720 desktop at 2x


def run(args):
    subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error", *args], check=True)


# ---- narration ----
os.makedirs(os.path.join(out, "tts"), exist_ok=True)
k = Kokoro(os.path.join(clean, "voice", "kokoro-v1.0.onnx"), os.path.join(clean, "voice", "voices-v1.0.bin"))
for b in beats:
    audio, rate = k.create(b["say"], voice="af_heart", speed=1.05, lang="en-us")
    sf.write(os.path.join(out, "tts", f"{b['id']}.wav"), audio, rate)
    b["dur"] = len(audio) / rate
    # How long the beat stays on screen: its narration, a breath, or longer if it asks.
    b["len"] = max(b["dur"] + (1.4 if "card" in b else 1.5), b.get("min", 0), 3.2 if "card" in b else 0)

# ---- one clip per beat, wide and square ----
clips = os.path.join(out, "clips")
os.makedirs(clips, exist_ok=True)
cards = os.path.join(out, "cards")
enc = ["-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-an"]
for i, b in enumerate(beats):
    n = f"{i:02d}-{b['id']}"
    L = f"{b['len']:.2f}"
    if "card" in b:
        for shape, size in (("wide", "1920:1080"), ("square", "1080:1080")):
            # A slow push-in, so the card isn't a frozen frame.
            frames = int(b["len"] * 30)
            run(["-loop", "1", "-framerate", "30", "-t", L, "-i", os.path.join(cards, f"{b['id']}-{shape}.png"),
                 "-vf", f"scale={size},zoompan=z='1+0.04*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s={size.replace(':', 'x')}:fps=30",
                 "-t", L, *enc, os.path.join(clips, f"{n}-{shape}.mp4")])
        continue
    if b["mark"] not in marks:
        sys.exit(f"no mark {b['mark']} in marks.json")
    start = max(0.0, marks[b["mark"]] - b.get("before", 1.0))
    # Optional zoom on the part that matters: [x, y, w, h] on the 1280 x 720 desktop.
    x, y, w, h = [v * SCALE for v in b.get("crop", [0, 0, 1280, 720])]
    crop = f"crop={w}:{h}:{x}:{y},"
    run(["-ss", f"{start:.2f}", "-t", L, "-i", os.path.join(clean, "screen.mkv"),
         "-vf", f"{crop}scale=1920:1080:flags=lanczos,setsar=1", *enc, os.path.join(clips, f"{n}-wide.mp4")])
    run(["-loop", "1", "-framerate", "30", "-t", L, "-i", os.path.join(cards, f"{b['id']}-square.png"),
         "-ss", f"{start:.2f}", "-t", L, "-i", os.path.join(clean, "screen.mkv"),
         "-filter_complex", f"[1:v]{crop}scale=1080:608:flags=lanczos,setsar=1[v];[0:v]scale=1080:1080,setsar=1[bg];[bg][v]overlay=0:236:shortest=1",
         "-t", L, *enc, os.path.join(clips, f"{n}-square.mp4")])

# ---- where each beat starts once they're joined with crossfades ----
t = 0.0
for i, b in enumerate(beats):
    b["start"] = t
    t += b["len"] - FADE
total = t + FADE


def ts(x):
    return f"{int(x // 3600)}:{int(x % 3600 // 60):02d}:{x % 60:05.2f}"


def chunks(text):
    """Caption-sized pieces: sentences, split at commas when long."""
    pieces = []
    for sent in re.split(r"(?<=[.!?:])\s+", text.strip()):
        if len(sent) <= 46:
            pieces.append(sent)
            continue
        cur = ""
        for part in re.split(r"(?<=,)\s+", sent):
            if cur and len(cur) + len(part) > 46:
                pieces.append(cur)
                cur = part
            else:
                cur = f"{cur} {part}".strip()
        if cur:
            pieces.append(cur)
    return pieces


def captions(path, w, h, size, margin):
    with open(path, "w") as f:
        f.write(
            f"[Script Info]\nScriptType: v4.00+\nPlayResX: {w}\nPlayResY: {h}\nWrapStyle: 0\n\n"
            "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
            f"Style: Cap,DejaVu Sans,{size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,3,16,0,2,60,60,{margin},1\n\n"
            "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        )
        for b in beats:
            if "card" in b:
                continue  # the card says it already
            pieces = chunks(b["say"])
            n = sum(len(p) for p in pieces)
            at = b["start"] + LEAD
            for j, p in enumerate(pieces):
                d = b["dur"] * len(p) / n
                # Each line hands over to the next exactly; the last one lingers a moment.
                end = at + d + (0.3 if j == len(pieces) - 1 else 0)
                f.write(f"Dialogue: 0,{ts(at)},{ts(end)},Cap,,0,0,0,,{p}\n")
                at += d


def join(shape, size, ass, dest):
    files = [os.path.join(clips, f"{i:02d}-{b['id']}-{shape}.mp4") for i, b in enumerate(beats)]
    args = []
    for f in files:
        args += ["-i", f]
    for b in beats:
        args += ["-i", os.path.join(out, "tts", f"{b['id']}.wav")]
    chain, last = [], "[0:v]"
    for i in range(1, len(files)):
        off = beats[i]["start"]
        chain.append(f"{last}[{i}:v]xfade=transition=fade:duration={FADE}:offset={off:.2f}[x{i}]")
        last = f"[x{i}]"
    chain.append(f"{last}subtitles={ass},fade=t=in:st=0:d=0.5,fade=t=out:st={total - 0.8:.2f}:d=0.8[vid]")
    nv = len(files)
    mix = []
    for i, b in enumerate(beats):
        ms = int((b["start"] + LEAD) * 1000)
        mix.append(f"[{nv + i}:a]adelay={ms}|{ms},aresample=48000[a{i}]")
    mix.append("".join(f"[a{i}]" for i in range(len(beats))) + f"amix=inputs={len(beats)}:normalize=0,apad,atrim=0:{total:.2f}[aud]")
    run([*args, "-filter_complex", ";".join(chain + mix), "-map", "[vid]", "-map", "[aud]",
         "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30",
         "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", dest])
    print(dest)


captions(os.path.join(out, "captions-wide.ass"), 1920, 1080, 46, 60)
captions(os.path.join(out, "captions-square.ass"), 1080, 1080, 40, 70)
join("wide", "1920:1080", os.path.join(out, "captions-wide.ass"), os.path.join(out, "dynamic-island-launch.mp4"))
join("square", "1080:1080", os.path.join(out, "captions-square.ass"), os.path.join(out, "dynamic-island-launch-square.mp4"))
print(f"{total:.1f} s")
