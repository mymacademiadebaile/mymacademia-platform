"""Generate reports/FUNCTIONAL_COVERAGE.md and reports/VIDEO_QA_REPORT.md
from the rendered chapters (summary.json, SRT files and ffprobe/ffmpeg checks)."""
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from produce import CHAPTERS  # noqa: E402
from studio.render import ts_clock  # noqa: E402
from tutorial_env import ROOT  # noqa: E402

REPORTS = ROOT / "reports"


def probe(path: pathlib.Path) -> dict:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def ffmpeg_filter(path: pathlib.Path, af: str | None = None, vf: str | None = None) -> str:
    cmd = ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path)]
    if af:
        cmd += ["-af", af, "-vn"]
    if vf:
        cmd += ["-vf", vf, "-an"]
    cmd += ["-f", "null", "-"]
    return subprocess.run(cmd, capture_output=True, text=True).stderr


def srt_cues(path: pathlib.Path):
    cues = []
    for block in re.split(r"\n\s*\n", path.read_text(encoding="utf-8").strip()):
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        m = re.match(r"(\d+):(\d+):(\d+),(\d+) --> (\d+):(\d+):(\d+),(\d+)", lines[1])
        g = list(map(int, m.groups()))
        a = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
        b = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
        cues.append((a, b, lines[2:]))
    return cues


def qa_chapter(cid: str) -> dict:
    mp4 = ROOT / "videos" / f"{cid}.mp4"
    summ = json.loads((ROOT / "recordings" / cid / "summary.json").read_text(encoding="utf-8"))
    info = probe(mp4)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = next((s for s in info["streams"] if s["codec_type"] == "audio"), None)
    dur = float(info["format"]["duration"])
    loud = ffmpeg_filter(mp4, af="ebur128=framelog=quiet")
    m = re.search(r"I:\s+(-?[\d.]+) LUFS", loud)
    lufs = float(m.group(1)) if m else None
    sil = ffmpeg_filter(mp4, af="silencedetect=noise=-45dB:d=7")
    silences = [float(x) for x in re.findall(r"silence_duration: ([\d.]+)", sil)]
    blk = ffmpeg_filter(mp4, vf="blackdetect=d=1.2:pix_th=0.10")
    blacks = [float(x) for x in re.findall(r"black_duration:([\d.]+)", blk)]
    cues = srt_cues(ROOT / "subtitles" / f"{cid}.srt")
    long_lines = sum(1 for _, _, ls in cues for l in ls if len(l) > 56)
    too_many = sum(1 for _, _, ls in cues if len(ls) > 2)
    fast = sum(1 for s, e, ls in cues if (e - s) > 0 and len(" ".join(ls)) / (e - s) > 21)
    overlaps = sum(1 for i in range(1, len(cues)) if cues[i][0] < cues[i - 1][1] - 0.01)
    segs = summ["segments"]
    voice_overlaps = sum(1 for i in range(1, len(segs)) if segs[i]["start"] < segs[i - 1]["start"] + segs[i - 1]["duration"] - 0.05)
    return {
        "id": cid, "title": summ["title"], "number": summ["number"], "duration": dur,
        "res": f"{v['width']}x{v['height']}", "fps": v.get("r_frame_rate"), "vcodec": v["codec_name"],
        "acodec": a["codec_name"] if a else None, "achannels": a.get("channels") if a else 0,
        "lufs": lufs, "long_silences": silences, "blacks": blacks, "cues": len(cues), "long_lines": long_lines,
        "three_lines": too_many, "fast_cues": fast, "cue_overlaps": overlaps, "voice_overlaps": voice_overlaps,
        "issues": summ.get("issues", []), "labels": summ["labels"], "segments": len(segs), "marks": summ.get("marks", []),
    }


