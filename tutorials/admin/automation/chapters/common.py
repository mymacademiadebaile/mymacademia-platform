"""Shared scenario data and UI helpers for every chapter.

Scenario (all fictitious, tagged TUTORIAL_ADMIN_2026):
  baseline (seed_baseline.py): academy already operating with Salón Principal,
  professors Lucía Benítez / Martín Ocampo, classes Salsa Inicial, Hip Hop
  Adolescentes, Bachata Intermedio, 12 students and 2 contacts.
  storyline created on camera: pista "Salón B", discipline "Dancehall",
  professor Carla Romero, class "Dancehall Inicial", promotions, student
  Valentina Ríos, contact Julieta Paz, etc.
"""
from __future__ import annotations

import datetime as dt
import re

from playwright.sync_api import Locator, Page

TAG = "TUTORIAL_ADMIN_2026"

PISTA = "Salón B"
DISCIPLINE = "Dancehall"
PROF = {"first": "Carla", "last": "Romero", "display": "Carla Romero", "phone": "221 555-0150",
        "email": "carla.romero@example.com", "password": "Profesora-Demo-2026", "instagram": "@carla.dancehall.demo",
        "short": "Docente de dancehall con foco en ritmo, actitud y técnica de base.",
        "bio": f"Profesora ficticia creada para el tutorial de administración. {TAG}"}
CLASS = "Dancehall Inicial"
STUDENT = {"first": "Valentina", "last": "Ríos", "dni": "40222333", "phone": "221 555-0160",
           "email": "valentina.rios@example.com", "birth": "1998-05-14",
           "notes": f"Alumna ficticia de demostración. {TAG}"}
CONTACT = {"first": "Julieta", "last": "Paz", "phone": "221 555-0170", "dni": "43555666",
           "email": "julieta.paz@example.com"}
DAYS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre",
             "octubre", "noviembre", "diciembre"]


def today() -> dt.date:
    return dt.date.today()


def iso(d: dt.date) -> str:
    return d.isoformat()


def next_weekday(weekday: int, after: dt.date | None = None, include_today: bool = False) -> dt.date:
    base = after or today()
    delta = (weekday - base.weekday()) % 7
    if delta == 0 and not include_today:
        delta = 7
    return base + dt.timedelta(days=delta)


def long_date(d: dt.date) -> str:
    return f"{DAYS_ES[d.weekday()].lower()} {d.day} de {MONTHS_ES[d.month - 1]}"


# ------------------------------------------------------------------ locators
def nav(page: Page, name: str) -> Locator:
    return page.locator("aside nav").get_by_role("link", name=name, exact=True)


def modal(page: Page, title: str | re.Pattern) -> Locator:
    """LiveModal forms have no dialog role: scope by their <h2> title."""
    return page.locator("form").filter(has=page.get_by_role("heading", name=title)).last


def confirm_dialog(page: Page) -> Locator:
    # CSS instead of role: on some pages the alertdialog is not exposed in the accessibility tree.
    return page.locator("[aria-labelledby='admin-confirm-title']")


def field(scope: Locator, label: str, exact: bool = True) -> Locator:
    return scope.get_by_label(label, exact=exact)


def go(rec, name: str, narration: str | None = None, pause: float = 0.4) -> None:
    """Navigate with a visible click on the sidebar item."""
    if narration:
        with rec.say(narration):
            rec.click(nav(rec.page, name), pause=pause)
    else:
        rec.click(nav(rec.page, name), pause=pause)


def select_containing(rec, loc: Locator, text: str) -> None:
    """Choose the first <option> whose text contains ``text``."""
    value = loc.locator("option").filter(has_text=text).first.get_attribute("value")
    rec.select(loc, value=value)


def open_class(rec, professor: str, klass: str, narration: str) -> None:
    """Reach a class detail page through Profesores › profesor › Clases asignadas."""
    p = rec.page
    with rec.say(narration):
        rec.click(nav(p, "Profesores"))
        rec.click(p.locator("a[href*='/admin/professors/']").filter(has_text=professor).first)
        link = p.locator("a[href*='/admin/classes/']").filter(has_text=klass).first
        rec.scroll_to(link)
        rec.click(link, pause=0.8)


def enrolled_row(page: Page, name: str) -> Locator:
    return page.locator("[class*='studentList'] > div").filter(has_text=name).first


def open_session_today(rec, klass: str, narration: str) -> Locator:
    """Calendar › Día view › click today's occurrence of ``klass``; returns the drawer."""
    p = rec.page
    with rec.say(narration):
        rec.click(nav(p, "Calendario"))
        rec.click(p.get_by_role("group", name="Vista").get_by_role("button", name="Día"), pause=0.6)
        rec.click(p.get_by_role("button", name=re.compile(re.escape(klass))).first, pause=0.8)
    return p.get_by_role("dialog", name=klass)


def fill_date(rec, loc: Locator, value: str) -> None:
    """Native date inputs: click to show focus, then set the ISO value."""
    rec.click(loc, pause=0.1, settle=False)
    loc.fill(value)
    rec.wait(0.35)
