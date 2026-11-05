"""Render chapters as soon as their recording (and DB snapshot) is finished."""
import os
import pathlib
import subprocess
import sys
import time

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent
ids = sys.argv[1:]
env = dict(os.environ, TUTORIAL_X264_THREADS="6", PYTHONUNBUFFERED="1")
for cid in ids:
    done = ROOT / ".local" / "snapshots" / f"after_{cid}"
    while not done.exists():
        time.sleep(10)
    time.sleep(5)
    print(f"rendering {cid}", flush=True)
    r = subprocess.run([sys.executable, str(HERE / "produce.py"), cid, "--render-only"], env=env,
                       capture_output=True, text=True)
    print(r.stdout[-800:], r.stderr[-1500:], flush=True)
