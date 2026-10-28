# QA integral — M&M Academia de Baile

Fecha: 28/10/2026. Datos exclusivamente ficticios. Las pruebas combinan API real con MongoDB Memory Replica Set, servicios transaccionales y Chromium con interfaz real. `full-system.qa.test.ts` crea una base exclusiva `qa_mym_<UUID>` por ejecución; `manual-server.ts` crea otra por corrida de Playwright. Ambas se detienen al finalizar. No se consultó ni modificó una base compartida o de producción.

## Escenario integral ejecutado

El recorrido único de `apps/api/src/modules/qa/full-system.qa.test.ts` crea mediante rutas reales 4 profesores (Bachata, Femme Heels, Reggaetón y Full Body), 4 clases con sus relaciones de catálogo y profesor, 8 contactos con orígenes distintos y 9 alumnos directos. Un contacto que asiste a una prueba gratuita se convierte y completa el total de 10 alumnos. Los nombres y emails llevan un ID de ejecución; los correos usan `example.test`. Las clases generan 4 sesiones hoy y la segunda generación produce cero. Un contacto duplicado recibe 409. La prueba gratuita deja al contacto sin perfil académico ni cargo; la conversión repetida conserva la misma inscripción. Un segundo contacto asiste gratis y sigue siendo contacto sin cargo.

El alumno convertido obtiene la mensualidad de $30.000 mediante una decisión explícita `FULL` para su primer mes parcial y la paga; una segunda generación no duplica cargos. Otro alumno deja $25.000 pendientes tras un pago parcial de $5.000. Un alumno por clase asiste con QR desde una tablet autorizada, debe $8.000 una sola vez aunque repita el escaneo, paga la obligación y figura en Recepción e historial financiero. Se activa una segunda tablet; la revocación por sede invalida ambas. Se comprueban persistencia, asignaciones, auditoría y ausencia de referencias huérfanas en inscripciones, asistencias y asignaciones financieras.

## Matriz de resultados

`API` significa integración real en réplica efímera; `UI` significa Playwright Chromium con Next y Express locales. Un `PASS` corresponde a una aserción ejecutada, no a una certificación de producción.

| Módulo | Escenario | Resultado | Evidencia |
|---|---|---|---|
| Profesores | 4 altas, disciplinas, edición y relación con clases | PASS · API | `full-system.qa.test.ts` |
| Contactos | 8 altas, orígenes, edición, búsqueda y rechazo de duplicado | PASS · API | `full-system.qa.test.ts` |
| Contactos | No convierte por mera consulta; prueba sin compra sigue siendo contacto | PASS · API | `full-system.qa.test.ts`, `identity-trial.flows.test.ts` |
| Clase gratuita | Reserva, presente, beneficio consumido y cero cargos | PASS · API/UI | `full-system.qa.test.ts`, `identity.spec.ts` |
| Conversión | Misma identidad e inscripción en doble intento; historia conservada | PASS · API/UI | `full-system.qa.test.ts`, `identity.spec.ts` |
| Alumnos | 10 perfiles, contacto vinculado y detalle financiero | PASS · API | `full-system.qa.test.ts` |
| Clases y sesiones | 4 clases/profesores, 4 sesiones; segundo generador crea cero | PASS · API | `full-system.qa.test.ts` |
| Programación | Reprogramación, cancelación, capacidad y conflictos | PASS · API | `scheduling-billing.flows.test.ts`, `check-in.flows.test.ts` |
| Mensualidad | Primer mes parcial con decisión; cargo único de $30.000 | PASS · API | `full-system.qa.test.ts`, `daily-jobs.test.ts` |
| Mensualidad | Pago completo, pago parcial y saldo de $25.000 | PASS · API | `full-system.qa.test.ts` |
| Clase individual | Inscripción, cargo único de $8.000, cobro, asistencia e historial | PASS · API | `full-system.qa.test.ts` |
| Finanzas | Asignaciones válidas y saldo en ficha/Pagos igual a MongoDB | PASS · API | `full-system.qa.test.ts` |
| Finanzas | Reembolso, crédito, anulación y cobros múltiples | PASS · API | `scheduling-billing.flows.test.ts`, `collection-void.test.ts` |
| Recepción | Código de un uso, sesión persistida y dos tablets activas | PASS · API/UI | `full-system.qa.test.ts`, `kiosk-access.spec.ts` |
| Recepción | QR real en cámara simulada, DNI, selección, duplicado y avisos | PASS · API/UI | `check-in.flows.test.ts`, `check-in.spec.ts`, `attendance-dni.spec.ts` |
| Recepción | Revocación HTTP 204, mensaje, recarga y rechazo posterior | PASS · API/UI | `check-in.flows.test.ts`, `reception-management.spec.ts` |
| Seguridad | Profesor sin cobros administrativos, tablet sin datos administrativos, scope | PASS · API | `full-system.qa.test.ts`, `check-in.flows.test.ts` |
| Automatizaciones | Autorización cron, generación, concurrencia, reintento y cargo único | PASS · API | `daily-jobs.test.ts` |
| Recordatorios de deuda | Política apagada, preview, SMTP simulado, idempotencia | PASS · API/UI | `debt-reminder.flows.test.ts`, `reception-management.spec.ts` |
| Navegación | Login, renovación, SEO privado, ficha y búsqueda en navegador | PASS · UI | `auth-seo-regression.spec.ts`, `session-participant-search.spec.ts` |
| Integridad | Referencias de inscripciones, asistencias y asignaciones; índices únicos | PASS · API | `full-system.qa.test.ts`, `scheduling-billing.flows.test.ts` |
| Limpieza | Cierre de réplica QA y servidores E2E, sin SMTP/cobros reales | PASS · local | Hooks `afterAll`, runner Playwright, verificación de procesos/puertos final |

