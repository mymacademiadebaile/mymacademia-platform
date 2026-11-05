"""Records real interactions with the platform for the admin tutorial.

* Chromium is driven by Playwright against the isolated tutorial environment.
* Frames are captured with the DevTools screencast (high quality JPEG plus a
  wall-clock timestamp per frame), so the final video keeps sharp text.
* A visual cursor overlay shows mouse movement and clicks.
* ``with rec.say("..."):`` starts a narration line at the moment the actions
  inside the block begin, and waits until the line has finished before the
  next step, so the voice never runs ahead of the screen.

Everything needed for post-production is written to ``timeline.json``.
"""
from __future__ import annotations

import base64
import contextlib
import json
import math
import pathlib
import shutil
import time
from dataclasses import dataclass, field, asdict

from playwright.sync_api import Locator, Page, sync_playwright

from . import tts

HERE = pathlib.Path(__file__).resolve().parent
OVERLAY_JS = (HERE / "cursor_overlay.js").read_text(encoding="utf-8")

# CSS viewport scaled by 1.2 -> 1920x960 pixels. The remaining 120 px of the
# 1080p frame are a caption band added in post, so subtitles never cover UI.
FAST = bool(__import__("os").environ.get("TUTORIAL_FAST"))  # dry run: validate steps without narration timing
CSS_VIEWPORT = {"width": 1600, "height": 800}
SCALE = 1.2
FRAME_W, FRAME_H = 1920, 960


class StepFailed(RuntimeError):
    """An on-screen operation did not produce the expected result."""


@dataclass
class Segment:
    start: float
    text: str
    audio: str
    duration: float
    words: list
    kind: str = "screen"


@dataclass
class Timeline:
    chapter: str
    frames: list = field(default_factory=list)      # [t, file]
    segments: list = field(default_factory=list)    # Segment dicts
    labels: list = field(default_factory=list)      # [t, text]
    zooms: list = field(default_factory=list)       # {start,end,x,y,w,h}
    marks: list = field(default_factory=list)       # [t, name] scenario markers
    issues: list = field(default_factory=list)      # problems seen while recording
    cuts: list = field(default_factory=list)        # [start, end] intervals removed in post
    end: float = 0.0


