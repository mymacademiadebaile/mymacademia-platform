# Inventario funcional del Administrador — M&M Academia

Inventario de todas las pantallas, funciones y recorridos disponibles para un usuario con rol **Administrador** (`ADMIN` / `SUPER_ADMIN`), elaborado para producir el videotutorial de `tutorials/admin/`.

- **Fuentes**: lectura completa del frontend (`apps/web/src/app/admin/**`, `apps/web/src/components/admin/**`, `/asistencia`, `/check-in`, `/login`) y del backend (`apps/api/src/modules/**`), más ejecución real en un entorno local aislado.
- **Entorno de verificación**: MongoDB local en replica set (`127.0.0.1:27118`, base `mymacademia_tutorial`), API en `:4100` y web compilada en `:3100`, con correo capturado por un SMTP local y sin Cloudinary. No se usó la base de producción.
- **Fecha**: 04/11/2026.

## Convenciones de estado

| Estado | Significado |
|---|---|
| ✅ Ejecutado | La función se ejecutó en la interfaz real durante la grabación y su resultado se comprobó en pantalla (aviso de éxito, dato actualizado o navegación esperada). Se indica el capítulo. |
| 🧪 Verificado por API | Regla comprobada contra la API real con `automation/verify_rules.py` (ver `tutorials/admin/reports/RULES_VERIFICATION.md`). |
| 👁 Mostrado | La pantalla o el control se muestra y explica en el video, pero no se completó la operación (por ejemplo, para no cerrar la sesión). |
| ⛔ No demostrable | Existe en la aplicación, pero no se pudo ejecutar en el entorno de capacitación. Se indica la causa. |
| ✖ No existe | Se pidió en el temario, pero la aplicación no la implementa. No se presenta como existente en el video. |

## 1. Acceso y navegación

| Ruta / lugar | Funcionalidad | Estado |
|---|---|---|
| `/login` | Ingreso con email o usuario y contraseña; ver contraseña; redirección por rol | ✅ Cap. 1 y 13 |
| `/login` | Error de credenciales ("El email o la contraseña no son correctos") | 🔍 Código (no se muestra) |
| `/forgot-password` | Solicitar enlace de recuperación (válido 30 minutos) | ✅ Cap. 14 (correo capturado localmente) |
| `/reset-password` | Definir una nueva contraseña desde el enlace | ⛔ Requiere abrir el enlace del correo; se explica, no se graba |
| Menú lateral | 14 accesos: Inicio, Calendario, Profesores, Alumnos, Contactos, Recepción, Pagos, Comunicaciones, Recordatorios, Reportes, Auditoría, Configuración, Usuarios, Mi perfil | ✅ Cap. 1 |
| Barra superior | Campana de notificaciones (pagos vencidos + envíos con error), panel de actividad, acceso a Mi perfil | ✅ Cap. 1 y 12 |
| Menú lateral | Cerrar sesión | ✅ Cap. 14 |
| `/admin/classes`, `/admin/catalogs` | Redirigen a Calendario y Configuración (no hay listado de clases ni pantalla de catálogos propia) | ✅ Verificado al recorrer rutas |

## 2. Inicio (dashboard) — `/admin`

| Funcionalidad | Estado |
|---|---|
| Indicadores: Alumnos activos (+altas del mes), Profesores activos, Clases de hoy, Cobrado este mes | ✅ Cap. 1 |
| Clases del día con horario, profesor, inscriptos/cupo, modalidad y acceso a la clase | ✅ Cap. 1 y 10 |
| Finanzas del período (Pendiente / Vencido) y Ocupación (top 4), con accesos a Pagos y Reportes | ✅ Cap. 1 |

## 3. Configuración — `/admin/settings`

