"""Capítulo 11 — Calendario y cambios de horario."""
import datetime as dt
import re

from .common import CLASS, PROF, fill_date, iso, modal, nav, next_weekday, today, open_class

META = {
    "number": 11, "short": "Calendario",
    "title": "Calendario y cambios de horario",
    "subtitle": "Vistas, filtros, cambios de una sola clase, reprogramaciones, suplencias, clases extra y cambios recurrentes.",
    "learn": ["Navegar por mes, semana, día y lista", "Filtrar por profesor, clase y estado",
              "Cambiar el horario o el profesor de una sola clase", "Reprogramar y cancelar una fecha",
              "Cambiar un horario recurrente desde una fecha", "Crear una clase extra y avisar a los alumnos"],
    "summary": ["El panel de una fecha cambia solo esa clase", "Reprogramar mueve la clase con sus alumnos y pagos",
                "Cambiar desde… modifica esta y las siguientes", "Las clases ya pasadas nunca se modifican",
                "Avisar prepara mensajes para revisarlos en Comunicaciones"],
    "intro": [
        "En este capítulo vamos a usar el calendario para consultar y modificar clases.",
        "La diferencia clave es entre cambiar una sola fecha y cambiar el horario recurrente del grupo. Vamos a ver los dos casos.",
    ],
    "outro": [
        "Ya sabés hacer cambios puntuales y recurrentes, reprogramar, cancelar, sumar clases extra y avisar a los alumnos.",
        "En el próximo capítulo vamos a consultar los reportes y estadísticas.",
    ],
}


