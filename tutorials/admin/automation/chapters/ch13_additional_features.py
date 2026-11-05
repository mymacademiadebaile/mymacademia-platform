"""Capítulo 14 — Funciones adicionales."""
import re

from .common import STUDENT, confirm_dialog, modal, nav, next_weekday, open_class

NAME = f"{STUDENT['first']} {STUDENT['last']}"

META = {
    "number": 14, "short": "Funciones adicionales",
    "title": "Funciones adicionales",
    "subtitle": "Comunicaciones, recordatorios de deuda, credencial QR, sedes, pausa y eliminación de clases, perfil, usuarios y recuperación de contraseña.",
    "learn": ["Enviar emails y WhatsApp a alumnos", "Recordatorios de deuda", "Credencial QR de asistencia",
              "Nuevas sedes", "Pausar y eliminar clases", "Mi perfil, usuarios y contraseña"],
    "summary": ["Comunicaciones envía emails segmentados y deja historial", "Recordatorios avisa deudas respetando preferencias",
                "La credencial QR se muestra una sola vez", "Pausar suspende clases sin perder inscripciones",
                "Solo se elimina una clase sin actividad", "Mi perfil cambia datos y contraseña"],
    "intro": [
        "En este último capítulo vamos a recorrer funciones adicionales que completan la administración.",
        "Comunicaciones, recordatorios de deuda, credenciales QR, sedes, pausa y eliminación de clases, el perfil, los usuarios y la recuperación de contraseña.",
    ],
    "outro": [
        "Con esto completamos el recorrido por todas las funciones de la administración.",
        "Ya podés configurar la academia, organizar profesores y clases, gestionar alumnos, promociones, inscripciones y cobros, atender contactos, controlar la asistencia y analizar los reportes. ¡Éxitos!",
    ],
}


def prepare(rec):
    # WhatsApp links would open external sites: answer them locally so nothing leaves the environment.
    rec.context.route(re.compile(r"https://(wa\.me|web\.whatsapp\.com|api\.whatsapp\.com)/.*"),
                      lambda route: route.fulfill(status=200, content_type="text/html",
                                                  body="<h1>WhatsApp (bloqueado en el entorno de capacitación)</h1>"))
    rec.context.add_init_script("window.print = () => {};")