| Pestaña | Funcionalidad | Estado |
|---|---|---|
| Academia | Nombre, email institucional, teléfono | ✅ Cap. 2 |
| Consultas | Responsable y WhatsApp de consultas | ✅ Cap. 2 (el dato se guarda; el código no lo usa todavía en otras pantallas) |
| Operación | Zona horaria, anticipación mínima para cancelar | ✅ Cap. 2 |
| Canales | Instagram, TikTok, Facebook, YouTube; Gmail administrado | ✅ Cap. 2 |
| Landing | Reemplazar las tres fotos del collage público; restaurar | ⛔ Requiere Cloudinary (no conectado en el entorno de capacitación) |
| Sedes | Alta, edición, activar/desactivar | ✅ Cap. 2 (consulta) y Cap. 14 (alta y desactivación) |
| Catálogos | Alta de ritmo/público/nivel, reordenar, editar nombre, activar/desactivar | ✅ Cap. 2 (alta de "Dancehall"); 👁 reordenar/editar/desactivar |
| Catálogos | Ficha web del ritmo: descripción corta/larga, URL, publicar | ✅ Cap. 2 (descripción); ⛔ imagen de portada (Cloudinary) |
| Pistas, feriados y cobros | Pistas: alta y edición, estado | ✅ Cap. 2 (alta de "Salón B") |
| Pistas, feriados y cobros | Feriados: cargar (suspende las clases del día) y quitar | ✅ Cap. 2 (carga) y Cap. 11 (efecto en calendario) |
| Pistas, feriados y cobros | Día de vencimiento de la mensualidad; política de alta a mitad de mes | ✅ Cap. 2 (la política se guarda; en la práctica siempre se pregunta en cada alta) |

## 4. Usuarios — `/admin/users`

| Funcionalidad | Estado |
|---|---|
| Listado con búsqueda y filtros de rol y estado | ✅ Cap. 2 |
| Crear usuario Administrador o Profesor (sedes, contraseña inicial) | ✅ Cap. 2 |
| Desactivar / activar | ✅ Cap. 2 |
| Editar datos y contraseña | 👁 Cap. 2 |
| Eliminar (confirmación nativa del navegador) | ✅ Cap. 14 |
| Roles y permisos: ADMIN/SUPER_ADMIN (iguales en la administración) y PROFESSOR (portal propio) | 🔍 Código; explicado en Cap. 2 y 10 |

## 5. Mi perfil — `/admin/profile`

| Funcionalidad | Estado |
|---|---|
| Editar nombre, apellido, email y teléfono | ✅ Cap. 14 |
| Acceso y alcance (rol, academia, sedes) | ✅ Cap. 14 |
| Cambiar contraseña (cierra la sesión) | 👁 Cap. 14 (no se ejecuta para no invalidar el acceso de grabación) |

## 6. Profesores — `/admin/professors`, `/admin/professors/[id]`

| Funcionalidad | Estado |
|---|---|
| Listado en tarjetas o lista; búsqueda; filtros por sede, disciplina y estado | ✅ Cap. 3 |
| Alta con acceso, sedes, disciplinas, Instagram, descripción y biografía | ✅ Cap. 3 (Carla Romero) |
| Perfil: indicadores, datos, alcance, publicación web, material comercial, clases asignadas | ✅ Cap. 3 |
| Editar (disciplinas, sedes y datos) | ✅ Cap. 3 |
| Restablecer acceso (nueva contraseña) | 👁 Cap. 3 |
| Inactivar / reactivar | ✅ Cap. 3 |
| Eliminar (solo sin clases vinculadas) | 🧪 Bloqueo verificado por API |
| Foto de perfil y video de presentación | ⛔ Requiere Cloudinary |
| Publicar en la web | 👁 Cap. 3 (requiere foto) |

## 7. Calendario y clases — `/admin/calendar`, `/admin/classes/[id]`, `/admin/sessions/[id]`

