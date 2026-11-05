"""Build complete_admin_tutorial.mp4: course cover + visual index + every chapter.

Also writes subtitles/complete_admin_tutorial.srt (all chapters, shifted) and
embeds chapter markers so players show the index.
"""
from __future__ import annotations

import json
import pathlib
import re
import shutil
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from produce import CHAPTERS  # noqa: E402
from studio import cards, render, tts  # noqa: E402
from tutorial_env import LOCAL, ROOT  # noqa: E402

VIDEOS = ROOT / "videos"
SUBS = ROOT / "subtitles"
WORK = LOCAL / "build" / "_complete"


def duration(path: pathlib.Path) -> float:
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                                capture_output=True, text=True, check=True).stdout.strip())


def srt_shift(text: str, offset: float) -> list[tuple[float, float, str]]:
    cues = []
    for block in re.split(r"\n\s*\n", text.strip()):
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        m = re.match(r"(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)", lines[1])
        if not m:
            continue
        g = list(map(int, m.groups()))
        a = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
        b = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
        cues.append((a + offset, b + offset, "\n".join(lines[2:])))
    return cues


def main() -> None:
    if WORK.exists():
        shutil.rmtree(WORK)
    WORK.mkdir(parents=True)
    metas = []
    for cid in CHAPTERS:
        mp4 = VIDEOS / f"{cid}.mp4"
        if not mp4.exists():
            raise SystemExit(f"Missing chapter video: {mp4}")
        summ = json.loads((ROOT / "recordings" / cid / "summary.json").read_text(encoding="utf-8"))
        metas.append({"id": cid, "title": summ["title"], "number": summ["number"], "duration": duration(mp4)})

    cover_lines = [
        "Bienvenidos al curso completo de administración de la plataforma de M&M Academia.",
        f"El curso tiene {len(metas)} capítulos, ordenados desde lo más básico hasta los procesos completos. En pantalla está el índice con el minuto de inicio de cada uno.",
        "Cada capítulo también está disponible como video independiente. Empecemos.",
    ]
    segs, t = [], render.CARD_GAP
    for line in cover_lines:
        n = tts.narrate(line)
        segs.append({"start": t, "text": n.text, "audio": str(n.audio), "duration": n.duration, "words": n.words})
        t += n.duration + 0.4
    cover_dur = 4.0
    index_dur = max(8.0, t - cover_dur + render.CARD_GAP)
    intro_total = cover_dur + index_dur

    rows, offset = [], intro_total
    for m in metas:
        m["start"] = offset
        rows.append((f"{m['number']:02d}", m["title"], render.ts_clock(offset)))
        offset += m["duration"]

    cover_png = cards.render_png(cards.chapter_card("Curso completo", "Administración de la plataforma",
                                                    "Capacitación para administradores de M&M Academia de Baile.",
                                                    [f"{len(metas)} capítulos", "Datos de demostración ficticios",
                                                     "Locución y subtítulos en español", "Procesos reales de la plataforma"]),
                                 WORK / "cover.png")
    index_png = cards.render_png(cards.index_card("Índice del curso", rows), WORK / "index.png")
    render.encode_card(cover_png, cover_dur, WORK / "a_cover.mp4")
    render.encode_card(index_png, index_dur, WORK / "b_index.mp4")
    render.concat_videos([WORK / "a_cover.mp4", WORK / "b_index.mp4"], WORK / "intro_silent.mp4")
    render.mix_audio([(s["start"], s["audio"]) for s in segs], intro_total, WORK / "intro.wav")
    cues = []
    for s in segs:
        cues += [render.Cue(a, b, c) for a, b, c in render.cue_times(s["text"], s["words"], s["start"], s["duration"])]
    render.write_subtitles(cues, [(cover_dur, intro_total, "Índice del curso")], "Curso completo", intro_total,
                           WORK / "intro.srt", WORK / "intro.ass")
    render.burn_and_mux(WORK / "intro_silent.mp4", WORK / "intro.wav", WORK / "intro.ass", WORK / "intro.mp4")

    # Concatenate (identical encoding parameters -> stream copy).
    concat_list = WORK / "all.txt"
    concat_list.write_text("\n".join(f"file '{p.as_posix()}'" for p in [WORK / "intro.mp4"] + [VIDEOS / f"{m['id']}.mp4" for m in metas]),
                           encoding="utf-8")
    meta_txt = [";FFMETADATA1", "title=Curso completo de administración — M&M Academia"]
    meta_txt += ["[CHAPTER]", "TIMEBASE=1/1000", "START=0", f"END={int(intro_total * 1000)}", "title=Portada e índice"]
    for m in metas:
        meta_txt += ["[CHAPTER]", "TIMEBASE=1/1000", f"START={int(m['start'] * 1000)}",
                     f"END={int((m['start'] + m['duration']) * 1000)}", f"title={m['number']:02d}. {m['title']}"]
    (WORK / "chapters.txt").write_text("\n".join(meta_txt) + "\n", encoding="utf-8")
    out = VIDEOS / "complete_admin_tutorial.mp4"
    render.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(concat_list),
                "-i", str(WORK / "chapters.txt"), "-map_metadata", "1", "-map_chapters", "1", "-map", "0",
                "-c", "copy", "-movflags", "+faststart", str(out)])

    all_cues = srt_shift((WORK / "intro.srt").read_text(encoding="utf-8"), 0.0)
    for m in metas:
        all_cues += srt_shift((SUBS / f"{m['id']}.srt").read_text(encoding="utf-8"), m["start"])
    lines = []
    for i, (a, b, text) in enumerate(all_cues, 1):
        lines += [str(i), f"{render.ts_srt(a)} --> {render.ts_srt(b)}", text, ""]
    (SUBS / "complete_admin_tutorial.srt").write_text("\n".join(lines), encoding="utf-8")
    index = {"intro": intro_total, "chapters": metas, "total": offset}
    (ROOT / "reports" / "complete_index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"complete tutorial: {out} ({render.ts_clock(offset)})")


if __name__ == "__main__":
    main()
