"""Produce one or more tutorial chapters end to end.

    python automation/produce.py 05_students          # record + render one chapter
    python automation/produce.py all                  # every chapter, in order
    python automation/produce.py 05_students --render-only   # reuse the last recording

Before recording chapter N the local tutorial database is restored from the
snapshot taken after chapter N-1 (if it exists), so any chapter can be
re-recorded alone with exactly the data it expects. After a successful
recording a new snapshot is stored.
"""
from __future__ import annotations

import argparse
import importlib
import json
import pathlib
import shutil
import subprocess
import sys
import traceback

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from tutorial_env import ROOT, LOCAL, WEB_URL, MONGO_URI, assert_tutorial_database  # noqa: E402
from studio import cards, render, tts  # noqa: E402
from studio.recorder import Recorder, StepFailed  # noqa: E402

CHAPTERS = [
    "00_introduction", "01_configuration", "02_teachers", "03_classes", "04_promotions",
    "05_students", "06_enrollments", "07_payments", "08_contacts", "09_attendance",
    "10_schedule", "11_reports", "12_daily_workflow", "13_additional_features",
]

VIDEOS = ROOT / "videos"
SUBS = ROOT / "subtitles"
SCRIPTS = ROOT / "scripts"
RECS = ROOT / "recordings"
BUILD = LOCAL / "build"
SNAP = LOCAL / "snapshots"
MONGO_TOOLS = pathlib.Path("C:/Program Files/MongoDB/Tools/100/bin")


def _db_name() -> str:
    return MONGO_URI.rsplit("/", 1)[1].split("?")[0]


def snapshot(name: str) -> None:
    assert_tutorial_database(MONGO_URI)
    target = SNAP / name
    if target.exists():
        shutil.rmtree(target)
    subprocess.run([str(MONGO_TOOLS / "mongodump.exe"), f"--uri={MONGO_URI}", f"--out={target}", "--quiet"], check=True)


def restore(name: str) -> bool:
    assert_tutorial_database(MONGO_URI)
    src = SNAP / name / _db_name()
    if not src.exists():
        return False
    from pymongo import MongoClient
    client = MongoClient(MONGO_URI)
    client.drop_database(_db_name())
    server_uri = "mongodb://127.0.0.1:27118/?replicaSet=rs0"
    subprocess.run([str(MONGO_TOOLS / "mongorestore.exe"), f"--uri={server_uri}", "--drop", "--quiet",
                    f"--nsInclude={_db_name()}.*", str(SNAP / name)], check=True)
    counts = {n: client[_db_name()][n].estimated_document_count() for n in ("students", "danceclasses", "charges")}
    print(f"restored {name}: {counts}")
    return True


def login(rec: Recorder) -> None:
    from tutorial_env import admin_credentials
    email, pw = admin_credentials()
    page = rec.page
    page.goto(WEB_URL + "/login")
    page.get_by_label("Email o usuario").fill(email)
    page.locator("input[autocomplete=current-password]").fill(pw)
    page.get_by_role("button", name="Ingresar").click()
    page.wait_for_url("**/admin**", timeout=30_000)
    rec.settle()


def record(chapter_id: str, mod) -> pathlib.Path:
    out = RECS / chapter_id
    src = HERE / "chapters" / f"ch{chapter_id}.py"
    tts.prefetch(tts.literal_lines(src) + mod.META["intro"] + mod.META["outro"])
    rec = Recorder(chapter_id, out, WEB_URL)
    rec.open()
    ok = False
    try:
        if getattr(mod, "LOGIN_FIRST", True):
            login(rec)
        rec.page.goto(WEB_URL + getattr(mod, "START_PATH", "/admin"))
        rec.settle(0.8)
        if hasattr(mod, "prepare"):
            mod.prepare(rec)
        rec.start_capture()
        mod.run(rec)
        ok = True
    except StepFailed as exc:
        rec.issue(f"FALLÓ: {exc}")
        raise
    except Exception as exc:
        rec.issue(f"ERROR: {exc}")
        try:
            rec.page.screenshot(path=str(out / "failure.png"))
        except Exception:
            pass
        raise
    finally:
        rec.close()
        print(f"[{chapter_id}] recording {'ok' if ok else 'FAILED'} -> {out}")
    return out


def _card_block(lines: list[str], start: float) -> tuple[list[dict], float]:
    """Sequential narration for a card; returns segments and card duration."""
    segs, t = [], start + render.CARD_GAP
    for line in lines:
        n = tts.narrate(line)
        segs.append({"start": t, "text": n.text, "audio": str(n.audio), "duration": n.duration, "words": n.words, "kind": "card"})
        t += n.duration + 0.4
    return segs, t - start + render.CARD_GAP - 0.4


