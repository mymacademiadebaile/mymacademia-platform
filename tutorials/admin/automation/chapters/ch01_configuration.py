"""Capítulo 2 — Configuración general."""
import re

from .common import DISCIPLINE, PISTA, TAG, confirm_dialog, go, modal, nav, next_weekday, iso, fill_date

META = {
    "number": 2, "short": "Configuración",
    "title": "Configuración general",
    "subtitle": "Datos de la academia, reglas operativas, catálogos, pistas, feriados, cobros y usuarios administrativos.",
    "learn": ["Datos e identidad de la academia", "Reglas de cancelación y canales",
              "Ritmos, públicos y niveles", "Pistas de baile y feriados", "Reglas de cobro de mensualidades",
              "Usuarios y roles del sistema"],
    "summary": ["Configuración guarda los datos y reglas generales", "Los catálogos se usan al crear clases y profesores",
                "Las pistas evitan superponer clases", "Un feriado suspende las clases de ese día",
                "Las reglas de cobro definen el vencimiento mensual", "Usuarios crea accesos de administradores y profesores"],
    "intro": [
        "En este capítulo vamos a revisar la configuración general de la academia.",
        "Son los datos y reglas que conviene completar antes de empezar a operar: identidad, reglas de cancelación, catálogos de ritmos, pistas, feriados, cobros y usuarios.",
    ],
    "outro": [
        "Con la configuración completa, la academia está lista para operar.",
        "Antes de empezar, conviene revisar los datos de la academia, cargar los ritmos y las pistas, y definir el vencimiento de la mensualidad.",
        "En el próximo capítulo vamos a dar de alta a una profesora.",
    ],
}