def main() -> None:
    REPORTS.mkdir(exist_ok=True)
    index = {}
    idx_file = REPORTS / "complete_index.json"
    if idx_file.exists():
        index = {c["id"]: c["start"] for c in json.loads(idx_file.read_text(encoding="utf-8"))["chapters"]}
    rows = [qa_chapter(cid) for cid in CHAPTERS if (ROOT / "videos" / f"{cid}.mp4").exists()]
    (REPORTS / "qa_metrics.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    # ------------------------------------------------------------ coverage
    cov = ["# Cobertura funcional del videotutorial", "",
           "Matriz **Módulo → Funcionalidad → Escenario → Capítulo → Minuto → Estado**, generada a partir de las marcas reales de cada grabación (`recordings/<capítulo>/summary.json`).", "",
           "- *Minuto (capítulo)*: momento en el video individual. *Minuto (completo)*: momento en `complete_admin_tutorial.mp4`.",
           "- *Estado ✅*: la operación se ejecutó en la plataforma real durante la grabación y el script verificó el resultado en pantalla (aviso de éxito, dato o navegación esperados); si una verificación falla, la grabación se detiene y el capítulo no se publica.",
           "- El detalle de cada función (incluidas las que no pudieron demostrarse o no existen) está en `docs/tutorials/ADMIN_FUNCTIONAL_INVENTORY.md`.", "",
           "| Módulo | Funcionalidad / escenario | Capítulo | Minuto (capítulo) | Minuto (completo) | Estado |", "|---|---|---|---|---|---|"]
    for r in rows:
        base = index.get(r["id"])
        status = "✅ Ejecutado y verificado" if not r["issues"] else "⚠️ Ver incidencias"
        for a, _b, text in r["labels"]:
            full = ts_clock(base + a) if base is not None else "—"
            cov.append(f"| {r['title']} | {text} | {r['number']:02d} | {ts_clock(a)} | {full} | {status} |")
    (REPORTS / "FUNCTIONAL_COVERAGE.md").write_text("\n".join(cov) + "\n", encoding="utf-8")

    # ------------------------------------------------------------------ QA
    total = sum(r["duration"] for r in rows)
    qa = ["# Informe de control de calidad audiovisual", "",
          f"Capítulos analizados: {len(rows)} · Duración total de los capítulos: {ts_clock(total)} (mm:ss).", "",
          "Comprobaciones automáticas por archivo (ffprobe/ffmpeg) y sobre los subtítulos:", "",
          "| Cap. | Archivo | Duración | Resolución | FPS | Video | Audio | Sonoridad (LUFS) | Silencios > 7 s | Negros > 1,2 s | Subtítulos | Líneas > 56 car. | > 2 líneas | > 21 car/s | Solapes subt. | Solapes voz |",
          "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in rows:
        qa.append(f"| {r['number']:02d} | `{r['id']}.mp4` | {ts_clock(r['duration'])} | {r['res']} | {r['fps']} | {r['vcodec']} | "
                  f"{r['acodec']} {r['achannels']}ch | {r['lufs']} | {len(r['long_silences'])} | {len(r['blacks'])} | {r['cues']} | "
                  f"{r['long_lines']} | {r['three_lines']} | {r['fast_cues']} | {r['cue_overlaps']} | {r['voice_overlaps']} |")
    qa += ["", "## Criterios", "",
           "- Resolución 1920×1080, 16:9, 30 FPS, H.264 + AAC estéreo 48 kHz.",
           "- Sonoridad objetivo −16 LUFS (normalización de voz).",
           "- Silencios de más de 7 segundos y tramos negros de más de 1,2 segundos se reportan como posibles tiempos muertos o cortes (las transiciones de portada duran 0,45 s).",
           "- Subtítulos: máximo dos líneas, hasta 56 caracteres por línea y 21 caracteres por segundo; sin solapamientos.",
           "- Solapes de voz: una frase no debe empezar antes de que termine la anterior.",
           "", "## Incidencias registradas durante la grabación", ""]
    any_issue = False
    for r in rows:
        for t, text in r["issues"]:
            any_issue = True
            qa.append(f"- Cap. {r['number']:02d} [{ts_clock(t)}]: {text}")
    if not any_issue:
        qa.append("- Ninguna: todas las operaciones grabadas finalizaron con el resultado esperado.")
    manual = REPORTS / "qa_manual_review.md"
    if manual.exists():
        qa += ["", manual.read_text(encoding="utf-8")]
    (REPORTS / "VIDEO_QA_REPORT.md").write_text("\n".join(qa) + "\n", encoding="utf-8")
    print("reports written", len(rows))


if __name__ == "__main__":
    main()
