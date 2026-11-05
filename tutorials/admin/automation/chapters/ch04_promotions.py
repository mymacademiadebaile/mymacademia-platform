"""Capítulo 5 — Promociones y descuentos."""
import datetime as dt
import re

from .common import CLASS, PROF, confirm_dialog, fill_date, go, iso, modal, today

META = {
    "number": 5, "short": "Promociones",
    "title": "Promociones y descuentos",
    "subtitle": "Porcentajes, descuentos fijos, precio final y 2x1: creación, vigencia, inscripción de parejas y cierre.",
    "learn": ["Dónde se gestionan las promociones", "Crear un 2x1 con su período de inscripción",
              "Inscribir una pareja con 2x1", "Ver el importe calculado y cobrarlo",
              "Crear un descuento por porcentaje", "Cerrar una campaña"],
    "summary": ["Cada promoción pertenece a una clase y cubre todos sus horarios", "El descuento se aplica solo al generar los cobros",
                "En el 2x1 una persona paga y la otra queda bonificada", "Cerrar campaña frena nuevas altas; lo ya emitido se conserva",
                "No puede haber dos promociones iguales superpuestas en la misma clase"],
    "intro": [
        "En este capítulo vamos a trabajar con el módulo comercial: las promociones.",
        f"Vamos a crear un 2x1 para {CLASS}, inscribir a una pareja con ese beneficio, ver cómo se calcula el importe y registrar el cobro. También vamos a crear un descuento por porcentaje y a cerrar una campaña.",
    ],
    "outro": [
        "Las promociones se aplican solas sobre los cobros del período, sin cálculos manuales.",
        "En el próximo capítulo vamos a registrar y gestionar alumnos.",
    ],
}


def _open_class(rec, professor, klass, narration):
    p = rec.page
    with rec.say(narration):
        rec.click(p.locator("aside nav").get_by_role("link", name="Profesores", exact=True))
        rec.click(p.locator("a[href*='/admin/professors/']").filter(has_text=professor).first)
        link = p.locator("a[href*='/admin/classes/']").filter(has_text=klass).first
        rec.scroll_to(link)
        rec.click(link, pause=0.8)