def run(rec):
    p = rec.page
    rec.label("Ingresar a Configuración")
    go(rec, "Configuración", "Ingresamos a Configuración desde el menú lateral.")
    rec.narrate("La pantalla está organizada en pestañas: Academia, Consultas, Operación, Canales, Landing, Sedes, Catálogos y Pistas, feriados y cobros.")
    with rec.say("Las primeras cuatro pestañas comparten un mismo botón Guardar cambios, ubicado al pie, así que podemos editar varias y confirmar todo junto."):
        rec.hover(p.get_by_role("button", name="Guardar cambios"))

    rec.label("Identidad de la academia")
    with rec.say("En la pestaña Academia están el nombre, el email institucional y el teléfono. Estos datos se usan dentro del sistema y en las comunicaciones."):
        rec.hover(p.get_by_label("Nombre de la academia"))
    with rec.say("Actualizamos el teléfono de la academia."):
        rec.type(p.get_by_label("Teléfono", exact=True), "+54 9 221 555-0100")

    rec.label("Consultas e inscripciones")
    with rec.say("En Consultas definimos un único responsable para atender a las personas interesadas, y su WhatsApp."):
        rec.click(p.get_by_role("tab", name="Consultas"))
    with rec.say("Escribimos Administración como responsable."):
        rec.type(p.get_by_label("Responsable de consultas"), "Administración")
    with rec.say("Y el número de WhatsApp de consultas e inscripción."):
        rec.type(p.get_by_label("WhatsApp de consultas e inscripción"), "+54 9 221 555-0100")
    rec.narrate("Como indica la nota, los profesores no reciben contactos públicos de forma directa: todas las consultas se centralizan en la administración.")

    rec.label("Reglas operativas")
    with rec.say("En Operación se define la zona horaria de la academia y la anticipación mínima para cancelar un turno."):
        rec.click(p.get_by_role("tab", name="Operación"))
    with rec.say("Por ejemplo, con seis horas, un alumno no puede cancelar su lugar en una clase si faltan menos de seis horas para que empiece."):
        rec.hover(p.get_by_label(re.compile("Anticipación mínima")))

    rec.label("Canales públicos")
    with rec.say("En Canales se cargan las redes sociales que se muestran en el pie de la página web."):
        rec.click(p.get_by_role("tab", name="Canales"))
    with rec.say("Completamos, por ejemplo, el enlace de Instagram."):
        rec.type(p.get_by_label("Instagram", exact=True), "https://www.instagram.com/academia.demo.tutorial")
    with rec.say("El envío de correos por Gmail figura como Administrado: sus credenciales están protegidas y no se editan desde esta pantalla."):
        rec.hover(p.get_by_text("Envíos por Gmail"))
    with rec.say("Presionamos Guardar cambios."):
        rec.click(p.get_by_role("button", name="Guardar cambios"), settle=False)
        rec.toast("Configuración general guardada")
    rec.narrate("El aviso verde confirma que la configuración general se guardó correctamente.")

    rec.label("Landing pública")
    with rec.say("La pestaña Landing permite reemplazar las tres fotos del collage de la página web pública: una vertical, una horizontal y una de detalle."):
        rec.click(p.get_by_role("tab", name="Landing"))
    rec.narrate("Se usa el botón Cargar imagen de cada tarjeta. En este entorno de capacitación el almacenamiento de imágenes no está conectado, por eso no vamos a subir archivos.")

    rec.label("Sedes")
    with rec.say("En Sedes se administran las ubicaciones de la academia. Hoy tenemos la sede La Plata, activa."):
        rec.click(p.get_by_role("tab", name="Sedes"))
    with rec.say("Con Editar se cambian el nombre y la dirección; con Desactivar, la sede deja de estar disponible para nuevas operaciones. El botón Nueva sede agrega otra ubicación."):
        rec.hover(p.get_by_role("button", name="Editar").first)
        rec.wait(0.6)
        rec.hover(p.get_by_role("button", name="Nueva sede"))

    rec.label("Catálogos: ritmos, público y niveles")
    with rec.say("La pestaña Catálogos es muy importante: contiene los ritmos o disciplinas, el público y los niveles que después se eligen al crear clases y profesores."):
        rec.click(p.get_by_role("tab", name="Catálogos"))
    rec.narrate("Así, nadie escribe categorías a mano y la información queda ordenada. Cada opción muestra en cuántas clases y profesores se usa, y si está activa.")
    ritmos = p.locator("section").filter(has=p.get_by_text("Ritmos / disciplinas", exact=True)).last
    with rec.say(f"Vamos a agregar un ritmo nuevo: {DISCIPLINE}. Lo escribimos en el campo Agregar de la columna Ritmos."):
        rec.type(ritmos.get_by_placeholder("Agregar..."), DISCIPLINE)
    with rec.say("Y presionamos el botón con el signo más."):
        rec.click(ritmos.get_by_role("button", name="Agregar"), settle=False)
        rec.toast("Opción agregada")
    item = ritmos.locator("li, div").filter(has_text=re.compile(rf"^{DISCIPLINE}")).last
    with rec.say(f"{DISCIPLINE} ya aparece en la lista, al final y activo. Con las flechas podemos cambiar el orden en que se muestra."):
        rec.scroll_to(ritmos.get_by_text(DISCIPLINE, exact=True))
        rec.hover(ritmos.get_by_text(DISCIPLINE, exact=True))
    with rec.say("El lápiz cambia el nombre en todas las pantallas, y el botón de pausa desactiva la opción para nuevas selecciones, sin perder el historial."):
        rec.hover(ritmos.get_by_role("button", name="Editar nombre").last)
    with rec.say("Los ritmos también tienen una ficha web, con la descripción que se muestra en la página pública."):
        rec.click(p.get_by_role("button", name=f"Ficha web de {DISCIPLINE}"))
    form = modal(p, re.compile("Ficha web"))
    with rec.say("Completamos la descripción corta."):
        rec.type(form.get_by_label(re.compile("^Descripción corta")), "Ritmo jamaiquino con mucha energía, ideal para empezar desde cero.", delay=25)
    rec.narrate("Para publicarlo en la web también hace falta una imagen de portada; mientras tanto, el ritmo queda disponible dentro del sistema. Guardamos.")
    with rec.say("Presionamos Guardar."):
        rec.click(form.get_by_role("button", name="Guardar", exact=True), settle=False)
        rec.toast("Ficha web guardada")

    rec.label("Pistas de baile")
    with rec.say("Pasamos a Pistas, feriados y cobros."):
        rec.click(p.get_by_role("tab", name="Pistas, feriados y cobros"))
    rec.narrate("Las pistas son los salones donde se dictan las clases. El sistema impide superponer dos clases en la misma pista, y al crear una clase hay que elegir una.")
    with rec.say("Creamos una nueva con el botón Nueva pista."):
        rec.click(p.get_by_role("button", name="Nueva pista"))
    form = modal(p, "Nueva pista")
    with rec.say(f"La llamamos {PISTA}."):
        rec.type(form.get_by_label("Nombre", exact=True), PISTA)
    with rec.say("Indicamos su capacidad en personas."):
        rec.type(form.get_by_label("Capacidad (personas)"), "25")
    with rec.say("El estado queda en Disponible, y anotamos su disponibilidad horaria."):
        rec.type(form.get_by_label("Disponibilidad"), "Turno tarde y noche")
    with rec.say("Presionamos Guardar."):
        rec.click(form.get_by_role("button", name="Guardar", exact=True), settle=False)
        rec.toast("Pista creada")
    rec.narrate(f"{PISTA} ya figura en la lista, con su capacidad y el estado Disponible. Haciendo clic sobre una pista se puede editar o pasar a mantenimiento.")

    rec.label("Feriados")
    holiday = next_weekday(0) + __import__("datetime").timedelta(days=14)
    with rec.say("En Feriados se cargan los días sin actividad. Presionamos Cargar feriado."):
        rec.scroll_to(p.get_by_role("button", name="Cargar feriado"))
        rec.click(p.get_by_role("button", name="Cargar feriado"))
    form = modal(p, "Cargar feriado")
    with rec.say("Elegimos la fecha."):
        fill_date(rec, form.get_by_label("Fecha", exact=True), iso(holiday))
    with rec.say("Le ponemos un nombre. La sede queda en Todas las sedes."):
        rec.type(form.get_by_label("Nombre", exact=True), "Feriado de ejemplo")
    with rec.say("Y presionamos Cargar."):
        rec.click(form.get_by_role("button", name="Cargar", exact=True), settle=False)
        rec.toast("Feriado cargado")
    rec.narrate("Importante: las clases regulares de ese día quedan suspendidas automáticamente. Después se pueden reprogramar desde el calendario, o quitar el feriado con el ícono de la papelera.")

    rec.label("Reglas de cobro")
    cobros = p.get_by_label("Día de vencimiento de la mensualidad")
    with rec.say("Por último, en Cobros se define el día del mes en que vence la mensualidad."):
        rec.scroll_to(cobros)
        rec.hover(cobros)
    with rec.say("Lo fijamos en el día 10."):
        rec.type(cobros, "10")
    with rec.say("La opción Alta a mitad de mes indica cómo se calcula la primera cuota de un alumno que empieza con el mes ya iniciado. Dejamos Preguntar en cada alta, para decidirlo en cada inscripción."):
        rec.select(p.get_by_label("Alta a mitad de mes"), label="Preguntar en cada alta")
    with rec.say("Presionamos Guardar reglas."):
        rec.click(p.get_by_role("button", name="Guardar reglas"), settle=False)
        rec.toast("Reglas de cobro guardadas")

    rec.label("Usuarios y roles")
    go(rec, "Usuarios", "Ahora veamos los usuarios del sistema. Entramos a Usuarios.")
    rec.narrate("Acá se crean y administran los accesos. Hay dos roles: Administrador, con acceso completo a esta administración, y Profesor, que solo ingresa a su portal para ver sus clases y alumnos y tomar asistencia.")
    with rec.say("Arriba podemos buscar por nombre o email y filtrar por rol y por estado."):
        rec.hover(p.get_by_placeholder("Nombre, email o usuario..."))
    with rec.say("Creamos un acceso para una persona de recepción. Presionamos Nuevo usuario."):
        rec.click(p.get_by_role("button", name="Nuevo usuario"))
    form = modal(p, "Crear usuario")
    with rec.say("El rol queda en Administrador."):
        rec.hover(form.get_by_label("Rol"))
    with rec.say("Completamos nombre y apellido."):
        rec.type(form.get_by_label("Nombre", exact=True), "Daniela")
        rec.type(form.get_by_label("Apellido", exact=True), "Suárez")
    with rec.say("El email con el que va a ingresar."):
        rec.type(form.get_by_label("Email de acceso"), "daniela.suarez@example.com")
    with rec.say("Opcionalmente, un nombre de usuario y un teléfono."):
        rec.type(form.get_by_label("Nombre de usuario (opcional)"), "daniela.recepcion")
        rec.type(form.get_by_label("Teléfono", exact=True), "221 555-0180")
    with rec.say("Una contraseña inicial de al menos diez caracteres, con letras y números, que después le compartimos por un canal seguro."):
        rec.type(form.get_by_label(re.compile("^Contraseña inicial")), "Recepcion-2026a")
    with rec.say("Y la sede en la que trabaja."):
        sedes = form.get_by_label("Sedes")
        rec.move_to(sedes)
        sedes.select_option(index=0)
        rec.wait(0.4)
    with rec.say("Presionamos Crear usuario."):
        rec.click(form.get_by_role("button", name="Crear usuario"), settle=False)
        rec.toast("Usuario creado correctamente")
    row = p.locator("article").filter(has_text="Daniela Suárez")
    with rec.say("La nueva usuaria aparece en la lista, con su rol y el estado Activo."):
        rec.hover(row.get_by_text("Daniela Suárez"))
    with rec.say("Si una persona deja de trabajar en la academia, usamos Desactivar: pierde el acceso pero se conserva el historial."):
        rec.click(row.get_by_role("button", name="Desactivar"), settle=False)
        rec.toast("Usuario desactivado")
    rec.narrate("Como el filtro muestra solo usuarios activos, ya no aparece en la lista. Cambiamos el filtro a Todos para volver a verla.")
    status = p.locator("select").filter(has=p.locator("option", has_text="Inactivos"))
    rec.select(status, label="Todos")
    with rec.say("Y la reactivamos con Activar."):
        rec.click(p.locator("article").filter(has_text="Daniela Suárez").get_by_role("button", name="Activar"), settle=False)
        rec.toast("Usuario activado")
    rec.narrate("Con Editar se actualizan sus datos o se define una nueva contraseña, y con el ícono de papelera se elimina el acceso de forma definitiva. Para conservar el historial, conviene desactivar en lugar de eliminar.")