| Funcionalidad | Estado |
|---|---|
| Vistas Mes, Semana, Día y Lista; navegación Anterior/Hoy/Siguiente | ✅ Cap. 11 |
| Filtros por profesor, disciplina, clase, pista y estado | ✅ Cap. 4 y 11 |
| Crear clase: sede, pista, nombre, profesores, disciplinas, público, niveles, cupo, modalidad, precios por clase y planes mensuales de 4/8 clases, clase de prueba, horarios | ✅ Cap. 4 (Dancehall Inicial) |
| Panel de una fecha: estado, alumnos, precios, historial | ✅ Cap. 4, 7, 8, 11 |
| Solo esta clase: cambiar horario, pista o profesor suplente de una fecha | ✅ Cap. 11 y 13 |
| Reprogramar una fecha (mantiene alumnos y pagos) | ✅ Cap. 11 |
| Suspender / restaurar | 👁 Explicado en Cap. 11 |
| Cancelar una fecha con motivo | ✅ Cap. 11 |
| Marcar realizada / reabrir | ✅ Finalizar desde la clase del día (Cap. 10); 👁 reabrir |
| Avisar a alumnos y profesores (prepara avisos en Comunicaciones) | ✅ Cap. 11 |
| Clase extra | ✅ Cap. 11 |
| Arrastrar y soltar para reprogramar | 🔍 Código (no grabado) |
| Ficha de clase: estado, indicadores, horarios y vigencia, publicación web | ✅ Cap. 4 |
| Editar clase (cupo, precios, profesores, categorías, horarios) | ✅ Cap. 4 |
| Cambiar horario recurrente desde una fecha | ✅ Cap. 11 |
| Agregar / finalizar horario recurrente | 👁 Cap. 11 |
| Pausar / reanudar clase | ✅ Cap. 14 |
| Inactivar clase (cierra inscripciones, conserva historial) | 👁 Cap. 4 |
| Eliminar clase sin actividad | ✅ Cap. 14 |
| Bloqueo de eliminación con historial; cupo no menor a inscriptos | 🧪 Verificado por API |
| Copiar ID de la clase | 🔍 Código |

## 8. Promociones (dentro de cada clase)

| Funcionalidad | Estado |
|---|---|
| Crear 2x1 con período de inscripción y vigencia | ✅ Cap. 5 |
| Inscribir pareja 2x1 con vista previa de importes | ✅ Cap. 5 (Sofía Medina paga, Tomás Aguirre bonificado) |
| Ver el cargo bonificado y cobrar a quien paga | ✅ Cap. 5 |
| Crear promoción por porcentaje | ✅ Cap. 5 (Semana de la salsa, 15 %) |
| Crear promoción de precio final | ✅ Cap. 5 |
| Descuento fijo y encuentro puntual | 👁 Opciones mostradas |
| Cerrar campaña | ✅ Cap. 5 |
| Corregir pareja | 👁 Cap. 5 |
| Superposición de promociones bloqueada | 🧪 Verificado por API |
| Editar o borrar una promoción | ✖ No existe (solo se crean y se cierran) |

## 9. Alumnos — `/admin/students`, `/admin/students/[id]`

| Funcionalidad | Estado |
|---|---|
| Listado; búsqueda por nombre, email, teléfono o DNI; filtros de sede, estado y deuda vencida | ✅ Cap. 6 |
| Alta con datos personales, responsable y notas | ✅ Cap. 6 (Valentina Ríos) |
| Duplicados por DNI o email rechazados | 🧪 Verificado por API |
| Ficha: indicadores, información personal, inscripciones, pagos | ✅ Cap. 6 |
| Editar datos | ✅ Cap. 6 |
| Inactivar / reactivar | ✅ Cap. 6 |
| QR e historial: historial de clases, preferencias de contacto | ✅ Cap. 6 |
| Generar credencial QR y descargarla | ✅ Cap. 14 |
| Renovar / revocar credencial, imprimir | 👁 Cap. 14 |
| Recordatorios desde la ficha | 👁 (se usa el módulo Recordatorios, Cap. 14) |

## 10. Inscripciones

| Escenario | Estado |
|---|---|
| A · Mensualidad con plan y primer mes proporcional (desde la ficha de la clase) | ✅ Cap. 7 |
| B · Por clase con turnos habituales (desde la ficha del alumno) | ✅ Cap. 7 |
| B · Clase suelta de un día ("Agregar solo a esta fecha", Autorizado / Recupera) | ✅ Cap. 7 |
| C · Inscripción con promoción vigente (descuento aplicado al cobro) | ✅ Cap. 7 y 13; 2x1 en Cap. 5 |
| D · Varias clases | ✅ Cap. 7 |
| E · Cambiar plan mensual | ✅ Cap. 7 |
| E · Cambiar modalidad (por clase ↔ mensual) | 👁 Cap. 7 |
| E · Dar de baja y reinscribir | ✅ Cap. 7 (baja) / 👁 reinscribir |
| Clases de prueba desde la ficha de la clase (agendar, realizada, convertir) | 👁 Se usa el flujo desde Contactos (Cap. 9) |
| Cambiar turno / cancelar turno de un día | 👁 Cap. 10 |

