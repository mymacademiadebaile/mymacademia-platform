"""Runtime verification of business rules that the narration states but the
videos do not show (to avoid displaying error screens).

Runs against the tutorial API, on a throwaway copy of the final state: it
restores the snapshot given (default after_13_additional_features), runs the
checks, writes reports/RULES_VERIFICATION.md and restores the snapshot again.
"""
from __future__ import annotations

import datetime as dt
import pathlib
import sys
import uuid

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from api_client import Api, ApiError  # noqa: E402
from produce import restore  # noqa: E402
from tutorial_env import ROOT  # noqa: E402

SNAP = sys.argv[1] if len(sys.argv) > 1 else "after_13_additional_features"


def expect_error(fn, status, contains=None):
    try:
        fn()
    except ApiError as exc:
        ok = exc.status == status and (contains is None or contains in exc.body)
        return ok, f"HTTP {exc.status}: {exc.body[:180]}"
    return False, "No error: the operation was accepted"


def main() -> None:
    if not restore(SNAP):
        raise SystemExit(f"Snapshot {SNAP} not found")
    api = Api().login()
    branch = api.get("/admin/branches")[0]["_id"]
    students = api.get("/admin/students?limit=100")["items"]
    camila = next(s for s in students if s["firstName"] == "Camila")
    classes = api.get("/admin/classes")
    classes = classes.get("items", classes) if isinstance(classes, dict) else classes
    salsa = next(c for c in classes if c["name"] == "Salsa Inicial")
    profs = api.get("/admin/professors?limit=100")["items"]
    lucia = next(p for p in profs if p.get("displayName", "").startswith("Lucía"))
    today = dt.date.today()
    results = []

    def check(name, fn, status, contains=None):
        ok, detail = expect_error(fn, status, contains)
        results.append((name, ok, detail))

    check("Alta de alumno con DNI repetido es rechazada",
          lambda: api.post("/admin/students", {"branchId": branch, "firstName": "Prueba", "lastName": "Duplicado", "dni": camila["dni"]}),
          409, "DNI")
    check("Alta de contacto con el teléfono de otro contacto (cargado desde Contactos) es rechazada",
          lambda: api.post("/admin/contacts", {"branchId": branch, "firstName": "Prueba", "lastName": "Duplicado",
                                               "phone": "2215550191", "dni": "49999002", "creationKey": uuid.uuid4().hex}),
          409)
    check("Alta de contacto con el teléfono de un alumno cargado desde Alumnos (con espacios y guion) es rechazada",
          lambda: api.post("/admin/contacts", {"branchId": branch, "firstName": "Prueba", "lastName": "Duplicado",
                                               "phone": "2215550122", "dni": "49999001", "creationKey": uuid.uuid4().hex}),
          409)
    check("Alta de alumno con email de un contacto existente es rechazada",
          lambda: api.post("/admin/students", {"branchId": branch, "firstName": "Prueba", "lastName": "Email", "email": camila["email"]}),
          409)
    check("No se puede eliminar una clase con historial",
          lambda: api.delete(f"/admin/classes/{salsa['_id']}"), 409)
    check("No se puede eliminar un profesor con clases vinculadas",
          lambda: api.delete(f"/admin/professors/{lucia['_id']}"), 409)
    check("No se puede bajar el cupo por debajo de los inscriptos",
          lambda: api.patch(f"/admin/classes/{salsa['_id']}", {"capacity": 1}), 409)
    sunday = today + dt.timedelta(days=(6 - today.weekday()) % 7)
    check("No se pueden superponer dos promociones iguales en la misma clase",
          lambda: api.post("/admin/promotions", {"classId": salsa["_id"], "name": "Superpuesta", "kind": "PERCENT",
                                                 "percent": 10, "appliesTo": "CLASS_FEE",
                                                 "benefitFrom": today.isoformat(), "benefitTo": sunday.isoformat()}),
          409)

    lines = ["# Verificación de reglas en ejecución", "",
             f"Fecha: {dt.datetime.now():%Y-%m-%d %H:%M} · Base: snapshot `{SNAP}` (entorno local de capacitación).", "",
             "Reglas que la locución menciona y que se comprobaron contra la API real, sin mostrarlas en video:", "",
             "| Regla | Resultado | Respuesta del sistema |", "|---|---|---|"]
    for name, ok, detail in results:
        lines.append(f"| {name} | {'✅ Verificada' if ok else '❌ No se comportó como se esperaba'} | `{detail.replace('|', '/')}` |")
    (ROOT / "reports" / "RULES_VERIFICATION.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    restore(SNAP)
    for name, ok, detail in results:
        print("OK " if ok else "FAIL", name, "-", detail[:120])


if __name__ == "__main__":
    main()
