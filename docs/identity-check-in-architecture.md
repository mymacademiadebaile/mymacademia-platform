# Identidad y recepción — arquitectura implementada

## Identidad y compatibilidad

`Contact` representa a la persona; `Opportunity`, su interés por un grupo; `Student`, el perfil académico; `Enrollment`, su inscripción. Un contacto no necesita un Student para reservar o asistir a una prueba/cortesía.

Se conserva un invariante deliberado: **Contact._id = Student._id cuando existe perfil académico**. El backfill usa el ID del alumno existente; la conversión de un interesado crea Student con el ID del contacto. Las referencias financieras no cambian. `Student.contactId` tiene índice único parcial.

En `TrialBooking` y `ClassAttendance`, el nombre legado `studentId` se conserva como **clave de participante**, ahora con referencia a Contact, y se agrega `contactId` explícito. Ese campo no implica que exista un perfil Student. Esto mantiene los contratos operativos de sesiones, reportes e inscripciones sin crear alumnos ficticios ni borrar índices históricos de asistencia. Los cargos sólo referencian perfiles académicos reales. La lectura del roster combina Contact y Student para soportar datos previos al backfill.

Los datos de identidad se sincronizan entre Contact y Student dentro de una transacción desde las rutas de edición. No se fusionan personas por nombre, email familiar o teléfono. Las altas con medios coincidentes piden reutilizar/revisar el contacto; las altas sin medios tienen una clave de creación idempotente. Resolver homónimos o identidades que ya estuvieran duplicadas requiere intervención de recepción. El sistema no puede demostrar que dos identidades sin datos verificables pertenecen a la misma persona.

La baja de Student cierra inscripciones, pero **no archiva Contact**: un exalumno puede mantener intereses comerciales y tomar una prueba en otro grupo. La conversión reactiva su perfil académico existente. Archivar una identidad es una decisión separada.

## Pruebas y cortesías

Cada reserva nueva apunta a una **sesión concreta**, no a todos los horarios de una fecha. Las rutas antiguas con fecha sólo resuelven automáticamente cuando hay una única sesión; si hay varias exigen selección.

`TrialBenefit` tiene un índice único `(organizationId, contactId, classId)` y guarda reserva activa y consumo. Además, TrialBooking impide dos TRIAL SCHEDULED con la misma identidad/grupo por índice parcial. Locks de sesión/beneficio y transacciones serializan último cupo, cancelaciones, reservas y consumo concurrente. `PRESENT` es el único evento que consume. ABSENT/cancelación sin consumo libera la reserva y conserva el historial. Una corrección posterior no restaura el beneficio.

`COURTESY` requiere administrador, motivo y auditoría; no modifica TrialBenefit. Una cortesía a un inscripto puede sustituir su participación esperada; si ya existe cargo de esa sesión se exige revisión financiera antes. Clases FREE usan su regla existente. Ninguna gratuidad crea un cargo por asistencia.

El endpoint anterior de completar prueba registra PRESENT mediante el servicio común. La conversión es transaccional e idempotente; no reinicia beneficios, no cambia el QR y no registra pagos. Las mensualidades siguen el flujo existente de decisión de primer mes/generación de cargos, sin inventar una condición comercial.

## API de identidad

| Ruta administrativa | Uso |
|---|---|
| GET/POST `/api/admin/contacts` | Buscar/crear identidad (creationKey requerida en alta) |
| GET/PATCH `/api/admin/contacts/:id` | Historial, datos y preferencias |
| POST `/api/admin/contacts/:id/opportunities` | Interés y seguimiento por grupo |
| POST `/api/admin/contacts/:id/convert` | Inscripción directa sin exigir una prueba |
| POST `/api/admin/trials` | Reservar TRIAL/COURTESY con contactId y sessionId |
| PATCH `/api/admin/trials/:id` | Cancelar o confirmar asistencia por el servicio común |
| POST `/api/admin/trials/:id/convert` | Convertir preservando identidad e historial |

Las rutas de administración conservan los roles y scope de organización existentes. Los canales de profesor conservan su autorización por clase. El futuro portal necesita autenticación User separada; la identidad comercial no otorga autorización.

## Migración

`pnpm --filter @mym/api migrate:identity` usa el cliente nativo para emitir un **dry-run sin autoIndex ni escrituras**. `--apply` sólo admite localhost/loopback y se usa sobre copia respaldada. Se calcula el plan completo antes de escribir; las ambigüedades bloquean aplicación. Se preservan todos los documentos e IDs. La aplicación es aditiva e idempotente; ante una interrupción se reejecuta y se compara el informe.

