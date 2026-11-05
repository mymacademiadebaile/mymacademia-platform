"""Capítulo 9 — Contactos y potenciales alumnos."""
import re

from .common import CLASS, CONTACT, TAG, fill_date, iso, modal, nav, today

NAME = f"{CONTACT['first']} {CONTACT['last']}"

META = {
    "number": 9, "short": "Contactos",
    "title": "Contactos y potenciales alumnos",
    "subtitle": "Registro de interesados, clase de prueba gratuita, seguimiento, notas y conversión en alumno.",
    "learn": ["Ver y buscar contactos", "Crear un contacto sin duplicados", "Registrar su interés y observaciones",
              "Reservar una clase de prueba gratuita", "Registrar su asistencia a la prueba", "Convertir el contacto en alumno"],
    "summary": ["Contactos lista a las personas interesadas que aún no son alumnas", "El DNI y el teléfono evitan duplicados",
                "La prueba gratuita se reserva en una clase que la tenga habilitada", "Convertir crea la ficha de alumno con los mismos datos",
                "El contacto conserva su historial y sale de la lista de posibles alumnos"],
    "intro": [
        "En este capítulo vamos a gestionar a las personas interesadas en la academia, que todavía no son alumnas.",
        f"Vamos a registrar a {NAME}, interesada en {CLASS}, reservarle una clase de prueba gratuita, hacer el seguimiento y convertirla en alumna.",
    ],
    "outro": [
        f"{CONTACT['first']} pasó de contacto a alumna, y su historial de prueba se conservó.",
        "En el próximo capítulo vamos a trabajar con el presentismo y la asistencia.",
    ],
}


