# Identidad, pruebas y recepción — auditoría inicial

Fecha: 23/10/2026. Base: `main` en `357090a`. Este documento registra el diagnóstico **anterior a la implementación**; el estado de ejecución se conserva en `identity-check-in-progress.md`.

## Inventario comprobado

- Monorepo pnpm 10.17.1, Turbo instalado 2.11.5; API Express 5, Mongoose 8, Zod 4, TypeScript 5.9; web Next 16.4, React 19; contratos en `packages/shared`.
- `apps/api/src/modules`: auth, admin, professor-portal, public, internal, core, students, enrollments, classes, sessions, scheduling, trials, billing, payments, notifications, audit, catálogos y profesores. UI administrativa y de profesores ya funcional, App Router, CSS Modules y `apiFetch` con cookies.
- Se revisaron README, arquitectura, alcance funcional, UX de administración/profesores, plan administrativo, arquitectura de agenda/finanzas y auditoría histórica. Algunos documentos todavía describen exclusiones o ramas antiguas: el pedido actual autoriza CRM y kiosco y exige `main`.
- Estado Git: `main` coincide con `origin/main`; modificación previa en `apps/web/src/app/login/login.module.css` (`inline-flex` → `flex`), preservada y excluida de los commits de este trabajo.
- Pruebas: Vitest/Supertest, replica set efímero con `mongodb-memory-server`; tests financieros, concurrencia, migración, autorización y frontend con Node Test Runner. No existe infraestructura Playwright de proyecto. `lint` es comprobación TypeScript, no ESLint. No se debe presentar como análisis ESLint.

## Datos accesibles (sólo lectura)

Se usó el cliente MongoDB sin importar modelos, sin autoIndex ni escrituras, con la URI configurada localmente. **No está verificado si esta conexión representa desarrollo o producción**. No se imprimieron URI, secretos ni documentos personales.

| Colección | Cantidad |
|---|---:|
| students | 2 |
| enrollments | 3 |
| classsessions | 216 |
| classattendances | 1 |
| trialbookings | 0 |
| charges / payments / migrationissues | 0 / 0 / 0 |

Las tres inscripciones tienen períodos; las dos identidades académicas todavía no tienen `contactId`. Sesiones tienen índices únicos parciales `occurrenceKey` y `slotKey`; no está presente el índice único antiguo de sesión. Charges tiene unicidad de `chargeKey`. Esto **no demuestra** que toda otra base esté migrada. No se aplicó ninguna migración remota.

## Reutilización y deficiencias comprobadas

| Área | Reutilizar | Deficiencia |
|---|---|---|
| Identidad | Student, organización/sede, auditoría | No existe Contact/Opportunity; TrialBooking exige Student |
| Pruebas | Reserva, cancelación, conversión | Consulta previa sin índice único; no impide repetir una prueba completada; fecha diaria se mezcla con todos los turnos del grupo |
| Asistencia | ClassAttendance, roster congelado, reservas específicas | `setSessionAttendance` no es transaccional; sólo la ruta admin crea cargos y lo hace después de persistir asistencia; profesor omite el cargo |
| Congelamiento | Snapshot y altas autorizadas | No hay incorporación normal de último momento después de congelar; no conviene recalcular el snapshot completo |
| Finanzas | Charge, Collection, coverage, balance-service | No hay atomicidad asistencia/cargo; fallback de transacciones a standalone pierde atomicidad; no debe permitirse en los nuevos flujos críticos |
| Correcciones | Historial financiero y auditoría | Volver de PRESENT no debe borrar automáticamente obligaciones ni restaurar beneficio; necesita motivo y conciliación explícita |
| Correo | SMTP, plantillas y NotificationLog | Sin reserva de envío/frecuencia; reintento reenvía texto antiguo sin consultar deuda; no contempla preferencias |
| Kiosco | API modular, rate limiter general | No existen credenciales de dispositivo, QR personal, selección segura ni interfaz |

Todos los paths suministrados en el pedido existen. También se revisaron enrollment-validity/capacity, resource-lock, session-commands/state/generator, coverage-service, transaction, auth, communications, billing routes y sus tests. `balance-service` calcula deuda desde Charge/Collection; se reutiliza sin cálculos paralelos.

## Riesgos y decisiones

