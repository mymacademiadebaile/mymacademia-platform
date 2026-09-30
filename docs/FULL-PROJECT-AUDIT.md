# M&M Academia — Auditoría Integral

Fecha: 2026-09-29 · Base auditada: `main` @ `3a6ea46` (feat(admin): manage academic catalogs from settings).

**Metodología.** Validaciones ejecutadas por mí (install, typecheck, test, build, prueba de `dist` obsoleto, arranque de `api dev`). Revisión estática por cuatro pasadas de solo lectura: (1) seguridad y multi-tenancy, (2) billing/inscripciones/sesiones, (3) frontend, (4) modelos/catálogos/seeds/docs/tests. Los números de línea son aproximados. Salvo lo indicado en la sección 4, **ningún flujo se ejecutó contra una base real**: los escenarios de la sección 15 se simularon leyendo código, porque el repo tiene solo 4 tests. Todo hallazgo lleva CONFIRMADO (demostrado por lectura de código) o RIESGO (depende de datos/despliegue/prueba).

**Aviso sobre el árbol de trabajo.** Durante la auditoría aparecieron cambios que **no hice yo ni los subagentes de lectura**: `apps/api/package.json` (se agregó `mongodb-memory-server`) y el archivo nuevo `apps/api/src/common/dates.ts`. Parecen trabajo de correcciones iniciado por otra sesión o proceso. No los toqué ni los evalué; esta auditoría corresponde al commit `3a6ea46`.

---

## 1. Resumen ejecutivo

- El proyecto compila, tipa y arranca. No hay hallazgos P0 confirmados.
- **Multi-tenancy: sólida.** Todas las queries de negocio revisadas filtran por `organizationId` tomado del JWT. Únicamente hay una referencia sin validar (`student.branchId`), que no filtra datos pero deja registros huérfanos o ligados a una sede ajena.
- **Los riesgos reales están en dinero y consistencia**: la `billingPreference` queda inválida o ambigua en varios flujos, los pagos no tienen unicidad a nivel base de datos, el alta manual de pagos no valida modalidad, y los formularios de edición descartan en silencio ritmos/profesores inactivos ya usados.
- **Seguridad de producción**: secreto JWT con valor por defecto público, login sin rate limit propio, `pino-http` que loguea cookie/token.
- **Cobertura de tests casi nula** (4 tests: `health` y esquemas de perfil). Ningún flujo de billing, sesiones, inscripciones o tenancy tiene prueba automática.
- La experiencia SPA está bien resuelta: no hay `location.reload`, `alert` ni `confirm` nativo en el admin.

Conteo: **P0: 0 · P1: 8 · P2: 36 · P3: 24**.

## 2. Estado general del proyecto

Base funcional amplia y coherente con el alcance vigente (V1 incluye asistencia operativa). Lista para seguir desarrollando funcionalidades. No lista para producción con datos reales hasta cerrar el Bloque 1 y 2 del plan (sección 23).

## 3. Arquitectura

| Pieza | Responsabilidad | Dependencias |
|---|---|---|
| `apps/api` | Express 5 + Mongoose 8 + Zod 4. Rutas `/api/auth` (pública), `/api/admin` (`requireAuth` + `requireRole("ADMIN")`), `/api/professor` (`PROFESSOR`), `/api/health` | `@mym/shared` (workspace), MongoDB, Cloudinary, SMTP (Nodemailer/Gmail), exceljs, pdfkit |
| `apps/web` | Next.js (App Router). `/admin/*`, `/professor`, `/login`, recuperación de contraseña. `AuthGate` en el layout de `/admin` y `/professor` | API vía `fetch` con `credentials: "include"`. **No importa `@mym/shared`** (tipos duplicados) |
| `packages/shared` | Constantes/enums runtime (`BILLING_MODES`, etc.) compilados a `dist/` | — |

- **Flujo**: navegador → `apiFetch` (`lib/api.ts`) → Express (helmet, CORS, rate limit global 120/min/IP en memoria, pino-http) → middleware auth → Zod → Mongoose → MongoDB.
- **Auth**: JWT de 15 minutos en cookie `mym_access` (httpOnly, `SameSite=Lax`, `secure` en producción). Sin refresh. bcrypt costo 12. Reset por token aleatorio con hash SHA-256, TTL 30 min, un solo uso.
- **Errores**: `AppError` con códigos + `error-handler.ts` (no expone stack). Errores de Multer/E11000/JSON malformado salen como 500 (P2-14).
- **Feedback**: `AdminFeedbackProvider` (`confirm()` modal, `toast()`). El portal de profesor no lo usa.
- **Archivos**: Cloudinary (avatar 5 MB, video 60 MB, comprobantes de pago) vía Multer en memoria.
- **Comunicaciones**: email real (Nodemailer, síncrono); WhatsApp solo como enlace `wa.me` (sin API); todo registrado en `NotificationLog`.
- **Modelos**: Organization, Branch, User, Professor, Student, DanceClass, Enrollment, Payment, ClassSession, ClassAttendance, TrialBooking, CatalogItem, NotificationLog, AuditLog, Sequence, PasswordResetToken.
- **CI**: `.github/workflows/ci.yml` (typecheck, test, build por turbo; instala con `--no-frozen-lockfile`).

## 4. Resultado de CI / builds / tests

Comandos ejecutados desde la raíz del repo (Windows, pnpm 10.17.1, turbo 2.11.5, Node 24.11.1):

| Comando | Resultado |
|---|---|
| `pnpm install` | OK (lockfile ya resuelto). Aviso: build script de `esbuild` ignorado |
| `pnpm typecheck` | OK (4 tareas) |
| `pnpm test` | OK: api 2 archivos / 4 tests; shared y web no tienen tests (solo imprimen un mensaje) |
| `pnpm build` | OK (Next compila 24 rutas) |
| `pnpm --filter @mym/shared build` | OK |
| `pnpm --filter @mym/api typecheck` / `test` / `build` | OK |
| `pnpm --filter @mym/web typecheck` / `build` | OK |
| `pnpm --filter @mym/api dev` | OK: recompila shared y responde `listening on port 4000`. No verifiqué la conexión a Mongo (no leí `.env` por política de credenciales) |

**Turbo emite `WARNING no output files found` para `test`**: `outputs: ["coverage/**"]` sin coverage. Cosmético.

### `@mym/shared` y `dist` obsoleto: ¿resuelto?

Prueba realizada: borré `packages/shared/dist` (ignorado por git; se regeneró después con `dev`) y ejecuté cada flujo:

| Situación sin `dist` | Resultado |
|---|---|
| `pnpm --filter @mym/api typecheck` directo | **FALLA**: `Cannot find module '@mym/shared'` |
| `pnpm --filter @mym/api test` directo | **FALLA** (exit 1) |
| `import('@mym/shared')` con tsx | **FALLA** |
| `pnpm --filter @mym/api dev` | OK: el script compila shared antes |
| `pnpm build/typecheck/test` vía turbo | OK: `dependsOn: ["^build"]` |

**Conclusión:** el problema quedó mitigado, no eliminado. `dev`, `seed:*` y turbo construyen shared primero, pero (a) invocar `typecheck`/`test`/`vitest` de `@mym/api` directamente en un clon limpio sigue fallando; (b) `tsx watch` no vigila `shared/dist`, así que un cambio en `packages/shared/src` durante `dev` no se refleja hasta reiniciar (P2-34); (c) `shared` no tiene `noEmitOnError`, un error de tipos puede emitir un `dist` roto. Producción (`node dist/server.js`) exige haber corrido `turbo build`; no hay Dockerfile en el repo que lo garantice.

