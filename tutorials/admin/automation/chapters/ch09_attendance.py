"""Capítulo 10 — Presentismo y asistencias."""
import re

from .common import CLASS, PROF, confirm_dialog, fill_date, iso, nav, today

META = {
    "number": 10, "short": "Presentismo",
    "title": "Presentismo y asistencias",
    "subtitle": "Clase del día, marcar presentes y ausentes, recepción, tablet de asistencia con DNI e historial del alumno.",
    "learn": ["Abrir la clase del día", "Marcar y corregir asistencia", "Interpretar los estados",
              "Consultar llegadas por fecha y clase", "Habilitar la tablet de asistencia", "Ver el historial de un alumno"],
    "summary": ["Cada clase de cada fecha tiene su propia lista y estado", "Esperado, Presente y Ausente indican la asistencia",
                "Marcar presente a un alumno por clase genera su cobro", "Recepción muestra las llegadas por fecha y clase",
                "La tablet registra la asistencia con DNI o QR, sin cuenta administrativa"],
    "intro": [
        "En este capítulo vamos a registrar y consultar la asistencia.",
        "Veremos la clase del día, cómo marcar presentes y ausentes, la vista de recepción, la tablet de autoregistro y el historial de cada alumno.",
    ],
    "outro": [
        "Ya sabés tomar asistencia desde la clase, controlarla en Recepción y habilitar la tablet para que los alumnos se registren solos.",
        "En el próximo capítulo vamos a trabajar con el calendario y los cambios de horario.",
    ],
}


