"""Capítulo 12 — Reportes y estadísticas."""
import datetime as dt
import re

from .common import fill_date, iso, nav, today

META = {
    "number": 12, "short": "Reportes",
    "title": "Reportes y estadísticas",
    "subtitle": "Caja, facturación, deuda, actividad, asistencia y rendimiento por clase, con filtros y exportación a Excel.",
    "learn": ["Filtrar por fechas y sede", "Diferenciar caja y facturación", "Leer deuda y turnos del período",
              "Analizar asistencia y ocupación por clase", "Exportar a Excel", "Usar el inicio, notificaciones y auditoría"],
    "summary": ["Caja cuenta el dinero por fecha de cobro", "Facturación cuenta lo emitido por fecha de clase o mes",
                "Por cobrar suma lo pendiente y lo vencido", "El detalle por clase cruza asistencia, finanzas y ocupación",
                "Exportar Excel descarga el reporte con los filtros aplicados"],
    "intro": [
        "En este capítulo vamos a consultar e interpretar los reportes de la academia.",
        "Veremos qué representa cada indicador, cómo filtrar por período y sede, y cómo exportar la información a Excel.",
    ],
    "outro": [
        "Con los reportes podés seguir la caja, lo facturado, la deuda, la asistencia y la ocupación de cada clase.",
        "En el próximo capítulo vamos a juntar todo en un día típico de trabajo.",
    ],
}


def run(rec):
    p = rec.page
    rec.label("Reportes: filtros")
    with rec.say("Ingresamos a Reportes desde el menú lateral."):
        rec.click(nav(p, "Reportes"))
    rec.narrate("Por defecto se analiza el mes actual. Arriba están los filtros Desde, Hasta y Sede, y los botones Este mes, Aplicar y Exportar Excel.")
    with rec.say("La franja Período analizado resume el rango, los días, las altas de alumnos y los alumnos activos hoy. La nota aclara un criterio importante: la facturación y la caja no se mezclan."):
        rec.hover(p.get_by_label("Criterio del reporte"))

    rec.label("Indicadores principales")
    cards = p.locator("article")
    with rec.say("Cobrado en caja es el dinero efectivamente recibido en estas fechas, según el día del cobro."):
        rec.zoom(cards.nth(0), 4)
        rec.hover(cards.nth(0))
    with rec.say("Facturado vigente es lo emitido para el período, según la fecha de la clase o el mes de la mensualidad, sin contar lo anulado."):
        rec.hover(cards.nth(1))
    with rec.say("Por cobrar suma lo pendiente y lo vencido de esos cargos: es la deuda del período."):
        rec.hover(cards.nth(2))
    with rec.say("Y Turnos del período cuenta las clases del rango, con las completadas y las canceladas."):
        rec.hover(cards.nth(3))
    rec.narrate("Por ejemplo, una mensualidad de octubre pagada en noviembre cuenta en la facturación de octubre y en la caja de noviembre.")

    rec.label("Ingresos y operación")
    inc = p.get_by_text("Facturación y caja por modalidad")
    with rec.say("Ingresos separa la facturación, la caja y lo vencido por modalidad: por clase y mensual. Debajo, la caja por medio de pago: efectivo, transferencia y tarjeta."):
        rec.scroll_to(inc, block="start")
        rec.hover(inc)
    with rec.say("Operación muestra las clases completadas y programadas, y las asistencias presentes y ausentes registradas."):
        rec.hover(p.get_by_text("Actividad y asistencia registrada"))
    det = p.get_by_text("Rendimiento académico y financiero")
    with rec.say("El detalle por clase cruza todo: actividad, asistencia, lo facturado y cobrado, y la ocupación actual de cada grupo. Sirve para comparar disciplinas y profesores."):
        rec.scroll_to(det, block="start")
        rec.hover(det)
        rec.wait(1.5)
    rec.scroll_top()

    rec.label("Cambiar el período")
    first_prev = (today().replace(day=1) - dt.timedelta(days=1)).replace(day=1)
    with rec.say("Para analizar otro período cambiamos las fechas. Elegimos desde el primero del mes pasado hasta hoy."):
        fill_date(rec, p.get_by_label("Desde", exact=True), iso(first_prev))
        fill_date(rec, p.get_by_label("Hasta", exact=True), iso(today()))
    with rec.say("Y presionamos Aplicar: los números se recalculan."):
        rec.click(p.get_by_role("button", name="Aplicar"), pause=0.8)
    with rec.say("El filtro Sede limita el análisis a una ubicación. Y Este mes vuelve al mes en curso."):
        rec.hover(p.get_by_label(re.compile(r"^Sede")))
        rec.click(p.get_by_role("button", name="Este mes"), pause=0.8)

    rec.label("Exportar a Excel")
    with rec.say("Para trabajar los datos en una planilla, presionamos Exportar Excel."):
        downloads, popups = [], []

        def hook(pg):
            popups.append(pg)
            pg.on("download", lambda d: downloads.append(d.suggested_filename))

        p.context.on("page", hook)
        p.on("download", lambda d: downloads.append(d.suggested_filename))
        rec.click(p.get_by_role("button", name="Exportar Excel"), settle=False)
        rec.wait(3)
        for pg in popups:
            if pg is not p:
                pg.close()
        p.bring_to_front()
        if downloads:
            rec.mark(f"excel:{downloads[0]}")
        else:
            rec.issue("Exportar Excel: no se detectó la descarga")
    rec.narrate("Se descarga un archivo de Excel con tres hojas: Resumen, Facturación y caja, y Actividad por clase, con los filtros aplicados.")

    rec.label("Otros indicadores: inicio, notificaciones y auditoría")
    with rec.say("Recordemos que el Inicio también resume alumnos activos y nuevas altas, clases del día, finanzas del período y las clases con mayor ocupación."):
        rec.click(nav(p, "Inicio"))
        rec.wait(1)
    with rec.say("El centro de Notificaciones, que se abre desde la campana, muestra pagos vencidos, envíos con error y la actividad reciente de mensajes."):
        rec.click(p.get_by_role("button", name="Notificaciones"), pause=0.5)
        rec.click(p.get_by_role("link", name="Ver centro de notificaciones"), pause=0.8)
    with rec.say("Y Auditoría registra las acciones sensibles del equipo: quién hizo cada cambio y cuándo."):
        rec.click(nav(p, "Auditoría"))
    with rec.say("Se puede filtrar por tipo de entidad, por ejemplo Alumnos."):
        sel = p.locator("select").first
        rec.select(sel, label="Alumnos")
        rec.wait(1)
    rec.narrate("La auditoría es de solo lectura y sirve para controlar la operación diaria.")
