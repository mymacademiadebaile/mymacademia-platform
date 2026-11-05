"""Capítulo 8 — Cobros y gestión de pagos."""
import re

from .common import STUDENT, modal, nav, open_session_today, select_containing

NAME = f"{STUDENT['first']} {STUDENT['last']}"

META = {
    "number": 8, "short": "Cobros",
    "title": "Cobros y gestión de pagos",
    "subtitle": "Por cobrar, mensualidades, clases sueltas, promociones, cobros parciales, deudas, recibos y anulaciones.",
    "learn": ["Consultar lo pendiente y lo vencido", "Cobrar una mensualidad", "Cobrar una clase individual",
              "Cobrar un importe con promoción", "Cobros parciales e importes extra",
              "Recibos, historial y anulación de cobros"],
    "summary": ["Pagos › Por cobrar lista cuotas y clases pendientes del mes", "Los medios son efectivo, transferencia, tarjeta u otro",
                "Cada cobro genera un recibo numerado en PDF", "Un cobro mal cargado se anula con motivo; nada se borra",
                "Las deudas vencidas se ven con el filtro Vencidos y en Alumnos"],
    "intro": [
        "En este capítulo recorremos el circuito financiero completo: qué hay por cobrar, cómo registrar cada tipo de cobro, los recibos y cómo corregir errores.",
        "Todos los importes son ficticios y no se usan medios de pago reales: el sistema solo registra los cobros que la academia recibe.",
    ],
    "outro": [
        "Ya sabés registrar cobros de mensualidades, clases sueltas e importes con promoción, emitir recibos y anular un cobro cargado por error.",
        "En el próximo capítulo vamos a gestionar contactos y posibles alumnos.",
    ],
}


def _row(p, *texts):
    loc = p.locator("article")
    for t in texts:
        loc = loc.filter(has_text=t)
    return loc.first