**Efectos secundarios de las ejecuciones** (`git status`): `.turbo/`, `apps/web/tsconfig.tsbuildinfo` y `apps/web/next-env.d.ts` (regenerado por Next). `pnpm-lock.yaml` y `AGENTS.md` ya estaban sin trackear antes de empezar.

---

## 5. Hallazgos P0

Ninguno confirmado. Nota: **P1-01 (secreto JWT por defecto) pasa a P0 si producción arranca sin `JWT_ACCESS_SECRET`.**

Formato de cada hallazgo: **ID · Sev · Título · Estado — Archivo(s)/función — Qué pasa — Reproducir — Impacto — Causa raíz — Solución — Complejidad.**

## 6. Hallazgos P1

**P1-01 · RIESGO · JWT con secreto por defecto también en producción**
- `apps/api/src/config/env.ts:15-18` (verificado). También `MONGODB_URI` y `APP_ORIGIN` con defaults de desarrollo.
- Sin `JWT_ACCESS_SECRET`, arranca con `development-only-secret-change-before-production` (pasa `.min(32)`).
- Reproducir: desplegar sin la variable; firmar un JWT `{sub, organizationId, role:"ADMIN"}` con el secreto público.
- Impacto: toma total de cualquier organización. Causa: default en el schema. Solución: sin default y `superRefine` que rechace el valor de desarrollo si `NODE_ENV=production` y exija `APP_ORIGIN`/`MONGODB_URI`. **XS.**

**P1-02 · CONFIRMADO · `branchId` de alumno no se valida contra la organización**
- `apps/api/src/modules/admin/students.routes.ts` POST (~172-201) y PATCH (línea 270, `as never`, verificado; el schema solo usa `objectIdSchema`, líneas 11 y 27).
- Reproducir: `POST /api/admin/students` con `branchId` de otra organización o inexistente → 201.
- Impacto: referencia cross-tenant / huérfana. No se filtran datos (no hay populate), pero el alumno no se puede inscribir ni cobrar (`STUDENT_BRANCH_MISMATCH`) y los reportes por sede se corrompen. Otros módulos sí validan.
- Solución: `BranchModel.exists({_id, organizationId, isActive:true})` antes de crear/actualizar. **XS.**

**P1-03 · CONFIRMADO · `billingPreference` inválida o ambigua al mover, convertir prueba o reactivar**
- `enrollments.routes.ts:271-291` (`/move`); `trials.routes.ts:~605-625` (`/convert`); reactivación en `enrollments.routes.ts:162-175`.
- La inscripción nueva se crea sin `billingPreference`; si el destino tenía una INACTIVE se reactiva conservando la preferencia vieja (puede ser de otro `billingMode`). En clases BOTH queda sin definir y las vistas asumen PER_CLASS en silencio (`sessions.routes.ts:73`). Además `$set: {endedAt: undefined, billingPreference: undefined}` no borra campos en Mongoose 8 (RIESGO a probar); requiere `$unset`.
- Reproducir: mover un alumno MONTHLY a otra clase BOTH → queda sin preferencia y se ve PER_CLASS.
- Impacto: elección de cobro que nadie tomó. Solución: `resolveBillingPreference(targetClass, requested ?? previous)` en ambos flujos, aceptar `billingPreference` en el body, `$unset` explícito. **S.**

**P1-04 · CONFIRMADO · Cambiar `billingMode` de una clase no reconcilia las inscripciones**
- `classes.routes.ts:~420` (PATCH solo asigna).
- BOTH→PER_CLASS deja preferencias MONTHLY; BOTH→FREE deja preferencias viejas; FREE→otro deja `undefined`. `GET /enrollments` y la UI leen el valor crudo mientras sesiones resuelve por `billingMode` (`class-detail-live.tsx:524` vs `:529`).
- Impacto: datos inválidos y UI inconsistente. No altera pagos históricos.
- Solución: al cambiar el modo normalizar inscripciones ACTIVE (único→forzar; FREE→`$unset`; BOTH→conservar válida o PER_CLASS) y auditar. **M.**

**P1-05 · CONFIRMADO (lógica) · Sesión pasada muestra "sin pagar" tras cambiar la preferencia**
- `sessions.routes.ts:330-341` (`paymentMap.get(studentId + ":" + billingType)`) y `resolvedBillingPreference` (65-74).
- Reproducir: clase BOTH, alumno PER_CLASS paga el día 5; se cambia a MONTHLY; se abre la sesión del día 5 → aparece sin pagar y `quick-charge` permite cobrar MONTHLY. Inverso igual.
- Impacto: riesgo de doble cobro. Causa: el estado de pago depende de la preferencia vigente, no del pago real.
- Solución: buscar el pago PER_CLASS de ese día y el MONTHLY de ese período sin importar la preferencia; avisar si ya hay cobertura. **S.**

**P1-06 · CONFIRMADO · `POST /admin/payments` sin validar modalidad y con duplicado mal definido**
- `payments.routes.ts:489-575` (schema 24-35).
- Duplicado por `period + concept` (sin `paymentType` ni `classDate`): un MONTHLY con otro concepto entra aunque el período esté PAID; dos PENDING PER_CLASS del mismo mes dan 409 falso. No valida `billingMode` (se crea MONTHLY en clase PER_CLASS/FREE), ni clase ACTIVE, ni exige `classDate` en PER_CLASS ni coherencia `period`/`classDate`.
- Impacto: deuda de septiembre con septiembre pagado; cobros en modalidad no habilitada. `quick-charge` sí valida (391-399).
- Solución: servicio compartido `assertChargeAllowed` para ambas rutas (PER_CLASS: alumno+clase+día; MONTHLY: alumno+clase+período). **M.**

**P1-07 · RIESGO / REQUIERE PRUEBA · Sin índice único de pagos: doble cobro por carrera**
- `payment.model.ts:60-67` (verificado: índices no únicos salvo `receiptNumber`); `payments.routes.ts:419-464` (`exists` → `create`).
- Reproducir: doble clic o dos admins con dos `quick-charge` simultáneos → dos PAID y dos recibos. `mark-paid` (599-651) es read-modify-write sin condición de estado: dos números de recibo. `nextReceiptNumber` se consume antes del `create` (huecos).
- Solución: guardar `classDay` (YYYY-MM-DD); índices únicos parciales sobre `status ∈ {PENDING, PAID, OVERDUE}` (PER_CLASS: org+alumno+clase+classDay; MONTHLY: org+alumno+clase+period); capturar E11000→409; `mark-paid` con `findOneAndUpdate` condicional. Antes, auditar duplicados existentes. **M.**

**P1-08 · CONFIRMADO · Editar profesor/clase descarta ritmos, niveles o profesores inactivos ya usados**
- Frontend: `professor-detail-live.tsx:65,98,441`; `class-detail-live.tsx:136-138,331-333,586-601`. Backend: `classes.routes.ts:373-381,112-188` (`validateClassRelations` exige `isActive:true` y se le reenvían los ids existentes).
- Los `<select multiple>` solo listan ítems activos; al guardar, `form.getAll` omite los inactivos y el PATCH reemplaza el arreglo. En backend, editar solo la sede de una clase con un ritmo inactivo falla con `INVALID_*`.
- Reproducir: desactivar un ritmo usado (con `confirmInUse`), editar y guardar un profesor o clase que lo usaba → el ritmo desaparece.
- Impacto: pérdida de referencias históricas, contra el requisito. Contradice el mensaje "las referencias actuales se conservan".
- Solución: opciones = activos ∪ ya seleccionados (marcados "inactivo"); en backend validar solo ids nuevos (`nuevos − actuales`). **S.**

