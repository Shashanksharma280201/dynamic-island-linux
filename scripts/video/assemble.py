"""Puts the tour together: the screen recording from tour.cjs, each scene's
narration at the moment the scene starts, and captions burned in.

    python3 scripts/video/assemble.py VIDEO_DIR OUT.mp4

VIDEO_DIR holds scenes.json (with each narration's length), timeline.json,
screen.mkv and tts/<scene>.wav. Needs ffmpeg (FFMPEG=path) built with libass.
"""
import json
import os
import re
import subprocess
import sys

d, out = sys.argv[1], sys.argv[2]
ffmpeg = os.environ.get("FFMPEG", "ffmpeg")
scenes = {s["id"]: s for s in json.load(open(os.path.join(d, "scenes.json")))}
timeline = json.load(open(os.path.join(d, "timeline.json")))
LEAD = 0.6  # narration starts this long after its scene


def ts(t):
    h, m = int(t // 3600), int(t % 3600 // 60)
    return f"{h}:{m:02d}:{t % 60:05.2f}"


def chunks(text):
    """Caption-sized pieces: sentences, split again at commas when long."""
    out = []
    for sent in re.split(r"(?<=[.!?])\s+", text.strip()):
        if len(sent) <= 70:
            out.append(sent)
            continue
        cur = ""
        for part in re.split(r"(?<=,)\s+", sent):
            if cur and len(cur) + len(part) > 70:
                out.append(cur)
                cur = part
            else:
                cur = f"{cur} {part}".strip()
        if cur:
            out.append(cur)
    return out


events = []
for t in timeline:
    s = scenes[t["id"]]
    pieces = chunks(s["say"])
    total = sum(len(p) for p in pieces)
    at = t["start"] + LEAD
    for p in pieces:
        dur = s["dur"] * len(p) / total
        events.append((at, at + dur, p))
        at += dur

ass = os.path.join(d, "captions.ass")
with open(ass, "w") as f:
    f.write(
        "[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\nWrapStyle: 0\n\n"
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
        "Style: Cap,DejaVu Sans,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H90000000,0,0,0,0,100,100,0,0,3,14,0,2,200,200,56,1\n\n"
        "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
    )
    for a, b, text in events:
        f.write(f"Dialogue: 0,{ts(a)},{ts(b)},Cap,,0,0,0,,{text}\n")

# Narration: each scene's audio delayed to its start, mixed into one track.
args = [ffmpeg, "-y", "-loglevel", "error", "-i", os.path.join(d, "screen.mkv")]
mix = []
for i, t in enumerate(timeline):
    args += ["-i", os.path.join(d, "tts", f"{t['id']}.wav")]
    ms = int((t["start"] + LEAD) * 1000)
    mix.append(f"[{i + 1}:a]adelay={ms}|{ms},aresample=48000[a{i}]")
length = timeline[-1]["end"] + 1.0
n = len(timeline)
filters = ";".join(mix) + ";" + "".join(f"[a{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0,apad,atrim=0:{length:.2f}[aud]"
video = f"[0:v]scale=1920:1080:flags=lanczos,subtitles={ass},fade=t=in:st=0:d=0.8,fade=t=out:st={length - 1.2:.2f}:d=1.2,trim=0:{length:.2f}[vid]"
args += [
    "-filter_complex", filters + ";" + video,
    "-map", "[vid]", "-map", "[aud]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out,
]
subprocess.run(args, check=True)
print(out)