def run(rec):
    p = rec.page
    rec.label("Dónde consultar los pagos")
    with rec.say("Ingresamos a Pagos desde el menú lateral."):
        rec.click(nav(p, "Pagos"))
    rec.narrate("La pantalla Cobros tiene dos pestañas: Por cobrar, con lo pendiente, e Historial, con los cobros registrados. Al abrir el mes actual, el sistema prepara automáticamente las mensualidades vigentes.")
    with rec.say("Arriba elegimos el mes y qué ver: Pendientes, que incluye lo vencido y los pagos parciales, o solo Vencidos. Al lado se resume la cantidad y el total pendiente."):
        rec.hover(p.get_by_label("Período"))
        rec.wait(0.6)
        rec.hover(p.get_by_label("Estado"))
    rec.narrate("Cada fila muestra el alumno, el concepto, el vencimiento, el saldo y su estado: Pendiente, Pago parcial o Vencido.")

    rec.label("Cobrar una mensualidad")
    row = _row(p, NAME, "Dancehall")
    with rec.say(f"Cobramos la mensualidad proporcional de {NAME} en Dancehall. Presionamos Cobrar en su fila."):
        rec.scroll_to(row)
        rec.click(row.get_by_role("button", name="Cobrar"))
    form = modal(p, "Registrar cobro")
    with rec.say("El importe se completa con el saldo. Como medio de pago elegimos Transferencia."):
        rec.hover(form.get_by_label("Importe"))
        rec.select(form.get_by_label("Medio de pago"), label="Transferencia")
    with rec.say("Si es una transferencia, se puede adjuntar el comprobante como foto o PDF. Es opcional. Presionamos Confirmar cobro."):
        rec.hover(form.get_by_text(re.compile("Comprobante de transferencia")))
        rec.click(form.get_by_role("button", name="Confirmar cobro"), settle=False)
        rec.toast("Cobro registrado")
    rec.narrate("La cuota sale de la lista de pendientes y se genera su recibo.")

    rec.label("Cobro parcial")
    row = _row(p, "Florencia Ibarra")
    with rec.say("A veces un alumno paga una parte. Florencia Ibarra entrega diez mil pesos a cuenta de su mensualidad de Hip Hop. Presionamos Cobrar."):
        rec.scroll_to(row)
        rec.click(row.get_by_role("button", name="Cobrar"))
    form = modal(p, "Registrar cobro")
    with rec.say("Cambiamos el importe a diez mil y dejamos Efectivo."):
        rec.type(form.get_by_label("Importe"), "10000")
    with rec.say("Confirmamos."):
        rec.click(form.get_by_role("button", name="Confirmar cobro"), settle=False)
        rec.toast("Cobro registrado")
    with rec.say("La cuota queda como Pago parcial, con el saldo que falta."):
        rec.hover(_row(p, "Florencia Ibarra").get_by_text(re.compile("Pago parcial")))

    rec.label("Agregar un importe")
    with rec.say("Para un concepto excepcional, como una remera o un recargo, usamos Agregar importe."):
        rec.click(p.get_by_role("button", name="Agregar importe"))
    form = modal(p, "Agregar importe")
    with rec.say(f"Elegimos a {STUDENT['first']}, escribimos el concepto y el importe. El vencimiento es hoy."):
        rec.select(form.get_by_label("Alumno"), label=f"{STUDENT['last']}, {STUDENT['first']}")
        rec.type(form.get_by_label("Concepto"), "Remera de la academia")
        rec.type(form.get_by_label("Importe"), "8000")
    with rec.say("Presionamos Agregar a Por cobrar."):
        rec.click(form.get_by_role("button", name="Agregar a Por cobrar"), settle=False)
        rec.toast("Importe agregado")

    rec.label("Deudas y vencidos")
    with rec.say("Para consultar deudas, en Ver elegimos Vencidos: aparecen solo los importes que pasaron su fecha de vencimiento."):
        rec.select(p.get_by_label("Estado"), label="Vencidos")
        rec.settle(0.6)
    with rec.say("Las deudas de meses anteriores se consultan cambiando el mes en Período. Por ejemplo, el mes pasado."):
        prev = p.get_by_label("Período").input_value()
        y, m = map(int, prev.split("-"))
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)
        rec.click(p.get_by_label("Período"), pause=0.1, settle=False)
        p.get_by_label("Período").fill(f"{y}-{m:02d}")
        rec.settle(0.8)
    rec.narrate("También en Alumnos, la casilla Con deuda vencida lista a los deudores, y en la ficha de cada alumno se ve el total vencido.")
    p.get_by_label("Período").fill(prev)
    rec.select(p.get_by_label("Estado"), label="Pendientes")

    rec.label("Cobrar una clase individual")
    drawer = open_session_today(rec, "Bachata Intermedio", "Las clases sueltas se cobran desde la clase del día. Abrimos la clase de hoy de Bachata Intermedio en el calendario.")
    part = drawer.locator("[class*='participant']").filter(has_text=NAME).first
    with rec.say(f"{STUDENT['first']} tomó esta clase como autorizada. En su fila presionamos Cobrar."):
        rec.scroll_to(part)
        rec.click(part.get_by_role("button", name="Cobrar"))
    form = modal(p, "Registrar cobro")
    with rec.say("Si dejamos el importe vacío se cobra el valor completo de la clase. Elegimos Efectivo y presionamos Cobrar."):
        rec.hover(form.get_by_label(re.compile("^Importe")))
        rec.click(form.get_by_role("button", name="Cobrar", exact=True), settle=False)
        rec.toast("Cobro registrado")
    with rec.say("El estado de pago de su fila pasa a Pagado."):
        rec.hover(drawer.locator("[class*='participant']").filter(has_text=NAME).first)
    rec.click(drawer.get_by_role("button", name="Cerrar"), pause=0.3, settle=False)

    rec.label("Cobrar un importe con promoción")
    with rec.say(f"Ahora cobramos la clase de Salsa con la promoción, desde la ficha de {STUDENT['first']}."):
        rec.click(nav(p, "Alumnos"))
        rec.type(p.get_by_placeholder("Nombre, email o teléfono..."), STUDENT["first"], delay=70)
        rec.wait(0.8)
        rec.click(p.get_by_role("link", name=re.compile(NAME)), pause=0.8)
    row = p.locator("[class*=paymentRow]").filter(has_text="Salsa").first
    with rec.say("La fila de Salsa muestra el importe con el quince por ciento ya descontado. Presionamos Cobrar."):
        rec.scroll_to(p.get_by_role("heading", name="Pagos"), block="start")
        rec.zoom(row, 4)
        rec.click(row.get_by_role("button", name="Cobrar"))
    form = modal(p, "Registrar cobro")
    with rec.say("Desde la ficha se cobra el saldo completo. Elegimos Tarjeta y confirmamos."):
        rec.select(form.get_by_label("Medio de pago"), label="Tarjeta")
        rec.click(form.get_by_role("button", name="Confirmar cobro"), settle=False)
        rec.toast("Cobro registrado")
    with rec.say("En la tabla Pagos, cada cobro registrado muestra el estado Pagado y los accesos a su recibo: ver, descargar, enviar por email o por WhatsApp."):
        rec.hover(p.locator("[class*=paymentRow]").filter(has_text="Salsa").first.get_by_title("Ver recibo"))

    rec.label("Historial y recibos")
    with rec.say("Volvemos a Pagos y abrimos la pestaña Historial."):
        rec.click(nav(p, "Pagos"))
        rec.click(p.get_by_role("tab", name="Historial"))
    rec.narrate("El historial muestra el total cobrado del mes, la cantidad de cobros y el subtotal por medio de pago. Cada cobro tiene su número de recibo correlativo.")
    with rec.say(f"Podemos buscar por alumno o por número de recibo. Escribimos {STUDENT['last']}."):
        rec.type(p.get_by_label("Buscar cobro"), STUDENT["last"], delay=80)
        rec.wait(0.8)
    card = p.locator("article").filter(has_text=NAME).first
    with rec.say("Presionamos Ver recibo para abrir el comprobante."):
        with p.context.expect_page() as popup:
            rec.click(card.get_by_title("Ver recibo"), settle=False)
    pdf = popup.value
    pdf.wait_for_load_state()
    rec.switch_to(pdf)
    rec.wait(1.5)
    rec.narrate("El recibo en PDF incluye el número, los datos del alumno, la fecha y el medio de pago, el concepto y el total abonado. Se puede imprimir o descargar.")
    main = p
    pdf.close()
    p = rec.switch_to(main)
    card = p.locator("article").filter(has_text=NAME).first
    with rec.say("También se puede enviar por email: el botón Email lo manda con el PDF adjunto a la dirección de la alumna."):
        rec.click(card.get_by_title(re.compile("^Enviar recibo a")), settle=False)
        rec.toast("Recibo enviado por email")
    rec.narrate("El botón WhatsApp abre WhatsApp Web con el número del alumno y descarga el recibo para adjuntarlo en el chat.")

    rec.label("Anular un cobro")
    with rec.say("Si un cobro se cargó por error, se anula. Por ejemplo, supongamos que el pago parcial de Florencia Ibarra se registró por equivocación. La buscamos."):
        rec.type(p.get_by_label("Buscar cobro"), "Ibarra", delay=80)
        rec.wait(0.8)
    card = p.locator("article").filter(has_text="Florencia Ibarra").first
    with rec.say("Presionamos Anular."):
        rec.click(card.get_by_title("Anular un cobro cargado por error"))
    form = modal(p, "Anular cobro")
    rec.narrate("El aviso explica que el cobro deja de contar en el total, el recibo queda marcado como anulado y la cuota vuelve a Por cobrar. No se borra nada: queda registrado quién lo anuló y por qué.")
    with rec.say("Escribimos el motivo."):
        rec.type(form.get_by_label("Motivo"), "Importe cargado por error")
    with rec.say("No marcamos la casilla de eliminar la deuda, porque la cuota sí corresponde. Presionamos Anular cobro."):
        rec.click(form.get_by_role("button", name="Anular cobro"), settle=False)
        rec.toast("Cobro anulado")
    with rec.say("El cobro figura como Anulado, con su motivo, y deja de sumar en el total. Para corregir un importe, se anula el cobro equivocado y se registra nuevamente el correcto."):
        rec.hover(p.locator("article").filter(has_text="Florencia Ibarra").get_by_text("Anulado").first)
    rec.narrate("Los movimientos de caja por período y por medio de pago se analizan en Reportes, que vemos en el capítulo 12.")