def produce_render(chapter_id: str, mod) -> dict:
    meta = mod.META
    rec_dir = RECS / chapter_id
    work = BUILD / chapter_id
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)
    tl = render.apply_cuts(json.loads((rec_dir / "timeline.json").read_text(encoding="utf-8")))
    number = meta["number"]
    chap_label = f"Capítulo {number} · {meta['short']}"

    # Cards
    intro_png = cards.render_png(cards.chapter_card(f"Capítulo {number}", meta["title"], meta["subtitle"], meta["learn"]),
                                 work / "intro.png")
    outro_png = cards.render_png(cards.chapter_card("Resumen del capítulo", meta["title"], meta.get("outro_subtitle", "Lo que aprendimos"),
                                                    meta["summary"], done=True), work / "outro.png")
    intro_segs, intro_dur = _card_block(meta["intro"], 0.0)
    intro_dur = render.encode_card(intro_png, intro_dur, work / "p1_intro.mp4")
    screen_dur = render.encode_screen(rec_dir, work / "p2_screen.mp4", tl)
    outro_start = intro_dur + screen_dur
    outro_segs, outro_dur = _card_block(meta["outro"], outro_start)
    outro_dur = render.encode_card(outro_png, outro_dur, work / "p3_outro.mp4")
    total = intro_dur + screen_dur + outro_dur

    # Keep the raw screen recording (no narration) next to the timeline.
    shutil.copy(work / "p2_screen.mp4", rec_dir / "screen_raw.mp4")

    screen_segs = []
    for s in tl["segments"]:
        s = dict(s)
        s["start"] += intro_dur
        screen_segs.append(s)
    all_segs = intro_segs + screen_segs + outro_segs

    cues = []
    for s in all_segs:
        for a, b, text in render.cue_times(s["text"], s["words"], s["start"], s["duration"]):
            cues.append(render.Cue(a, b, text))
    labels = []
    lab = tl.get("labels", [])
    for i, (t, text) in enumerate(lab):
        end = lab[i + 1][0] if i + 1 < len(lab) else screen_dur
        labels.append((t + intro_dur, end + intro_dur, text))

    video = work / "video.mp4"
    render.concat_videos([work / "p1_intro.mp4", work / "p2_screen.mp4", work / "p3_outro.mp4"], video)
    audio = work / "voice.wav"
    render.mix_audio([(s["start"], s["audio"]) for s in all_segs], total, audio)
    SUBS.mkdir(exist_ok=True)
    VIDEOS.mkdir(exist_ok=True)
    srt = SUBS / f"{chapter_id}.srt"
    ass = work / f"{chapter_id}.ass"
    render.write_subtitles(cues, labels, chap_label, total, srt, ass)
    shutil.copy(ass, SUBS / f"{chapter_id}.ass")
    final = VIDEOS / f"{chapter_id}.mp4"
    render.burn_and_mux(video, audio, ass, final)

    summary = {
        "id": chapter_id, "number": number, "title": meta["title"], "short": meta["short"],
        "duration": total, "intro": intro_dur, "screen": screen_dur, "outro": outro_dur,
        "segments": [{"start": s["start"], "duration": s["duration"], "text": s["text"], "kind": s.get("kind", "screen")} for s in all_segs],
        "labels": [[a, b, t] for a, b, t in labels],
        "marks": [[t + intro_dur, n] for t, n in tl.get("marks", [])],
        "issues": tl.get("issues", []),
        "cues": len(cues),
    }
    (work / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8")
    shutil.copy(work / "summary.json", rec_dir / "summary.json")
    write_script(chapter_id, meta, summary)
    print(f"[{chapter_id}] rendered {final} ({render.ts_clock(total)})")
    return summary


def write_script(chapter_id: str, meta: dict, summary: dict) -> None:
    SCRIPTS.mkdir(exist_ok=True)
    lines = [f"# Capítulo {meta['number']} — {meta['title']}", "",
             f"_{meta['subtitle']}_", "",
             f"Duración: {render.ts_clock(summary['duration'])} · Voz: es-AR-ElenaNeural · Subtítulos: `subtitles/{chapter_id}.srt`", "",
             "## Objetivos", ""] + [f"- {b}" for b in meta["learn"]] + ["", "## Guion de locución (con tiempos del video final)", ""]
    labels = summary["labels"]
    li = 0
    for s in summary["segments"]:
        while li < len(labels) and labels[li][0] <= s["start"] + 0.01:
            lines += ["", f"### {labels[li][2]}", ""]
            li += 1
        kind = " _(portada)_" if s["kind"] == "card" else ""
        lines.append(f"- **[{render.ts_clock(s['start'])}]**{kind} {s['text']}")
    lines += ["", "## Resumen", ""] + [f"- {b}" for b in meta["summary"]]
    (SCRIPTS / f"{chapter_id}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("chapters", nargs="+")
    ap.add_argument("--render-only", action="store_true")
    ap.add_argument("--no-restore", action="store_true")
    ap.add_argument("--record-only", action="store_true")
    args = ap.parse_args()
    ids = CHAPTERS if args.chapters == ["all"] else args.chapters
    failures = []
    for cid in ids:
        mod = importlib.import_module(f"chapters.ch{cid}")
        try:
            if not args.render_only:
                idx = CHAPTERS.index(cid) if cid in CHAPTERS else -1
                if not args.no_restore and idx >= 0:
                    prev = "baseline" if idx == 0 else f"after_{CHAPTERS[idx - 1]}"
                    if restore(prev):
                        print(f"[{cid}] database restored from snapshot {prev}")
                record(cid, mod)
                snapshot(f"after_{cid}")
            if not args.record_only:
                produce_render(cid, mod)
        except Exception:
            traceback.print_exc()
            failures.append(cid)
            if not args.render_only:
                break
    if failures:
        print("FAILED:", failures)
        sys.exit(1)


if __name__ == "__main__":
    main()
