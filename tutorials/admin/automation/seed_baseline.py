"""Baseline demo data: an academy that is already operating.

Everything here is fictitious and tagged TUTORIAL_ADMIN_2026 (notes / bio /
emails @example.com / phones 221-555-01xx). It only runs against the local
tutorial API (port 4100) and records its start time in .local/tutorial_meta.json
so the cleanup script can find every record created for the tutorial.

The chapters then create, on camera, the course storyline: a new studio
(pista), the discipline "Dancehall", professor Carla Romero, the class
"Dancehall Inicial", students, a 2x1 promotion, payments, a contact, etc.
"""
from __future__ import annotations

import datetime as dt
import json
import uuid

from api_client import Api, ApiError
from tutorial_env import LOCAL, TAG

TODAY = dt.date.today()


def d(offset: int) -> str:
    return (TODAY + dt.timedelta(days=offset)).isoformat()


def oid(resp) -> str:
    if isinstance(resp, dict):
        for key in ("_id", "id"):
            if key in resp:
                return resp[key]
        for value in resp.values():
            if isinstance(value, dict) and ("_id" in value or "id" in value):
                return value.get("_id") or value.get("id")
    raise RuntimeError(f"No id in response: {str(resp)[:300]}")


def backdate_and_generate(class_ids: list[str], valid_from: str) -> None:
    import subprocess
    from bson import ObjectId
    from pymongo import MongoClient
    from tutorial_env import MONGO_URI, REPO, assert_tutorial_database

    assert_tutorial_database(MONGO_URI)
    db = MongoClient(MONGO_URI).get_default_database()
    ids = [ObjectId(x) for x in class_ids]
    res = db.classschedules.update_many({"classId": {"$in": ids}}, {"$set": {"validFrom": valid_from}})
    print("backdated rules:", res.modified_count)
    env = dict(__import__("os").environ, DOTENV_CONFIG_PATH=str(LOCAL / "api.env"))
    subprocess.run(["npx", "tsx", "src/scripts/daily-jobs.ts"], cwd=REPO / "apps" / "api", env=env,
                   check=True, capture_output=True, shell=True)