class Recorder:
    def __init__(self, chapter: str, out_dir: pathlib.Path, base_url: str):
        self.chapter = chapter
        self.out = out_dir
        self.base_url = base_url.rstrip("/")
        self.frames_dir = out_dir / "frames"
        self.tl = Timeline(chapter=chapter)
        self.t0: float | None = None
        self._pos = (CSS_VIEWPORT["width"] * 0.55, CSS_VIEWPORT["height"] * 0.55)
        self._frame_no = 0
        self._pw = None
        self.browser = None
        self.context = None
        self.page: Page | None = None
        self.cdp = None

    # ------------------------------------------------------------------ setup
    def open(self) -> Page:
        if self.out.exists():
            shutil.rmtree(self.out)
        self.frames_dir.mkdir(parents=True)
        self._pw = sync_playwright().start()
        # channel="chromium" = new headless mode (full Chrome: includes the PDF viewer for receipts).
        self.browser = self._pw.chromium.launch(channel="chromium", headless=True,
                                                args=["--hide-scrollbars", "--font-render-hinting=none"])
        self.context = self.browser.new_context(
            viewport=CSS_VIEWPORT, device_scale_factor=SCALE, locale="es-AR",
            timezone_id="America/Argentina/Buenos_Aires", color_scheme="light",
        )
        self.context.add_init_script(OVERLAY_JS)
        self.context.set_default_timeout(20_000)
        self.page = self.context.new_page()
        self.page.on("dialog", lambda d: d.accept())  # native confirm() (e.g. delete user)
        return self.page

    def start_capture(self) -> None:
        self.cdp = self.context.new_cdp_session(self.page)
        self.cdp.on("Page.screencastFrame", self._on_frame)
        self.t0 = time.time()
        self.cdp.send("Page.startScreencast", {
            "format": "jpeg", "quality": 93, "maxWidth": FRAME_W, "maxHeight": FRAME_H, "everyNthFrame": 1,
        })
        self._set_cursor(*self._pos)
        self.page.wait_for_timeout(400)

    def switch_to(self, page: Page) -> Page:
        """Move the capture to another tab/page (popup receipt, kiosk tablet...)."""
        with contextlib.suppress(Exception):
            self.cdp.send("Page.stopScreencast")
        with contextlib.suppress(Exception):
            self.cdp.detach()
        page.bring_to_front()
        self.page = page
        self.cdp = page.context.new_cdp_session(page)
        self.cdp.on("Page.screencastFrame", self._on_frame)
        self.cdp.send("Page.startScreencast", {
            "format": "jpeg", "quality": 93, "maxWidth": FRAME_W, "maxHeight": FRAME_H, "everyNthFrame": 1,
        })
        self._set_cursor(*self._pos)
        page.wait_for_timeout(300)
        return page

    def new_isolated_page(self) -> Page:
        """A page in a separate browser context (e.g. the attendance tablet)."""
        ctx = self.browser.new_context(
            viewport=CSS_VIEWPORT, device_scale_factor=SCALE, locale="es-AR",
            timezone_id="America/Argentina/Buenos_Aires", color_scheme="light",
        )
        ctx.add_init_script(OVERLAY_JS)
        ctx.set_default_timeout(20_000)
        return ctx.new_page()

    def _on_frame(self, params) -> None:
        try:
            self.cdp.send("Page.screencastFrameAck", {"sessionId": params["sessionId"]})
        except Exception:
            pass
        ts = params.get("metadata", {}).get("timestamp") or time.time()
        if self.t0 is None:
            return
        self._frame_no += 1
        name = f"{self._frame_no:06d}.jpg"
        (self.frames_dir / name).write_bytes(base64.b64decode(params["data"]))
        self.tl.frames.append([max(0.0, ts - self.t0), name])

    def now(self) -> float:
        return time.time() - (self.t0 or time.time())

    def close(self) -> Timeline:
        if self.cdp is not None:
            self.page.wait_for_timeout(600)
            self.tl.end = self.now()
            with contextlib.suppress(Exception):
                self.cdp.send("Page.stopScreencast")
        (self.out / "timeline.json").write_text(json.dumps(asdict(self.tl), ensure_ascii=False, indent=1), encoding="utf-8")
        with contextlib.suppress(Exception):
            self.browser.close()
        with contextlib.suppress(Exception):
            self._pw.stop()
        return self.tl

    # -------------------------------------------------------------- narration
    @contextlib.contextmanager
    def say(self, text: str, hold: float = 0.45, lead: float = 0.0):
        """Narrate ``text`` while running the block's actions."""
        if FAST:
            yield None
            return
        before = self.now()
        n = tts.narrate(text)
        start = self.now()
        if start - before > 0.05:
            self.tl.cuts.append([before, start])  # synthesis wait is removed from the video
        self.tl.segments.append(asdict(Segment(start=start, text=n.text, audio=str(n.audio),
                                               duration=n.duration, words=n.words)))
        if lead:
            self.page.wait_for_timeout(int(lead * 1000))
        yield n
        remaining = start + n.duration + hold - self.now()
        if remaining > 0:
            self.page.wait_for_timeout(int(remaining * 1000))

    def narrate(self, text: str, hold: float = 0.45) -> None:
        with self.say(text, hold=hold):
            pass

    def label(self, text: str) -> None:
        """Discrete step label shown in the caption band."""
        self.tl.labels.append([self.now(), text])

    def mark(self, name: str) -> None:
        self.tl.marks.append([self.now(), name])

    def issue(self, text: str) -> None:
        self.tl.issues.append([self.now(), text])

    def wait(self, seconds: float) -> None:
        self.page.wait_for_timeout(int((0.05 if FAST else seconds) * 1000))

    @contextlib.contextmanager
    def offscreen(self, keep: float = 0.4):
        """Technical waits/preparation that should not appear in the final video."""
        a = self.now()
        yield
        b = self.now()
        if b - a > keep + 0.1:
            self.tl.cuts.append([a + keep, b])

    # ------------------------------------------------------------ navigation
    def goto(self, path: str) -> None:
        self.page.goto(self.base_url + path)
        self.settle()

    def settle(self, extra: float = 0.35) -> None:
        with contextlib.suppress(Exception):
            self.page.wait_for_load_state("networkidle", timeout=8000)
        with contextlib.suppress(Exception):
            self.page.get_by_text("Cargando", exact=False).first.wait_for(state="hidden", timeout=8000)
        self._set_cursor(*self._pos)
        self.page.wait_for_timeout(int(extra * 1000))

    # ----------------------------------------------------------------- mouse
    def _set_cursor(self, x: float, y: float) -> None:
        with contextlib.suppress(Exception):
            self.page.evaluate("([x,y]) => window.__tutSetCursor && window.__tutSetCursor(x,y)", [x, y])

    def _box(self, loc: Locator) -> dict:
        loc.wait_for(state="visible")
        self._ensure_in_view(loc)
        # Wait until smooth scrolling/animations stop so the click lands on the element.
        box, last = loc.bounding_box(), None
        for _ in range(30):
            if box and last and abs(box["x"] - last["x"]) < 0.5 and abs(box["y"] - last["y"]) < 0.5:
                break
            last = box
            self.page.wait_for_timeout(60)
            box = loc.bounding_box()
        if not box:
            raise StepFailed(f"Element without box: {loc}")
        return box

    def _ensure_in_view(self, loc: Locator) -> None:
        box = loc.bounding_box()
        if box is None:
            return
        top_margin, bottom_margin = 90, 70
        if box["y"] < top_margin or box["y"] + box["height"] > CSS_VIEWPORT["height"] - bottom_margin:
            loc.evaluate("el => el.scrollIntoView({behavior:'smooth', block:'center'})")
            self.page.wait_for_timeout(750)

    def move_to(self, loc: Locator, speed: float = 1.0, offset: tuple[float, float] | None = None) -> tuple[float, float]:
        box = self._box(loc)
        if offset:
            tx, ty = box["x"] + offset[0], box["y"] + offset[1]
        else:
            tx = box["x"] + min(box["width"] * 0.5, 60 if box["width"] > 220 else box["width"] * 0.5)
            ty = box["y"] + box["height"] * 0.5
        sx, sy = self._pos
        dist = math.hypot(tx - sx, ty - sy)
        duration = min(1.0, max(0.28, dist / 1400)) / speed
        steps = max(8, int(duration * 50))
        if FAST:
            duration, steps = 0.02, 1
        for i in range(1, steps + 1):
            p = i / steps
            e = p * p * (3 - 2 * p)  # smoothstep easing
            x = sx + (tx - sx) * e
            y = sy + (ty - sy) * e - math.sin(math.pi * p) * min(40, dist * 0.06)
            self.page.mouse.move(x, y)
            self.page.wait_for_timeout(int(duration * 1000 / steps))
        self._pos = (tx, ty)
        return tx, ty

    def hover(self, loc: Locator, pause: float = 0.25) -> None:
        self.move_to(loc)
        self.page.wait_for_timeout(int(pause * 1000))

    def click(self, loc: Locator, pause: float = 0.35, settle: bool = True, offset=None) -> None:
        x, y = self.move_to(loc, offset=offset)
        # Toasts or overlays may cover the target for a few seconds: wait until the point is free.
        for _ in range(80):
            try:
                hit = loc.evaluate("(el, [x, y]) => { const t = document.elementFromPoint(x, y);"
                                   " return !!t && (el === t || el.contains(t) || t.contains(el) || t.id === '__tut_cursor'); }", [x, y])
            except Exception:
                hit = True
            if hit:
                break
            self.page.wait_for_timeout(100)
        self.page.wait_for_timeout(140)
        self.page.mouse.down()
        self.page.wait_for_timeout(70)
        self.page.mouse.up()
        if settle:
            self.settle(extra=pause)
        else:
            self.page.wait_for_timeout(int(pause * 1000))

    def type(self, loc: Locator, text: str, delay: int = 45, clear: bool = True) -> None:
        self.click(loc, pause=0.15, settle=False)
        if clear:
            loc.press("Control+a")
            loc.press("Delete")
        loc.press_sequentially(text, delay=delay)
        self.page.wait_for_timeout(200)

    def fill_fast(self, loc: Locator, text: str) -> None:
        """For long texts: show the click, then fill at once (avoids dead time)."""
        self.click(loc, pause=0.1, settle=False)
        loc.fill(text)
        self.page.wait_for_timeout(250)

    def select(self, loc: Locator, label: str | None = None, value: str | None = None) -> None:
        """Native <select>: show the click, then choose the option."""
        self.move_to(loc)
        self.page.wait_for_timeout(150)
        if label is not None:
            loc.select_option(label=label)
        else:
            loc.select_option(value=value)
        self.page.wait_for_timeout(450)

    def check(self, loc: Locator) -> None:
        self.click(loc, pause=0.2, settle=False)

    def scroll(self, dy: int, steps: int = 12) -> None:
        for _ in range(steps):
            self.page.mouse.wheel(0, dy / steps)
            self.page.wait_for_timeout(28)
        self.page.wait_for_timeout(400)

    def scroll_to(self, loc: Locator, block: str = "center") -> None:
        loc.wait_for(state="attached")
        loc.evaluate(f"el => el.scrollIntoView({{behavior:'smooth', block:'{block}'}})")
        self.page.wait_for_timeout(800)

    def scroll_top(self) -> None:
        self.page.evaluate("() => window.scrollTo({top:0, behavior:'smooth'})")
        self.page.wait_for_timeout(700)

    # ------------------------------------------------------------- emphasis
    def highlight(self, loc: Locator | None, seconds: float = 0.0) -> None:
        if loc is None:
            self.page.evaluate("() => window.__tutBox && window.__tutBox(null)")
            return
        box = self._box(loc)
        self.page.evaluate("(r) => window.__tutBox && window.__tutBox(r)", box)
        if seconds:
            self.page.wait_for_timeout(int(seconds * 1000))
            self.page.evaluate("() => window.__tutBox && window.__tutBox(null)")

    def zoom(self, loc: Locator, seconds: float, factor: float | None = None) -> None:
        """Ask post-production to zoom smoothly into ``loc`` for ``seconds``."""
        box = self._box(loc)
        start = self.now()
        self.tl.zooms.append({
            "start": start, "end": start + seconds,
            "x": box["x"] * SCALE, "y": box["y"] * SCALE, "w": box["width"] * SCALE, "h": box["height"] * SCALE,
            "factor": factor,
        })

    # --------------------------------------------------------------- checks
    def expect_text(self, text: str, timeout: int = 10_000) -> Locator:
        loc = self.page.get_by_text(text, exact=False).first
        try:
            loc.wait_for(state="visible", timeout=timeout)
        except Exception as exc:
            raise StepFailed(f"Expected text not visible: {text!r}") from exc
        return loc

    def toast(self, text: str, timeout: int = 10_000) -> None:
        """Wait for a success toast; fail loudly if it does not appear."""
        loc = self.page.locator("[data-tone]").filter(has_text=text).first
        try:
            loc.wait_for(state="visible", timeout=timeout)
        except Exception as exc:
            err = self.page.locator("[data-tone=error]").first
            detail = err.inner_text() if err.count() else ""
            raise StepFailed(f"Toast {text!r} not shown. {detail}") from exc