def run(rec):
    p = rec.page
    view = p.get_by_role("group", name="Vista")
    rec.label("Vistas y navegación")
    with rec.say("Abrimos el Calendario. La vista predeterminada es Semana, con las clases de cada día."):
        rec.click(nav(p, "Calendario"))
    with rec.say("Cada tarjeta muestra el horario, la clase, la disciplina, los profesores, la pista y los inscriptos sobre el cupo. Las canceladas o suspendidas se ven atenuadas y con su motivo."):
        rec.hover(p.get_by_role("button", name=re.compile(CLASS)).first)
    with rec.say("La vista Mes da un panorama general. Por ejemplo, el lunes con el feriado que cargamos muestra sus clases suspendidas."):
        rec.click(view.get_by_role("button", name="Mes"), pause=0.8)
        rec.wait(1.5)
    with rec.say("La vista Día ordena las clases por pista, y Lista muestra las próximas dos semanas en orden."):
        rec.click(view.get_by_role("button", name="Día"), pause=0.8)
        rec.wait(1)
        rec.click(view.get_by_role("button", name="Lista"), pause=0.8)
        rec.wait(1)
    with rec.say("Las flechas avanzan o retroceden, y Hoy vuelve a la fecha actual. Regresamos a la vista Semana."):
        rec.click(p.get_by_role("button", name="Siguiente"), pause=0.5)
        rec.click(p.get_by_role("button", name="Hoy", exact=True), pause=0.5)
        rec.click(view.get_by_role("button", name="Semana"), pause=0.8)

    rec.label("Filtros")
    with rec.say("Los filtros permiten ver un profesor, una disciplina, una clase, una pista o un estado. Elegimos la clase."):
        sel = p.get_by_role("combobox", name="Clase")
        value = sel.locator("option").filter(has_text=CLASS).first.get_attribute("value")
        rec.select(sel, value=value)
        rec.settle(0.6)

    rec.label("Cambiar una sola clase: horario y profesor suplente")
    sat = next_weekday(5, include_today=True)
    card = p.get_by_role("button", name=re.compile(rf"11:00.*{CLASS}|{CLASS}.*11:00")).first
    with rec.say(f"Supongamos que el sábado {sat.day} {PROF['display']} no puede dar su clase. Abrimos esa fecha."):
        rec.click(card, pause=0.8)
    drawer = p.get_by_role("dialog", name=CLASS)
    rec.narrate("El panel corresponde solo a esta fecha: muestra su estado, horario, pista, profesores, precios y alumnos, y las acciones disponibles.")
    with rec.say("Presionamos Solo esta clase."):
        rec.click(drawer.get_by_role("button", name="Solo esta clase"))
    form = modal(p, "Cambiar solo esta clase")
    with rec.say("El cambio aplica únicamente a esta fecha. Movemos el horario media hora: de 11:30 a 12:30."):
        rec.type(form.get_by_label("Desde", exact=True), "1130", delay=70)
        rec.type(form.get_by_label("Hasta", exact=True), "1230", delay=70)
    with rec.say("Y asignamos a Lucía Benítez como profesora suplente."):
        prof = form.get_by_label(re.compile("^Profesores"))
        rec.move_to(prof.locator("option", has_text="Lucía Benítez"))
        prof.select_option(label=["Lucía Benítez"])
        rec.wait(0.4)
    with rec.say("Escribimos el motivo y guardamos."):
        rec.type(form.get_by_label(re.compile("^Motivo")), "Reemplazo por viaje de la profesora", delay=30)
        rec.click(form.get_by_role("button", name="Guardar", exact=True), settle=False)
        rec.toast("Cambios guardados para esta clase")
    with rec.say("El panel muestra la etiqueta Suplente, el nuevo horario y a Lucía como profesora de esta fecha. El resto de las clases del grupo no cambia."):
        rec.hover(drawer.get_by_text("Suplente").first)

    rec.label("Avisar a los alumnos afectados")
    with rec.say("Los alumnos afectados son los de la lista de esta clase. Para avisarles, presionamos Avisar."):
        rec.click(drawer.get_by_role("button", name="Avisar"))
    form = modal(p, "Avisar a alumnos y profesores")
    with rec.say("El mensaje viene precargado y se puede editar. Presionamos Preparar avisos."):
        rec.hover(form.get_by_label("Mensaje"))
        rec.click(form.get_by_role("button", name="Preparar avisos"), settle=False)
        rec.toast("Avisos preparados en Comunicaciones")
    rec.narrate("Los avisos no se envían todavía: quedan preparados en Comunicaciones para revisarlos y enviarlos.")
    rec.click(drawer.get_by_role("button", name="Cerrar"), pause=0.3, settle=False)

    rec.label("Reprogramar una fecha")
    with rec.say("Ahora vamos a la semana siguiente con la flecha."):
        rec.click(p.get_by_role("button", name="Siguiente"), pause=0.8)
    wed = next_weekday(2)
    with rec.say(f"Abrimos la clase del miércoles {wed.day}."):
        rec.click(p.get_by_role("button", name=re.compile(rf"21:00.*{CLASS}|{CLASS}.*21:00")).first, pause=0.8)
    drawer = p.get_by_role("dialog", name=CLASS)
    with rec.say("Esa noche el salón no está disponible. Presionamos Reprogramar."):
        rec.click(drawer.get_by_role("button", name="Reprogramar"))
    form = modal(p, "Reprogramar")
    thu = wed + dt.timedelta(days=1)
    with rec.say("Elegimos la nueva fecha, el jueves, en el mismo horario."):
        fill_date(rec, form.get_by_label("Nueva fecha"), iso(thu))
    with rec.say("Indicamos el motivo y presionamos Reprogramar."):
        rec.type(form.get_by_label(re.compile("^Motivo")), "Salón ocupado por un evento", delay=30)
        rec.click(form.get_by_role("button", name="Reprogramar", exact=True), settle=False)
        rec.toast("Clase reprogramada")
    rec.narrate("La clase aparece ahora el jueves con la etiqueta Reprogramada, con los mismos alumnos. Lo que se haya pagado por la clase original cubre la nueva: no se cobra dos veces.")
    rec.settle(0.5)
    rec.click(drawer.get_by_role("button", name="Cerrar"), pause=0.4, settle=False)

    rec.label("Cancelar una fecha")
    with rec.say("Si una clase directamente no se dicta, se usa Cancelar. Abrimos la clase del sábado siguiente."):
        rec.click(p.get_by_role("button", name=re.compile(rf"11:00.*{CLASS}|{CLASS}.*11:00")).first, pause=0.8)
    drawer = p.get_by_role("dialog", name=CLASS)
    with rec.say("Presionamos Cancelar."):
        rec.click(drawer.get_by_role("button", name="Cancelar", exact=True))
    form = modal(p, "Cancelar la clase")
    with rec.say("Se pide un motivo. La asistencia y los pagos ya registrados se conservan. Confirmamos."):
        rec.type(form.get_by_label("Motivo", exact=True), "Jornada institucional", delay=30)
        rec.click(form.get_by_role("button", name="Confirmar"), settle=False)
        rec.toast("Clase cancelada")
    rec.narrate("Suspender funciona de forma parecida, pero deja la clase en espera para reprogramarla después o restaurarla.")
    rec.click(drawer.get_by_role("button", name="Cerrar"), pause=0.3, settle=False)

    rec.label("Clase extra")
    with rec.say("Para sumar una fecha fuera del horario habitual, como un ensayo, usamos Clase extra."):
        rec.click(p.get_by_role("button", name="Clase extra"))
    form = modal(p, "Clase extraordinaria")
    sun = next_weekday(6)
    with rec.say(f"Elegimos la clase, la fecha, el domingo {sun.day}, y el horario de 16 a 18."):
        sel = form.get_by_label(re.compile(r"^Clase(?! de| y)"))
        value = sel.locator("option").filter(has_text=CLASS).first.get_attribute("value")
        rec.select(sel, value=value)
        fill_date(rec, form.get_by_label("Fecha", exact=True), iso(sun))
        rec.type(form.get_by_label("Desde", exact=True), "1600", delay=70)
        rec.type(form.get_by_label("Hasta", exact=True), "1800", delay=70)
    with rec.say("Agregamos una nota y presionamos Crear clase."):
        rec.type(form.get_by_label("Notas"), "Ensayo general", delay=35)
        rec.click(form.get_by_role("button", name="Crear clase", exact=True), settle=False)
        rec.toast("Clase extra creada")

    rec.label("Cambiar el horario recurrente")
    open_class(rec, PROF["display"], CLASS, f"Por último, un cambio permanente. Los horarios recurrentes se cambian desde la ficha de la clase: abrimos {CLASS}.")
    sched = p.get_by_role("heading", name="Horarios y vigencia")
    rule = p.locator("li, div").filter(has_text=re.compile(r"Sábado 11:00")).filter(has=p.get_by_role("button", name="Cambiar desde…")).last
    with rec.say("En Horarios y vigencia, el horario del sábado de 11 a 12 tiene el botón Cambiar desde. Lo presionamos."):
        rec.scroll_to(sched, block="start")
        rec.click(rule.get_by_role("button", name="Cambiar desde…"))
    form = modal(p, "Cambiar esta y las siguientes")
    start = next_weekday(5, after=next_weekday(5)) + dt.timedelta(days=7)
    with rec.say("Las clases desde la fecha elegida pasan al nuevo horario, con los mismos alumnos, asistencias y pagos. Las anteriores no cambian. Elegimos la fecha de inicio."):
        fill_date(rec, form.get_by_label("Desde", exact=True), iso(start))
    with rec.say("Y el nuevo horario: de 10 a 11."):
        rec.type(form.get_by_label("Desde las"), "1000", delay=70)
        rec.type(form.get_by_label("Hasta las"), "1100", delay=70)
    with rec.say("Guardamos."):
        rec.click(form.get_by_role("button", name="Guardar", exact=True), settle=False)
        rec.toast("Horario actualizado desde la fecha elegida")
    with rec.say("El horario anterior queda con fecha de fin y aparece el nuevo, que rige desde la fecha indicada."):
        rec.hover(sched)
    rec.narrate("Las fechas que habíamos modificado a mano, como la suplencia, se mantienen. Y Finalizar termina un horario desde una fecha: las clases futuras sin movimientos se eliminan y las que tienen asistencia o pagos quedan canceladas.")