## 7. Hallazgos P2

**P2-01 · CONFIRMADO · Login/forgot/reset sin rate limit propio.** `middleware/rate-limit.ts`, `app.ts:34`. Solo 120 req/min/IP, en memoria; login acepta contraseñas desde 8 caracteres. Impacto: fuerza bruta viable sobre datos financieros; forgot-password permite spamear a un usuario. Solución: limitador estricto en `/auth/*` (IP+email), lockout/backoff, store compartido si hay varias instancias. **S.**

**P2-02 · CONFIRMADO (default de librería; verificar en runtime) · `pino-http` sin `redact`.** `app.ts:30` (`pinoHttp()` verificado). Los logs incluyen `cookie` (`mym_access`) y `authorization` (el test de health imprime headers). Solución: `redact` de `req.headers.cookie`, `req.headers.authorization`, `res.headers['set-cookie']`. **XS.**

**P2-03 · RIESGO · Login y forgot-password buscan por email global.** `auth.service.ts:9-17`, `auth.routes.ts:53-56`. Índice único `(organizationId, email)`; `findOne({email})` sin organización; el alta de profesores solo chequea duplicado dentro de la propia organización. Hoy no ocurre (una academia); con multi-org: cuenta equivocada/DoS de cuenta. Solución: email único global o slug de organización en login. **M.**

**P2-04 · CONFIRMADO · `q` usado como regex sin escapar.** `students.routes.ts:41-47`, `payments.routes.ts:118-138`, `professors.routes.ts:124-129`, `communications.routes.ts:377-382`, `classes.routes.ts:504`, `audit.routes.ts:458-471`. `q="("` da 500 real; riesgo de regex costosa (límite 120 caracteres). No es NoSQL injection. Solución: helper `escapeRegex`. **XS.**

**P2-05 · CONFIRMADO · `GET /admin/sessions?date=` escribe en la base, sin rango y con sesiones obsoletas.** `sessions.routes.ts:78-145`. `bulkWrite` upsert para cualquier fecha (1900, 2999) y previa a la creación de la clase; si cambia el horario la sesión vieja sigue y aparecen dos tarjetas (el `find` filtra por `classId`, no por horario vigente); un cambio solo de `endTime` no actualiza (`$setOnInsert`); clases desactivadas dejan sesiones ocultas; dos GET concurrentes pueden dar E11000 (bulkWrite ordenado) → 500 esporádico. No corrompe datos (índice único). Solución: acotar fechas (≥ `createdAt`, ±N días), filtrar/cancelar sesiones que ya no coinciden con horarios vigentes, `ordered:false` tolerando E11000, o crear sesiones bajo demanda. **M.**

**P2-06 · CONFIRMADO · Roster de sesión pasada usa inscripciones de hoy.** `sessions.routes.ts:230-250`. Un alumno dado de baja desaparece de sesiones pasadas (con su asistencia y pago); uno nuevo aparece en fechas previas a su ingreso. Solución: filtrar por `enrolledAt`/`endedAt` respecto de la fecha e incluir a quien tenga `ClassAttendance`; o materializar asistencia al completar. **M.**

**P2-07 · CONFIRMADO · Pruebas gratuitas: día UTC, fecha sin validar, repetibles, sin cupo.** `trials.routes.ts:436-497`, `sessions.routes.ts:48-53,238-245,422-427`, `class-detail-live.tsx:265`. `utcDayRange` usa el día UTC pero `scheduledFor` es un instante: una prueba a las 21:30 ART cae en el día siguiente y la asistencia devuelve 422 `STUDENT_NOT_IN_SESSION`. La UI manda `"YYYY-MM-DDT12:00:00"` sin offset. No valida que la fecha sea día de clase (nunca aparece en ninguna sesión); solo bloquea dos SCHEDULED simultáneas (una COMPLETED/CANCELLED permite reagendar sin límite); no cuenta contra el cupo. Solución: recibir `trialDate` YYYY-MM-DD, validar contra horarios con `weekDayFor`, guardar 12:00Z, definir regla "una prueba por alumno y clase". **S-M.**

**P2-08 · CONFIRMADO · Vencimiento (`dueDate`) en UTC.** `payments.routes.ts:33` (`z.coerce.date()` sobre "YYYY-MM-DD" → 00:00Z), `effectiveStatus` (85-93), `buildPaymentFilter` (109-113), `students.routes.ts:69-72,135`, `reports.routes.ts:32`, `sessions.routes.ts:59`. Una cuota que vence el 10 pasa a OVERDUE el 9 a las 21:00 ART y `student-detail-live.tsx:467` muestra el 9. `quick-charge` usa 12:00Z y no lo sufre. Solución: normalizar a 12:00Z o fin de día ART con un helper único de fechas. **S.**

**P2-09 · CONFIRMADO (código); TZ del hosting a confirmar · Recibo PDF y Excel con la zona del servidor.** `payments.routes.ts:341` (`toLocaleDateString("es-AR")` sin `timeZone`), `export.xlsx` 276/280. Un cobro después de las 21:00 ART puede mostrar el día siguiente si el servidor está en UTC. El recibo no muestra `classDate`; el export no incluye columna `classDate`. Solución: `timeZone` explícito (mejor `organization.timezone`) y agregar la columna. **XS-S.**

**P2-10 · CONFIRMADO (posible por diseño) · `quick-charge` no respeta `billingPreference`.** `payments.routes.ts:374,391-399`. Solo compara con `billingMode`; en clase BOTH se puede cobrar MONTHLY a un alumno PER_CLASS y viceversa sin aviso (la UI sugiere el valor correcto). Solución: 409 con `overridePreference` explícito o registrar el desvío en auditoría. **S.**

**P2-11 · RIESGO · Clases legacy sin `billingMode` resuelven distinto por ruta.** `class.model.ts:49-53` (default PER_CLASS al hidratar; `.lean()` no lo aplica) vs `?? "MONTHLY"` en `sessions.routes.ts:69,180,326`, `payments.routes.ts:391`, `enrollments.routes.ts:26` y el web. Solo aplica si hay clases sin el campo en producción; no hay script de migración. Solución: migración one-off y eliminar los fallbacks. **S.**

**P2-12 · CONFIRMADO/RIESGO · Cupo, `move` y altas sin atomicidad.** `enrollments.routes.ts:141-160,245-291`, `trials.routes.ts:177-238`, `classes.routes.ts:676-692`. `count` → `create` permite sobrecupo concurrente; `move` desactiva el origen antes de crear el destino (si falla, el alumno queda sin inscripción); un alta duplicada concurrente cae en E11000 → 500. Solución: crear destino y luego cerrar origen, contador/transacción para cupo, mapear E11000→409. **M.**

**P2-13 · CONFIRMADO · Alumno desactivado sigue ocupando cupo.** `students.routes.ts:279` vs conteos de `enrollments.routes.ts:65-77`, `classes.routes.ts:283`, `sessions.routes.ts:146-155`. Cupos, reportes y comunicaciones cuentan inscripciones de alumnos inactivos; sesiones sí los filtra (pantallas discrepan). Solución: cerrar inscripciones al desactivar o filtrar por alumno activo. **S.**

**P2-14 · CONFIRMADO · Error handler devuelve 500 a errores de cliente.** `middleware/error-handler.ts`, `payments.routes.ts:75-78`. `MulterError`, `UNSUPPORTED_PROOF_TYPE`, E11000, JSON malformado y `CastError` salen como `INTERNAL_SERVER_ERROR`. Impacto: el usuario no ve "archivo muy grande" ni "duplicado", justo los casos de las carreras. Solución: mapear a 400/409/413/422. **XS.**

