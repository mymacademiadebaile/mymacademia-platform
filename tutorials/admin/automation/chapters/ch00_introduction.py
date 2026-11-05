"""Capítulo 1 — Introducción a la plataforma."""
from tutorial_env import admin_credentials

from .common import nav

LOGIN_FIRST = False
START_PATH = "/login"

META = {
    "number": 1, "short": "Introducción",
    "title": "Introducción a la plataforma",
    "subtitle": "Cómo ingresar, leer el panel de inicio y moverse entre los módulos de la administración.",
    "learn": ["Ingresar como administrador", "Leer los indicadores del inicio", "Usar el menú lateral",
              "Consultar notificaciones y tu perfil"],
    "summary": ["Ingresamos con email y contraseña", "El inicio resume alumnos, clases del día y finanzas",
                "El menú lateral lleva a cada módulo", "La campana avisa pagos vencidos y envíos con error"],
    "intro": [
        "Bienvenidos al curso de administración de la plataforma de M&M Academia.",
        "En este primer capítulo vamos a ingresar al sistema, conocer el panel de inicio y recorrer el menú, para familiarizarnos con la interfaz antes de operar.",
        "Todos los datos que vas a ver son ficticios y fueron creados solo para esta capacitación.",
    ],
    "outro": [
        "Listo. Ya sabés cómo ingresar, qué muestra el panel de inicio y dónde está cada módulo.",
        "En el próximo capítulo vamos a revisar la configuración general de la academia.",
    ],
}


def prepare(rec):
    # The login form comes pre-filled with the academy's real address: clear it
    # before recording so it never appears on screen.
    rec.page.get_by_label("Email o usuario").fill("")


