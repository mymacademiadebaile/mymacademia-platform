"""Narration synthesis with Microsoft Edge neural voices (es-AR).

Each narration line is synthesised once and cached by a hash of
(voice, rate, text). Word boundaries are kept so subtitles can be split into
short, readable cues that follow the voice exactly.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import pathlib
import subprocess
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

import edge_tts

VOICE = "es-AR-ElenaNeural"
RATE = "-3%"
PITCH = "+0Hz"

CACHE = pathlib.Path(__file__).resolve().parents[2] / ".local" / "tts-cache"
CACHE.mkdir(parents=True, exist_ok=True)


@dataclass
class Narration:
    text: str
    audio: pathlib.Path  # mp3
    duration: float      # seconds
    words: list[tuple[float, float, str]]  # (start, end, word) in seconds


def _probe_duration(path: pathlib.Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return float(out)


async def _synth(text: str, mp3: pathlib.Path, meta: pathlib.Path) -> None:
    communicate = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH, boundary="WordBoundary")
    words: list[tuple[float, float, str]] = []
    with mp3.open("wb") as fh:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                fh.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                start = chunk["offset"] / 10_000_000
                end = start + chunk["duration"] / 10_000_000
                words.append((start, end, chunk["text"]))
    meta.write_text(json.dumps({"text": text, "words": words}, ensure_ascii=False), encoding="utf-8")


def narrate(text: str) -> Narration:
    text = " ".join(text.split())
    key = hashlib.sha1(f"{VOICE}|{RATE}|{PITCH}|{text}".encode("utf-8")).hexdigest()[:16]
    mp3 = CACHE / f"{key}.mp3"
    meta = CACHE / f"{key}.json"
    if not (mp3.exists() and meta.exists() and mp3.stat().st_size > 0):
        for attempt in range(4):
            try:
                # Run in a worker thread: Playwright's sync API owns this thread's event loop.
                with ThreadPoolExecutor(max_workers=1) as pool:
                    pool.submit(asyncio.run, _synth(text, mp3, meta)).result()
                break
            except Exception:  # transient network errors from the TTS service
                if attempt == 3:
                    raise
    data = json.loads(meta.read_text(encoding="utf-8"))
    return Narration(text=text, audio=mp3, duration=_probe_duration(mp3),
                     words=[tuple(w) for w in data["words"]])


def literal_lines(source_file: pathlib.Path) -> list[str]:
    """String literals passed to rec.say()/rec.narrate() and META narration in a chapter file."""
    import ast
    tree = ast.parse(source_file.read_text(encoding="utf-8"))
    found: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "attr", None) in {"say", "narrate"}:
            if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
                found.append(node.args[0].value)
    return found


def prefetch(lines: list[str]) -> None:
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(narrate, lines))