El dry-run sobre la conexión configurada encontró 2 contactos faltantes, 1 asistencia sin contactId y ninguna prueba/ambigüedad. No se aplicó a esa base. Las aplicaciones ensayadas fueron exclusivamente en replica sets efímeros de tests. No se considera demostrada una migración de producción.

## Operación de contactos

1. Administración → Contactos: buscar antes de crear; registrar nombre, sede, procedencia y medios disponibles.
2. Ficha del contacto: registrar grupo de interés y próxima fecha de seguimiento. Un alumno puede mantener otras oportunidades abiertas.
3. Para una prueba: elegir fecha, clase y horario concretos; reservar. Para una cortesía: seleccionar el tipo y explicar el motivo.
4. Registrar presente desde la sesión o desde la ficha. El beneficio se consume al persistir PRESENT; ausencia/cancelación sin asistencia permite reprogramar.
5. Convertir la reserva a inscripción o usar Inscripción directa. Abrir la ficha académica para ajustar horarios, resolver la primera mensualidad y consultar cuenta corriente.
6. Las correcciones de PRESENT son administrativas y requieren motivo; cargos y beneficios históricos se concilian explícitamente, nunca se borran con la asistencia.

## Verificación reproducible

- API: Vitest/Supertest con MongoMemoryReplSet; no SMTP real.
- Navegador: `pnpm --filter @mym/web test:e2e`. Inicia API efímera y frontend local; exige `/__test/isolated` antes de escribir datos. Usuario de fixture `admin@example.test`, contraseña `LocalDemoOnly-1234`, exclusivos de esa base temporal.
- El fixture nunca usa la URI real: genera su propio replica set antes de importar la aplicación y dirige SMTP a localhost:1. No es un seed de despliegue.

## QR, dispositivos y kiosco

Administración → Contactos → ficha → Generar QR. Se entrega un PNG descargable/imprimible. Sólo se conserva SHA-256 del token aleatorio de 256 bits; el original no se puede recuperar al reabrir la ficha. Renovar revoca el anterior y no cambia la identidad. El QR habilita exclusivamente check-in; no autentica al futuro portal.

Administración → Recepción → Dispositivos → Autorizar nuevo dispositivo. Ingresar el código en `/check-in` de la tablet dentro de 10 minutos. Es de un solo uso; la autorización dura 8 horas en cookie HttpOnly, SameSite Strict, Secure en producción, con path limitado. El kiosco cierra cookies administrativas de ese navegador; generar el código desde otra computadora es el flujo recomendado. Cada tablet está ligada a organización/sede y puede revocarse inmediatamente. Los verificadores nunca se devuelven en los listados.

El primer toque habilita audio y cámara (requiere HTTPS fuera de localhost). La cámara decodifica QR localmente con jsQR: no transmite ni guarda imágenes. Sólo se envía el token a la API propia. Una única sesión elegible se confirma automáticamente; con varias se selecciona una. La ventana por dispositivo comienza 45 minutos antes y termina 20 minutos después del inicio, limitada también por fin de sesión y día argentino; es editable por administración. Se respetan estado, sede, inscripción vigente, prueba/cortesía y snapshot. Una inscripción legítima de último momento se agrega como una sola fila auditada; no recalcula el historial.

Los tokens/dispositivos y la elegibilidad se vuelven a verificar dentro de la transacción de asistencia. Actualizar lastUsedAt/lastSeenAt serializa una revocación concurrente. Los controles de origen y rate limiting se suman al rate limiter general existente. Los límites en memoria heredan la limitación de ese middleware: son por instancia; un despliegue distribuido puede sumar un almacén compartido o protección de plataforma.

Después de la respuesta persistida se reproducen dos tonos ascendentes (éxito), uno suave (duplicado) o dos descendentes (error). El volumen y silenciado provienen del dispositivo. Un pago pendiente se informa sin montos y no bloquea ni convierte un éxito en error. Pantalla de resultado se limpia a los 7 segundos; selección a los 20. Las imágenes de cámara y el token no se guardan en almacenamiento del navegador. Ocultar/cerrar la pantalla detiene la cámara. El botón de ayuda deriva a identificación asistida por recepción; no hay búsqueda pública de personas.

Recepción muestra presentes, origen, sesión, saldo pendiente/vencido/a favor, pagos parciales, último recordatorio y enlaces a ficha/sesión. Los saldos salen de balance-service. Los intentos fallidos guardan sólo dispositivo, código de error y fecha, con retención de 30 días. No guardan QR, IP, cuerpo de solicitud ni importes.