def main() -> None:
    meta_file = LOCAL / "tutorial_meta.json"
    meta = {"tag": TAG, "started_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    meta_file.write_text(json.dumps(meta, indent=1), encoding="utf-8")

    api = Api().login()
    branch = api.get("/admin/branches")[0]["_id"]
    cats = api.get("/admin/catalogs")
    cat = {(c["type"], c["name"]): c["_id"] for c in cats}

    space = oid(api.post("/admin/spaces", {"branchId": branch, "name": "Salón Principal", "capacity": 40,
                                           "status": "ACTIVE", "description": "Pista principal con espejos. " + TAG}))

    def professor(first, last, disciplines, phone):
        return oid(api.post("/admin/professors", {
            "branchIds": [branch], "disciplineIds": [cat[("DISCIPLINE", x)] for x in disciplines],
            "email": f"{first.lower()}.{last.lower()}@example.com".replace("í", "i").replace("á", "a"),
            "password": "Profesor-Demo-2026", "firstName": first, "lastName": last, "displayName": f"{first} {last}",
            "phone": phone, "bioShort": f"Docente de {', '.join(disciplines).lower()}.", "bio": f"Profesor/a ficticio/a de demostración. {TAG}",
        }))

    lucia = professor("Lucía", "Benítez", ["Salsa", "Bachata"], "221 555-0111")
    martin = professor("Martín", "Ocampo", ["Hip Hop", "Urbano"], "221 555-0112")

    def dance_class(name, prof, disc, seg, lvl, cap, mode, schedules, **prices):
        body = {"branchId": branch, "name": name, "professorIds": [prof],
                "disciplineIds": [cat[("DISCIPLINE", disc)]], "segmentIds": [cat[("SEGMENT", seg)]],
                "levelIds": [cat[("LEVEL", lvl)]], "capacity": cap, "billingMode": mode,
                "schedules": [{"day": day, "startTime": a, "endTime": b} for day, a, b in schedules],
                "startDate": d(-35), "defaultSpaceId": space, **prices}
        return oid(api.post("/admin/classes", body))

    salsa = dance_class("Salsa Inicial", lucia, "Salsa", "Adultos", "Inicial", 20, "PER_CLASS",
                        [("MONDAY", "19:00", "20:00"), ("WEDNESDAY", "19:00", "20:00")],
                        pricePerClass=6000, freeTrialEnabled=True)
    hiphop = dance_class("Hip Hop Adolescentes", martin, "Hip Hop", "Adolescentes", "Inicial", 20, "MONTHLY",
                         [("TUESDAY", "18:00", "19:00"), ("THURSDAY", "18:00", "19:00")],
                         monthlyPrice4=22000, monthlyPrice8=38000)
    bachata = dance_class("Bachata Intermedio", lucia, "Bachata", "Adultos", "Intermedio", 24, "BOTH",
                          [("WEDNESDAY", "20:00", "21:00"), ("FRIDAY", "20:00", "21:00")],
                          pricePerClass=6500, monthlyPrice4=24000, monthlyPrice8=42000)

    # The API never creates retroactive schedules; to simulate an academy that
    # was already running we backdate the baseline rules in the tutorial DB and
    # let the daily job materialise the last 7 days of sessions.
    backdate_and_generate([salsa, hiphop, bachata], d(-35))

    people = [
        ("Sofía", "Medina", "38111201"), ("Tomás", "Aguirre", "39111202"), ("Camila", "Duarte", "40111203"),
        ("Lautaro", "Gómez", "41111204"), ("Micaela", "Ferreyra", "37111205"), ("Joaquín", "Paredes", "42111206"),
        ("Abril", "Navarro", "43111207"), ("Nicolás", "Herrera", "44111208"), ("Florencia", "Ibarra", "45111209"),
        ("Agustina", "Molina", "46111210"), ("Bruno", "Castillo", "36111211"), ("Paula", "Ledesma", "35111212"),
    ]
    sid = {}
    for i, (first, last, dni) in enumerate(people):
        plain = (first + "." + last).lower()
        for a, b in (("á", "a"), ("é", "e"), ("í", "i"), ("ó", "o"), ("ú", "u")):
            plain = plain.replace(a, b)
        sid[first] = oid(api.post("/admin/students", {
            "branchId": branch, "firstName": first, "lastName": last, "dni": dni,
            "phone": f"221 555-01{20 + i:02d}", "email": f"{plain}@example.com",
            "notes": f"Alumno/a ficticio/a. {TAG}",
        }))

    start = d(-30)

    def enroll(student, klass, **kw):
        return api.post("/admin/enrollments", {"classId": klass, "studentId": sid[student], "startDate": start, **kw})

    for s in ("Camila", "Lautaro", "Micaela", "Joaquín", "Abril"):
        enroll(s, salsa)
    for s, plan in (("Nicolás", 8), ("Florencia", 4), ("Agustina", 8), ("Bruno", 4)):
        enroll(s, hiphop, billingPreference="MONTHLY", monthlyPlan=plan, joinPolicy="FULL")
    enroll("Paula", bachata, billingPreference="MONTHLY", monthlyPlan=8, joinPolicy="FULL")
    enroll("Camila", bachata, billingPreference="MONTHLY", monthlyPlan=4, joinPolicy="FULL")
    enroll("Micaela", bachata, billingPreference="PER_CLASS")

    # Monthly fees for last and current month.
    for period in ({"period": d(-30)[:7]}, {"period": TODAY.isoformat()[:7]}):
        try:
            api.post("/admin/billing/monthly/generate", period)
        except ApiError as exc:
            print("monthly generate:", exc)

    # Past sessions: attendance + completion (per-class charges are created by PRESENT).
    cal = api.get(f"/admin/calendar?from={d(-7)}&to={d(-1)}")
    sessions = cal["items"]
    absent = {"Joaquín", "Bruno"}
    for s in sessions:
        sess_id = s["id"]
        detail = api.get(f"/admin/sessions/{sess_id}")
        for p in detail["participants"]:
            pid = p["studentId"]
            name = p["student"]["firstName"]
            status = "ABSENT" if name in absent else "PRESENT"
            try:
                api.patch(f"/admin/sessions/{sess_id}/attendance/{pid}", {"status": status})
            except ApiError as exc:
                print("attendance:", exc)
        try:
            api.patch(f"/admin/sessions/{sess_id}/status", {"status": "COMPLETED"})
        except ApiError as exc:
            print("complete:", exc)

    # Collections: pay part of what is owed, leave some debt open.
    payers = {"Nicolás": "TRANSFER", "Agustina": "CASH", "Paula": "TRANSFER", "Camila": "CASH", "Lautaro": "CASH", "Abril": "CARD"}
    for name, method in payers.items():
        account = api.get(f"/admin/billing/students/{sid[name]}/account")
        charges = [c for c in account.get("charges", []) if (c.get("balance") or 0) > 0]
        charges.sort(key=lambda c: c.get("dueDate", ""))
        if not charges:
            continue
        target = charges[0]
        api.post("/admin/billing/collections", {
            "studentId": sid[name], "amount": target["balance"], "method": method,
            "allocations": [{"chargeId": target["id"], "amount": target["balance"]}],
            "notes": TAG, "idempotencyKey": f"seed-{uuid.uuid4().hex[:16]}",
        })

    for first, last, phone, dni in (("Rocío", "Villalba", "2215550190", "47111290"), ("Federico", "Luna", "2215550191", "48111291")):
        api.post("/admin/contacts", {"branchId": branch, "firstName": first, "lastName": last, "phone": phone, "dni": dni,
                                     "notes": f"Consulta por redes. {TAG}", "creationKey": uuid.uuid4().hex})

    meta.update({"branch": branch, "space": space, "professors": {"lucia": lucia, "martin": martin},
                 "classes": {"salsa": salsa, "hiphop": hiphop, "bachata": bachata}, "students": sid})
    meta_file.write_text(json.dumps(meta, indent=1, ensure_ascii=False), encoding="utf-8")
    print("baseline seeded")


if __name__ == "__main__":
    main()