def run(rec):
    p = rec.page
    rec.label("La clase del día")
    with rec.say("La asistencia se toma en la clase del día. Desde Inicio, en Clases del día, cada clase tiene su acceso."):
        rec.click(nav(p, "Inicio"))
        link = p.locator("a[href*='/admin/sessions/']").filter(has_text=CLASS).first
        rec.scroll_to(link)
        rec.hover(link)
    with rec.say(f"Abrimos {CLASS}."):
        rec.click(link, pause=0.8)
    rec.narrate("Esta pantalla corresponde a una fecha y horario concretos. Arriba se ve el estado de la clase y la profesora.")
    with rec.say("Los indicadores cuentan los alumnos esperados, presentes, ausentes y el importe a cobrar."):
        rec.hover(p.get_by_text("Esperados", exact=True).first)
    rec.narrate("La tabla lista a cada alumno con su asistencia, su modalidad y el estado de pago. Incluye a los inscriptos en ese turno, las clases de prueba y los agregados solo para ese día.")

    rec.label("Marcar asistencia")
    def row(name):
        return p.locator("[class*='sessionParticipantRow']").filter(has_text=name).first
    with rec.say("Sofía Medina llegó: presionamos Presente en su fila."):
        rec.click(row("Sofía Medina").get_by_role("button", name="Presente"), settle=False)
        rec.toast("Asistencia marcada como presente")
    with rec.say("Valentina Ríos también está presente."):
        rec.click(row("Valentina Ríos").get_by_role("button", name="Presente"), settle=False)
        rec.toast("Asistencia marcada como presente")
    with rec.say("Tomás Aguirre no vino: presionamos Ausente."):
        rec.click(row("Tomás Aguirre").get_by_role("button", name="Ausente"), settle=False)
        rec.toast("Asistencia marcada como ausente")
    with rec.say("Los indicadores se actualizan al instante."):
        rec.hover(p.get_by_text("Presentes", exact=True).first)

    rec.label("Corregir asistencia")
    with rec.say("Si Tomás llega tarde, corregimos su estado marcándolo Presente."):
        rec.click(row("Tomás Aguirre").get_by_role("button", name="Presente"), settle=False)
        rec.toast("Asistencia marcada como presente")
    rec.narrate("Para pasar a alguien de Presente a Ausente, en cambio, el sistema exige que lo haga un administrador e indique un motivo, porque la asistencia de un alumno por clase genera su cobro.")

    rec.label("Estados")
    rec.narrate("Los estados son tres: Esperado, cuando todavía no se registró nada; Presente; y Ausente. Una clase sin registros no se interpreta como ausencia.")
    rec.narrate("En cada fila también se puede cobrar, y para los inscriptos, Cambiar turno a otro horario del mismo día o Cancelar su turno, respetando la anticipación configurada.")
    with rec.say("Al terminar, Finalizar clase marca la clase como realizada y deja fija su lista. Confirmamos."):
        rec.click(p.get_by_role("button", name="Finalizar clase"))
        rec.click(confirm_dialog(p).get_by_role("button", name="Finalizar clase"), settle=False)
        rec.toast("Clase finalizada")
    rec.narrate("Si después hace falta corregirla, desde el calendario se la puede reabrir indicando un motivo.")

    rec.label("Consultar por fecha, clase y profesor")
    with rec.say("Para consultar el presentismo por fecha o por clase vamos a Recepción."):
        rec.click(nav(p, "Recepción"))
    rec.narrate("La pestaña Llegadas del día muestra quién asistió y la ocupación de cada grupo.")
    with rec.say("Con el filtro Clase vemos un grupo puntual."):
        sel = p.get_by_label(re.compile(r"^Clase(?! de| y)"))
        value = sel.locator("option").filter(has_text=CLASS).first.get_attribute("value")
        rec.select(sel, value=value)
        rec.settle(0.6)
    with rec.say("Los indicadores muestran asistencias, cupo, inscriptos y lugares libres, y la tabla lista a cada persona con la hora y el método de registro."):
        rec.hover(p.get_by_label("Indicadores de asistencia"))
    with rec.say("Con el campo Fecha consultamos un día anterior; por ejemplo, el lunes pasado."):
        rec.select(sel, label="Todas las clases")
        last_monday = today() - __import__("datetime").timedelta(days=(today().weekday() or 7))
        fill_date(rec, p.get_by_label("Fecha", exact=True), iso(last_monday))
        rec.settle(0.8)
    rec.narrate("Para ver la asistencia de un profesor, en el Calendario se filtra por profesor y se abre cada clase: su lista muestra presentes y ausentes.")

    rec.label("Tablet de asistencia")
    with rec.say("Los alumnos también pueden registrarse solos en una tablet de recepción. Para habilitarla, abrimos la pestaña Acceso de tablet."):
        rec.click(p.get_by_role("button", name="Ver hoy"), pause=0.3) if p.get_by_role("button", name="Ver hoy").count() else None
        rec.click(p.get_by_role("tab", name="Acceso de tablet"))
    rec.narrate("Se genera un código de un solo uso para la sede. Atención: generar uno nuevo deja sin acceso a las tablets anteriores de esa sede.")
    with rec.say("Presionamos Generar código."):
        btn = p.get_by_role("button", name=re.compile("^(Generar|Renovar) código"))
        rec.click(btn, settle=False)
        out = p.locator("output").first
        out.wait_for()
        rec.wait(0.6)
    code = out.inner_text().strip()
    rec.narrate("Este código se ingresa una sola vez en la tablet. No hace falta compartir ninguna cuenta administrativa.")

    main = p
    tablet = rec.new_isolated_page()
    tablet.goto(rec.base_url + "/asistencia")
    tablet.wait_for_load_state("networkidle")
    rec.switch_to(tablet)
    p = tablet
    rec.label("Tablet: activación y registro con DNI")
    rec.narrate("Esta es la pantalla de la tablet, en la dirección barra asistencia. La primera vez pide el código de acceso.")
    with rec.say("Lo ingresamos y presionamos Activar registro."):
        rec.type(p.get_by_label("Código de acceso"), code, delay=60)
        rec.click(p.get_by_role("button", name="Activar registro"), settle=False)
        p.get_by_role("heading", name="Registrá tu asistencia").wait_for()
        rec.settle(0.4)
    rec.narrate("Ya está lista. Cada alumno elige escanear el QR de su credencial o usar su DNI.")
    with rec.say("Simulamos la llegada de Camila Duarte: presiona Usar DNI."):
        rec.click(p.get_by_role("button", name="Usar DNI"))
    with rec.say("Escribe su DNI y presiona Registrar asistencia."):
        rec.type(p.get_by_label("DNI", exact=True), "40111203", delay=90)
        rec.click(p.get_by_role("button", name="Registrar asistencia"), settle=False)
        rec.wait(1.2)
    choose = p.get_by_role("heading", name="¿A qué clase venís?")
    choose.wait_for(timeout=5000)
    with rec.say("Como hoy tiene dos clases, la tablet le pregunta a cuál viene."):
        rec.hover(p.get_by_role("button", name=re.compile("Salsa Inicial")))
    # The confirmation screen stays only 7 seconds: click and describe it in the same short line.
    with rec.say("Elige Salsa Inicial, y la tablet confirma su asistencia. Si tiene un pago pendiente, le avisa."):
        rec.click(p.get_by_role("button", name=re.compile("Salsa Inicial")), settle=False)
        p.get_by_role("heading", name=re.compile("Bienvenid|Ya te registramos")).wait_for()
        rec.hover(p.get_by_role("heading", name=re.compile("Bienvenid|Ya te registramos")))

    p = rec.switch_to(main)
    tablet.context.close()
    with rec.say("Volvemos a Recepción, a Llegadas del día, y presionamos Actualizar."):
        rec.click(p.get_by_role("tab", name="Llegadas del día"))
        fill_date(rec, p.get_by_label("Fecha", exact=True), iso(today()))
        rec.click(p.get_by_role("button", name=re.compile("^Actualizar")), settle=True)
    rec.narrate("La llegada de Camila figura con el método DNI. Los registros hechos por la administración o por el profesor se identifican de la misma forma.")

    rec.label("Historial de un alumno")
    with rec.say("Por último, el historial de asistencia de un alumno está en su ficha. Hacemos clic en el nombre de Camila."):
        rec.click(p.get_by_role("link", name=re.compile("Camila Duarte")).first, pause=0.8)
    rec.narrate("Desde Recepción se abre su historial de contacto, con cada clase a la que asistió, su tipo, la fecha y el estado.")
    rec.narrate("Los profesores, desde su propio portal, ven sus clases y marcan la asistencia de sus alumnos, pero no registran cobros ni pueden quitar un presente: esas correcciones quedan en manos de la administración.")
