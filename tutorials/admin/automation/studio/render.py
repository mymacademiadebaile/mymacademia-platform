"""Post-production: turns a recorded timeline into a finished chapter MP4.

Layout of every frame (1920x1080, 30 fps):
  * top 1920x960  -> the real application (or a title card)
  * bottom 120 px -> caption band: chapter/step label on the left and the
    Spanish subtitles in the centre, so captions never hide buttons or fields.

Outputs per chapter: <id>.mp4 (burned subtitles), <id>.srt, <id>.ass and a
JSON summary with timings used by the QA and coverage reports.
"""
from __future__ import annotations

import json
import math
import pathlib
import re
import subprocess
import unicodedata
from dataclasses import dataclass

from PIL import Image

FPS = 30
W, H = 1920, 1080
APP_H = 960
BAND = "#1a1121"
CARD_GAP = 0.9        # silence before/after narration on cards
FADE = 0.45
THREADS = __import__("os").environ.get("TUTORIAL_X264_THREADS", "0")  # 0 = auto


# ----------------------------------------------------------------- helpers
def run(cmd: list[str], **kw) -> None:
    proc = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd[:6])}...\n{proc.stderr[-3000:]}")


def ts_srt(t: float) -> str:
    t = max(0.0, t)
    h, rem = divmod(int(round(t * 1000)), 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def ts_ass(t: float) -> str:
    t = max(0.0, t)
    cs = int(round(t * 100))
    h, rem = divmod(cs, 360_000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def ts_clock(t: float) -> str:
    m, s = divmod(int(t), 60)
    return f"{m:02d}:{s:02d}"


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s.lower())
    return "".join(ch for ch in s if ch.isalnum())


# ------------------------------------------------------------- subtitles
MAX_LINE = 50
MAX_CUE = 92


def split_cues(text: str) -> list[str]:
    """Split narration into short cues at natural pauses."""
    parts = re.split(r"(?<=[.!?;:])\s+", text.strip())
    cues: list[str] = []
    for part in parts:
        while len(part) > MAX_CUE:
            window = part[:MAX_CUE]
            cut = max(window.rfind(", "), window.rfind(" y "), window.rfind(" o "), window.rfind(" que "))
            if cut < 30:
                cut = window.rfind(" ")
            cues.append(part[:cut + (1 if part[cut] == "," else 0)].strip())
            part = part[cut + 1:].strip()
        if part:
            cues.append(part)
    return cues


def wrap2(cue: str) -> list[str]:
    if len(cue) <= MAX_LINE:
        return [cue]
    words = cue.split()
    best, best_score = None, 10**9
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        score = abs(len(a) - len(b)) + (0 if a.endswith(",") else 6)
        if max(len(a), len(b)) <= MAX_LINE + 6 and score < best_score:
            best, best_score = [a, b], score
    return best or [cue]


def cue_times(text: str, words: list, start: float, duration: float) -> list[tuple[float, float, str]]:
    """Map cues onto the voice using word boundaries (letter-count alignment)."""
    cues = split_cues(text)
    total_letters = len(_norm(text)) or 1
    word_marks = []  # (cumulative letters at word start, start time, end time)
    acc = 0
    for ws, we, wt in words:
        word_marks.append((acc, ws, we))
        acc += len(_norm(wt))
    scale = (acc / total_letters) if acc else 1.0

    def time_at(letter_pos: float, end: bool = False) -> float:
        if not word_marks:
            return duration * letter_pos / total_letters
        target = letter_pos * scale
        chosen = word_marks[0]
        for mark in word_marks:
            if mark[0] <= target + 0.01:
                chosen = mark
            else:
                break
        return chosen[2] if end else chosen[1]

    out = []
    pos = 0
    for i, cue in enumerate(cues):
        n = len(_norm(cue))
        t_start = time_at(pos)
        if i + 1 < len(cues):
            t_end = time_at(pos + n)  # start of next cue
        else:
            t_end = duration
        out.append((start + t_start, start + max(t_end, t_start + 0.8), cue))
        pos += n
    # Never overlap; keep a minimum display time.
    fixed = []
    for i, (a, b, c) in enumerate(out):
        if i + 1 < len(out):
            b = min(b, out[i + 1][0] - 0.02)
        fixed.append((a, max(b, a + 0.7), c))
    return fixed


ASS_HEADER = """[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Segoe UI Semibold,40,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,5,40,40,0,1
Style: Chapter,Segoe UI,22,&H00FF92B3,&H00FF92B3,&H00000000,&H00000000,1,0,0,0,100,100,1,0,1,0,0,4,40,40,0,1
Style: Step,Segoe UI,25,&H00E5DAF0,&H00E5DAF0,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,4,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


@dataclass
class Cue:
    start: float
    end: float
    text: str


def write_subtitles(cues: list[Cue], labels: list[tuple[float, float, str]], chapter_label: str,
                    total: float, srt: pathlib.Path, ass: pathlib.Path) -> None:
    lines = []
    for i, c in enumerate(cues, 1):
        lines += [str(i), f"{ts_srt(c.start)} --> {ts_srt(c.end)}", "\n".join(wrap2(c.text)), ""]
    srt.write_text("\n".join(lines), encoding="utf-8")

    ev = []
    if chapter_label:
        ev.append(f"Dialogue: 0,{ts_ass(0)},{ts_ass(total)},Chapter,,0,0,0,,{{\\an4\\pos(46,1000)}}{chapter_label.upper()}")
    for a, b, text in labels:
        ev.append(f"Dialogue: 0,{ts_ass(a)},{ts_ass(b)},Step,,0,0,0,,{{\\an4\\pos(46,1036)\\fad(250,250)}}{text}")
    for c in cues:
        body = "\\N".join(wrap2(c.text)).replace("{", "(").replace("}", ")")
        ev.append(f"Dialogue: 1,{ts_ass(c.start)},{ts_ass(c.end)},Sub,,0,0,0,,{{\\an5\\pos(1110,1020)}}{body}")
    ass.write_text(ASS_HEADER + "\n".join(ev) + "\n", encoding="utf-8")


# --------------------------------------------------------- screen frames
def _ease(p: float) -> float:
    p = min(1.0, max(0.0, p))
    return p * p * (3 - 2 * p)


def _zoom_state(t: float, zooms: list[dict]) -> tuple[float, float, float]:
    """Return (factor, cx, cy) in frame pixels for time t."""
    for z in zooms:
        ramp = 0.7
        if z["start"] - 0.05 <= t <= z["end"] + ramp:
            if t < z["start"] + ramp:
                k = _ease((t - z["start"]) / ramp)
            elif t > z["end"]:
                k = 1 - _ease((t - z["end"]) / ramp)
            else:
                k = 1.0
            factor = z.get("factor") or max(1.2, min(1.5, 0.6 * min(1920 / max(z["w"], 1), 960 / max(z["h"], 1))))
            f = 1 + (factor - 1) * k
            cx = 960 + (z["x"] + z["w"] / 2 - 960) * k
            cy = 480 + (z["y"] + z["h"] / 2 - 480) * k
            return f, cx, cy
    return 1.0, 960.0, 480.0


def apply_cuts(tl: dict) -> dict:
    """Remove technical waits (TTS synthesis, preparation) from every time axis."""
    cuts = sorted([list(c) for c in tl.get("cuts", []) if c[1] > c[0]])
    merged: list[list[float]] = []
    for a, b in cuts:
        if merged and a <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])

    def remap(t: float) -> float:
        shift = 0.0
        for a, b in merged:
            if t > a:
                shift += min(b, t) - a
        return t - shift

    out = dict(tl)
    out["frames"] = [[remap(t), f] for t, f in tl["frames"]]
    out["segments"] = [dict(s, start=remap(s["start"])) for s in tl["segments"]]
    out["labels"] = [[remap(t), x] for t, x in tl.get("labels", [])]
    out["marks"] = [[remap(t), x] for t, x in tl.get("marks", [])]
    out["issues"] = [[remap(t), x] for t, x in tl.get("issues", [])]
    out["zooms"] = [dict(z, start=remap(z["start"]), end=remap(z["end"])) for z in tl.get("zooms", [])]
    out["end"] = remap(tl["end"])
    out["cuts"] = []
    return out


def encode_screen(rec_dir: pathlib.Path, out: pathlib.Path, tl: dict | None = None) -> float:
    """Frames (variable timing) -> constant 30 fps 1920x1080 video with band."""
    if tl is None:
        tl = apply_cuts(json.loads((rec_dir / "timeline.json").read_text(encoding="utf-8")))
    frames = tl["frames"]
    if not frames:
        raise RuntimeError(f"No frames captured in {rec_dir}")
    total = max(tl["end"], frames[-1][0] + 0.5)
    n_out = int(math.ceil(total * FPS))
    zooms = tl.get("zooms", [])
    cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
           "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-threads", THREADS, "-preset", "medium", "-crf", "15",
           "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(out)]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    band = Image.new("RGB", (W, H), BAND)
    idx, cache_key, cache_img, cache_bytes = 0, None, None, None
    fade_frames = int(FADE * FPS)
    for k in range(n_out):
        t = k / FPS
        while idx + 1 < len(frames) and frames[idx + 1][0] <= t:
            idx += 1
        name = frames[idx][1]
        z = _zoom_state(t, zooms)
        fade = 1.0
        if k < fade_frames:
            fade = k / fade_frames
        elif k > n_out - fade_frames:
            fade = (n_out - k) / fade_frames
        key = (name, round(z[0], 4), round(z[1], 1), round(z[2], 1), round(fade, 3))
        if key != cache_key:
            if cache_img is None or cache_img[0] != name:
                img = Image.open(rec_dir / "frames" / name).convert("RGB")
                if img.size != (1920, APP_H):
                    img = img.resize((1920, APP_H), Image.LANCZOS)
                cache_img = (name, img)
            src = cache_img[1]
            f, cx, cy = z
            if f > 1.001:
                vw, vh = 1920 / f, APP_H / f
                x0 = min(max(cx - vw / 2, 0), 1920 - vw)
                y0 = min(max(cy - vh / 2, 0), APP_H - vh)
                src = src.transform((1920, APP_H), Image.EXTENT, (x0, y0, x0 + vw, y0 + vh), Image.BICUBIC)
            frame = band.copy()
            frame.paste(src, (0, 0))
            if fade < 0.999:
                frame = Image.blend(Image.new("RGB", (W, H), "black"), frame, max(0.0, fade))
            cache_key, cache_bytes = key, frame.tobytes()
        proc.stdin.write(cache_bytes)
    proc.stdin.close()
    err = proc.stderr.read().decode(errors="ignore")
    if proc.wait() != 0:
        raise RuntimeError(err[-2000:])
    return n_out / FPS


def encode_card(png: pathlib.Path, duration: float, out: pathlib.Path) -> float:
    n = int(math.ceil(duration * FPS))
    duration = n / FPS
    run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-framerate", str(FPS), "-i", str(png),
         "-t", f"{duration:.3f}", "-vf",
         f"scale={W}:{H},format=yuv420p,fade=t=in:st=0:d={FADE},fade=t=out:st={duration - FADE:.3f}:d={FADE}",
         "-c:v", "libx264", "-threads", THREADS, "-preset", "medium", "-crf", "15", "-r", str(FPS), "-pix_fmt", "yuv420p", str(out)])
    return duration


def mix_audio(clips: list[tuple[float, str]], total: float, out: pathlib.Path) -> None:
    """Place narration clips at absolute times and normalise loudness."""
    if not clips:
        run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
             "-t", f"{total:.3f}", "-c:a", "pcm_s16le", str(out)])
        return
    # Concatenate with explicit silence gaps (cheaper and exact compared to many-input amix).
    lst = out.with_suffix(".txt")
    silence_dir = out.parent / "silence"
    silence_dir.mkdir(exist_ok=True)
    entries = []
    cursor = 0.0
    for i, (t, path) in enumerate(sorted(clips)):
        gap = t - cursor
        if gap > 0.001:
            sil = silence_dir / f"s{i:04d}.wav"
            run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono",
                 "-t", f"{gap:.3f}", "-c:a", "pcm_s16le", str(sil)])
            entries.append(sil)
        wav = silence_dir / f"c{i:04d}.wav"
        run(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", str(wav)])
        dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                                    str(wav)], capture_output=True, text=True).stdout.strip())
        entries.append(wav)
        cursor = t + dur
    lst.write_text("\n".join(f"file '{p.as_posix()}'" for p in entries), encoding="utf-8")
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
         "-af", f"apad,atrim=0:{total:.3f},loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000",
         "-ac", "2", "-c:a", "pcm_s16le", str(out)])


def burn_and_mux(video: pathlib.Path, audio: pathlib.Path, ass: pathlib.Path, out: pathlib.Path) -> None:
    ass_arg = ass.as_posix().replace(":", "\\:")
    run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(video), "-i", str(audio),
         "-vf", f"ass='{ass_arg}'", "-c:v", "libx264", "-threads", THREADS, "-preset", "medium", "-crf", "19",
         "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-b:a", "192k",
         "-movflags", "+faststart", "-shortest", str(out)])


def concat_videos(parts: list[pathlib.Path], out: pathlib.Path) -> None:
    lst = out.with_suffix(".parts.txt")
    lst.write_text("\n".join(f"file '{p.as_posix()}'" for p in parts), encoding="utf-8")
    run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(out)])
