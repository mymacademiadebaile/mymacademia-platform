"""Capítulo 13 — Operaciones administrativas frecuentes (un día típico)."""
import re

from tutorial_env import admin_credentials

from .common import TAG, enrolled_row, modal, nav, next_weekday, open_class

LOGIN_FIRST = False
START_PATH = "/login"
P = {"first": "Martina", "last": "Sosa", "phone": "221 555-0175", "dni": "44777888", "email": "martina.sosa@example.com"}
NAME = f"{P['first']} {P['last']}"

META = {
    "number": 13, "short": "Día típico",
    "title": "Operaciones administrativas frecuentes",
    "subtitle": "Un día de trabajo completo: del primer contacto a la inscripción, el cobro con promoción, la asistencia y los reportes.",
    "learn": ["Ingresar y revisar el inicio", "Atender una nueva consulta", "Convertir el contacto en alumna",
              "Inscribir y cobrar con promoción", "Revisar asistencias", "Ajustar un horario y mirar los reportes"],
    "summary": ["Inicio › Contactos › Alumnos › Clase › Pagos es el circuito diario", "Cada paso queda vinculado al anterior",
                "Las promociones se aplican solas al cobrar", "Recepción y Reportes cierran el día"],
    "intro": [
        "En este capítulo vamos a recorrer un día típico de trabajo, conectando todos los módulos que aprendimos.",
        f"Llega una nueva interesada, {NAME}: la registramos, la convertimos en alumna, la inscribimos, cobramos su clase con promoción y revisamos el resultado.",
    ],
    "outro": [
        "Ese es el circuito diario completo: consulta, alta, inscripción, cobro, asistencia, ajustes y control.",
        "En el último capítulo vamos a ver funciones adicionales de la plataforma.",
    ],
}


def prepare(rec):
    rec.page.get_by_label("Email o usuario").fill("")