def run(rec):
    p = rec.page
    t = today()
    rec.label("Dónde están las promociones")
    rec.narrate("Las promociones no tienen un menú propio: se crean dentro de cada clase, porque cada promoción pertenece a un grupo y cubre todos sus horarios.")
    _open_class(rec, PROF["display"], CLASS, f"Llegamos a {CLASS} desde el perfil de su profesora: Profesores, {PROF['display']} y, en Clases asignadas, la clase.")
    promos = p.get_by_role("heading", name=re.compile("^Promociones de"))
    with rec.say("Bajamos hasta la sección Promociones de la clase. Todavía no tiene ninguna."):
        rec.scroll_to(promos, block="start")
        rec.hover(promos)

    rec.label("Crear un 2x1")
    with rec.say("Presionamos Crear promoción."):
        rec.click(p.get_by_role("button", name="Crear promoción"))
    form = modal(p, re.compile("^Promoción para"))
    with rec.say("Le damos un nombre claro."):
        rec.type(form.get_by_label("Nombre", exact=True), "2x1 Dancehall de noviembre")
    with rec.say("En Beneficio hay cuatro tipos: Porcentaje, Descuento fijo, Precio final y 2x1. Elegimos 2x1: dos personas se inscriben juntas y una de ellas no paga."):
        rec.select(form.get_by_label(re.compile(r"^Beneficio(?!\s+(desde|hasta))")), label="2x1")
    with rec.say("El 2x1 tiene un período de inscripción: las fechas en que se pueden anotar parejas. Lo dejamos abierto durante esta semana."):
        fill_date(rec, form.get_by_label("Se pueden inscribir hasta"), iso(t + dt.timedelta(days=6)))
    with rec.say("Y una vigencia del beneficio. Con los botones rápidos elegimos un encuentro puntual, una semana o un mes del grupo. Dejamos Un mes del grupo."):
        rec.click(form.get_by_role("button", name="Un mes del grupo"), pause=0.3, settle=False)
        rec.hover(form.get_by_label("Beneficio hasta"))
    rec.narrate("El alcance se toma de la clase: como admite pago mensual y por clase, la promoción alcanza ambas modalidades.")
    with rec.say("Presionamos Crear promoción."):
        rec.click(form.get_by_role("button", name="Crear promoción"), settle=False)
        rec.toast("Promoción creada")
    card = p.locator("article").filter(has_text="2x1 Dancehall de noviembre").first
    with rec.say("La promoción aparece activa, con su vigencia, el período de inscripción y la cantidad de parejas."):
        rec.hover(card.get_by_text("2x1 Dancehall de noviembre"))

    rec.label("Inscribir una pareja con 2x1")
    with rec.say("Para usarla presionamos Inscribir pareja."):
        rec.click(card.get_by_role("button", name="Inscribir pareja"))
    form = modal(p, "Inscribir pareja 2x1")
    rec.narrate("Se eligen dos alumnos que todavía no estén inscriptos en esta clase. Si alguno no existe en el sistema, primero hay que cargarlo en Alumnos.")
    with rec.say("Quién paga: Sofía Medina."):
        rec.select(form.get_by_label("Quién paga"), label="Medina, Sofía")
    with rec.say("Quién recibe el beneficio: Tomás Aguirre."):
        rec.select(form.get_by_label("Quién recibe el beneficio"), label="Aguirre, Tomás")
    with rec.say("Los dos van a pagar con mensualidad, plan de cuatro clases."):
        rec.select(form.get_by_label("Modalidad de ambos"), label="Mensualidad")
        rec.hover(form.get_by_label("Plan mensual"))
    with rec.say("Como empiezan con el mes ya iniciado, elegimos cómo cobrar el primer mes: Proporcional a las clases que quedan."):
        rec.select(form.get_by_label("Primer mes"), label="Proporcional")
    preview = form.get_by_text(re.compile("^Vista previa"))
    with rec.say("La vista previa calcula los importes: cuánto paga Sofía, cuánto paga Tomás, y la bonificación total."):
        preview.wait_for(timeout=10_000)
        rec.zoom(preview.locator("xpath=.."), 6)
        rec.highlight(preview.locator("xpath=.."), 0)
        rec.wait(2.5)
    rec.highlight(None)
    rec.narrate("Tomás, el beneficiario, tiene el cien por ciento de descuento sobre la parte del mes cubierta por la promoción.")
    with rec.say("Presionamos Inscribir a los dos."):
        rec.click(form.get_by_role("button", name="Inscribir a los dos"), settle=False)
        rec.toast("Pareja inscripta con 2x1")
    with rec.say("La tarjeta de la promoción muestra la pareja: Sofía paga y Tomás está bonificado. Si hubo un error, Corregir pareja corta el beneficio indicando el motivo."):
        rec.hover(p.locator("article").filter(has_text="2x1 Dancehall de noviembre").get_by_text(re.compile("paga ·")).first)
    with rec.say("La lista de inscriptos no se actualiza sola después de inscribir la pareja, así que recargamos la página. Ahora los dos figuran en Inscriptos actuales, con la modalidad Mensual."):
        p.reload()
        rec.settle(0.6)
        rec.scroll_to(p.get_by_text("Inscriptos actuales"))
        rec.hover(p.get_by_text("Inscriptos actuales"))

    rec.label("Verificar el importe y cobrar")
    with rec.say("Comprobemos los cobros. Abrimos la ficha de Tomás."):
        rec.click(p.locator("a[href*='/admin/students/']").filter(has_text="Tomás Aguirre").first, pause=0.8)
    pagos = p.get_by_role("heading", name="Pagos")
    with rec.say("En la tarjeta Pagos, su mensualidad de Dancehall figura como Bonificado, con el nombre de la promoción: no tiene nada para pagar."):
        rec.scroll_to(pagos, block="start")
        row = p.locator("[class*=paymentRow]").filter(has_text="Dancehall").first
        rec.highlight(row, 0)
        rec.wait(2)
    rec.highlight(None)
    with rec.say("Ahora vamos a la ficha de Sofía, desde Alumnos."):
        rec.click(p.locator("aside nav").get_by_role("link", name="Alumnos", exact=True))
        rec.type(p.get_by_placeholder("Nombre, email o teléfono..."), "Sofía", delay=70)
        rec.wait(0.8)
        rec.click(p.get_by_role("link", name=re.compile("Sofía Medina")), pause=0.8)
    with rec.say("Su mensualidad proporcional de noviembre figura como Pendiente. Presionamos Cobrar."):
        rec.scroll_to(p.get_by_role("heading", name="Pagos"), block="start")
        row = p.locator("[class*=paymentRow]").filter(has_text="Dancehall").first
        rec.click(row.get_by_role("button", name="Cobrar"))
    form = modal(p, "Registrar cobro")
    with rec.say("Elegimos el medio de pago, por ejemplo Efectivo. La fecha de pago es hoy."):
        rec.select(form.get_by_label("Medio de pago"), label="Efectivo")
    with rec.say("Y presionamos Confirmar cobro."):
        rec.click(form.get_by_role("button", name="Confirmar cobro"), settle=False)
        rec.toast("Cobro registrado")
    rec.narrate("El cobro quedó registrado, la mensualidad figura como Pagado y se generó el recibo. Vamos a profundizar en los cobros en el capítulo de pagos.")

    rec.label("Descuento por porcentaje")
    _open_class(rec, "Lucía Benítez", "Salsa Inicial", "Ahora creamos un descuento por porcentaje en otra clase. Vamos a Salsa Inicial desde el perfil de Lucía Benítez.")
    with rec.say("En su sección de promociones presionamos Crear promoción."):
        rec.scroll_to(p.get_by_role("button", name="Crear promoción"))
        rec.click(p.get_by_role("button", name="Crear promoción"))
    form = modal(p, re.compile("^Promoción para"))
    with rec.say("La llamamos Semana de la salsa."):
        rec.type(form.get_by_label("Nombre", exact=True), "Semana de la salsa")
    with rec.say("En Beneficio elegimos Porcentaje, y un descuento del quince por ciento."):
        rec.select(form.get_by_label(re.compile(r"^Beneficio(?!\s+(desde|hasta))")), label="Porcentaje")
        rec.type(form.get_by_label("Descuento (%)"), "15")
    sunday = t + dt.timedelta(days=(6 - t.weekday()) % 7)
    with rec.say("La vigencia va desde hoy hasta el domingo."):
        fill_date(rec, form.get_by_label("Beneficio desde"), iso(t))
        fill_date(rec, form.get_by_label("Beneficio hasta"), iso(sunday))
    with rec.say("Presionamos Crear promoción."):
        rec.click(form.get_by_role("button", name="Crear promoción"), settle=False)
        rec.toast("Promoción creada")
    rec.narrate("A diferencia del 2x1, este descuento se aplica automáticamente a todos los alumnos del grupo en las clases de esas fechas, al generarse cada cobro.")

    rec.label("Cerrar una campaña")
    _open_class(rec, "Martín Ocampo", "Hip Hop Adolescentes", "Por último, veamos cómo se desactiva una promoción. Vamos a Hip Hop Adolescentes, de Martín Ocampo.")
    with rec.say("Creamos una promoción de prueba con precio final para diciembre."):
        rec.scroll_to(p.get_by_role("button", name="Crear promoción"))
        rec.click(p.get_by_role("button", name="Crear promoción"))
    form = modal(p, re.compile("^Promoción para"))
    first_dec = dt.date(t.year + (1 if t.month == 12 else 0), 12 if t.month != 12 else 12, 1)
    rec.type(form.get_by_label("Nombre", exact=True), "Precio especial de diciembre")
    rec.select(form.get_by_label(re.compile(r"^Beneficio(?!\s+(desde|hasta))")), label="Precio final")
    with rec.say("Precio final de veinte mil pesos para la mensualidad, del 1 al 31 de diciembre."):
        rec.type(form.get_by_label("Precio final ($)"), "20000")
        fill_date(rec, form.get_by_label("Beneficio desde"), iso(first_dec))
        fill_date(rec, form.get_by_label("Beneficio hasta"), iso(first_dec.replace(day=31)))
    with rec.say("Creamos la promoción."):
        rec.click(form.get_by_role("button", name="Crear promoción"), settle=False)
        rec.toast("Promoción creada")
    card = p.locator("article").filter(has_text="Precio especial de diciembre").first
    with rec.say("Las promociones no se editan ni se borran: para terminarlas se usa Cerrar campaña."):
        rec.scroll_to(card)
        rec.click(card.get_by_role("button", name="Cerrar campaña"), settle=False)
        rec.toast("Promoción cerrada para nuevas altas")
    with rec.say("La promoción pasa a Cerrada: deja de aplicarse a los cobros nuevos, y los descuentos ya aplicados se conservan."):
        rec.hover(p.locator("article").filter(has_text="Precio especial de diciembre").get_by_text("Cerrada"))
    rec.narrate("Tené en cuenta que no puede haber dos promociones activas del mismo tipo de cobro con fechas superpuestas en la misma clase: el sistema lo advierte al crearla.")
