"""Capítulo 4 — Creación y configuración de clases."""
import re

from .common import CLASS, DISCIPLINE, PISTA, PROF, confirm_dialog, go, modal

META = {
    "number": 4, "short": "Clases",
    "title": "Creación y configuración de clases",
    "subtitle": "Disciplina, profesor, pista, cupo, modalidad de cobro, precios, clase de prueba y horarios.",
    "learn": ["Crear una clase desde el calendario", "Elegir disciplina, público, nivel y profesor",
              "Definir cupo, modalidad y precios", "Cargar días y horarios", "Ver la clase en el calendario",
              "Editar valores y entender sus efectos"],
    "summary": ["Las clases se crean desde Calendario › Nueva clase", "La modalidad define si se cobra por clase, mensual o ambas",
                "El cupo se controla en cada horario", "Gestionar clase reúne horarios, precios, promociones y alumnos",
                "Cambiar un precio no modifica cobros ya emitidos", "Inactivar conserva el historial; eliminar solo sin actividad"],
    "intro": [
        "Este capítulo es central: vamos a crear una clase desde cero y configurar todos sus parámetros.",
        f"Vamos a crear {CLASS}, dictada por {PROF['display']} en la pista {PISTA}, con cobro por clase o mensual y clase de prueba gratuita.",
    ],
    "outro": [
        f"{CLASS} ya está creada, con sus horarios, precios y clase de prueba, y aparece en el calendario.",
        "En el próximo capítulo vamos a crear promociones e inscribir alumnos con descuento.",
    ],
}


def _pick(rec, form, summary_text, label):
    details = form.locator(f"details:has(> summary:has-text(\"{summary_text}\"))")
    rec.click(details.locator("summary"), pause=0.25, settle=False)
    rec.click(details.get_by_label(label, exact=True), pause=0.3, settle=False)
    rec.click(form.locator("details[open] > summary"), pause=0.2, settle=False)