def run(rec):
    p = rec.page
    search = p.get_by_label("Buscar contacto por nombre, DNI o teléfono")
    rec.label("Contactos existentes")
    with rec.say("Ingresamos a Contactos desde el menú lateral."):
        rec.click(nav(p, "Contactos"))
    rec.narrate("La sección Posibles alumnos lista a las personas interesadas, con su teléfono y DNI. Cada una abre su historial.")
    with rec.say("El buscador encuentra por nombre, DNI o teléfono. Antes de cargar a alguien, lo buscamos para no duplicarlo. Escribimos su DNI."):
        rec.type(search, CONTACT["dni"], delay=70)
        rec.wait(1)
    with rec.say("No existe, así que lo creamos con Agregar contacto."):
        rec.type(search, "", delay=10)
        rec.click(p.get_by_role("button", name="Agregar contacto"))

    rec.label("Crear un contacto")
    form = modal(p, "Nuevo contacto")
    with rec.say("Se piden los datos básicos: nombre, apellido, teléfono y DNI. El resto se completa más adelante."):
        rec.type(form.get_by_label("Nombre", exact=True), CONTACT["first"])
        rec.type(form.get_by_label("Apellido", exact=True), CONTACT["last"])
    with rec.say("Si el DNI ya pertenece a otra persona, o el teléfono ya está cargado en otro contacto, el sistema avisa para reutilizar esa ficha."):
        rec.type(form.get_by_label("Teléfono", exact=True), CONTACT["phone"])
        rec.type(form.get_by_label("DNI", exact=True), CONTACT["dni"])
    with rec.say("Presionamos Guardar contacto."):
        rec.click(form.get_by_role("button", name="Guardar contacto"), settle=False)
        p.wait_for_url(re.compile(r"/admin/contacts/[0-9a-f]{24}"))
        rec.settle(0.6)

    rec.label("Ficha del contacto")
    rec.narrate("Se abre la ficha del contacto, identificada como Posible alumno. Tiene sus datos, las acciones disponibles y su historial de clases.")
    with rec.say("Con Editar datos se corrigen el nombre, el teléfono o el DNI."):
        rec.hover(p.get_by_role("button", name="Editar datos"))

    rec.label("Interés y observaciones")
    with rec.say("Para registrar su interés y observaciones, abrimos Más opciones."):
        more = p.locator("summary", has_text="Más opciones")
        rec.scroll_to(more)
        rec.click(more, pause=0.4, settle=False)
    with rec.say("Cargamos su email."):
        rec.type(p.get_by_label("Email", exact=True), CONTACT["email"])
    with rec.say(f"Y en Notas, la disciplina que le interesa y cómo nos conoció. La plataforma no tiene estados de seguimiento para contactos: el seguimiento se lleva con estas notas, las reservas y el historial."):
        rec.fill_fast(p.get_by_label("Notas", exact=True), f"Interesada en {CLASS}. Llegó por Instagram. Prefiere horario nocturno. {TAG}")
    with rec.say("También indicamos si acepta recibir novedades y promociones, y guardamos."):
        rec.click(p.get_by_label("Aceptar novedades y promociones"), pause=0.3, settle=False)
        rec.click(p.get_by_role("button", name="Guardar preferencias"), pause=0.3, settle=False)
        rec.expect_text("Preferencias actualizadas")

    rec.label("Reservar una clase de prueba gratuita")
    rec.scroll_top()
    with rec.say("Ahora le reservamos su clase de prueba. Presionamos Reservar clase sin cargo."):
        rec.click(p.get_by_role("button", name="Reservar clase sin cargo"))
    with rec.say("El tipo es Primera prueba gratuita. La otra opción, Cortesía administrativa, se usa para invitar a alguien con un motivo."):
        rec.hover(p.get_by_label(re.compile(r"^Tipo")))
    with rec.say("Elegimos la fecha: hoy."):
        fill_date(rec, p.get_by_label("Fecha", exact=True), iso(today()))
        rec.settle(0.6)
    with rec.say(f"En Clase y horario aparecen las clases de ese día. Elegimos {CLASS}, que tiene la prueba gratuita habilitada."):
        sel = p.get_by_label("Clase y horario")
        value = sel.locator("option").filter(has_text=CLASS).first.get_attribute("value")
        rec.select(sel, value=value)
    with rec.say("Agregamos una nota opcional y presionamos Guardar reserva."):
        rec.type(p.get_by_label("Nota (opcional)"), "Viene con una amiga", delay=35)
        rec.click(p.get_by_role("button", name="Guardar reserva"), settle=False)
        rec.expect_text("Reserva guardada")
    hist = p.get_by_role("heading", name="Historial de clases")
    with rec.say("La prueba aparece en el Historial de clases, en estado Reservada. Cada persona tiene una sola prueba gratuita por clase, y ocupa un lugar en el cupo de ese día."):
        rec.scroll_to(hist, block="start")
        rec.hover(p.get_by_text(re.compile("Reservada")).first)

    rec.label("Seguimiento: asistencia a la prueba")
    with rec.say(f"Cuando {CONTACT['first']} viene a la clase, registramos su asistencia con Registrar presente. Si avisa que no viene, se usa Cancelar."):
        rec.click(p.get_by_role("button", name="Registrar presente"), settle=False)
        rec.expect_text("Presente registrado")
    rec.narrate("La prueba queda registrada como Presente. Las clases de prueba no generan cobros.")

    rec.label("Convertir en alumno")
    rec.scroll_top()
    with rec.say("Le gustó la clase y quiere sumarse. Presionamos Convertir en alumno."):
        rec.click(p.get_by_role("button", name="Convertir en alumno"))
    with rec.say("Se crea su ficha académica. Podemos completar email y fecha de nacimiento."):
        rec.hover(p.get_by_label("Email (opcional)"))
        fill_date(rec, p.get_by_label("Fecha de nacimiento (opcional)"), "2001-08-22")
    with rec.say("Presionamos Confirmar conversión."):
        rec.click(p.get_by_role("button", name="Confirmar conversión"), settle=False)
        p.wait_for_url(re.compile(r"/admin/students/[0-9a-f]{24}"))
        rec.settle(0.8)
    rec.narrate(f"El sistema abre la ficha de alumna de {CONTACT['first']}: se copiaron su nombre, teléfono, DNI y email.")
    with rec.say("En QR e historial se conserva su clase de prueba, con el estado Presente."):
        rec.click(p.get_by_role("button", name=re.compile("^QR e historial")))
        h = p.get_by_role("heading", name="Historial de clases")
        rec.scroll_to(h, block="start")
        rec.hover(h)
    rec.scroll_top()
    with rec.say(f"La conversión no la inscribe en ninguna clase. Lo hacemos ahora: Inscribir, {CLASS}, pagando por clase."):
        rec.click(p.get_by_role("button", name=re.compile("^Resumen")))
        rec.click(p.get_by_role("button", name="Inscribir", exact=True))
        form = modal(p, "Inscribir en una clase")
        rec.select(form.get_by_label(re.compile(r"^Clase(?! de| y)")), label=CLASS)
        rec.select(form.get_by_label("Modalidad de pago"), label="Paga por clase")
        rec.click(form.get_by_role("button", name="Inscribir alumno"), settle=False)
        rec.toast("Alumno inscripto")

    rec.label("Comprobar el resultado")
    with rec.say("Comprobemos en Alumnos: buscamos a Julieta."):
        rec.click(nav(p, "Alumnos"))
        rec.type(p.get_by_placeholder("Nombre, email o teléfono..."), CONTACT["first"], delay=80)
        rec.wait(1)
    rec.narrate("Ya figura como alumna activa.")
    with rec.say("¿Y qué pasó con el contacto original? Vamos a Contactos."):
        rec.click(nav(p, "Contactos"))
    rec.narrate(f"{CONTACT['first']} ya no aparece en Posibles alumnos, porque ahora es alumna. Su contacto no se borra: conserva el historial y sigue vinculado a la ficha académica.")
    rec.narrate("Si una persona interesada pide no ser contactada, desde su ficha se puede eliminar con Eliminar posible alumno, siempre que todavía no sea alumna.")
