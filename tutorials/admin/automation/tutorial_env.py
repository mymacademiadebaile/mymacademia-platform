"""Shared configuration for the admin tutorial pipeline.

Credentials are read from tutorials/admin/.local/api.env (git-ignored) and are
never printed, narrated or written to subtitles.
"""
from __future__ import annotations

import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent  # tutorials/admin
REPO = ROOT.parent.parent
LOCAL = ROOT / ".local"
ENV_FILE = LOCAL / "api.env"

WEB_URL = "http://localhost:3100"
API_URL = "http://localhost:4100/api"
MONGO_URI = "mongodb://127.0.0.1:27118/mymacademia_tutorial?replicaSet=rs0"

# Every record created for the tutorial carries this tag (in a name, note or
# description field) so the cleanup script can find it.
TAG = "TUTORIAL_ADMIN_2026"

VIEWPORT = {"width": 1920, "height": 1080}


def _read_env() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def admin_credentials() -> tuple[str, str]:
    env = _read_env()
    return env["ADMIN_EMAIL"], env["ADMIN_PASSWORD"]


def assert_tutorial_database(uri: str) -> None:
    """Refuse to run against anything that is not the local tutorial DB."""
    if not uri.startswith("mongodb://127.0.0.1:27118/") or "tutorial" not in uri:
        raise SystemExit(f"Refusing to operate on non-tutorial database: {uri.split('@')[-1]}")
