"""Capítulo 3 — Administración de profesores."""
import re

from .common import DISCIPLINE, PROF, confirm_dialog, go, modal

META = {
    "number": 3, "short": "Profesores",
    "title": "Administración de profesores",
    "subtitle": "Alta, búsqueda, edición, acceso, disciplinas y estado de cada profesor.",
    "learn": ["Buscar y filtrar profesores", "Dar de alta un profesor con su acceso", "Editar datos y disciplinas",
              "Restablecer la contraseña", "Inactivar y reactivar", "Consultar sus clases asignadas"],
    "summary": ["Nuevo profesor crea el perfil y su acceso al portal", "Las disciplinas salen de los catálogos",
                "Editar actualiza datos, sedes y disciplinas", "Inactivar conserva el historial",
                "Solo se elimina un profesor sin clases vinculadas"],
    "intro": [
        "En este capítulo vamos a administrar al equipo de profesores.",
        f"Vamos a dar de alta a una profesora ficticia, {PROF['display']}, que va a dictar {DISCIPLINE}. La vamos a usar en los próximos capítulos.",
    ],
    "outro": [
        f"{PROF['display']} ya forma parte del equipo, con su acceso, sus disciplinas y su sede.",
        "En el próximo capítulo vamos a crear su clase y configurar horarios y precios.",
    ],
}


def _multi(rec, select, labels):
    for label in labels:
        rec.move_to(select.locator("option", has_text=label).first)
    select.select_option(label=labels)
    rec.wait(0.4)