## Validaciones técnicas

La configuración de CI ejecuta Node 22 con `pnpm typecheck`, `pnpm test`, `pnpm build` y, en un job de navegador, Chromium. La ejecución local usó Node 24.11.1 y pnpm 10.17.1. `lint` en este repositorio ejecuta TypeScript (`tsc --noEmit`); no es un linter de estilo. Los E2E reservaron puertos libres en `127.0.0.1`, comprobaron `/__test/isolated` y no reutilizaron servicios ajenos. El video QR es generado desde canvas; la cámara y el audio físicos no se probaron.

| Comando | Resultado local |
|---|---|
| `pnpm typecheck` | PASS · 4 tareas Turbo |
| `pnpm lint` | PASS · 4 tareas Turbo; implementa `tsc --noEmit` |
| `pnpm test` | PASS en dos corridas completas; última: 483 API en 50 archivos y 13 web |
| `pnpm build` | PASS · shared, API y Next de producción |
| `pnpm --filter @mym/web test:e2e` | PASS · 11/11 en Chromium, con UI/API/Mongo efímeros |
| Vitest focalizado después del ajuste de logs | PASS · 4/4 (job diario y recorrido integral) |
| Playwright focalizado después del ajuste visual final | PASS · 1/1 Recepción, incluida recarga y estado revocado |
| Lectura local de `vercel.json` | PASS · ruta diaria y expresión `0 9 * * *` presentes |
| `git diff --check` | PASS · sólo avisos de normalización CRLF/LF |

Son **507 casos automatizados únicos** en la última suite (483 API, 13 web, 11 navegador). Los fallos de pruebas obsoletas detectados durante la preparación (puerto 4000 fijo, título antiguo de Contactos y expectativa inicial del botón Generar/Renovar) se corrigieron y repitieron; no se contabilizan como fallos actuales del producto.

**Limpieza comprobada:** los hooks detuvieron cada replica set y Playwright cerró sus servidores. Tras la última ejecución, seis puertos QA usados en las corridas finales tenían cero listeners, había cero procesos `manual-server.ts`, cero runners E2E y cero procesos `mongod.exe` asociados a `mongodb-memory-server`. Un `mongod.exe` local ajeno a QA escucha en 27017; no se usó ni se detuvo. El archivo generado `apps/web/next-env.d.ts` se devolvió a su contenido previo; las capturas locales se conservan como evidencia visual. Ninguna fixture salió del MongoDB efímero; SMTP apuntó sólo a localhost:1 y no se hizo cobro real.

## Límites de ejecución

No se ejecutó un cron desplegado, SMTP real, hardware físico, pagos reales ni migraciones en datos reales. Los recordatorios de clase mencionados en el plan antiguo no tienen un job implementado y constan en `functional-gaps.md`. La suite API abarca escenarios de reprogramación, cancelación, prepagos, capacidad y permisos en pruebas focalizadas; el recorrido con 4/8/10 no repite cada variante desde la interfaz.
