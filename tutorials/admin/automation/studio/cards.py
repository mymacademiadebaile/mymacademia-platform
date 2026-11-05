"""Title, summary and index cards rendered from HTML to 1920x1080 PNG."""
from __future__ import annotations

import base64
import html
import pathlib

from playwright.sync_api import sync_playwright

REPO = pathlib.Path(__file__).resolve().parents[4]
LOGO = REPO / "apps" / "web" / "public" / "mym-academia-logo.png"

BASE_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden}
body{font-family:Inter,"Segoe UI",system-ui,sans-serif;color:#fff;
  background:radial-gradient(1200px 700px at 85% 15%, rgba(124,58,237,.38), transparent 60%),
             radial-gradient(900px 600px at 5% 100%, rgba(91,33,182,.45), transparent 60%), #1a1121;}
.frame{position:absolute;inset:0;padding:110px 140px;display:flex;flex-direction:column}
.brand{display:flex;align-items:center;gap:22px;color:#cbb8ef;font-size:26px;letter-spacing:.06em;text-transform:uppercase;font-weight:600}
.brand img{height:74px;width:auto;border-radius:14px;background:#fff;padding:6px}
.eyebrow{margin-top:120px;color:#b392ff;font-size:30px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
h1{margin-top:22px;font-size:96px;line-height:1.02;font-weight:800;letter-spacing:-.02em;max-width:1500px}
.sub{margin-top:30px;font-size:36px;line-height:1.35;color:#ddd2f2;max-width:1400px}
ul{margin-top:56px;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:20px 60px;max-width:1600px}
li{font-size:31px;line-height:1.3;color:#f1ecf9;padding-left:46px;position:relative}
li:before{content:"";position:absolute;left:0;top:11px;width:20px;height:20px;border-radius:6px;background:#7c3aed;box-shadow:0 0 0 4px rgba(124,58,237,.25)}
.done li:before{content:"✓";background:#22563b;color:#bff3cf;font-size:16px;line-height:20px;text-align:center;box-shadow:none}
.footer{margin-top:auto;display:flex;justify-content:space-between;color:#a99bbd;font-size:24px}
.index{margin-top:48px;display:grid;grid-template-columns:1fr 1fr;gap:14px 70px;max-width:1640px}
.index div{display:flex;gap:22px;align-items:baseline;font-size:28px;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:10px}
.index b{color:#b392ff;min-width:52px}.index span{flex:1}.index em{font-style:normal;color:#a99bbd;font-variant-numeric:tabular-nums}
"""


def _logo_tag() -> str:
    data = base64.b64encode(LOGO.read_bytes()).decode()
    return f'<img src="data:image/png;base64,{data}" alt="">'


def _page(body: str) -> str:
    return f"<!doctype html><html><head><meta charset='utf-8'><style>{BASE_CSS}</style></head><body>{body}</body></html>"


def chapter_card(eyebrow: str, title: str, subtitle: str, bullets: list[str], done: bool = False) -> str:
    items = "".join(f"<li>{html.escape(b)}</li>" for b in bullets)
    return _page(f"""
<div class="frame">
  <div class="brand">{_logo_tag()}<span>M&amp;M Academia · Capacitación para administradores</span></div>
  <div class="eyebrow">{html.escape(eyebrow)}</div>
  <h1>{html.escape(title)}</h1>
  <div class="sub">{html.escape(subtitle)}</div>
  <ul class="{'done' if done else ''}">{items}</ul>
  <div class="footer"><span>Datos de demostración ficticios</span><span>Plataforma de gestión M&amp;M Academia</span></div>
</div>""")


def index_card(title: str, rows: list[tuple[str, str, str]]) -> str:
    cells = "".join(f"<div><b>{html.escape(n)}</b><span>{html.escape(t)}</span><em>{html.escape(ts)}</em></div>" for n, t, ts in rows)
    return _page(f"""
<div class="frame" style="padding-top:90px">
  <div class="brand">{_logo_tag()}<span>M&amp;M Academia · Capacitación para administradores</span></div>
  <h1 style="margin-top:60px;font-size:72px">{html.escape(title)}</h1>
  <div class="index">{cells}</div>
</div>""")


def render_png(html_doc: str, out: pathlib.Path) -> pathlib.Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={"width": 1920, "height": 1080})
        page.set_content(html_doc)
        page.wait_for_timeout(300)
        page.screenshot(path=str(out))
        b.close()
    return out