def run(rec):
    p = rec.page
    rec.label("Dónde se crean las clases")
    go(rec, "Calendario", "Las clases se crean desde el Calendario. Lo abrimos desde el menú lateral.")
    rec.narrate("El calendario muestra, por defecto, la semana actual con todas las clases programadas. Arriba a la derecha está el botón Nueva clase.")

    rec.label("Nueva clase: datos del grupo")
    with rec.say("Lo presionamos."):
        rec.click(p.get_by_role("button", name="Nueva clase"))
    form = modal(p, "Crear clase")
    rec.narrate("El formulario define el grupo, la modalidad de cobro y los horarios. Empezamos por la sede y la pista.")
    with rec.say(f"La sede es La Plata. En Pista elegimos {PISTA}, la que creamos en la configuración."):
        rec.select(form.get_by_label(re.compile("^Pista")), label=PISTA)
    with rec.say("Escribimos el nombre de la clase."):
        rec.type(form.get_by_label("Nombre de la clase"), CLASS)
    with rec.say(f"En Profesores abrimos la lista y marcamos a {PROF['display']}."):
        _pick(rec, form, "Seleccionar profesores", PROF["display"])
    with rec.say(f"En Disciplinas elegimos {DISCIPLINE}."):
        _pick(rec, form, "Seleccionar disciplinas", DISCIPLINE)
    with rec.say("En Público, Adultos."):
        _pick(rec, form, "Seleccionar público", "Adultos")
    with rec.say("Y en Niveles, Inicial. Todas estas opciones provienen de los catálogos de la configuración."):
        _pick(rec, form, "Seleccionar niveles", "Inicial")

    rec.label("Cupo, modalidad y precios")
    with rec.say("El cupo es la cantidad máxima de alumnos por horario. Lo fijamos en 20."):
        rec.type(form.get_by_label("Cupo", exact=True), "20")
    with rec.say("La modalidad de cobro puede ser Por clase, Mensual, o Por clase y mensual. Elegimos esta última, para que cada alumno pueda optar."):
        rec.select(form.get_by_label("Modalidad de cobro"), label="Por clase y mensual")
    with rec.say("Ahora cargamos los precios: el valor de cada clase suelta,"):
        rec.type(form.get_by_label("Precio por clase (ARS)"), "7000")
    with rec.say("el plan mensual de cuatro clases,"):
        rec.type(form.get_by_label("Mensual · 4 clases (ARS)"), "25000")
    with rec.say("y el plan mensual de ocho clases. Si no ofrecemos uno de los planes, se deja vacío."):
        rec.type(form.get_by_label(re.compile(r"^Mensual · 8 clases")), "44000")
    with rec.say("Activamos la clase de prueba, que permite una primera clase sin cargo para quien quiere conocerla."):
        rec.click(form.get_by_role("switch"), pause=0.3, settle=False)

    rec.label("Días y horarios")
    rows = form.locator("[class*='scheduleEditorRow']")
    with rec.say("En Horarios definimos los días. Primer horario: miércoles, de 21 a 22."):
        rec.select(rows.nth(0).locator("select"), label="Miércoles")
        rec.type(rows.nth(0).locator("input[type=time]").nth(0), "2100", delay=60)
        rec.type(rows.nth(0).locator("input[type=time]").nth(1), "2200", delay=60)
    with rec.say("Con Agregar horario sumamos otro día: sábado, de 11 a 12."):
        rec.click(form.get_by_role("button", name="Agregar horario"), pause=0.2, settle=False)
        rec.select(rows.nth(1).locator("select"), label="Sábado")
        rec.type(rows.nth(1).locator("input[type=time]").nth(0), "1100", delay=60)
        rec.type(rows.nth(1).locator("input[type=time]").nth(1), "1200", delay=60)
    rec.narrate("La duración de la clase surge de la hora de inicio y de fin de cada horario. Con el ícono de papelera se quita un horario.")
    with rec.say("Revisamos todo y presionamos Crear clase."):
        rec.click(form.get_by_role("button", name="Crear clase", exact=True), settle=False)
        rec.toast("Clase creada")
    rec.narrate("El sistema controla que la profesora y la pista estén libres en esos horarios, y genera automáticamente las clases de las próximas semanas.")

    rec.label("Ver la clase en el calendario")
    with rec.say(f"Para encontrarla rápido, filtramos el calendario por profesor: elegimos {PROF['display']}."):
        rec.select(p.get_by_role("combobox", name="Profesor"), label=PROF["display"])
        rec.settle(0.5)
    card = p.get_by_role("button", name=re.compile(CLASS)).first
    with rec.say("Ahí están sus clases de la semana, con el horario, la disciplina, la profesora, la pista y los inscriptos sobre el cupo."):
        rec.hover(card)
    with rec.say("Las vistas Mes, Semana, Día y Lista, y las flechas, permiten recorrer el calendario. Lo vamos a ver en detalle en el capítulo de horarios."):
        rec.hover(p.get_by_role("group", name="Vista"))
    with rec.say("Hacemos clic en una clase para abrir su panel."):
        rec.click(card, pause=0.6)
    drawer = p.get_by_role("dialog", name=CLASS)
    rec.narrate("Este panel corresponde a una fecha puntual: muestra la fecha, el horario, la pista, los precios y los alumnos de ese día, con acciones para esa clase.")
    with rec.say("Para configurar el grupo completo usamos Gestionar clase."):
        rec.click(drawer.get_by_role("link", name="Gestionar clase"), pause=0.8)

    rec.label("Gestión de la clase")
    rec.narrate("Esta es la ficha de la clase. Arriba está su estado, Clase activa, la profesora, los precios y la clase de prueba disponible.")
    with rec.say("Los indicadores muestran inscriptos, cupo total, lugares disponibles y cantidad de horarios semanales."):
        rec.hover(p.get_by_text("Disponibles", exact=True).first)
    sched = p.get_by_role("heading", name="Horarios y vigencia")
    with rec.say("En Horarios y vigencia figura cada horario recurrente con su fecha de inicio, la pista y la profesora. Desde acá se agregan horarios, se cambian a partir de una fecha o se finalizan."):
        rec.scroll_to(sched, block="start")
        rec.hover(sched)
    with rec.say("El interruptor Mostrar en la web publica la clase en el horario público, siempre que su ritmo esté publicado."):
        rec.hover(p.get_by_role("switch", name=re.compile("Mostrar en la web")))
    with rec.say("Más abajo están las promociones del grupo, el formulario para inscribir alumnos, las clases de prueba y los inscriptos actuales. Los vamos a usar en los próximos capítulos."):
        rec.scroll_to(p.get_by_text("Inscriptos actuales"))
        rec.hover(p.get_by_text("Inscriptos actuales"))
    rec.scroll_top()

    rec.label("Editar la clase")
    with rec.say("Para modificar valores presionamos Editar clase."):
        rec.click(p.get_by_role("button", name="Editar clase"))
    form = modal(p, "Editar clase")
    rec.narrate("Acá se pueden cambiar la sede, la pista, el nombre, el cupo, la modalidad, los precios, los profesores, las categorías y los horarios.")
    with rec.say("Por ejemplo, ampliamos el cupo a 22 alumnos."):
        rec.type(form.get_by_label("Cupo", exact=True), "22")
    with rec.say("Y actualizamos el precio por clase a 7.500 pesos."):
        rec.type(form.get_by_label("Precio por clase (ARS)"), "7500")
    with rec.say("En Profesores se cambia o se suma un profesor; si se cambia, el nuevo profesor pasa a ver todas las clases del grupo en su portal."):
        rec.hover(form.get_by_label(re.compile(r"^Profesores")))
    with rec.say("Presionamos Guardar."):
        rec.click(form.get_by_role("button", name="Guardar", exact=True), settle=False)
        rec.toast("Clase actualizada")
    rec.narrate("Importante: los nuevos precios se aplican a los cobros que se generen desde ahora. Los cobros ya emitidos conservan su importe original.")
    rec.narrate("Tampoco se puede bajar el cupo por debajo de los alumnos ya inscriptos en un horario: el sistema lo impide.")

    rec.label("Inactivar o eliminar")
    with rec.say("Por último, los botones Inactivar y Eliminar."):
        rec.hover(p.get_by_role("button", name="Inactivar"))
    rec.narrate("Inactivar retira la clase de la operación: desde hoy no se generan más clases y se cierran sus inscripciones vigentes, pero se conservan asistencias, pagos y deudas.")
    with rec.say("Eliminar borra la clase definitivamente, y solo se permite si no tuvo ninguna actividad: alumnos, cobros, pruebas ni clases realizadas. Lo demostramos en el capítulo de funciones adicionales."):
        rec.hover(p.get_by_role("button", name="Eliminar"))