**P2-15 · RIESGO · Comprobantes de pago públicos en Cloudinary.** `services/cloudinary.ts:38-45`, `payments.routes.ts:721-727`. Tipo `upload` público, `public_id: payment-<id>` fijo, `overwrite:true` (reemplaza sin rastro). Solución: `type:"authenticated"` con URLs firmadas y `publicId` versionado. **M.**

**P2-16 · CONFIRMADO · Campaña de email síncrona y sin idempotencia.** `communications.routes.ts:222-303,407-488`, `services/mailer.ts`. Bucle secuencial dentro de la request, un transporter por envío, sin tope ni `batchId`; un doble clic envía todo dos veces; Gmail limita a ~500/día. Solución: cola/job con estado, tope, lock por organización, transporter pooled. **M.**

**P2-17 · CONFIRMADO · Audiencia DEBT incluye pagos PENDING no vencidos.** `communications.routes.ts:121-126`. En el resto del sistema (`students`, `notifications`) deuda = vencido. Solución: agregar `dueDate < ahora`. **XS.**

**P2-18 · CONFIRMADO · WhatsApp sin normalización E.164.** `communications.routes.ts:~323` (`wa.me/${phone.replace(/\D/g,"")}`). Un teléfono argentino con 0 y 15 no abre el chat correcto. Solución: normalizar con prefijo por defecto de la organización. **S.**

**P2-19 · CONFIRMADO · `seed-admin.ts` pisa datos en cada corrida.** `scripts/seed-admin.ts:66-84,138-145`. Reescribe la contraseña del admin con `ADMIN_PASSWORD`, nombre y sedes, reactiva al usuario, y en catálogos por defecto reescribe `isActive`/`sortOrder` (pierde la curación; reactiva ritmos apagados a propósito). Es el `seed:initial` del README y `.env.example` apunta a Atlas; sin guarda de `NODE_ENV`, sin validación de fuerza de contraseña, email real por defecto. Solución: `$setOnInsert` para todo salvo `--reset-password` explícito, guarda de producción. **S.**

**P2-20 · CONFIRMADO · Profesor: borrado con referencias huérfanas y cambios que no revalidan clases.** `professors.routes.ts:539-595` (DELETE duro de `Professor` y `User`; quedan `AuditLog.actorUserId`, `ClassAttendance.updatedByUserId`, `Payment.paidByUserId` huérfanos y `populate` devuelve `null`; borra media antes del borrado en DB, sin transacción) y `:349-363` (quitar sede o desactivar profesor no revisa sus clases activas). Solución: preferir inactivar, snapshot `actorName` en auditoría, advertir/rechazar con lista de clases afectadas. **S.**

**P2-21 · CONFIRMADO · Errores de mutación tapados y sin toast (regla UX incumplida).** `professors-live.tsx:449`, `students-live.tsx:88`, `professor-detail-live.tsx` (guardar, activar, media, borrar, reset), `catalogs-live.tsx`, `settings-live.tsx`, `communications-live.tsx:183/211/226`, `admin-profile.tsx`. Los fallos van a `setError` (bloque de página "No pudimos cargar esta sección") y el modal abierto lo tapa. Reproducir: crear profesor con email ya usado → modal sin mensaje ni toast. Solo `classes`, `class-detail`, `payments`, `student-detail` y `session` lo hacen bien. Solución: helper `toastError`; reservar `error` de página para carga. **S.**

**P2-22 · CONFIRMADO (análisis de código) · Email masivo: falso error tras envío exitoso.** `communications-live.tsx:180`. `event.currentTarget.reset()` tras dos `await`: `currentTarget` es `null` y lanza `TypeError`; el `catch` muestra error aunque el envío ya salió y no se limpia el formulario ni se recarga el historial. Riesgo de reenvío duplicado. Solución: `const formEl = event.currentTarget` al inicio. **XS.**

**P2-23 · CONFIRMADO · `window.confirm` nativo en el portal de profesor.** `apps/web/src/app/professor/page.tsx:181`. Sin `AdminFeedbackProvider` (usa `notice` inline que no se cierra). Solución: montar el provider en el layout del portal. **S.**

**P2-24 · CONFIRMADO · Selects de alumnos truncados a 100.** `class-detail-live.tsx:127`, `payments-live.tsx:166`, `communications-live.tsx:66` piden `/admin/students?limit=100`. Con más de 100 alumnos activos el resto no se puede inscribir, cobrar ni contactar, sin aviso. Solución: combobox con búsqueda remota (`?q=`). **M.**

**P2-25 · CONFIRMADO · Sesión vencida sin redirección al login.** `lib/api.ts` (sin manejo de 401) y `auth-gate.tsx` (valida solo al montar). Con la cookie de 15 min vencida cada pantalla muestra error hasta recargar a mano. Solución: en `apiFetch`, 401 fuera de `/auth/*` → `/login?next=`. **S.**

**P2-26 · CONFIRMADO · Fecha de nacimiento se muestra un día antes.** `student-detail-live.tsx:407` (`new Date(birthDate).toLocaleDateString`, la API guarda medianoche UTC). Edición usa `slice(0,10)` (discrepan). Solución: `formatDateOnly`. **XS.**

**P2-27 · CONFIRMADO · "Hoy" y "período" dependen de la zona del navegador.** `dashboard-live.tsx:68-72`, `payments-live.tsx:73-77`, `student-detail-live.tsx:94-98`, `reports-live.tsx:48-51` (`localDateValue()` copiada 3 veces). Con otra zona u cerca de medianoche, "Clases de hoy" muestra el día equivocado. El servidor (`currentPeriod`) usa -3h fijo. Solución: `lib/dates.ts` con `todayInTz(tz)` (`Intl` con zona de la organización). **S.**

**P2-28 · CONFIRMADO · Modales de gestión sin accesibilidad básica.** `live-common.tsx:35-88` (`LiveModal`). Sin Escape, sin `role="dialog"`/`aria-modal`/`aria-labelledby`, sin foco inicial ni trampa, X sin `aria-label`, backdrop cierra en `onMouseDown` (arrastrar desde un input pierde lo tipeado), X/Cancelar/backdrop siguen activos durante el guardado. `admin-feedback.tsx` (confirm) sí tiene Escape y `alertdialog`, pero no maneja foco. Solución: arreglar `LiveModal` una vez. **S.**

**P2-29 · CONFIRMADO · Campana: badge no se refresca y no hay leído/no leído.** `admin-shell.tsx:77-113`. El badge = vencidos + comunicaciones fallidas (contador de atención, no de no leídos); se carga al montar y al abrir; no se actualiza tras cobrar/enviar; un error de carga se traga y muestra "0 pagos vencidos"; el panel no cierra con Escape ni click afuera. No hay `readAt` (deuda de producto). Solución: contexto `useAttention().refresh()` tras mutaciones o polling 60 s; estado de error. **M.**

**P2-30 · CONFIRMADO · Fetches redundantes.** `class-detail-live.tsx:119-143` (cada mutación repite 7 requests, 5 estáticos, un único `busy` deshabilita toda la pantalla), `classes-live.tsx:59-91`, `professors-live.tsx:386-415`, `payments-live.tsx:143-181` (cada filtro repite sedes/profesores/catálogos). Solución: separar carga estática de dinámica o contexto compartido. **S.**

