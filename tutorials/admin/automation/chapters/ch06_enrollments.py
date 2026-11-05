"""Capítulo 7 — Inscripción de alumnos a clases."""
import re

from .common import (CLASS, PROF, STUDENT, confirm_dialog, enrolled_row, modal, nav, open_class,
                     open_session_today, select_containing)

NAME = f"{STUDENT['first']} {STUDENT['last']}"

META = {
    "number": 7, "short": "Inscripciones",
    "title": "Inscripción de alumnos a clases",
    "subtitle": "Mensualidad, clase por clase, clase suelta de un día, promociones, varias clases y cambios posteriores.",
    "learn": ["A · Inscripción con mensualidad", "B · Inscripción por clase y clase suelta de un día",
              "C · Inscripción con promoción", "D · Un alumno en varias clases",
              "E · Cambiar plan, modalidad o dar de baja"],
    "summary": ["La ficha de la clase permite elegir modalidad, plan, turnos, fecha y primer mes",
                "La ficha del alumno inscribe rápido en otra clase", "Agregar solo a esta fecha suma una clase suelta",
                "Las promociones vigentes se aplican solas al cobro", "Las bajas conservan el historial y permiten reinscribir"],
    "intro": [
        "Este es uno de los capítulos más importantes: cómo inscribir alumnos en las clases.",
        f"Vamos a inscribir a {NAME} con mensualidad, por clase, en una clase suelta y con una promoción vigente. Después vamos a ver cómo modificar o dar de baja una inscripción.",
    ],
    "outro": [
        f"{NAME} ya participa de varias clases con distintas modalidades, y vimos cómo modificar y dar de baja inscripciones.",
        "En el próximo capítulo vamos a cobrar todo lo que generaron estas inscripciones.",
    ],
}


