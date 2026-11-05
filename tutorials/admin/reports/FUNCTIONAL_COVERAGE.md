# Cobertura funcional del videotutorial

Matriz **Módulo → Funcionalidad → Escenario → Capítulo → Minuto → Estado**, generada a partir de las marcas reales de cada grabación (`recordings/<capítulo>/summary.json`).

- *Minuto (capítulo)*: momento en el video individual. *Minuto (completo)*: momento en `complete_admin_tutorial.mp4`.
- *Estado ✅*: la operación se ejecutó en la plataforma real durante la grabación y el script verificó el resultado en pantalla (aviso de éxito, dato o navegación esperados); si una verificación falla, la grabación se detiene y el capítulo no se publica.
- El detalle de cada función (incluidas las que no pudieron demostrarse o no existen) está en `docs/tutorials/ADMIN_FUNCTIONAL_INVENTORY.md`.

| Módulo | Funcionalidad / escenario | Capítulo | Minuto (capítulo) | Minuto (completo) | Estado |
|---|---|---|---|---|---|
| Introducción a la plataforma | Pantalla de inicio de sesión | 01 | 00:23 | 00:50 | ✅ Ejecutado y verificado |
| Introducción a la plataforma | Panel de inicio | 01 | 00:58 | 01:25 | ✅ Ejecutado y verificado |
| Introducción a la plataforma | Menú de navegación | 01 | 02:09 | 02:35 | ✅ Ejecutado y verificado |
| Introducción a la plataforma | Navegar entre módulos | 01 | 03:29 | 03:55 | ✅ Ejecutado y verificado |
| Introducción a la plataforma | Notificaciones y perfil | 01 | 03:57 | 04:23 | ✅ Ejecutado y verificado |
| Configuración general | Ingresar a Configuración | 02 | 00:19 | 05:35 | ✅ Ejecutado y verificado |
| Configuración general | Identidad de la academia | 02 | 00:46 | 06:01 | ✅ Ejecutado y verificado |
| Configuración general | Consultas e inscripciones | 02 | 01:00 | 06:15 | ✅ Ejecutado y verificado |
| Configuración general | Reglas operativas | 02 | 01:25 | 06:41 | ✅ Ejecutado y verificado |
| Configuración general | Canales públicos | 02 | 01:41 | 06:57 | ✅ Ejecutado y verificado |
| Configuración general | Landing pública | 02 | 02:10 | 07:25 | ✅ Ejecutado y verificado |
| Configuración general | Sedes | 02 | 02:32 | 07:47 | ✅ Ejecutado y verificado |
| Configuración general | Catálogos: ritmos, público y niveles | 02 | 02:52 | 08:07 | ✅ Ejecutado y verificado |
| Configuración general | Pistas de baile | 02 | 04:08 | 09:23 | ✅ Ejecutado y verificado |
| Configuración general | Feriados | 02 | 04:53 | 10:08 | ✅ Ejecutado y verificado |
| Configuración general | Reglas de cobro | 02 | 05:24 | 10:39 | ✅ Ejecutado y verificado |
| Configuración general | Usuarios y roles | 02 | 05:49 | 11:04 | ✅ Ejecutado y verificado |
| Administración de profesores | Listado de profesores | 03 | 00:17 | 13:29 | ✅ Ejecutado y verificado |
| Administración de profesores | Alta de una profesora | 03 | 00:51 | 14:04 | ✅ Ejecutado y verificado |
| Administración de profesores | Perfil del profesor | 03 | 01:47 | 15:00 | ✅ Ejecutado y verificado |
| Administración de profesores | Editar datos y disciplinas | 03 | 02:42 | 15:54 | ✅ Ejecutado y verificado |
| Administración de profesores | Restablecer acceso | 03 | 03:01 | 16:14 | ✅ Ejecutado y verificado |
| Administración de profesores | Inactivar y reactivar | 03 | 03:19 | 16:31 | ✅ Ejecutado y verificado |
| Administración de profesores | Clases y horarios de un profesor | 03 | 03:58 | 17:10 | ✅ Ejecutado y verificado |
| Creación y configuración de clases | Dónde se crean las clases | 04 | 00:18 | 18:17 | ✅ Ejecutado y verificado |
| Creación y configuración de clases | Nueva clase: datos del grupo | 04 | 00:35 | 18:34 | ✅ Ejecutado y verificado |
| Creación y configuración de clases | Cupo, modalidad y precios | 04 | 01:17 | 19:17 | ✅ Ejecutado y verificado |
| Creación y configuración de clases | Días y horarios | 04 | 01:59 | 19:58 | ✅ Ejecutado y verificado |
| Creación y configuración de clases | Ver la clase en el calendario | 04 | 02:35 | 20:35 | ✅ Ejecutado y verificado |
| Creación y configuración de clases | Gestión de la clase | 04 | 03:22 | 21:22 | ✅ Ejecutado y verificado |
| Creación y configuración de clases | Editar la clase | 04 | 04:14 | 22:14 | ✅ Ejecutado y verificado |
| Creación y configuración de clases | Inactivar o eliminar | 04 | 05:10 | 23:09 | ✅ Ejecutado y verificado |
| Promociones y descuentos | Dónde están las promociones | 05 | 00:23 | 24:19 | ✅ Ejecutado y verificado |
| Promociones y descuentos | Crear un 2x1 | 05 | 00:48 | 24:45 | ✅ Ejecutado y verificado |
| Promociones y descuentos | Inscribir una pareja con 2x1 | 05 | 01:49 | 25:46 | ✅ Ejecutado y verificado |
| Promociones y descuentos | Verificar el importe y cobrar | 05 | 03:09 | 27:06 | ✅ Ejecutado y verificado |
| Promociones y descuentos | Descuento por porcentaje | 05 | 03:58 | 27:55 | ✅ Ejecutado y verificado |
| Promociones y descuentos | Cerrar una campaña | 05 | 04:38 | 28:35 | ✅ Ejecutado y verificado |
| Gestión de alumnos | Listado y búsqueda | 06 | 00:18 | 30:01 | ✅ Ejecutado y verificado |
| Gestión de alumnos | Evitar duplicados | 06 | 01:01 | 30:45 | ✅ Ejecutado y verificado |
| Gestión de alumnos | Registrar un alumno nuevo | 06 | 01:24 | 31:07 | ✅ Ejecutado y verificado |
| Gestión de alumnos | La ficha del alumno | 06 | 02:01 | 31:45 | ✅ Ejecutado y verificado |
| Gestión de alumnos | Editar información | 06 | 02:36 | 32:20 | ✅ Ejecutado y verificado |
| Gestión de alumnos | QR, historial y preferencias | 06 | 02:47 | 32:30 | ✅ Ejecutado y verificado |
| Gestión de alumnos | Inactivar y reactivar | 06 | 03:07 | 32:50 | ✅ Ejecutado y verificado |
| Gestión de alumnos | Consultar un alumno con historial | 06 | 03:42 | 33:25 | ✅ Ejecutado y verificado |
| Inscripción de alumnos a clases | A · Inscripción con mensualidad | 07 | 00:21 | 34:50 | ✅ Ejecutado y verificado |
| Inscripción de alumnos a clases | B · Inscripción por clase | 07 | 01:42 | 36:12 | ✅ Ejecutado y verificado |
| Inscripción de alumnos a clases | B · Clase suelta de un solo día | 07 | 02:15 | 36:44 | ✅ Ejecutado y verificado |
| Inscripción de alumnos a clases | C · Inscripción con promoción | 07 | 03:04 | 37:34 | ✅ Ejecutado y verificado |
| Inscripción de alumnos a clases | D · Varias clases | 07 | 04:02 | 38:31 | ✅ Ejecutado y verificado |
| Inscripción de alumnos a clases | E · Modificaciones posteriores | 07 | 04:27 | 38:57 | ✅ Ejecutado y verificado |
| Cobros y gestión de pagos | Dónde consultar los pagos | 08 | 00:21 | 40:51 | ✅ Ejecutado y verificado |
| Cobros y gestión de pagos | Cobrar una mensualidad | 08 | 01:01 | 41:31 | ✅ Ejecutado y verificado |
| Cobros y gestión de pagos | Cobro parcial | 08 | 01:31 | 42:02 | ✅ Ejecutado y verificado |
| Cobros y gestión de pagos | Agregar un importe | 08 | 01:54 | 42:25 | ✅ Ejecutado y verificado |
| Cobros y gestión de pagos | Deudas y vencidos | 08 | 02:12 | 42:42 | ✅ Ejecutado y verificado |
| Cobros y gestión de pagos | Cobrar una clase individual | 08 | 02:39 | 43:09 | ✅ Ejecutado y verificado |
| Cobros y gestión de pagos | Cobrar un importe con promoción | 08 | 03:09 | 43:40 | ✅ Ejecutado y verificado |
| Cobros y gestión de pagos | Historial y recibos | 08 | 03:43 | 44:13 | ✅ Ejecutado y verificado |
| Cobros y gestión de pagos | Anular un cobro | 08 | 04:38 | 45:08 | ✅ Ejecutado y verificado |
| Contactos y potenciales alumnos | Contactos existentes | 09 | 00:19 | 46:46 | ✅ Ejecutado y verificado |
| Contactos y potenciales alumnos | Crear un contacto | 09 | 00:49 | 47:16 | ✅ Ejecutado y verificado |
| Contactos y potenciales alumnos | Ficha del contacto | 09 | 01:12 | 47:39 | ✅ Ejecutado y verificado |
| Contactos y potenciales alumnos | Interés y observaciones | 09 | 01:28 | 47:55 | ✅ Ejecutado y verificado |
| Contactos y potenciales alumnos | Reservar una clase de prueba gratuita | 09 | 01:57 | 48:24 | ✅ Ejecutado y verificado |
| Contactos y potenciales alumnos | Seguimiento: asistencia a la prueba | 09 | 02:44 | 49:11 | ✅ Ejecutado y verificado |
| Contactos y potenciales alumnos | Convertir en alumno | 09 | 03:01 | 49:28 | ✅ Ejecutado y verificado |
| Contactos y potenciales alumnos | Comprobar el resultado | 09 | 03:43 | 50:10 | ✅ Ejecutado y verificado |
| Presentismo y asistencias | La clase del día | 10 | 00:16 | 51:16 | ✅ Ejecutado y verificado |
| Presentismo y asistencias | Marcar asistencia | 10 | 00:57 | 51:57 | ✅ Ejecutado y verificado |
| Presentismo y asistencias | Corregir asistencia | 10 | 01:14 | 52:14 | ✅ Ejecutado y verificado |
| Presentismo y asistencias | Estados | 10 | 01:32 | 52:31 | ✅ Ejecutado y verificado |
| Presentismo y asistencias | Consultar por fecha, clase y profesor | 10 | 02:10 | 53:10 | ✅ Ejecutado y verificado |
| Presentismo y asistencias | Tablet de asistencia | 10 | 02:51 | 53:51 | ✅ Ejecutado y verificado |
| Presentismo y asistencias | Tablet: activación y registro con DNI | 10 | 03:25 | 54:24 | ✅ Ejecutado y verificado |
| Presentismo y asistencias | Historial de un alumno | 10 | 04:27 | 55:26 | ✅ Ejecutado y verificado |
| Calendario y cambios de horario | Vistas y navegación | 11 | 00:16 | 56:30 | ✅ Ejecutado y verificado |
| Calendario y cambios de horario | Filtros | 11 | 01:01 | 57:15 | ✅ Ejecutado y verificado |
| Calendario y cambios de horario | Cambiar una sola clase: horario y profesor suplente | 11 | 01:11 | 57:24 | ✅ Ejecutado y verificado |
| Calendario y cambios de horario | Avisar a los alumnos afectados | 11 | 02:01 | 58:15 | ✅ Ejecutado y verificado |
| Calendario y cambios de horario | Reprogramar una fecha | 11 | 02:25 | 58:39 | ✅ Ejecutado y verificado |
| Calendario y cambios de horario | Cancelar una fecha | 11 | 03:05 | 59:18 | ✅ Ejecutado y verificado |
| Calendario y cambios de horario | Clase extra | 11 | 03:35 | 59:48 | ✅ Ejecutado y verificado |
| Calendario y cambios de horario | Cambiar el horario recurrente | 11 | 03:53 | 60:06 | ✅ Ejecutado y verificado |
| Reportes y estadísticas | Reportes: filtros | 12 | 00:15 | 61:38 | ✅ Ejecutado y verificado |
| Reportes y estadísticas | Indicadores principales | 12 | 00:43 | 62:06 | ✅ Ejecutado y verificado |
| Reportes y estadísticas | Ingresos y operación | 12 | 01:20 | 62:43 | ✅ Ejecutado y verificado |
| Reportes y estadísticas | Cambiar el período | 12 | 01:55 | 63:19 | ✅ Ejecutado y verificado |
| Reportes y estadísticas | Exportar a Excel | 12 | 02:15 | 63:39 | ✅ Ejecutado y verificado |
| Reportes y estadísticas | Otros indicadores: inicio, notificaciones y auditoría | 12 | 02:31 | 63:54 | ✅ Ejecutado y verificado |
| Operaciones administrativas frecuentes | 1 · Ingresar al sistema | 13 | 00:21 | 65:09 | ✅ Ejecutado y verificado |
| Operaciones administrativas frecuentes | 2 · Revisar el inicio | 13 | 00:28 | 65:15 | ✅ Ejecutado y verificado |
| Operaciones administrativas frecuentes | 3 · Consultar nuevas solicitudes | 13 | 00:42 | 65:30 | ✅ Ejecutado y verificado |
| Operaciones administrativas frecuentes | 4 · Registrar un contacto | 13 | 00:50 | 65:38 | ✅ Ejecutado y verificado |
| Operaciones administrativas frecuentes | 5 · Convertir en alumna | 13 | 01:12 | 66:00 | ✅ Ejecutado y verificado |
| Operaciones administrativas frecuentes | 6 · Inscribir en una clase | 13 | 01:21 | 66:08 | ✅ Ejecutado y verificado |
| Operaciones administrativas frecuentes | 7 y 8 · Promoción y cobro | 13 | 01:27 | 66:15 | ✅ Ejecutado y verificado |
| Operaciones administrativas frecuentes | 9 · Consultar la inscripción | 13 | 01:59 | 66:47 | ✅ Ejecutado y verificado |
| Operaciones administrativas frecuentes | 10 · Revisar asistencias | 13 | 02:10 | 66:58 | ✅ Ejecutado y verificado |
| Operaciones administrativas frecuentes | 11 · Modificar un horario | 13 | 02:20 | 67:08 | ✅ Ejecutado y verificado |
| Operaciones administrativas frecuentes | 12 · Reportes finales | 13 | 02:44 | 67:32 | ✅ Ejecutado y verificado |
| Funciones adicionales | Comunicaciones: email | 14 | 00:20 | 68:22 | ✅ Ejecutado y verificado |
| Funciones adicionales | Comunicaciones: WhatsApp | 14 | 01:27 | 69:28 | ✅ Ejecutado y verificado |
| Funciones adicionales | Recordatorios de deuda | 14 | 01:38 | 69:39 | ✅ Ejecutado y verificado |
| Funciones adicionales | Credencial QR de asistencia | 14 | 02:29 | 70:31 | ✅ Ejecutado y verificado |
| Funciones adicionales | Nuevas sedes | 14 | 02:57 | 70:58 | ✅ Ejecutado y verificado |
| Funciones adicionales | Pausar una clase | 14 | 03:19 | 71:20 | ✅ Ejecutado y verificado |
| Funciones adicionales | Eliminar una clase sin actividad | 14 | 03:51 | 71:52 | ✅ Ejecutado y verificado |
| Funciones adicionales | Mi perfil | 14 | 04:56 | 72:58 | ✅ Ejecutado y verificado |
| Funciones adicionales | Eliminar un usuario | 14 | 05:18 | 73:19 | ✅ Ejecutado y verificado |
| Funciones adicionales | Recuperar la contraseña | 14 | 05:35 | 73:37 | ✅ Ejecutado y verificado |