**P2-31 · CONFIRMADO/RIESGO · Catálogos sin cache compartida y sin creación en línea.** Cada pantalla refetchea `/admin/catalogs` al montar, por lo que un ritmo nuevo **sí** aparece sin recargar la app, pero un modal ya abierto o una pantalla que no remonta usa datos viejos; y si falta un ritmo hay que salir del formulario y perder lo cargado. Solución: `CatalogsProvider` con `refresh()`; atajo "crear ritmo" en formularios. **M.**

**P2-32 · CONFIRMADO/RIESGO · Sesión: sin refresh, sin revocación, cookie entre dominios.** `auth.service.ts:200-208`, `auth.routes.ts:19-27`, `require-auth.ts`. Hay que iniciar sesión cada 15 min; cambiar contraseña o desactivar un usuario no invalida los JWT vigentes; `SameSite=Lax` con web y API en dominios distintos no envía la cookie, y el arreglo habitual (`None`) abriría CSRF (no hay token). Solución: mismo sitio o proxy de Next; refresh rotativo o `tokenVersion`. **M.**

**P2-33 · CONFIRMADO · `pnpm-lock.yaml` sin trackear y CI con `--no-frozen-lockfile`.** `.github/workflows/ci.yml`. Dependencias no reproducibles. Solución: commitear el lockfile y `--frozen-lockfile`. **XS.**

**P2-34 · CONFIRMADO (reproducido) · `@mym/shared/dist` obsoleto/inexistente.** Ver sección 4. `test`/`typecheck` directos de `@mym/api` fallan en clon limpio; `tsx watch` no vigila shared. Solución: `pretest`/`pretypecheck` en `@mym/api` (o `tsc -w` de shared en `dev`), `noEmitOnError` en shared, documentar el despliegue. **XS-S.**

**P2-35 · CONFIRMADO · Documentación contradice el código.** Ver sección 20. **S.**

**P2-36 · CONFIRMADO · Cobertura de tests casi nula.** Ver sección 19. **L.**

## 8. Hallazgos P3

- **P3-01 · CONFIRMADO** Enumeración por timing y email bombing: `forgot-password` espera SMTP solo si el usuario existe; `login` no ejecuta bcrypt si no existe (`auth.routes.ts:56-94`). Responder antes de enviar, hash dummy, límite por email. **S.**
- **P3-02 · RIESGO** `avatarUrl`/`introVideoUrl` en PATCH admin aceptan cualquier `z.string().url()` (incluye `javascript:`/`data:`): `professors.routes.ts:48-49,358-359`. XSS almacenado si la web las usa en `href`/`src` (no verificado). Exigir https + host Cloudinary. **XS.**
- **P3-03 · CONFIRMADO** N+1 en `GET /admin/catalogs`: 1-2 `countDocuments` por ítem (~25-50 consultas por carga, llamado desde varias pantallas) (`catalogs.routes.ts:73-78`). Agregación + índices multikey. **S.**
- **P3-04 · CONFIRMADO** Agregaciones en memoria y sin tope: `payments.routes.ts:176-301` (summary y export), `reports.routes.ts:331`, `notifications.routes.ts:23`; listados sin paginación (`/classes`, `/professors`, `/catalogs`, `/branches`, `/trials`, `/enrollments`, historial de alumno). Riesgo futuro, no actual. **S.**
- **P3-05 · CONFIRMADO** Cambiar `student.branchId` no sincroniza inscripciones/pagos (`students.routes.ts:270`); desactivar sede no revisa clases/alumnos/profesores (`branches.routes.ts:380`); cambiar sede de una clase con inscripciones no revalida. **S.**
- **P3-06 · CONFIRMADO/RIESGO** `mark-paid`/`cancel` sin control optimista; cancelar un PAID no revierte el recibo (auditado); huecos de recibos; `amount` es `Number` float; `AuditLog.create` después del cambio y sin transacción (si falla, mutación hecha y 500); `OVERDUE` nunca se persiste (se calcula al leer, sin job). **S.**
- **P3-07 · CONFIRMADO** Subidas validadas solo por `mimetype` del cliente, Multer en memoria (hasta 60 MB), `resource_type:"auto"` (`payments.routes.ts:75`, `professor-media.ts:16`). Validar magic bytes, fijar tipo. **S.**
- **P3-08 · CONFIRMADO** Auditoría: el `before/after` de alumnos guarda PII sin retención (`students.routes.ts:283-304`); faltan eventos de login/logout/forgot, exportaciones (`export.xlsx`, `receipt.pdf`), seeds, autogeneración de sesiones; desactivar entidades queda como `*_UPDATED` genérico; sin índice `{org, entityType, entityId, createdAt}`; `NotificationLog` guarda mensaje y email en claro. **S.**
- **P3-09 · RIESGO** Open redirect: `login/page.tsx:37-45` acepta `next` si `startsWith("/")`; `//evil.com` pasa. **XS.**
- **P3-10 · CONFIRMADO** Catálogos: alta sin estado busy (Enter doble = doble alta), `normalizedName` solo trim+lowercase (Reggaeton ≠ Reggaetón), sin hook de modelo, `reorder` parcial deja `sortOrder` duplicados, reordenar solo con flechas (`catalogs-live.tsx:74-95`). **XS-S.**
- **P3-11 · RIESGO** `student-detail-live.tsx:51-56` recalcula "vencido" en el cliente en vez de usar `effectiveStatus`. **XS.**
- **P3-12 · CONFIRMADO** `login/page.tsx:52-54` calcula `passwordChanged` con `typeof window` (warning de hidratación); `router.refresh()` innecesario tras `router.replace` (`login/page.tsx:43`, `professor/page.tsx:204`); `AuthGate` trata cualquier error (incluso de red/500) como no autenticado. **XS.**
- **P3-13 · CONFIRMADO** Sesiones: `PATCH /sessions/:id/status` sin transiciones válidas (COMPLETED→CANCELLED con pagos); asistencia y cobro permitidos en CANCELLED/COMPLETED/futuras (`sessions.routes.ts:398-515`); cobro sin exigir PRESENT; UI sin "marcar todos presentes", se puede finalizar con alumnos EXPECTED o cobros pendientes sin aviso, `completeSession` sin busy. **S.**
- **P3-14 · CONFIRMADO** Frontend: Dashboard sin presentes/pendientes por clase; `admin-ui.tsx` (587 líneas) tiene >500 líneas de demos muertas (solo `PageHeader` se usa); catálogos duplicados en `/admin/catalogs` y `/admin/settings`; `professor-detail-live.tsx:411` muestra `MONDAY 18:00` sin traducir y `dayLabels` duplicado en 3 archivos; `<img>` sin `next/image` para avatares; formulario de clase con `select multiple` (Ctrl+click), sin validar `endTime > startTime`. **S.**
- **P3-15 · CONFIRMADO** Conflicto de horarios: no detecta solapes dentro de la misma clase (Lun 18:00-19:00 y 18:30-19:30) ni compara contra pruebas; chequeo/guardado no atómicos; `pricePerClass = 0` aceptado (falla recién al cobrar); no se valida que el ritmo de la clase esté entre las disciplinas del profesor (`classes.routes.ts:53-83,176-215`). **XS-S.**
- **P3-16 · CONFIRMADO** Bugs de listado: `GET /professors` tiene `else if (query.q)` inalcanzable y fallback por `displayName` que ignora `branchId` (`professors.routes.ts:132-154`); en `students.routes.ts:65,77` `?classId=` y `?debt=true` juntos se pisan en `filter._id`; sede comparada por nombre exacto. **S.**
- **P3-17 · RIESGO** Hardening: `jwt.verify` sin `algorithms/issuer/audience`; cambio de email del admin sin reautenticación; `settings.timezone` string libre y sin uso (`settings.routes.ts:216`); SMTP sin `requireTLS` y `errorMessage` devuelto al cliente. **XS.**
- **P3-18 · CONFIRMADO** Modelos: soft delete inconsistente (`isActive` vs `status`), dos representaciones de fecha (`sessionDate` string vs `classDate` Date), faltan índices `{org, classId, status}`, `{org, studentId, status}`, `{org, status}` en clases y multikey de profesores/disciplinas; `Payment.paymentType` default MONTHLY vs clase default PER_CLASS. **S.**
- **P3-19 · CONFIRMADO** Higiene: `.env.example` raíz trae `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM` (variables muertas) y un email real; `apps/web` duplica tipos/enums en vez de importar `@mym/shared` (riesgo de deriva); `seed:admin` y `seed:initial` son alias; `lint` = `typecheck`; turbo `outputs` de `test`. **XS.**
- **P3-20 · A CONFIRMAR CON NEGOCIO** Reportes agrupan `collectedAmount` por `period`, no por `paidAt` (`reports.routes.ts:106-116`): un mensual de septiembre pagado el 2 de octubre suma a septiembre; los totales incluyen CANCELLED. **XS.**
- **P3-21 · CONFIRMADO** `seed-natalia-catalogs.ts`: slug `mym-academia` fijo, no escribe AuditLog, cuenta renombres como "reactivated", si el admin renombró un ítem esperado crea uno nuevo. **XS.**
- **P3-22 · CONFIRMADO** `POST /professors`: si falla algo tras crear el profesor se borra el `User` pero queda un `Professor` huérfano (`professors.routes.ts:279-282`). **S.**
- **P3-23 · CONFIRMADO/INTENCIONAL?** Portal de profesor devuelve email y teléfono de alumnos (`professor.routes.ts:95-103`); al quitar una sede a un profesor sus clases de esa sede siguen visibles. **XS.**
- **P3-24 · CONFIRMADO** Componentes grandes con beneficio real al dividir: solo `app/professor/page.tsx` (541 líneas, 4 vistas en un componente) y, menos urgente, `payments-live.tsx` (651). `class-detail` (629), `student-detail` (580), `session` (481) son cohesivos. **M.**