def run(rec):
    p = rec.page

    # ---------------------------------------------------------------- A
    rec.label("A · Inscripción con mensualidad")
    rec.mark("A")
    open_class(rec, PROF["display"], CLASS, f"Escenario A: inscripción con mensualidad. Abrimos {CLASS} desde el perfil de {PROF['display']}.")
    card = p.locator("#class-enroll-card")
    with rec.say("Bajamos hasta la tarjeta Inscripción, Agregar alumno. Los pasos están numerados."):
        rec.scroll_to(card, block="center")
        rec.hover(card.get_by_text("Agregar alumno"))
    selects = card.locator("select")
    with rec.say(f"Paso uno: elegimos a la alumna. La lista muestra los alumnos activos de la sede que todavía no están en esta clase. Elegimos a {NAME}."):
        select_containing(rec, selects.nth(0), NAME)
    with rec.say("Paso dos: cómo paga. Como la clase admite ambas modalidades, elegimos Mensual."):
        select_containing(rec, selects.nth(1), "Mensual")
    with rec.say("Paso tres: el plan mensual. Elegimos el plan de cuatro clases."):
        select_containing(rec, card.locator("select").nth(2), "Plan de 4")
    with rec.say("En Días y horarios podemos elegir en qué turnos participa. Si no marcamos ninguno, queda inscripta en todos."):
        rec.hover(card.get_by_text("Días y horarios"))
    with rec.say("La fecha de inicio es hoy."):
        rec.hover(card.get_by_label("Fecha de inicio"))
    with rec.say("Como empieza con el mes ya iniciado, hay que definir el cobro del primer mes: cuota completa, proporcional o un importe personalizado. Elegimos Proporcional a las clases que quedan."):
        select_containing(rec, card.locator("select").last, "Proporcional")
    with rec.say("Presionamos Inscribir alumno."):
        rec.click(card.get_by_role("button", name="Inscribir alumno"), settle=False)
        rec.toast("Alumno inscripto")
    row = enrolled_row(p, NAME)
    with rec.say(f"{STUDENT['first']} aparece en Inscriptos actuales, con modalidad Mensual y plan de cuatro clases. La cuota proporcional del mes ya quedó generada para cobrar."):
        rec.scroll_to(row)
        rec.highlight(row, 0)
        rec.wait(1.5)
    rec.highlight(None)

    # ---------------------------------------------------------------- B
    rec.label("B · Inscripción por clase")
    rec.mark("B")
    with rec.say("Escenario B: inscripción por clase, sin mensualidad. Esta vez lo hacemos desde la ficha de la alumna: hacemos clic en su nombre."):
        rec.click(row.get_by_role("link"), pause=0.8)
    with rec.say("En la tarjeta Inscripciones presionamos Inscribir."):
        rec.scroll_to(p.get_by_role("button", name="Inscribir", exact=True))
        rec.click(p.get_by_role("button", name="Inscribir", exact=True))
    form = modal(p, "Inscribir en una clase")
    with rec.say("Elegimos la clase Salsa Inicial."):
        rec.select(form.get_by_label(re.compile(r"^Clase(?! de| y)")), label="Salsa Inicial")
    with rec.say("Esta clase se cobra por clase: la alumna paga solo las clases a las que asiste."):
        rec.hover(form.get_by_text(re.compile("Modalidad de esta clase")))
    with rec.say("En Turnos habituales marcamos los dos días."):
        boxes = form.get_by_role("checkbox")
        for i in range(boxes.count()):
            if not boxes.nth(i).is_checked():
                rec.click(boxes.nth(i), pause=0.2, settle=False)
    with rec.say("Y presionamos Inscribir alumno."):
        rec.click(form.get_by_role("button", name="Inscribir alumno"), settle=False)
        rec.toast("Alumno inscripto")

    rec.label("B · Clase suelta de un solo día")
    rec.narrate("Para alguien que quiere tomar una única clase, sin inscribirse al grupo, se lo agrega solo a esa fecha.")
    drawer = open_session_today(rec, "Bachata Intermedio", "Vamos al Calendario, vista Día, y abrimos la clase de hoy de Bachata Intermedio.")
    with rec.say("En la sección Alumnos presionamos Agregar solo a esta fecha."):
        rec.click(drawer.get_by_role("button", name="Agregar solo a esta fecha"))
    form = modal(p, "Agregar alumno a esta clase")
    with rec.say(f"Buscamos a {STUDENT['first']} por su nombre."):
        rec.type(form.get_by_placeholder("Nombre, email, teléfono o DNI"), STUDENT["first"], delay=80)
        result = form.get_by_role("button", name=re.compile(NAME)).first
        result.wait_for()
        rec.click(result, pause=0.3, settle=False)
    with rec.say("El tipo queda en Autorizado, clase suelta o invitado. También existe Recupera una clase, para quien recupera una clase perdida."):
        rec.hover(form.get_by_label(re.compile(r"^Tipo")))
    with rec.say("Presionamos Agregar."):
        rec.click(form.get_by_role("button", name="Agregar", exact=True), settle=False)
        rec.toast("Alumno agregado a esta clase")
    with rec.say("La alumna figura en la lista de hoy con la etiqueta Autorizado. El cupo se respeta, y su cobro se registra como una clase individual."):
        part = drawer.locator("[class*='participant']").filter(has_text=NAME).first
        rec.scroll_to(part)
        rec.highlight(part, 0)
        rec.wait(1.5)
    rec.highlight(None)
    rec.click(drawer.get_by_role("button", name="Cerrar"), pause=0.3, settle=False)

    # ---------------------------------------------------------------- C
    rec.label("C · Inscripción con promoción")
    rec.mark("C")
    rec.narrate("Escenario C: inscripción con promoción. Salsa Inicial tiene esta semana la promoción Semana de la salsa, con quince por ciento de descuento.")
    drawer = open_session_today(rec, "Salsa Inicial", "Abrimos la clase de hoy de Salsa Inicial.")
    part = drawer.locator("[class*='participant']").filter(has_text=NAME).first
    with rec.say(f"{STUDENT['first']} ya figura en la lista por su inscripción. Al marcarla presente, se genera el cobro de esta clase con la promoción aplicada."):
        rec.scroll_to(part)
        rec.click(part.get_by_role("button", name="Presente"), settle=False)
        rec.toast("Presente registrado")
    with rec.say("El estado de pago muestra la clase pendiente de cobro. Veamos el importe en su ficha."):
        rec.hover(part)
    rec.click(drawer.get_by_role("button", name="Cerrar"), pause=0.3, settle=False)
    with rec.say("Vamos a Alumnos y abrimos su ficha."):
        rec.click(nav(p, "Alumnos"))
        rec.type(p.get_by_placeholder("Nombre, email o teléfono..."), STUDENT["first"], delay=70)
        rec.wait(0.8)
        rec.click(p.get_by_role("link", name=re.compile(NAME)), pause=0.8)
    salsa = p.locator("[class*=paymentRow]").filter(has_text="Salsa").first
    with rec.say("En Pagos aparece la clase de Salsa con el nombre de la promoción: el importe ya tiene descontado el quince por ciento. No hubo que calcular nada a mano."):
        rec.scroll_to(p.get_by_role("heading", name="Pagos"), block="start")
        rec.highlight(salsa, 0)
        rec.zoom(salsa, 4.5)
        rec.wait(3)
    rec.highlight(None)

    # ---------------------------------------------------------------- D
    rec.label("D · Varias clases")
    rec.mark("D")
    with rec.say(f"Escenario D: un alumno en varias clases. En la tarjeta Inscripciones vemos que {STUDENT['first']} participa de {CLASS} con mensualidad y de Salsa Inicial por clase, cada una con sus turnos."):
        rec.scroll_to(p.get_by_role("heading", name="Inscripciones"), block="start")
        rec.hover(p.get_by_role("heading", name="Inscripciones"))
        rec.wait(1)
    rec.narrate("Para sumar otra disciplina se repite Inscribir: la lista solo ofrece las clases en las que todavía no está inscripta. Y la tarjeta Clases activas resume cuántas tiene.")

    # ---------------------------------------------------------------- E
    rec.label("E · Modificaciones posteriores")
    rec.mark("E")
    open_class(rec, PROF["display"], CLASS, f"Escenario E: modificaciones. Los cambios de plan y de modalidad se hacen desde la clase. Volvemos a {CLASS}.")
    row = enrolled_row(p, NAME)
    with rec.say(f"En la fila de {STUDENT['first']}, el selector Plan mensual permite pasar al plan de ocho clases."):
        rec.scroll_to(row)
        select_containing(rec, row.locator("select").last, "8 clases")
    with rec.say("El sistema aclara que las cuotas ya generadas no cambian de importe y que las próximas usarán el nuevo precio. Confirmamos con Cambiar plan."):
        rec.click(confirm_dialog(p).get_by_role("button", name="Cambiar plan"), settle=False)
        rec.toast("Plan mensual actualizado")
    rec.narrate("De la misma forma, el selector de modalidad pasa a un alumno de mensual a por clase, o al revés, sin modificar sus pagos históricos.")

    open_class(rec, "Lucía Benítez", "Bachata Intermedio", "Ahora veamos una baja. Abrimos Bachata Intermedio, de Lucía Benítez.")
    row = enrolled_row(p, "Micaela Ferreyra")
    with rec.say("Micaela Ferreyra deja de venir a esta clase. En su fila presionamos el ícono de papelera, Dar de baja."):
        rec.scroll_to(row)
        rec.click(row.get_by_title("Dar de baja"))
    with rec.say("Confirmamos. El historial se conserva."):
        rec.click(confirm_dialog(p).get_by_role("button", name="Dar de baja"), settle=False)
        rec.toast("Inscripción dada de baja")
    hist = p.get_by_text(re.compile(r"^Inscripciones anteriores"))
    with rec.say("Micaela pasa a Inscripciones anteriores, con su fecha de alta y de baja. Si vuelve, el botón Inscribir la reincorpora en un paso."):
        rec.scroll_to(hist)
        rec.click(hist, pause=0.4, settle=False)
        rec.hover(p.locator("[class*='historyRow']").filter(has_text="Micaela").get_by_role("button", name="Inscribir"))
    rec.narrate("Y para corregir datos personales de un alumno se usa Editar en su ficha, como vimos en el capítulo anterior.")
