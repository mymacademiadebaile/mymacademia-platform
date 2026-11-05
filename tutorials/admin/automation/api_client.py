"""Tiny admin API client for seeding/verification against the tutorial environment only."""
from __future__ import annotations

import http.cookiejar
import json
import urllib.error
import urllib.request

from tutorial_env import API_URL, admin_credentials


class ApiError(RuntimeError):
    def __init__(self, status: int, body: str):
        super().__init__(f"HTTP {status}: {body[:600]}")
        self.status = status
        self.body = body


class Api:
    def __init__(self, base: str = API_URL):
        if "localhost:4100" not in base and "127.0.0.1:4100" not in base:
            raise SystemExit("Refusing to use a non-tutorial API")
        self.base = base.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def request(self, method: str, path: str, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json", "Origin": "http://localhost:3100"})
        try:
            with self.opener.open(req, timeout=60) as resp:
                raw = resp.read().decode()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raise ApiError(exc.code, exc.read().decode(errors="ignore")) from None

    def get(self, path): return self.request("GET", path)
    def post(self, path, body=None): return self.request("POST", path, body or {})
    def patch(self, path, body=None): return self.request("PATCH", path, body or {})
    def put(self, path, body=None): return self.request("PUT", path, body or {})
    def delete(self, path): return self.request("DELETE", path)

    def login(self) -> "Api":
        email, pw = admin_credentials()
        self.post("/auth/login", {"login": email, "password": pw})
        return self
