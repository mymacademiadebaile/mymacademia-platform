"""Capítulo 6 — Gestión de alumnos."""
import re

from .common import STUDENT, confirm_dialog, fill_date, go, modal

META = {
    "number": 6, "short": "Alumnos",
    "title": "Gestión de alumnos",
    "subtitle": "Búsqueda, alta sin duplicados, ficha completa, edición, historial, preferencias y estado.",
    "learn": ["Buscar y filtrar alumnos", "Evitar registros duplicados", "Registrar un alumno nuevo",
              "Leer la ficha: clases, pagos e historial", "Editar datos y preferencias", "Inactivar y reactivar"],
    "summary": ["Antes de crear, buscá por nombre, teléfono o DNI", "El DNI y el email no se pueden repetir",
                "La ficha reúne datos, clases, pagos, asistencia y QR", "Editar mantiene sincronizado el contacto",
                "Inactivar cierra sus inscripciones y conserva el historial"],
    "intro": [
        "En este capítulo vamos a gestionar alumnos: buscarlos, registrarlos sin duplicados y consultar toda su información.",
        f"Vamos a registrar a una alumna ficticia, {STUDENT['first']} {STUDENT['last']}, que vamos a inscribir en el próximo capítulo.",
    ],
    "outro": [
        f"{STUDENT['first']} ya tiene su ficha completa en el sistema.",
        "En el próximo capítulo vamos a inscribirla en distintas clases y modalidades.",
    ],
}