## 11. Pagos — `/admin/payments`

| Funcionalidad | Estado |
|---|---|
| Por cobrar del mes; filtros Pendientes / Vencidos; cambio de período | ✅ Cap. 8 |
| Generación automática de mensualidades al abrir el mes | 🔍 Código; explicado en Cap. 8 |
| Cobrar mensualidad (medio de pago, comprobante opcional) | ✅ Cap. 8 |
| Cobro parcial | ✅ Cap. 8 |
| Agregar importe excepcional | ✅ Cap. 8 |
| Definir primer mes pendiente | 🔍 Código (en el guion el primer mes se define al inscribir) |
| Cobrar clase individual desde la clase del día | ✅ Cap. 8 |
| Cobrar con promoción | ✅ Cap. 5, 8 y 13 |
| Historial: total, cantidad, por medio, búsqueda | ✅ Cap. 8 |
| Ver recibo PDF | ✅ Cap. 8 |
| Enviar recibo por email | ✅ Cap. 8 (capturado localmente) |
| Recibo por WhatsApp, descargar recibo | 👁 Cap. 8 |
| Anular cobro con motivo | ✅ Cap. 8 |
| Adjuntar / ver comprobante | ⛔ Requiere Cloudinary |
| Exportar pagos, devoluciones, ajustes y saldo a favor | ✖ No existen en la interfaz (la API tiene devoluciones y ajustes) |

## 12. Contactos — `/admin/contacts`, `/admin/contacts/[id]`

| Funcionalidad | Estado |
|---|---|
| Listado de posibles alumnos y búsqueda por nombre, DNI o teléfono | ✅ Cap. 9 |
| Alta de contacto con control de duplicados | ✅ Cap. 9 y 13; 🧪 DNI y teléfono de otro contacto rechazados; ⚠️ no detecta el teléfono de un alumno cargado con espacios o guion (hallazgo 13) |
| Editar datos | 👁 Cap. 9 |
| Email, notas y preferencias (Más opciones) | ✅ Cap. 9 |
| Reservar clase sin cargo (prueba gratuita o cortesía) | ✅ Cap. 9 |
| Registrar presente / cancelar reserva | ✅ Cap. 9 (presente) |
| Convertir en alumno | ✅ Cap. 9 y 13 |
| Credencial de aspirante | 🔍 Código |
| Eliminar posible alumno | 👁 Cap. 9 |
| Estados de seguimiento, interés por disciplina, actividades con fecha | ✖ No existen en la interfaz (la API tiene "oportunidades" sin pantalla) |

## 13. Presentismo, recepción y tablet

| Funcionalidad | Estado |
|---|---|
| Clase del día: esperados, presentes, ausentes, a cobrar | ✅ Cap. 10 |
| Marcar presente / ausente y corregir ausente → presente | ✅ Cap. 10 |
| Finalizar clase | ✅ Cap. 10 |
| Recepción › Llegadas del día con filtros de fecha y clase | ✅ Cap. 10 y 13 |
| Recepción › Acceso de tablet: generar código | ✅ Cap. 10 |
| Tablet `/asistencia`: activar con código y registrar asistencia con DNI, elección de clase | ✅ Cap. 10 |
| Tablet: registro con QR | ⛔ Requiere cámara; no disponible en la grabación automatizada |
| Revocar accesos de tablet | 👁 |
| Historial de asistencia del alumno | ✅ Cap. 6 y 10 |

## 14. Comunicaciones, recordatorios, notificaciones, reportes y auditoría

| Funcionalidad | Estado |
|---|---|
| Comunicaciones › Email a un alumno, a una clase o a todos | ✅ Cap. 14 (un alumno; correo capturado) |
| Comunicaciones › WhatsApp precargado | 👁 Cap. 14 |
| Historial de comunicaciones y reintento | ✅ Cap. 14 |
| Recordatorios › habilitar, configurar frecuencia y programación | ✅ Cap. 14 |
| Recordatorios › vista previa y envío | ✅ Cap. 14 (correo capturado) |
| Notificaciones › centro de actividad | ✅ Cap. 12 |
| Reportes › filtros por fechas y sede, Este mes, Aplicar | ✅ Cap. 12 |
| Reportes › caja, facturación, por cobrar, turnos, ingresos por modalidad y medio, actividad, detalle por clase | ✅ Cap. 12 |
| Reportes › exportar Excel | ✅ Cap. 12 |
| Reportes › PDF, contactos generados, conversiones, rendimiento por profesor | ✖ No existen (el detalle por clase permite comparar disciplinas y profesores) |
| Auditoría › listado con búsqueda y filtro de entidad | ✅ Cap. 12 |