---

## 9. Seguridad

Lo que **está bien** (verificado por lectura): todas las rutas `/api/admin` detrás de `requireAuth` + `requireRole("ADMIN")` y `/api/professor` detrás de `PROFESSOR` (solo `/health` y `/auth` son públicas por diseño); Zod 4 en todos los bordes elimina claves desconocidas (mass assignment mitigado; `role`, `organizationId`, `passwordHash` nunca vienen del body); NoSQL injection mitigada (query parser simple de Express 5 + Zod + `objectIdSchema`); `passwordHash` con `select:false`; bcrypt 12; reset seguro con respuesta uniforme 204; helmet, `x-powered-by` off, CORS con un origen explícito, JSON 1 MB, `trust proxy` solo en producción; sin stack traces al cliente; `.env` gitignoreado y no trackeado; uploads detrás de `requireAuth` con límites; Cloudinary por carpeta de organización.

Pendiente: P1-01, P1-02, P2-01, P2-02, P2-03, P2-04, P2-15, P2-32, P3-01, P3-02, P3-07, P3-17. XSS: no se encontró renderizado inseguro en la web; queda pendiente verificar el uso de las URLs de P3-02.

## 10. Base de datos

Índices únicos correctos donde importan: inscripción `{org, class, student}`, asistencia `{org, session, student}`, sesión `{org, class, sessionDate, startTime}` (fecha como string, sin sesgo UTC), `receiptNumber` `{org, receiptNumber}` sparse, secuencia `{org, key}`, usuario `{org, email}`, sede `{org, name}`, catálogo `{org, type, normalizedName}`. Recibos con `$inc` atómico. Faltantes y riesgos: P1-07, P1-02, P2-05, P2-12, P2-13, P2-20, P3-03, P3-04, P3-05, P3-18. Sin transacciones en ninguna operación multi-escritura (mover inscripción, alta de profesor, cobro+auditoría, borrado de profesor+media).

## 11. API

Zod en todos los bordes, `AppError` con códigos consistentes, auditoría amplia. Debilidades: errores de infraestructura como 500 (P2-14), regex sin escapar (P2-04), un GET con efectos secundarios (P2-05), listados sin paginación (P3-04), validación de pagos incompleta (P1-06), GET/PATCH sin control de concurrencia (P1-07, P2-12). Rutas de catálogos: `GET /`, `POST /`, `POST /reorder`, `PATCH /:id` (sin DELETE, correcto).

## 12. Frontend

Bien: `AuthGate` en el layout persiste entre navegaciones (no reconsulta por ruta); navegación interna con `next/link`/`router.push` (los únicos `<a href>` son mailto, WhatsApp y descargas); **no hay** `location.reload`, `location.assign`, `alert`, `prompt`; 15 usos de `confirm()` del provider con `alertdialog` y Escape; listas con debounce 180 ms que conservan datos mientras recargan; keys estables; `useEffect` sin loops; doble submit controlado en modales. Pendiente: P2-21..P2-31, P3-09..P3-14, P3-24.

## 13. UX

Pasos por flujo (administradora no técnica):
- **A) Profesor → clase → horarios → precio:** 2 modales (Profesor nuevo → detalle; Clase nueva con profesores, horarios, precio, modalidad, prueba). Fricción: `select multiple` con Ctrl+click, ritmo faltante obliga a salir del formulario (P2-31), un profesor puede crearse sin disciplinas.
- **B) Alumno → inscribir → modalidad → cobrar:** ~7 pasos en 3 pantallas (Alumnos→Nuevo→detalle→Inscribir con modalidad→Pagos→Nuevo cobro→alumno/clase/tipo). El detalle solo cobra pendientes existentes. Propuesta: botón "Cobrar" por fila de inscripción con alumno y clase precargados (ahorra ~4 pasos, M).
- **C) Clase de hoy:** Dashboard → tarjeta → Presente/Ausente (1 clic) → contador "A cobrar" → Cobrar (importe, medio y fecha precargados) → Finalizar (confirm). Bien resuelto; mejoras en P3-13.
- **D) Configuración → nuevo ritmo → profesor → clase:** escribir y Enter (toast) → Profesores → detalle → Editar → Guardar; Clases → Nueva. Funciona sin recargar la app, con la fricción de P2-31 y el riesgo de P1-08 al editar.

## 14. Billing

Reglas vigentes verificadas: default PER_CLASS en clase; `resolveBillingPreference` valida contra `billingMode` al alta; FREE → sin preferencia; `quick-charge` exige inscripción activa, misma sede, modalidad habilitada, importe > 0, audita; cancelados no bloquean un nuevo cobro; cancelar pide motivo y es idempotente; recibo solo para PAID. `classDate` se guarda a las 12:00Z, por lo que el duplicado PER_CLASS del mismo día **no depende de la hora**. Deuda: P1-03..P1-07, P2-08..P2-10, P2-15, P3-06, P3-20.

## 15. Class Sessions / asistencia — escenarios simulados