Pruebas Chromium decodifican un QR real mediante video generado desde canvas (sin cámara física), confirman su persistencia por API y verifican tonos, duplicado, error de servidor, silenciado y limpieza de pantalla. Queda una prueba de aceptación física de cámara/altavoces en la tablet elegida: las pruebas automatizadas no demuestran calidad óptica ni volumen del hardware.

## Recordatorios de deuda

Comunicaciones → Gestionar recordatorios de deuda, o ficha del alumno → Recordatorios. Los dos interruptores (general y programado) comienzan apagados. Administración configura frecuencia mínima (1–60 días), días de vencimiento para programación (1–90) y desglose opcional. La persona controla su preferencia de recordatorios desde la ficha de Contactos. El portal futuro debe aplicar esa misma preferencia.

Seleccionar alumno, revisar saldo pendiente/vencido/a favor y vista previa; luego confirmar Enviar email. El mensaje usa español argentino y la plantilla SMTP existente. La vista previa nunca se acepta como contenido de envío: se recalcula el balance al procesar, y otra vez inmediatamente antes de SMTP. Una cuenta regularizada o sin autorización se omite.

La persistencia del envío se reserva como PENDING antes de llamar SMTP, bajo lock por alumno y transacción. `deliveryKey` es único por organización; reintentos de la misma solicitud no duplican envíos. La frecuencia se aplica a todos los caminos, incluidos recordatorios de cargos, pagos legacy y reintentos de historial. Los intentos fallidos también respetan frecuencia para evitar duplicar una entrega incierta. Un PENDING después de una interrupción requiere revisión operativa; nunca se reenvía automáticamente ese intento. No es posible garantizar entrega exactamente una vez entre MongoDB y un proveedor SMTP sin idempotencia del proveedor. SENT significa que SMTP aceptó el mensaje, no que el destinatario lo leyó o recibió.

Los errores guardados son genéricos y no contienen diagnósticos SMTP ni secretos. SKIPPED distingue una omisión legítima de un fallo. El historial guarda destinatario, texto privado, estado y fecha; es accesible sólo en administración.

La programación se conecta al job diario **existente** y autenticado; no se creó ni desplegó un cron nuevo. Sólo procesa una organización con ambos interruptores activos, después del umbral de vencimiento, con un máximo de 100 intentos nuevos por corrida. No envía nada desde check-in. No se habilitó programación ni se enviaron correos reales durante este trabajo. Tests de servicio usan SMTP mock; E2E usa localhost:1 para comprobar el error y el historial sin entregar emails.

### Endpoints de recordatorios

- GET/PATCH `/api/admin/debt-reminders/settings`.
- GET `/api/admin/debt-reminders/students/:id/preview`.
- POST `/api/admin/debt-reminders/students/:id/send` con `idempotencyKey` estable por acción.
- GET `/api/admin/debt-reminders/students/:id/history`.

### Validación aislada del navegador

`pnpm --filter @mym/web test:e2e:reception` usa puertos 3100/4100 y `.next-reception`, evitando colisiones con el desarrollo/SEO local. No reutiliza servidores desconocidos. El fixture siempre genera su propia base. `test:e2e` conserva el flujo original 3000/4000 para otras suites. Los archivos generados de Next se deben revisar al terminar un build de verificación.

El recorrido de gestión genera/renueva un QR PNG, autoriza un dispositivo, comprueba automatización deshabilitada y procesa una falla SMTP local en el historial. El recorrido de cámara también simula una solicitud demorada al ocultar y volver a la pestaña: no restaura el nombre ni un resultado después del reinicio de privacidad.

## Puesta en uso pendiente de autorización

El código y los flujos automatizados están completos; no equivalen a un despliegue ni a una migración de datos reales. Antes de habilitar recepción se necesita respaldo, revisión del dry-run en destino y autorización explícita para la migración/despliegue. MongoDB debe soportar transacciones; los flujos críticos fallan si no las soporta. `--apply` remoto sigue bloqueado en el script.

En la tablet elegida, verificar HTTPS, permisos de cámara/audio, lectura de QR en papel y pantalla, respuesta sonora física, volumen/silenciado, rotación del teléfono, expiración/revocación del dispositivo y limpieza de datos entre personas. Para emails, verificar destinatario autorizado y aceptación/entrega SMTP antes de habilitar la política. No se enviaron emails reales en las validaciones.

La recepción asistida resuelve homónimos y revisa duplicados antes de crear una identidad; el beneficio es único por identidad/grupo y no sustituye la verificación humana de una persona que intente registrarse con identidades distintas. No hay integración Meta ni portal de alumnos en esta entrega.