## 15. Hallazgos detectados durante la auditoría y su corrección

Los videos se grabaron **antes** de estas correcciones, así que algunos capítulos todavía muestran el comportamiento anterior (por ejemplo, la recarga después del 2x1 en el capítulo 5). Las correcciones están en el working tree de `main`, sin commit. Están cubiertas por `apps/api/src/modules/admin/tutorial-findings.test.ts` y `apps/web/src/lib/dates.test.ts`, y la suite completa de la API pasa.

| # | Hallazgo | Estado | Corrección |
|---|---|---|---|
| 1 | Crear una clase exige elegir una pista, aunque Configuración indica "Asignarlas es opcional". | ✅ Corregido | "Crear clase" ofrece "Sin pista asignada" y preselecciona la primera pista de la sede (`class-create-modal.tsx`). |
| 2 | En "Clases asignadas" del profesor los días aparecen en inglés ("MONDAY 19:00"). | ✅ Corregido | Se traducen con `dayLabels` (`professor-detail-live.tsx`). |
| 3 | Errores de formulario detrás del modal (alta de alumno, usuarios, sedes, editar profesor, restablecer acceso). | ✅ Corregido | Cada modal muestra su error dentro del formulario (`error` de `LiveModal`). |
| 4 | Eliminar usuario y eliminar contacto usan la confirmación nativa del navegador. | ✅ Corregido | Usan el diálogo propio de la administración, en tono de peligro. |
| 5 | WhatsApp del recibo limpia mal el teléfono (`/D/g`). | ✅ Corregido | `/\D/g` (`student-detail-receipts.ts`). |
| 6 | El filtro "Reprogramada" del calendario nunca muestra resultados. | ✅ Corregido | La API y la vista dejan de ocultar las reprogramadas cuando se filtra explícitamente por ese estado. |
| 7 | Fechas de promociones en formato ISO. | ✅ Corregido | Formato dd/mm/aaaa en vigencia, inscripción y aviso del 2x1. |
| 8 | Auditoría con acciones en inglés y búsqueda solo por códigos. | ✅ Corregido | Etiquetas en español para más de 100 acciones y 28 entidades en `packages/shared/src/audit.ts`, compartidas por la web y la API. La búsqueda acepta el texto en español ("cobro anulado", "alumno") y el filtro de entidad incluye todas. |
| 9 | La política "Alta a mitad de mes" se guarda pero no se aplica. | ✅ Corregido | Si la academia fija "Cuota completa" o "Proporcional", se aplica cuando no se eligió otra opción: altas, conversiones, 2x1, generación mensual. La ficha de la clase la preselecciona. Con "Preguntar en cada alta" (por defecto) no cambia nada. |
| 10 | Las campañas masivas no respetan "Aceptar novedades y promociones". | ✅ Corregido | "Todos los alumnos con email" envía, por defecto, solo a quienes aceptaron. Un casillero permite desactivarlo para avisos institucionales. Los envíos a una clase o a un alumno no se filtran porque son operativos. |
| 11 | Las sesiones empiezan hoy aunque se indique una fecha de inicio anterior. | ➖ Sin cambios (diseño) | La API impide horarios retroactivos a propósito (`assertNotRetroactive`), para no generar clases ni cobros en el pasado. |
| 12 | Después de "Inscribir pareja 2x1", "Inscriptos actuales" no se actualiza. | ✅ Corregido | La tarjeta de promociones avisa a la ficha de la clase y la lista se recarga. |
| 13 | El control de duplicados de Contactos no detecta el teléfono de un alumno guardado con formato. | ✅ Corregido | La comparación ignora espacios, guiones y signos (`samePhoneDigits`). |
| 14 | El historial muestra el día siguiente para clases nocturnas (UTC). | ✅ Corregido | La fecha se calcula en la zona horaria de Argentina (`contact-history.ts`). |