def run(rec):
    p = rec.page
    search = p.get_by_placeholder("Nombre, email o teléfono...")
    rec.label("Listado y búsqueda")
    go(rec, "Alumnos", "Ingresamos a Alumnos desde el menú lateral.")
    rec.narrate("El listado muestra a los alumnos activos ordenados por apellido, con su teléfono o email y su estado. Abajo se elige cuántos ver por página.")
    with rec.say("El buscador encuentra por nombre, apellido, email, teléfono o DNI. Por ejemplo, escribimos Camila."):
        rec.type(search, "Camila", delay=80)
        rec.wait(1)
    with rec.say("Los filtros permiten elegir la sede, el estado, Activos, Inactivos o Todos, y ver solo a quienes tienen deuda vencida."):
        rec.type(search, "", delay=10)
        rec.click(p.get_by_label("Con deuda vencida"), pause=0.8, settle=False)
        rec.wait(1)
    rec.narrate("Con la casilla Con deuda vencida marcada, vemos rápidamente a quiénes hay que cobrarles. La desmarcamos.")
    rec.click(p.get_by_label("Con deuda vencida"), pause=0.6, settle=False)

    rec.label("Evitar duplicados")
    with rec.say("Antes de registrar a alguien, conviene buscarlo para no crear un duplicado. Buscamos el DNI de la nueva alumna."):
        rec.type(search, STUDENT["dni"], delay=70)
        rec.wait(1.2)
    with rec.say("No hay resultados, así que podemos crearla con tranquilidad. Además, el sistema rechaza un DNI o un email que ya pertenezcan a otra persona."):
        rec.hover(p.get_by_text("No hay alumnos para estos filtros."))
    rec.type(search, "", delay=10)

    rec.label("Registrar un alumno nuevo")
    with rec.say("Presionamos Nuevo alumno."):
        rec.click(p.get_by_role("button", name="Nuevo alumno"))
    form = modal(p, "Agregar alumno")
    with rec.say("Elegimos la sede."):
        rec.select(form.get_by_label(re.compile(r"^Sede")), label="La Plata")
    with rec.say("Completamos nombre y apellido."):
        rec.type(form.get_by_label("Nombre", exact=True), STUDENT["first"])
        rec.type(form.get_by_label("Apellido", exact=True), STUDENT["last"])
    with rec.say("El DNI es opcional, pero recomendamos cargarlo: identifica a la persona y le permite registrar su asistencia en la tablet."):
        rec.type(form.get_by_label("DNI (opcional)"), STUDENT["dni"])
    with rec.say("Teléfono y email, para contactarla y enviarle recibos."):
        rec.type(form.get_by_label("Teléfono", exact=True), STUDENT["phone"])
        rec.type(form.get_by_label("Email", exact=True), STUDENT["email"])
    with rec.say("La fecha de nacimiento."):
        fill_date(rec, form.get_by_label("Fecha de nacimiento"), STUDENT["birth"])
    with rec.say("Los datos de un responsable se completan en el caso de menores. Y en Notas, cualquier observación útil."):
        rec.hover(form.get_by_label("Responsable", exact=True))
        rec.fill_fast(form.get_by_label("Notas"), STUDENT["notes"])
    with rec.say("Presionamos Guardar."):
        rec.click(form.get_by_role("button", name="Guardar", exact=True), settle=False)
        rec.toast("Alumno creado correctamente")
        rec.settle(0.6)

    rec.label("La ficha del alumno")
    rec.narrate("El sistema abre la ficha de la alumna. Arriba está su estado, Alumno activo, y los accesos para escribirle por Email o WhatsApp, Editar e Inactivar.")
    with rec.say("Las tarjetas muestran lo cobrado, lo pendiente, lo vencido y sus clases activas. Al ser nueva, todo está en cero."):
        rec.hover(p.get_by_text("Vencido", exact=True).first)
    with rec.say("La ficha tiene tres secciones: Resumen, QR e historial, y Recordatorios."):
        rec.hover(p.get_by_role("navigation", name="Secciones de la ficha del alumno"))
    with rec.say("En Resumen vemos la información personal, sus inscripciones y sus pagos."):
        rec.scroll(420)
        rec.hover(p.get_by_text("Información personal"))
    rec.scroll_top()

    rec.label("Editar información")
    with rec.say("Para corregir un dato presionamos Editar."):
        rec.click(p.get_by_role("button", name="Editar", exact=True))
    form = modal(p, "Editar alumno")
    with rec.say("Por ejemplo, actualizamos su teléfono."):
        rec.type(form.get_by_label("Teléfono", exact=True), "221 555-0161")
    with rec.say("Guardamos."):
        rec.click(form.get_by_role("button", name="Guardar", exact=True), settle=False)
        rec.toast("Datos del alumno actualizados")

    rec.label("QR, historial y preferencias")
    with rec.say("En QR e historial está su credencial con código QR, el historial de clases a las que asistió y sus preferencias de contacto."):
        rec.click(p.get_by_role("button", name=re.compile("^QR e historial")))
    prefs = p.locator("#student-contact-settings")
    with rec.say("En Contacto y preferencias definimos si acepta recordatorios de pago por email y si quiere recibir novedades y promociones."):
        rec.scroll_to(prefs)
        rec.click(prefs.get_by_label("Aceptar novedades y promociones"), pause=0.3, settle=False)
    with rec.say("Guardamos las preferencias."):
        rec.click(prefs.get_by_role("button", name="Guardar preferencias"), pause=0.3, settle=False)
        rec.expect_text("Preferencias guardadas")

    rec.label("Inactivar y reactivar")
    rec.scroll_top()
    with rec.say("Cuando un alumno deja la academia, se lo inactiva. Presionamos Inactivar."):
        rec.click(p.get_by_role("button", name="Inactivar"))
    with rec.say("El sistema avisa que su historial se conserva. Al inactivarlo, además, se cierran sus inscripciones activas. Confirmamos."):
        rec.click(confirm_dialog(p).get_by_role("button", name="Inactivar"), settle=False)
        rec.toast("Alumno inactivado")
    with rec.say("Ahora figura como Alumno inactivo. Para que vuelva, presionamos Reactivar y confirmamos."):
        rec.click(p.get_by_role("button", name="Reactivar"))
        rec.click(confirm_dialog(p).get_by_role("button", name="Reactivar"), settle=False)
        rec.toast("Alumno reactivado")
    rec.narrate("Tené en cuenta que reactivar no recupera las inscripciones anteriores: hay que volver a inscribirlo en sus clases.")

    rec.label("Consultar un alumno con historial")
    with rec.say("Veamos ahora una alumna con actividad. Volvemos a Alumnos y buscamos a Camila Duarte."):
        rec.click(p.get_by_role("link", name="Volver a alumnos"))
        rec.type(search, "Duarte", delay=80)
        rec.wait(0.8)
        rec.click(p.get_by_role("link", name=re.compile("Camila Duarte")), pause=0.8)
    with rec.say("Sus tarjetas muestran lo cobrado, lo pendiente y lo vencido."):
        rec.hover(p.get_by_text("Cobrado", exact=True).first)
    with rec.say("En Inscripciones vemos sus dos clases: Salsa Inicial por clase, y Bachata Intermedio con mensualidad, cada una con sus turnos."):
        rec.scroll_to(p.get_by_role("heading", name="Inscripciones"), block="start")
        rec.hover(p.get_by_role("heading", name="Inscripciones"))
    with rec.say("Y en Pagos, cada mensualidad o clase con su vencimiento, importe y estado: Pagado, Pendiente o Vencido. Desde cada fila se puede cobrar y ver el recibo."):
        rec.scroll_to(p.get_by_role("heading", name="Pagos"), block="start")
        rec.hover(p.get_by_role("heading", name="Pagos"))
        rec.wait(1.2)
    with rec.say("En QR e historial, el Historial de clases muestra cada asistencia registrada, con la clase, el tipo y la fecha."):
        rec.scroll_top()
        rec.click(p.get_by_role("button", name=re.compile("^QR e historial")))
        hist = p.get_by_role("heading", name="Historial de clases")
        rec.scroll_to(hist, block="start")
        rec.hover(hist)
    rec.narrate("Así, desde una sola ficha consultamos sus datos, clases, mensualidades, pagos y asistencia.")