def run(rec):
    p = rec.page
    email, pw = admin_credentials()
    rec.label("1 · Ingresar al sistema")
    with rec.say("Empezamos el día ingresando con nuestro usuario y contraseña."):
        rec.type(p.get_by_label("Email o usuario"), email, delay=30)
        rec.type(p.locator("input[autocomplete=current-password]"), pw, delay=30)
        rec.click(p.get_by_role("button", name="Ingresar"), settle=False)
        p.wait_for_url("**/admin")
        rec.settle(0.8)

    rec.label("2 · Revisar el inicio")
    with rec.say("Revisamos el inicio: alumnos activos, clases de hoy y lo cobrado en el mes."):
        rec.hover(p.locator("article").nth(2))
    with rec.say("Las clases del día nos dicen qué grupos hay hoy, y la campana, si hay pagos vencidos para gestionar."):
        rec.scroll_to(p.get_by_role("heading", name="Clases del día"))
        rec.hover(p.get_by_role("button", name="Notificaciones"))
    rec.scroll_top()

    rec.label("3 · Consultar nuevas solicitudes")
    with rec.say("Revisamos los contactos pendientes en Contactos: son las personas interesadas que todavía no se inscribieron."):
        rec.click(nav(p, "Contactos"))
        rec.wait(1)

    rec.label("4 · Registrar un contacto")
    with rec.say(f"Escribe {NAME}, interesada en salsa. Primero la buscamos por teléfono para no duplicarla."):
        rec.type(p.get_by_label("Buscar contacto por nombre, DNI o teléfono"), "2215550175", delay=50)
        rec.wait(0.8)
    with rec.say("No está cargada. Presionamos Agregar contacto."):
        rec.type(p.get_by_label("Buscar contacto por nombre, DNI o teléfono"), "", delay=10)
        rec.click(p.get_by_role("button", name="Agregar contacto"))
        form = modal(p, "Nuevo contacto")
    with rec.say("Completamos nombre y apellido,"):
        rec.type(form.get_by_label("Nombre", exact=True), P["first"], delay=35)
        rec.type(form.get_by_label("Apellido", exact=True), P["last"], delay=35)
    with rec.say("teléfono y DNI, y guardamos."):
        rec.type(form.get_by_label("Teléfono", exact=True), P["phone"], delay=35)
        rec.type(form.get_by_label("DNI", exact=True), P["dni"], delay=35)
        rec.click(form.get_by_role("button", name="Guardar contacto"), settle=False)
        p.wait_for_url(re.compile(r"/admin/contacts/[0-9a-f]{24}"))
        rec.settle(0.4)

    rec.label("5 · Convertir en alumna")
    with rec.say("Decide inscribirse directamente. Presionamos Convertir en alumno, cargamos su email y confirmamos."):
        rec.click(p.get_by_role("button", name="Convertir en alumno"))
        rec.type(p.get_by_label("Email (opcional)"), P["email"], delay=30)
        rec.click(p.get_by_role("button", name="Confirmar conversión"), settle=False)
        p.wait_for_url(re.compile(r"/admin/students/[0-9a-f]{24}"))
        rec.settle(0.6)

    rec.label("6 · Inscribir en una clase")
    with rec.say("Desde su ficha, Inscribir: elegimos Salsa Inicial y sus dos turnos."):
        rec.click(p.get_by_role("button", name="Inscribir", exact=True))
        form = modal(p, "Inscribir en una clase")
        rec.select(form.get_by_label(re.compile(r"^Clase(?! de| y)")), label="Salsa Inicial")
        boxes = form.get_by_role("checkbox")
        for i in range(boxes.count()):
            if not boxes.nth(i).is_checked():
                rec.click(boxes.nth(i), pause=0.2, settle=False)
        rec.click(form.get_by_role("button", name="Inscribir alumno"), settle=False)
        rec.toast("Alumno inscripto")

    rec.label("7 y 8 · Promoción y cobro")
    open_class(rec, "Lucía Benítez", "Salsa Inicial", "Hoy toma su primera clase y la paga en el momento. Vamos a la ficha de Salsa Inicial.")
    with rec.say("La promoción Semana de la salsa está activa: quince por ciento de descuento en las clases de esta semana."):
        rec.scroll_to(p.get_by_text("Semana de la salsa").first)
        rec.hover(p.get_by_text("Semana de la salsa").first)
    row = enrolled_row(p, NAME)
    with rec.say(f"En Inscriptos actuales, en la fila de {P['first']}, presionamos Registrar cobro."):
        rec.scroll_to(row)
        rec.click(row.get_by_title("Registrar cobro"))
    form = modal(p, "Registrar cobro")
    with rec.say("La fecha de la clase es hoy. Dejamos vacío el dinero recibido para cobrar el saldo calculado, elegimos Efectivo y presionamos Registrar cobro."):
        rec.hover(form.get_by_label("Fecha de la clase"))
        rec.select(form.get_by_label("Medio de pago"), label="Efectivo")
        rec.click(form.get_by_role("button", name="Registrar cobro"), settle=False)
        rec.toast("Cobro registrado")

    rec.label("9 · Consultar la inscripción")
    with rec.say("Abrimos su ficha para verificar."):
        rec.click(row.get_by_role("link"), pause=0.8)
    with rec.say("Tiene Salsa Inicial activa, y en Pagos la clase de hoy figura como Pagado, con la promoción aplicada."):
        rec.scroll_to(p.get_by_role("heading", name="Pagos"), block="start")
        r = p.locator("[class*=paymentRow]").filter(has_text="Salsa").first
        rec.highlight(r, 0)
        rec.zoom(r, 4)
        rec.wait(2.5)
    rec.highlight(None)

    rec.label("10 · Revisar asistencias")
    with rec.say("Revisamos las llegadas del día en Recepción."):
        rec.click(nav(p, "Recepción"))
        rec.wait(1)
    rec.narrate("Vemos quién ya registró su asistencia, en qué clase y con qué método.")

    rec.label("11 · Modificar un horario")
    with rec.say("La profesora de Salsa avisa que el lunes empieza media hora más tarde. Vamos al Calendario y pasamos a la semana siguiente."):
        rec.click(nav(p, "Calendario"))
        rec.click(p.get_by_role("button", name="Siguiente"), pause=0.8)
    mon = next_weekday(0)
    card = p.get_by_role("button", name=re.compile(r"Salsa Inicial")).first
    with rec.say(f"Abrimos la clase de Salsa Inicial del lunes {mon.day} y elegimos Solo esta clase."):
        rec.click(card, pause=0.8)
        drawer = p.get_by_role("dialog", name="Salsa Inicial")
        rec.click(drawer.get_by_role("button", name="Solo esta clase"))
    form = modal(p, "Cambiar solo esta clase")
    with rec.say("Nuevo horario, de 19:30 a 20:30, y guardamos."):
        rec.type(form.get_by_label("Desde", exact=True), "1930", delay=70)
        rec.type(form.get_by_label("Hasta", exact=True), "2030", delay=70)
        rec.click(form.get_by_role("button", name="Guardar", exact=True), settle=False)
        rec.toast("Cambios guardados para esta clase")
    rec.click(drawer.get_by_role("button", name="Cerrar"), pause=0.3, settle=False)

    rec.label("12 · Reportes finales")
    with rec.say("Para cerrar el día, miramos los Reportes del mes."):
        rec.click(nav(p, "Reportes"))
    with rec.say("La caja ya incluye los cobros de hoy, y la deuda del período nos indica a quién recordarle sus pagos."):
        rec.hover(p.locator("article").nth(0))
        rec.wait(0.8)
        rec.hover(p.locator("article").nth(2))