| # | Escenario | Resultado |
|---|---|---|
| 1 | PER_CLASS → presente → cobra hoy → no cobra dos veces | **PASA por UI/API secuencial** (duplicado por día, `classDate` 12:00Z). Falla ante concurrencia (P1-07) |
| 2 | MONTHLY paga septiembre → no debe septiembre | **PASA por `quick-charge`** (no hay generación automática de cuotas; duplicado por período). Se rompe por `POST /payments` (P1-06) y por concurrencia (P1-07) |
| 3 | BOTH PER_CLASS → cambia a MONTHLY → pagos previos siguen PER_CLASS | **PASA PARCIAL**: los pagos no se tocan (`billing-preference` solo cambia la inscripción); la sesión del día pagado se ve sin pagar (P1-05); `move`/`convert`/cambio de modo dejan preferencias inválidas (P1-03, P1-04) |
| 4 | Trial presente → recarga → no desaparece | **PASA** si la fecha cae en día de clase (la asistencia pasa la prueba a COMPLETED y el detalle incluye SCHEDULED y COMPLETED). Falla con fecha fuera de horario o cerca de medianoche (P2-07) |
| 5 | Profesor con dos clases superpuestas → se impide | **PASA** en alta y edición (`ensureNoProfessorConflicts`, solapes entre sedes, contiguos válidos). Huecos menores en P3-15 |
| 6 | Desactivar ritmo usado → conservar referencias | **Backend conserva** (solo desactiva, `confirmInUse`). **La UI las pierde al editar** (P1-08) |
| 7 | Nuevo ritmo aparece al crear clase/profesor sin recargar | **PASA** (refetch al montar). Modal ya abierto o pantalla sin remontar queda desactualizada (P2-31) |
| 8 | Navegación admin sin full reload | **PASA** (búsqueda global, sin `location.*`/`reload`) |
| 9 | API desde clon limpio sin `dist` | **PASA con `dev`, `seed:*` y turbo; FALLA con `typecheck`/`test` directos** (sección 4, P2-34) |
| 10 | Usuario de org A nunca accede a org B | **PASA por lectura de código** (todas las queries con `organizationId` del JWT). Sin test automático; única excepción de referencia: P1-02 |

Otros: `weekDayFor` usa 12:00 UTC (sin desfase); índice único de sesión con string de fecha evita duplicados; pendientes de la sección: P2-05..P2-07, P3-13.

## 16. Configuración / catálogos

Bien: `normalizedName` con índice único por organización y tipo, sin DELETE (solo desactivar con confirmación cuando está en uso), `reorder` valida pertenencia, ritmos/público/nivel por ObjectId (sin texto libre), auditoría en alta/edición/reorden. Ritmos confirmados: `seed-natalia-catalogs.ts` es idempotente, limitado a `slug: "mym-academia"`, reactiva/renombra ítems inactivos, agrega Bachata Sensual, Bachata Zouk/Souk y Estilo Femenino, no toca otras organizaciones. Problemas: P1-08, P2-19, P2-31, P3-03, P3-10, P3-21, catálogos duplicados en menú y Configuración (P3-14).

## 17. Notificaciones

`NotificationLog` (canal EMAIL/WHATSAPP; tipos DEBT_REMINDER/CLASS_REMINDER/PROMOTION; estados PENDING/SENT/FAILED/OPENED). El badge = vencidos + fallos (contador de atención, sin duplicados de ítems). No existe leído/no leído (`readAt`): **deuda de producto**. No hay recordatorios automáticos ni cola. `OPENED` significa "se abrió el enlace de WhatsApp". Pendiente: P2-16..P2-18, P2-29, P3-04, P3-06, P3-08.

## 18. Performance

**Problemas actuales reales:** N+1 en catálogos (P3-03), 7 fetches por mutación en detalle de clase y refetch de datos estáticos por cada filtro (P2-30), campaña de email síncrona (P2-16).
**Riesgos futuros:** agregaciones/exports en memoria y listados sin paginación (P3-04), índices faltantes (P3-18), sesiones creadas por `GET` (P2-05), rate limit en memoria por instancia (P2-01). Bundles razonables (First Load JS compartido 102 kB, páginas 109-118 kB).

## 19. Tests faltantes

Existentes: `health.test.ts` (1) y `profile.schemas.test.ts` (3). Web y shared sin tests; no hay DB de pruebas (durante la auditoría apareció `mongodb-memory-server` agregado por otra sesión). Tests propuestos, en orden de prioridad (vitest + supertest + `mongodb-memory-server`, helper `createOrg()`):
1. **Auth y tenancy:** dos organizaciones; admin A recibe 404 en GET/PATCH de alumnos, clases, pagos, catálogos, sesiones, profesores de B; PROFESSOR recibe 403 en `/api/admin/*`; login inactivo/token vencido/email repetido en dos orgs; reset de contraseña usado/vencido.
2. **Billing / quick-charge / duplicados:** MONTHLY duplicado por período 409; PER_CLASS duplicado por día 409 con horas distintas; cancelado permite recrear; modalidad no habilitada 422; importe 0 422; alumno no inscripto 422; sede distinta 422; `Promise.all` de dos cobros no crea dos pagos (falla hoy: P1-07); `mark-paid` idempotente; `POST /payments` con MONTHLY en clase PER_CLASS (falla hoy: P1-06).
3. **`billingPreference`:** `resolveBillingPreference` en PER_CLASS/MONTHLY/BOTH/FREE; `move` y `convert` la conservan (P1-03); cambio de `billingMode` de clase reconcilia (P1-04); reactivar limpia `endedAt`.
4. **Inscripciones:** cupo lleno 409; reinscribir reactiva sin duplicar; alumno inactivo no consume cupo (P2-13); `move` atómico.
5. **Sesiones/asistencia:** GET repetido no duplica; fecha lejana no crea documentos (P2-05); asistencia de alumno ajeno 422; prueba a las 23:00 ART en el día correcto (P2-07); cambio de horario no deja sesiones obsoletas; estado de pago de sesión pasada tras cambio de preferencia (P1-05).
6. **Catálogos:** unicidad por org/tipo y por acentos; desactivar en uso exige `confirmInUse`; reorder con ids de otra org 422; **regresión: editar profesor/clase con ritmo inactivo lo conserva** (P1-08).
7. **Conflictos de horario:** solapa 409; contiguas permitidas; edición excluye la clase propia; clase inactiva no cuenta.
8. **Seeds:** dos corridas no duplican ni pisan una desactivación (P2-19); no tocan otra organización.
9. Comunicaciones (DEBT excluye no vencidas), contrato de errores (E11000→409, archivo grande→413), unitarios puros (`effectiveStatus`, `overlaps`, `periodBounds`, `weekDayFor`).

## 20. Documentación vs implementación

- `README.md:~239`: dice "No incluye en V1: asistencia digital… clases de prueba". **Obsoleto**: ambas existen. No menciona `seed:natalia-catalogs`, clase del día ni pruebas.
- `docs/functional-scope.md`: alineado con asistencia operativa; aún promete como V1 cosas no implementadas: recordatorios de clase automáticos (solo envío manual), promociones del profesor a sus alumnos (el portal no tiene comunicaciones), exportación PDF (solo el recibo; Excel de pagos y reportes sí).
- `docs/architecture.md`: lista un módulo `promotions` inexistente; no lista sesiones, pruebas, comunicaciones ni asistencia; afirma scope por `branchId` que el acceso admin no aplica; no menciona JWT en cookie ni falta de refresh.
- `docs/admin-implementation-plan.md` (1210 líneas): sección 5 "Estado actual" desactualizada (marca ❌ recuperar contraseña, cambio de contraseña, auditoría, edición/reorden/uso de catálogos, Cloudinary: todo implementado); §6 sin ClassSession, ClassAttendance, TrialBooking, Sequence, PasswordResetToken. Su nota final sí aclara que prevalece la asistencia en V1, pero deja secciones internas en contradicción.
- `docs/admin-ux.md` y `docs/professor-ux.md`: faltan Clase del día, Auditoría, Catálogos; el portal de profesor no implementa "próxima clase", promociones ni mensajes.
- `.env.example` raíz: variables muertas (ver P3-19).