| Severidad | Riesgo | Decisión |
|---|---|---|
| Alta | Dos reservas/pruebas por carrera | Serializar por identidad/grupo; índice único de beneficio y reserva activa; consumo irreversible sólo por PRESENT |
| Alta | Presente guardado sin obligación o cobro duplicado | Una transacción compartida, locks de sesión, cargo idempotente; jamás registrar un pago |
| Alta | Eludir límites mediante endpoints antiguos | Adaptar rutas actuales al mismo servicio, incluyendo completar pruebas |
| Alta | Kiosco público con permisos administrativos | Credencial de dispositivo revocable, cookie HttpOnly limitada y expirable; QR opaco de 256 bits con SHA-256; ninguna lista pública de personas |
| Alta | Migración implícita de datos reales | Scripts dry-run, aplicación remota bloqueada; no fusionar personas por nombre ni borrar documentos |
| Media | Reprogramación y snapshot pierden contactos | Mantener IDs legacy y añadir `contactId`; snapshot admite interesados sin Student |
| Media | Correos repetidos o deuda desactualizada | Reserva atómica antes de SMTP, saldo vigente, preferencias y frecuencia; automatización deshabilitada |
| Media | Dato personal visible entre escaneos | Respuesta mínima, reinicio temporizado, sin importes en kiosco |

## Arquitectura propuesta y compatibilidad

- Contact: identidad estable, organización/sede, nombre, medios opcionales, procedencia/campaña/externalId, preferencias. Student conserva su ID y referencias financieras; agrega vínculo único a Contact. No se convierten interesados en alumnos ficticios.
- Opportunity: contacto + grupo/disciplina, estado y notas de seguimiento, conversión e historial auditado.
- TrialBooking: `contactId`, `sessionId` y Student opcional. Beneficio persistente por Contact/grupo; cancelación/ausencia libera reserva sin borrar historia; PRESENT consume definitivamente. COURTESY usa autorización, motivo y actor; no toca beneficio TRIAL.
- ClassAttendance: añadir identidad y origen, conservar `studentId` cuando existe. Todos los canales resuelven identidad y usan el mismo servicio. Snapshot permite incorporaciones explícitas verificadas, sin quitar integrantes históricos.
- QR: verificador hash, rotación/revocación; token original sólo se entrega al generar. No sirve como login. Dispositivo por organización/sede con ventana configurable 45/20 minutos, audio/volumen, vencimiento y revocación.
- API: rutas admin de contactos/oportunidades/credenciales/dispositivos, trials existentes adaptadas; `/api/check-in` para activación, elegibilidad y confirmación autenticadas por dispositivo. UI `/check-in`, gestión integrada al admin.
- Portal futuro: vincular User a Contact bajo autenticación propia; QR y dispositivo no sustituyen esa autenticación. Meta queda fuera de alcance.

## Migración propuesta

1. Inventario de sólo lectura e informe de duplicados/huérfanos/índices.
2. Backfill aditivo determinista: un Contact por Student heredado, preservar Student._id y todas las referencias; nada de merge por email familiar o nombre.
3. Backfill de identidad en pruebas/asistencias; reservar el beneficio ya utilizado a partir de evidencia PRESENT. Casos ambiguos se reportan y bloquean, nunca se inventa asistencia.
4. Crear índices después de revisar duplicados; no usar `syncIndexes` ni borrar índices remotos automáticamente.
5. Ensayar en replica set efímero y en copia respaldada. No aplicar en base remota sin autorización y respaldo.

## Fases y aceptación

1. Auditoría + baseline de validación.
2. Identidad/contactos/oportunidades y conversión idempotente.
3. Reservas por sesión y beneficio por identidad/grupo, cortesías.
4. Asistencia atómica común con cargos y snapshots compatibles.
5. QR, dispositivos, kiosco, sonidos y privacidad.
6. Backoffice de recepción y balances; recordatorios con preferencias/frecuencia.
7. Regresión, pruebas UI, manual operativo y checkpoint de publicación.

| Matriz | Evidencia requerida |
|---|---|
| Identidad | Contact sin Student reserva; conversión concurrente conserva ID/historial/QR; alumno interesado en otro grupo |
| Pruebas | Una activa; PRESENT consume; otro grupo permitido; cancelación/ausencia reprogramable; conversión no restaura; cortesía independiente |
| Concurrencia | Reservas simultáneas, último cupo, doble dispositivo y doble escaneo; una sola asistencia/cargo |
| Finanzas | Mensualidad cubierta/free/trial/courtesy sin cargo; per-class crea sólo obligación; deuda permite asistencia; fallo intermedio revierte |
| Seguridad | Sin dispositivo/QR inválido/revocado/otra sede/otra organización rechazados; token no permite usar API administrativa; rate limit |
| Kiosco | Ventana Argentina, sesión cancelada, varias sesiones seleccionables, reinicio sin datos personales, cámara/audio habilitados por gesto y errores reales |
| Correo | Mock SMTP, preview, saldo actualizado, pagado excluido, opt-out, frecuencia, reintentos, automatización apagada |

Validaciones iniciales: `pnpm typecheck`, `pnpm lint`, `pnpm test` (405 API + 9 web) y `pnpm build` aprobados. Build advierte ECONNREFUSED al consultar imágenes públicas en localhost:4000 sin API local; finaliza correctamente. Turbo advierte ausencia de coverage outputs (preexistente). Resultados de implementación, commits y pendientes: ver checkpoint. Ningún flujo visual se considera validado sólo por compilar.