def run(rec):
    p = rec.page

    rec.label("Comunicaciones: email")
    with rec.say("Empezamos por Comunicaciones, desde el menú lateral."):
        rec.click(nav(p, "Comunicaciones"))
    rec.narrate("Hay dos canales: Email, para envíos segmentados con seguimiento por destinatario, y WhatsApp, que abre la conversación con un mensaje precargado.")
    with rec.say("En Destinatarios se elige a todos los alumnos con email, a los de una clase o a un alumno en particular. Elegimos un alumno en particular."):
        rec.select(p.get_by_label("Destinatarios"), label="Un alumno en particular")
    with rec.say(f"Seleccionamos a {NAME}."):
        sel = p.get_by_label(re.compile(r"^Alumno"))
        value = sel.locator("option").filter(has_text=NAME).first.get_attribute("value")
        rec.select(sel, value=value)
    with rec.say("Escribimos el asunto y el mensaje. La etiqueta nombre entre llaves se reemplaza por el nombre de cada alumno."):
        rec.type(p.get_by_label("Asunto"), "Ensayo general del domingo", delay=30)
        rec.fill_fast(p.get_by_label("Mensaje"), "Hola {{nombre}}, te esperamos el domingo a las 16 para el ensayo general de Dancehall. ¡Nos vemos!")
    with rec.say("Presionamos Enviar email y confirmamos."):
        rec.click(p.get_by_role("button", name="Enviar email"))
        rec.click(confirm_dialog(p).get_by_role("button", name="Enviar email"), settle=False)
        rec.toast("Envío terminado")
    with rec.say("El historial de comunicaciones registra cada envío con su estado. Si un email falla, se puede reintentar desde ahí."):
        rec.scroll_to(p.get_by_text(re.compile("registros encontrados")))
        rec.hover(p.get_by_text(re.compile("registros encontrados")))
    rec.narrate("En este entorno de capacitación los correos se capturan localmente y no llegan a nadie. En la academia real, el envío a Todos los alumnos con email llega efectivamente a todos, así que conviene revisar bien el mensaje antes de confirmar.")

    rec.label("Comunicaciones: WhatsApp")
    rec.scroll_top()
    with rec.say("En WhatsApp se elige el alumno, se escribe el mensaje y Abrir WhatsApp abre la conversación en una pestaña nueva, registrando la acción en el historial."):
        rec.click(p.get_by_role("button", name=re.compile("^WhatsApp")))
        rec.wait(0.8)

    rec.label("Recordatorios de deuda")
    with rec.say("Ahora Recordatorios, para avisar deudas por email."):
        rec.click(nav(p, "Recordatorios"))
    with rec.say("Primero se habilitan para toda la academia. Marcamos Habilitar recordatorios por email."):
        rec.click(p.get_by_label("Habilitar recordatorios por email"), pause=0.3, settle=False)
    with rec.say("Se definen los días mínimos entre recordatorios y, opcionalmente, un envío programado automático. Lo dejamos apagado y guardamos."):
        rec.click(p.get_by_role("button", name="Guardar configuración"), settle=False)
        rec.expect_text("Configuración guardada")
    with rec.say("Para preparar un recordatorio buscamos al alumno: Micaela Ferreyra."):
        rec.type(p.get_by_placeholder("Nombre, apellido o email"), "Ferreyra", delay=70)
        rec.wait(0.8)
        sel = p.get_by_label("Destinatario")
        value = sel.locator("option").filter(has_text="Micaela").first.get_attribute("value")
        rec.select(sel, value=value)
        rec.settle(0.6)
    with rec.say("La vista previa muestra su saldo pendiente y vencido, el destinatario, el asunto y el texto del mensaje, que es cordial y detalla los conceptos."):
        rec.hover(p.get_by_label("Vista previa del mensaje"))
    with rec.say("Presionamos Enviar recordatorio y confirmamos."):
        rec.click(p.get_by_role("button", name="Enviar recordatorio"))
        rec.click(confirm_dialog(p).get_by_role("button", name="Enviar email"), settle=False)
        rec.expect_text("Recordatorio enviado")
    rec.narrate("El historial de la persona registra el envío, y el sistema respeta la frecuencia mínima para no insistir de más.")

    rec.label("Credencial QR de asistencia")
    with rec.say(f"Las credenciales QR permiten registrar la asistencia escaneando en la tablet. Abrimos la ficha de {NAME}."):
        rec.click(nav(p, "Alumnos"))
        rec.type(p.get_by_placeholder("Nombre, email o teléfono..."), STUDENT["first"], delay=70)
        rec.wait(0.8)
        rec.click(p.get_by_role("link", name=re.compile(NAME)), pause=0.8)
        rec.click(p.get_by_role("button", name=re.compile("^QR e historial")))
    with rec.say("Presionamos Generar credencial."):
        rec.click(p.get_by_role("button", name="Generar credencial"), pause=0.8)
    with rec.say("La credencial se muestra una única vez, con el QR personal. Se descarga como imagen o se imprime en tamaño tarjeta. Si se pierde, se renueva y el QR anterior deja de funcionar."):
        rec.hover(p.get_by_role("img", name=re.compile("Credencial de alumno")))
        rec.wait(1)
        rec.hover(p.get_by_role("button", name="Descargar credencial"))

    rec.label("Nuevas sedes")
    with rec.say("Si la academia abre otra ubicación, se carga en Configuración, pestaña Sedes. Presionamos Nueva sede."):
        rec.click(nav(p, "Configuración"))
        rec.click(p.get_by_role("tab", name="Sedes"))
        rec.click(p.get_by_role("button", name="Nueva sede"))
    form = modal(p, "Nueva sede")
    with rec.say("Nombre y dirección, y guardamos."):
        rec.type(form.get_by_label("Nombre", exact=True), "Sede City Bell (demo)", delay=30)
        rec.type(form.get_by_label("Dirección"), "Calle 14 y 473, City Bell", delay=30)
        rec.click(form.get_by_role("button", name="Guardar", exact=True), settle=False)
        rec.toast("Sede creada")
    with rec.say("Como es una prueba, la desactivamos: deja de estar disponible para nuevas operaciones."):
        card = p.locator("article").filter(has_text="Sede City Bell (demo)").first
        rec.click(card.get_by_role("button", name="Desactivar"))
        rec.click(confirm_dialog(p).get_by_role("button", name="Desactivar"), settle=False)
        rec.toast("Sede desactivada")

    rec.label("Pausar una clase")
    open_class(rec, "Martín Ocampo", "Hip Hop Adolescentes", "Una clase puede pausarse, por ejemplo durante vacaciones. Abrimos Hip Hop Adolescentes.")
    with rec.say("En Horarios y vigencia presionamos Pausar."):
        rec.scroll_to(p.get_by_role("heading", name="Horarios y vigencia"), block="start")
        rec.click(p.get_by_role("button", name="Pausar"))
    form = modal(p, "Pausar la clase")
    with rec.say("Indicamos desde cuándo, opcionalmente hasta cuándo, y el motivo."):
        rec.type(form.get_by_label("Motivo"), "Receso de mitad de año", delay=30)
        rec.click(form.get_by_role("button", name="Pausar", exact=True), settle=False)
        rec.toast("Clase en pausa")
    rec.narrate("Durante la pausa no se generan clases regulares y las ya programadas quedan suspendidas. Las inscripciones y el historial se conservan.")
    with rec.say("Para retomarla presionamos Reanudar."):
        rec.click(p.get_by_role("button", name="Reanudar"), settle=False)
        rec.toast("Clase reanudada")

    rec.label("Eliminar una clase sin actividad")
    with rec.say("Ahora veamos cómo se elimina una clase. Creamos una clase de prueba desde el Calendario, con Nueva clase."):
        rec.click(nav(p, "Calendario"))
        rec.click(p.get_by_role("button", name="Nueva clase"))
    form = modal(p, "Crear clase")
    with rec.say("Completamos lo mínimo: la pista y el nombre."):
        rec.select(form.get_by_label(re.compile("^Pista")), label="Salón B")
        rec.type(form.get_by_label("Nombre de la clase"), "Clase de prueba para eliminar", delay=25)
    with rec.say("El profesor y las categorías: disciplina, público y nivel."):
        for summary, label in (("Seleccionar profesores", "Martín Ocampo"), ("Seleccionar disciplinas", "Urbano"),
                               ("Seleccionar público", "Adolescentes"), ("Seleccionar niveles", "Inicial")):
            details = form.locator(f"details:has(> summary:has-text(\"{summary}\"))")
            rec.click(details.locator("summary"), pause=0.15, settle=False)
            rec.click(details.get_by_label(label, exact=True), pause=0.15, settle=False)
            rec.click(form.locator("details[open] > summary"), pause=0.15, settle=False)
    with rec.say("El precio por clase y un horario: domingo, de 10 a 11."):
        rec.type(form.get_by_label("Precio por clase (ARS)"), "5000", delay=40)
        row = form.locator("[class*='scheduleEditorRow']").nth(0)
        rec.select(row.locator("select"), label="Domingo")
        rec.type(row.locator("input[type=time]").nth(0), "1000", delay=50)
        rec.type(row.locator("input[type=time]").nth(1), "1100", delay=50)
    with rec.say("Y presionamos Crear clase."):
        rec.click(form.get_by_role("button", name="Crear clase", exact=True), settle=False)
        rec.toast("Clase creada")
    with rec.say("La abrimos desde el calendario y entramos a Gestionar clase."):
        rec.click(p.get_by_role("button", name=re.compile("Clase de prueba para eliminar")).first, pause=0.8)
        rec.click(p.get_by_role("dialog", name="Clase de prueba para eliminar").get_by_role("link", name="Gestionar clase"), pause=0.8)
    with rec.say("Como no tuvo ninguna actividad, se puede eliminar. Presionamos Eliminar."):
        rec.click(p.get_by_role("button", name="Eliminar", exact=True))
    with rec.say("El aviso aclara que solo se borra si no tiene alumnos, cobros, pruebas ni clases realizadas. Confirmamos con Eliminar definitivamente."):
        rec.click(confirm_dialog(p).get_by_role("button", name="Eliminar definitivamente"), settle=False)
        rec.toast("Clase eliminada definitivamente")
    rec.narrate("Si la clase tuviera historial, el sistema lo impediría y sugeriría Inactivar, para conservar la información.")

    rec.label("Mi perfil")
    with rec.say("En Mi perfil actualizamos nuestros datos personales. Cambiamos el teléfono y presionamos Guardar datos."):
        rec.click(nav(p, "Mi perfil"))
        rec.type(p.get_by_label("Teléfono", exact=True), "221 555-0199", delay=35)
        rec.click(p.get_by_role("button", name="Guardar datos"), settle=False)
        rec.toast("Tus datos se guardaron correctamente")
    with rec.say("La tarjeta Acceso y alcance muestra el rol, la academia y las sedes habilitadas. En Seguridad se cambia la contraseña: al guardarla, la sesión se cierra para volver a ingresar."):
        rec.scroll_to(p.get_by_role("button", name="Cambiar contraseña"))
        rec.hover(p.get_by_role("button", name="Cambiar contraseña"))

    rec.label("Eliminar un usuario")
    with rec.say("En Usuarios, el acceso de prueba que creamos se puede eliminar con el ícono de papelera."):
        rec.click(nav(p, "Usuarios"))
        rec.click(p.get_by_role("button", name="Eliminar a Daniela Suárez"), settle=False)
        rec.toast("Usuario eliminado correctamente")
    rec.narrate("El navegador pide confirmar, porque es una acción definitiva. No se puede eliminar la propia cuenta, ni a un profesor con clases vinculadas.")

    rec.label("Recuperar la contraseña")
    with rec.say("Por último, si alguien olvida su contraseña: cerramos sesión."):
        rec.click(p.get_by_role("button", name=re.compile("Cerrar sesión")), settle=False)
        p.wait_for_url("**/login**")
        rec.settle(0.5)
    with rec.say("En la pantalla de ingreso presionamos Olvidé mi contraseña."):
        rec.click(p.get_by_role("link", name="Olvidé mi contraseña"))
    with rec.say("Escribimos el email de la cuenta y presionamos Enviar enlace."):
        rec.type(p.get_by_label("Email", exact=True), "admin.tutorial@example.com", delay=35)
        rec.click(p.get_by_role("button", name="Enviar enlace"), settle=False)
        rec.expect_text("Si existe una cuenta activa")
    rec.narrate("El sistema envía un enlace de un solo uso, válido por treinta minutos, para definir una nueva contraseña.")