## 21. Código legacy / deuda

`grep` de TODO/FIXME/HACK/deprecated en `apps/api/src` y `apps/web/src`: sin resultados relevantes (solo `legacyHeaders: false`). Waitlist, Mercado Pago y CRM: no existen en código (coherente con V1). Restos de la etapa monthly-only: fallbacks `?? "MONTHLY"` (P2-11), default `Payment.paymentType = MONTHLY`, terminología "cuota" en `payments.routes.ts:532,540,557,615`. Asistencia: habilitada, sin flag "disabled". Código muerto: demos de `admin-ui.tsx`. Ver además P3-19.

## 22. Matriz de módulos

| Módulo | Backend | Frontend | Validación | UX | Tests | Estado |
|---|---|---|---|---|---|---|
| Auth / sesión | PARCIAL | PARCIAL | PARCIAL | PARCIAL | FALLA | PARCIAL |
| Multi-tenancy | OK | — | PARCIAL (`student.branchId`) | — | FALLA | PARCIAL |
| Clases | PARCIAL | PARCIAL | PARCIAL | PARCIAL | FALLA | PARCIAL |
| Inscripciones | PARCIAL | PARCIAL | PARCIAL | OK | FALLA | PARCIAL |
| Alumnos | PARCIAL | PARCIAL | PARCIAL | PARCIAL | FALLA | PARCIAL |
| Profesores | PARCIAL | PARCIAL | PARCIAL | PARCIAL | FALLA | PARCIAL |
| Pagos / billing | PARCIAL | OK | FALLA (`POST /payments`) | OK | FALLA | PARCIAL |
| Clase del día / asistencia | PARCIAL | OK | PARCIAL | OK | FALLA | PARCIAL |
| Pruebas gratuitas | PARCIAL | PARCIAL | PARCIAL | OK | FALLA | PARCIAL |
| Dashboard | OK | PARCIAL | OK | PARCIAL | FALLA | PARCIAL |
| Configuración / sedes | OK | PARCIAL | PARCIAL | PARCIAL | FALLA | PARCIAL |
| Catálogos | OK | FALLA (edición pierde inactivos) | PARCIAL | PARCIAL | FALLA | PARCIAL |
| Notificaciones / comunicaciones | PARCIAL | PARCIAL | OK | PARCIAL | FALLA | PARCIAL |
| Reportes / export | PARCIAL | OK | OK | OK | FALLA | PARCIAL |
| Auditoría | PARCIAL | OK | OK | OK | FALLA | PARCIAL |
| Portal profesor | PARCIAL | PARCIAL | OK | PARCIAL | FALLA | PARCIAL |
| Seeds | PARCIAL | — | PARCIAL | — | FALLA | PARCIAL |
| Build / CI / shared | PARCIAL | OK | — | — | PARCIAL | PARCIAL |
| Leído/no leído de notificaciones | NO IMPLEMENTADO | NO IMPLEMENTADO | — | — | — | NO IMPLEMENTADO |
| Recordatorios automáticos / refresh token | NO IMPLEMENTADO | — | — | — | — | NO IMPLEMENTADO |

## 23. Plan de corrección

**Bloque 1 — bloqueantes/críticos (antes de producción).** P1-01, P1-02, P2-01, P2-02, P2-14, P2-33, P2-34.
- Archivos: `config/env.ts`, `students.routes.ts`, `app.ts`, `middleware/rate-limit.ts`, `middleware/error-handler.ts`, `ci.yml`, `apps/api/package.json`, `packages/shared/tsconfig.json`.
- Dependencias: ninguna. Riesgo: bajo. Esfuerzo: ~1-2 días.

**Bloque 2 — integridad funcional.** P1-03..P1-08, P2-08..P2-13, P2-17, P2-19, P2-20. Orden: (a) tests base con Mongo en memoria (Bloque 4 parcial) → (b) servicio único de validación de cobros + `classDay` + índices únicos parciales (auditar duplicados previos) → (c) reglas de `billingPreference` (`move`, `convert`, cambio de modo, `$unset`) → (d) estado de pago de sesión por pagos reales → (e) migración `billingMode` legacy y retiro de `?? "MONTHLY"` → (f) fechas en ART con helper único (backend y `lib/dates.ts`) → (g) atomicidad de cupo/`move`.
- Archivos: `payments.routes.ts`, `payment.model.ts`, `enrollments.routes.ts`, `trials.routes.ts`, `classes.routes.ts`, `sessions.routes.ts`, `class-detail-live.tsx`, `professor-detail-live.tsx`, `students.routes.ts`, `professors.routes.ts`, `seed-admin.ts`, nuevo script de migración.
- Riesgo: medio-alto (datos de dinero; migrar con backup). Esfuerzo: ~2 semanas.

**Bloque 3 — UX.** P2-21..P2-25, P2-27..P2-31, P3-09..P3-14.
- Archivos: `live-common.tsx`, `admin-feedback.tsx`, `admin-shell.tsx`, `lib/api.ts`, `catalogs-live.tsx`, `communications-live.tsx`, `professor/page.tsx`, `payments-live.tsx`, `login/page.tsx`.
- Dependencias: helper de toast de error y `lib/dates.ts` primero. Riesgo: bajo. Esfuerzo: ~1 semana.

**Bloque 4 — tests.** P2-36 con la lista de la sección 19. Prioridad: tenancy, quick-charge/duplicados, `billingPreference`, sesiones, catálogos. Riesgo: bajo. Esfuerzo: ~1-2 semanas (incremental, en paralelo a los bloques 1-2).

**Bloque 5 — deuda técnica.** P2-03, P2-15, P2-16, P2-18, P2-32, P2-35, P3-* restantes (rate limit compartido, refresh/revocación, cola de emails, comprobantes autenticados, docs, índices, paginación, `@mym/shared` en web, leído/no leído).
- Riesgo: bajo-medio. Esfuerzo: ~2-3 semanas.

## 24. Veredicto técnico

- **Listo para seguir desarrollando:** arquitectura del monorepo, aislamiento por organización, auth base (cookie httpOnly, bcrypt, reset), catálogos (modelo y API), auditoría, navegación SPA y patrón de modales de confirmación, Clase del día, quick-charge secuencial.
- **Debe corregirse antes de producción:** P1-01 (secreto JWT), P1-02, P2-01 y P2-02 (auth/logs), P1-06/P1-07 (integridad de pagos), P1-03/P1-04/P1-05 (preferencia de cobro), P1-08 (pérdida de ritmos), P2-33 (lockfile), P2-14 (errores), P2-08/P2-09 (fechas), y tener al menos los tests de tenancy y cobros.
- **Puede esperar:** P2-16..P2-18 (comunicaciones), P2-29 (badge/leído), P2-30/31 (optimización de fetch, cache de catálogos), P2-35 (docs), reportes por `paidAt`, paginación, refactor de componentes, refresh token.
- **Módulos que requieren segunda revisión tras corregir:** pagos/billing (con tests de concurrencia), sesiones y pruebas (fechas y roster histórico), inscripciones (reglas de preferencia y cupo), y una verificación en runtime de P2-02 (redact), del `SameSite` cross-domain en el despliegue real y del TZ del servidor. Multi-organización real: revisar login por email (P2-03) antes de sumar una segunda academia.