def run(rec):
    p = rec.page
    rec.label("Listado de profesores")
    go(rec, "Profesores", "Ingresamos a Profesores desde el menú lateral.")
    rec.narrate("Vemos el equipo actual en tarjetas: foto o iniciales, estado, contacto y disciplinas de cada profesor.")
    with rec.say("Arriba tenemos un buscador por nombre o email, y filtros por sede, disciplina y estado."):
        rec.hover(p.get_by_placeholder("Nombre o email..."))
    with rec.say("Por ejemplo, buscamos Lucía."):
        rec.type(p.get_by_placeholder("Nombre o email..."), "Lucía", delay=80)
        rec.wait(1.0)
    with rec.say("La lista se filtra mientras escribimos. Borramos la búsqueda."):
        rec.type(p.get_by_placeholder("Nombre o email..."), "", delay=10)
        rec.wait(0.8)
    with rec.say("Con estos dos botones alternamos entre la vista en tarjetas y la vista en lista."):
        rec.click(p.get_by_role("button", name="Ver profesores en lista"), pause=0.6)
        rec.wait(0.6)
        rec.click(p.get_by_role("button", name="Ver profesores en tarjetas"), pause=0.6)

    rec.label("Alta de una profesora")
    with rec.say("Para dar de alta a un profesor presionamos Nuevo profesor."):
        rec.click(p.get_by_role("button", name="Nuevo profesor"))
    form = modal(p, "Agregar profesor")
    rec.narrate("En un solo paso se crea su perfil, su acceso al portal de profesores, sus sedes y disciplinas.")
    with rec.say("Completamos nombre y apellido."):
        rec.type(form.get_by_label("Nombre", exact=True), PROF["first"])
        rec.type(form.get_by_label("Apellido", exact=True), PROF["last"])
    with rec.say("El nombre visible es el que se muestra en el calendario y en la web."):
        rec.type(form.get_by_label("Nombre visible", exact=True), PROF["display"])
    with rec.say("Cargamos su teléfono y el email con el que va a ingresar."):
        rec.type(form.get_by_label("Teléfono", exact=True), PROF["phone"])
        rec.type(form.get_by_label("Email de acceso"), PROF["email"])
    with rec.say("Definimos una contraseña inicial de al menos diez caracteres, que luego le compartimos por un canal seguro."):
        rec.type(form.get_by_label("Contraseña inicial"), PROF["password"])
    with rec.say("Elegimos su sede."):
        _multi(rec, form.get_by_label("Sedes"), ["La Plata"])
    with rec.say(f"Y sus disciplinas. La lista sale del catálogo que configuramos: elegimos {DISCIPLINE} y Reggaetón."):
        _multi(rec, form.get_by_label("Disciplinas"), [DISCIPLINE, "Reggaetón"])
    with rec.say("Opcionalmente, su Instagram, una descripción corta para la web y una biografía."):
        rec.type(form.get_by_label("Instagram"), PROF["instagram"])
        rec.fill_fast(form.get_by_label(re.compile("^Descripción corta para la web")), PROF["short"])
        rec.fill_fast(form.get_by_label("Bio"), PROF["bio"])
    with rec.say("Presionamos Guardar."):
        rec.click(form.get_by_role("button", name="Guardar", exact=True), settle=False)
        rec.toast("Profesor creado correctamente")
        rec.settle(0.6)

    rec.label("Perfil del profesor")
    rec.narrate("El sistema abre directamente el perfil de la profesora. Arriba vemos su estado, Profesor activo, y los botones Email, Editar, Acceso, Inactivar y Eliminar.")
    with rec.say("Los indicadores muestran sus clases activas, alumnos actuales, disciplinas y sedes. Por ahora no tiene clases asignadas."):
        rec.hover(p.get_by_text("Clases activas").first)
    with rec.say("Más abajo están sus datos de perfil y acceso, y las sedes y disciplinas asignadas."):
        rec.scroll(380)
        rec.hover(p.get_by_text("Sedes y disciplinas"))
    with rec.say("La tarjeta Publicación en la web indica qué falta para mostrarla en la página pública: estar activa, tener foto y descripción corta."):
        rec.hover(p.get_by_text("Publicación en la web"))
    with rec.say("Y en Material comercial se cargan su foto de perfil y un video corto de presentación."):
        rec.scroll_to(p.get_by_text("Material comercial"))
        rec.hover(p.get_by_text("Material comercial"))
    with rec.say("Al final, Clases asignadas lista sus clases y horarios. Se completará cuando le asignemos su clase."):
        rec.scroll_to(p.get_by_text("Clases asignadas"))
        rec.hover(p.get_by_text("Clases asignadas"))
    rec.scroll_top()

    rec.label("Editar datos y disciplinas")
    with rec.say("Para modificar sus datos presionamos Editar."):
        rec.click(p.get_by_role("button", name="Editar", exact=True))
    form = modal(p, "Editar profesor")
    with rec.say("Podemos corregir cualquier dato. Por ejemplo, además de sus disciplinas actuales le asignamos Urbano."):
        _multi(rec, form.get_by_label("Disciplinas"), [DISCIPLINE, "Reggaetón", "Urbano"])
    with rec.say("Presionamos Guardar."):
        rec.click(form.get_by_role("button", name="Guardar", exact=True), settle=False)
        rec.toast("Perfil del profesor actualizado")
    rec.narrate("El perfil ya muestra las tres disciplinas.")

    rec.label("Restablecer acceso")
    with rec.say("Si la profesora olvida su contraseña, el botón Acceso permite definirle una nueva."):
        rec.click(p.get_by_role("button", name="Acceso"))
    form = modal(p, "Restablecer acceso")
    rec.narrate("Se escribe dos veces la nueva contraseña y se guarda. En este caso no la cambiamos, así que presionamos Cancelar.")
    rec.click(form.get_by_role("button", name="Cancelar"))

    rec.label("Inactivar y reactivar")
    with rec.say("Cuando un profesor deja de dar clases, se lo inactiva. Presionamos Inactivar."):
        rec.click(p.get_by_role("button", name="Inactivar"))
    with rec.say("El sistema pide confirmación y aclara que sus datos e historial se conservan. Confirmamos."):
        rec.click(confirm_dialog(p).get_by_role("button", name="Inactivar"), settle=False)
        rec.toast("Profesor inactivado")
    rec.narrate("El estado cambió a Profesor inactivo: ya no está disponible para nuevas asignaciones.")
    with rec.say("Como la vamos a necesitar, la reactivamos con Reactivar."):
        rec.click(p.get_by_role("button", name="Reactivar"))
        rec.click(confirm_dialog(p).get_by_role("button", name="Reactivar"), settle=False)
        rec.toast("Profesor reactivado")
    rec.narrate("El botón Eliminar borra al profesor definitivamente, pero solo se permite si no tiene clases vinculadas. Si ya dictó clases, lo correcto es inactivarlo.")

    rec.label("Clases y horarios de un profesor")
    with rec.say("Para ver las clases y horarios de un profesor, volvemos al listado."):
        rec.click(p.get_by_role("link", name="Volver a profesores"))
    with rec.say("Y abrimos el perfil de Lucía Benítez, que ya tiene clases."):
        rec.click(p.locator("a[href*='/admin/professors/']").filter(has_text="Lucía Benítez").first)
    with rec.say("Sus indicadores muestran clases activas y alumnos actuales."):
        rec.hover(p.get_by_text("Alumnos actuales").first)
    with rec.say("Y en Clases asignadas aparecen sus clases con los horarios y el cupo. Cada una es un enlace a la gestión de la clase."):
        rec.scroll_to(p.get_by_text("Clases asignadas"))
        rec.hover(p.locator("a[href*='/admin/classes/']").first)
    rec.narrate("Así se relacionan los módulos: cada clase tiene uno o más profesores, y desde el perfil del profesor llegamos a sus clases y alumnos.")