def run(rec):
    p = rec.page
    email, pw = admin_credentials()

    rec.label("Pantalla de inicio de sesión")
    rec.narrate("Esta es la pantalla de inicio de sesión. Se accede desde la dirección de la plataforma, en la sección de acceso del equipo.")
    with rec.say("En el campo Email o usuario escribimos el correo de nuestra cuenta de administrador."):
        rec.type(p.get_by_label("Email o usuario"), email, delay=40)
    with rec.say("Luego completamos la contraseña. Por seguridad se muestra oculta; con el ícono del ojo podemos verificarla si hace falta."):
        rec.type(p.locator("input[autocomplete=current-password]"), pw, delay=40)
        rec.hover(p.get_by_role("button", name="Mostrar contraseña"))
    with rec.say("Si olvidamos la clave, el enlace Olvidé mi contraseña envía un correo para crear una nueva."):
        rec.hover(p.get_by_role("link", name="Olvidé mi contraseña"))
    with rec.say("Presionamos Ingresar."):
        rec.click(p.get_by_role("button", name="Ingresar"), settle=False)
        p.wait_for_url("**/admin", timeout=30_000)
        rec.settle(0.8)

    rec.label("Panel de inicio")
    rec.narrate("Ingresamos al panel de inicio de la administración. Su título es Así viene la academia hoy, y reúne la información más importante del día.")
    kpis = p.locator("article")
    with rec.say("En la primera fila hay cuatro indicadores. Alumnos activos muestra cuántos alumnos están habilitados, y debajo, cuántas altas hubo este mes."):
        rec.zoom(kpis.nth(0), 5)
        rec.hover(kpis.nth(0))
    with rec.say("Profesores activos indica el equipo con acceso habilitado. Clases de hoy cuenta las clases programadas para el día."):
        rec.hover(kpis.nth(1))
        rec.wait(1.2)
        rec.hover(kpis.nth(2))
    with rec.say("Y Cobrado este mes suma el dinero efectivamente cobrado en el mes, junto con la cantidad de pagos."):
        rec.hover(kpis.nth(3))
    day = p.get_by_role("heading", name="Clases del día")
    with rec.say("Más abajo está la sección Clases del día: cada fila muestra el horario, la clase, el profesor, los inscriptos sobre el cupo y cómo se cobra."):
        rec.scroll_to(day, block="start")
        rec.highlight(day.locator("xpath=ancestor::*[self::section or self::article][1]"), 0)
        rec.wait(1.5)
    rec.highlight(None)
    with rec.say("Con el botón Abrir entramos a la clase para tomar asistencia y cobrar. Lo vamos a usar en el capítulo de presentismo."):
        rec.hover(p.locator("a[href*='/admin/sessions/']").first)
    with rec.say("Al final están Finanzas, con lo pendiente y lo vencido del período, y Ocupación, con las clases más llenas. Cada tarjeta tiene un acceso directo a Pagos o a Reportes."):
        rec.scroll(500)
        rec.hover(p.get_by_role("link", name="Ir a pagos"))
        rec.wait(0.8)
        rec.hover(p.get_by_role("link", name="Ver reportes"))
    rec.scroll_top()

    rec.label("Menú de navegación")
    rec.narrate("A la izquierda está el menú lateral. Desde acá se accede a todos los módulos. Veamos para qué sirve cada uno.")
    items = [
        ("Inicio", "Inicio vuelve a este panel."),
        ("Calendario", "Calendario muestra todas las clases por mes, semana o día, y desde ahí se crean y modifican clases."),
        ("Profesores", "Profesores administra el equipo docente."),
        ("Alumnos", "Alumnos contiene la ficha completa de cada alumno: datos, clases y pagos."),
        ("Contactos", "Contactos guarda a las personas interesadas que todavía no son alumnas."),
        ("Recepción", "Recepción muestra las llegadas del día y habilita la tablet de asistencia."),
        ("Pagos", "Pagos reúne lo que hay por cobrar y el historial de cobros con sus recibos."),
        ("Comunicaciones", "Comunicaciones envía emails y mensajes de WhatsApp a los alumnos."),
        ("Recordatorios", "Recordatorios prepara avisos de deuda por email."),
        ("Reportes", "Reportes analiza actividad, facturación y caja por período."),
        ("Auditoría", "Auditoría registra las acciones sensibles realizadas por el equipo."),
        ("Configuración", "Configuración define los datos y reglas de la academia."),
        ("Usuarios", "Usuarios administra los accesos de administradores y profesores."),
        ("Mi perfil", "Y Mi perfil permite actualizar nuestros datos y la contraseña."),
    ]
    for name, text in items:
        with rec.say(text, hold=0.25):
            rec.hover(nav(p, name))

    rec.label("Navegar entre módulos")
    with rec.say("Para cambiar de módulo, simplemente hacemos clic. Por ejemplo, entramos a Alumnos."):
        rec.click(nav(p, "Alumnos"))
    rec.narrate("Cada pantalla tiene un encabezado con su nombre y una breve descripción, y arriba a la derecha el botón principal de la sección; en este caso, Nuevo alumno.")
    rec.hover(p.get_by_role("button", name="Nuevo alumno"))
    with rec.say("El elemento resaltado en el menú indica en qué módulo estamos. Volvemos al inicio."):
        rec.click(nav(p, "Inicio"))

    rec.label("Notificaciones y perfil")
    with rec.say("Arriba a la derecha está la campana de notificaciones. El número indica cuántos pagos vencidos y envíos con error requieren atención."):
        rec.click(p.get_by_role("button", name="Notificaciones"), pause=0.6)
    rec.narrate("Desde este panel podemos ir directamente a los pagos vencidos o al centro de notificaciones completo.")
    with rec.say("Lo cerramos. Junto a la campana, el botón con nuestro nombre abre Mi perfil."):
        rec.click(p.get_by_role("button", name="Cerrar", exact=True), pause=0.3)
        rec.hover(p.get_by_role("link", name="Abrir mi perfil"))
    with rec.say("Y abajo a la izquierda, el botón Cerrar sesión finaliza el acceso de forma segura. Conviene usarlo siempre al terminar, sobre todo en computadoras compartidas."):
        rec.hover(p.get_by_role("button", name=__import__("re").compile("Cerrar sesión")))
