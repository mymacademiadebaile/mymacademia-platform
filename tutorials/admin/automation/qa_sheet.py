"""Contact sheets for visual QA: one frame near the end of every narrated line.

    python automation/qa_sheet.py 03_classes [out_dir]
"""
import json
import pathlib
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
cid = sys.argv[1]
out_dir = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / ".local" / "qa"
out_dir.mkdir(parents=True, exist_ok=True)
summary = json.loads((ROOT / "recordings" / cid / "summary.json").read_text(encoding="utf-8"))
video = ROOT / "videos" / f"{cid}.mp4"
tw, th, cols = 640, 360, 3
font = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 15)
thumbs = []
for i, s in enumerate(summary["segments"]):
    t = s["start"] + max(0.4, s["duration"] * 0.8)
    png = out_dir / f"_{cid}_{i:03d}.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1",
                    "-vf", f"scale={tw}:{th}", str(png)], check=True)
    thumbs.append((png, f"{i} [{int(t // 60):02d}:{int(t % 60):02d}] {s['text'][:95]}"))
per = 12
for sheet in range(0, len(thumbs), per):
    chunk = thumbs[sheet:sheet + per]
    rows = (len(chunk) + cols - 1) // cols
    img = Image.new("RGB", (cols * tw, rows * (th + 40)), "white")
    d = ImageDraw.Draw(img)
    for k, (png, cap) in enumerate(chunk):
        x, y = (k % cols) * tw, (k // cols) * (th + 40)
        img.paste(Image.open(png), (x, y))
        d.text((x + 4, y + th + 2), cap[:80], fill="black", font=font)
        d.text((x + 4, y + th + 20), cap[80:160], fill="black", font=font)
        png.unlink()
    path = out_dir / f"{cid}_sheet{sheet // per + 1}.jpg"
    img.save(path, quality=80)
    print(path)
print("issues:", summary.get("issues"))
