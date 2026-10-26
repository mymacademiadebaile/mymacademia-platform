# Checkpoint de identidad y recepción

## Reglas de continuación

Trabajar en `main`, sin ramas ni PR, preservar cambios del usuario y publicar sólo con validaciones aprobadas y sin divergencias. No desplegar, enviar correos reales ni migrar bases remotas. Leer `identity-check-in-audit.md` antes de continuar.

## Estado

- Corrección visual solicitada 25/10/2026: se retira la fotografía y la composición similar al login. Registro de asistencia pasa a una vista de aplicación con marco oscuro, borde violeta y área de operación centrada. QR y DNI se muestran lado a lado en tablet/escritorio, apilados en celular; formularios y resultados usan el mismo centro. Esta decisión reemplaza la composición fotográfica de la actualización anterior. PRODUCT.md registra la preferencia para las continuaciones.
- Validación de la composición centrada: build web de producción, typecheck, **13 pruebas web y 9 E2E de recepción aprobados**. Se comprueba ausencia de fotografía, centrado horizontal con tolerancia de 2px, controles táctiles y ausencia de desborde en 1440×900, 1024×768, 768×1024, 390×844 y 320×568. Se inspeccionaron capturas de escritorio, tablet, celular y formulario DNI en una ronda conjunta. QR/DNI, sonidos, persistencia, duplicados y privacidad conservan sus pruebas. CSS previo del login e imports generados de Next preservados; no se modificaron API ni datos reales. Commit identificado por `fix(attendance): center the app controls and replace the login-like image layout`.

- Adaptación visual solicitada 25/10/2026: Registro de asistencia comparte ahora el lenguaje de la landing/login (negro, papel, lavanda, Archivo y Big Shoulders, fotografía de baile existente). Escritorio con imagen lateral y área clara de operación; tablet/celular con composición apilada y fotografía compacta sólo en el inicio. QR y DNI tienen iconos, instrucciones y controles de al menos 88px. Formulario y resultado aprovechan el espacio disponible al ocultar la imagen en móvil. Estilos limitados a asistencia; CSS del login intacto.
- Verificación visual/funcional: build web de producción, typecheck y 13 tests web aprobados; **9 E2E de recepción aprobados** incluyendo QR real, sonidos, DNI, persistencia, duplicado, privacidad y acceso administrativo. El recorrido DNI comprueba ausencia de desbordes y controles táctiles en 1440×900, 1024×768, 768×1024, 390×844 y 320×568. Una ronda visual conjunta de capturas móvil/tablet/escritorio no mostró defectos materiales. Artefactos locales `artifacts/attendance-ready-*.png` y `attendance-dni-mobile.png`; no se versionan. Se conservaron los límites funcionales y no se cambiaron API, base de datos, emails ni configuración de despliegue. Commit de implementación identificado por `feat(attendance): match the landing identity across phone and tablet layouts`.

- Cambio solicitado 25/10/2026: el nombre visible pasa a **Registro de asistencia** y se incorpora acreditación con DNI, además de QR. Ruta de acceso `/asistencia`, con `/check-in` conservada por compatibilidad. DNI opcional/normalizado en Contact y Student, único por identidad/organización, sincronizado desde ambas fichas. Se reutiliza la transacción común, con método QR/DNI separado del origen histórico. Validación focalizada aprobada: 24 tests de registro + 7 de DNI. No se ejecutan migraciones remotas ni se inventan documentos para alumnos existentes.
- Verificación de este cambio: **473 tests API en 47 archivos + 13 web y 9 recorridos E2E Chromium aprobados**, con build web de producción. El recorrido nuevo crea una persona por interfaz, carga DNI con puntos, convierte a alumno sin emitir QR, registra por DNI en viewport móvil, comprueba método administrativo, duplicado y borrado del dato al ocultar. El recorrido de cámara denegada permite pasar directamente a DNI. Se comprobó la pantalla móvil en `artifacts/attendance-dni-mobile.png` (artefacto local no versionado). El primer intento del test nuevo se corrigió para usar el selector accesible de sede ya empleado por la suite; los 9 recorridos posteriores pasaron. Las 2 fallas iniciales de la suite focalizada eran una sede temporal no retirada por el nuevo fixture, corregido sin cambios en la autorización real.
- Cierre de validaciones de DNI: typecheck de todos los paquetes y build API aprobados. La repetición final de 31 casos focalizados pasó e incluye búsqueda administrativa por documento con puntos en ambas fichas. `lint` de estos paquetes ejecuta el mismo chequeo TypeScript. Imports generados de Next restaurados a sus valores previos; CSS del login sin diferencias. Para operar, cargar el DNI desde Contactos o Alumnos; no se ejecutó backfill, migración remota, despliegue manual ni envío real de correo.
- Commits de esta actualización: `692f883` (identidad/DNI y acreditación transaccional) y `1880549` (Registro de asistencia, formularios, ruta `/asistencia` y pruebas de navegador). Ambos se crearon directamente en `main` después de validar. Estado revisado antes del cierre documental: árbol limpio, login CSS intacto, sin ramas nuevas ni PR. La publicación usa `git fetch` y comprueba que no haya commits remotos faltantes antes de hacer push normal a `origin/main`; cualquier divergencia detiene la publicación. La aceptación física de cámara/audio y la entrega real de emails siguen siendo pendientes operativos, no pruebas realizadas por esta actualización.

- Incidente 25/10/2026: el operador informa que el kiosco no abre o vuelve al login. Se reprodujo en producción: POST anónimo `/api/check-in/authorize` desde Origin `www` devuelve 403 `INVALID_ORIGIN`, mientras el apex devuelve el 401 esperable sin sesión. Causa: comparación literal con APP_ORIGIN apex. CORS y guard comparten ahora una política que admite sólo ambos hosts oficiales HTTPS y mantiene exactos los otros entornos. Pasaron 27 tests focalizados, incluyendo presente/cargo real en replica set efímero con la combinación de orígenes publicada. Informe detallado: `kiosk-verification-2026-10-25.md`.
- Validación API del incidente: suite completa aprobada con **458 tests API en 46 archivos + 13 tests web**, sin fallos; typecheck completo y build API aprobados. La primera corrida en paralelo con el build web tuvo dos timeouts de 5 segundos; la repetición completa sin ese build simultáneo pasó en 171,17 s, sin cambiar la lógica de pruebas ni sus tiempos límite. El commit de corrección API se identifica por `fix(kiosk): accept canonical academy origin across authorization and CORS`.
- Corrección principal publicada en `cb8e1cc`; check Vercel `success`. HTTP real posterior: Origin `www` y apex llegan a 401 `AUTH_REQUIRED` sin cookies, con CORS correcto; dominio ajeno permanece 403 y sin ACAO. El bloqueo 403 anterior al login está eliminado en producción, sin cambiar APP_ORIGIN ni iniciar un despliegue manual.
- Cierre de acceso: ADMIN y SUPER_ADMIN admitidos igual que en el panel; fallback de login de ambos roles a administración. Errores de origen/servicio/conexión muestran estado recuperable y no un falso pedido de login. Las consultas tienen timeout/cancelación, incluida la renovación de sesión; cámara detenida al perder acceso. El fixture crea sus cuentas sólo en la base efímera.
- Validación final: **459 tests API / 46 archivos + 13 web, 8 E2E Chromium, typecheck y builds API/web aprobados**. E2E cubre login real de ambos roles, sesión vencida, recuperación de 403/503, cámara denegada, QR decodificado, persistencia, cargos, tonos, duplicado, privacidad y backoffice de identidad/recordatorios. El selector de alerta de cámara se precisó para excluir el anunciador de rutas de Next; no se debilitaron las aserciones ni se elevaron timeouts.
- Commit de cierre: `fix(kiosk): recover access failures and align administrative roles`. Estado al publicar: `main`, sin cambios propios pendientes ni alteraciones del CSS previo de login. No migraciones remotas, cambios de variables ni emails reales. Reporte completo y límites de prueba física en `kiosk-verification-2026-10-25.md`.

- Actualización solicitada después del cierre: acceso al kiosco simplificado a **login administrativo → abrir `/check-in`**, sin alta de dispositivo ni códigos en la interfaz. Recepción ofrece «Abrir kiosco» y conserva sólo ajustes opcionales de sonido/horario/cierre. La sesión administrativa permanece abierta. Varias sedes requieren elegir una; una sola se resuelve automáticamente. Las referencias históricas a códigos más abajo describen la implementación anterior y quedan reemplazadas por este flujo.
- Validación de esta simplificación: 15 tests de check-in aprobados (incluyen 3 nuevos sobre login activo/rol, reutilización del acceso/configuración y selección/scope de sede), typecheck completo y build web de producción aprobados; 3 E2E Chromium aprobados en 2 min. El recorrido QR ahora entra desde el login real y confirma que `/auth/me` sigue autorizado. No se migraron datos remotos ni se iniciaron despliegues. Se verificó HTTP 200 de `https://www.mymacademiadebaile.com.ar/check-in`. Cambio registrado con el commit `feat(kiosk): authorize automatically with an admin login`; el CSS previo del login sigue excluido. Se preservó el commit concurrente ajeno de SEO `d66a1ae`.

- Auditoría inicial completada; lectura de datos realizada sin mutaciones.
- Baseline: typecheck/lint/test/build aprobados (405 tests API, 9 web).
- Cambio del usuario en login.module.css preservado y excluido.
- Auditoría publicada: `8bd9a8b`.
- Asistencia central atómica implementada para admin y profesor: relee sesión, bloquea concurrencia, congela roster y crea obligación dentro de la misma transacción. Reintentos idempotentes; correcciones de PRESENT sólo administrativas y con motivo, sin borrar cargos.
- Verificación de esta etapa: typecheck/lint/build API aprobados; 18 tests de cobertura de sesiones + 17 de profesor + 20 de flujos financieros aprobados. Los dos nuevos prueban concurrencia y rollback ante fallo de persistencia.
- Seguridad de dependencias: Next 16.4.0 bloqueó dev/build por el aviso oficial del 14/10/2026. Se aplicó el parche 16.4.3 de la misma serie; también se incorporó Playwright como dependencia de pruebas. Validaciones: typecheck/lint, build web y prueba Chromium de identidad aprobados.
- Identidad/contactos/pruebas implementados: inscripción directa y desde prueba, oportunidades, identidad estable sin alumnos ficticios, beneficio único por grupo, cortesías con motivo, backoffice y migración aditiva. Ver arquitectura/manual en `identity-check-in-architecture.md`.
- Validación de identidad: suite completa aprobada con 418 tests API + 9 web antes de la extracción final de conversión; luego 40 tests focalizados (12 identidad/migración + 28 inscripciones) aprobados, typecheck/lint y build API aprobados. Build web 16.4.3 y E2E Chromium UI→API→replica set→UI aprobados. Capturas desktop/móvil generadas en artifacts (no versionadas).
- Migración: dry-run configurado reporta 2 contactos faltantes, 1 asistencia sin identidad, 0 pruebas y 0 ambigüedades. Sólo se aplicó en bases efímeras de tests; la base configurada no recibió escrituras.
- Identidad publicada en `fec738e`; backoffice publicado en `4ae8fcb`; parche Next en `e6bd1e8`.
- QR/dispositivos/kiosco/recepción implementados: hashes, activación de un uso y 8 h, cámara local, tonos, privacidad, avisos financieros, altas legítimas en snapshot congelado. Validación aprobada: 431 tests API, 10 web (incluye un test SEO ajeno), typecheck/lint/build y 3 E2E Chromium (identidad, QR completo y regresión SEO ajena). La cámara de E2E usa un video de canvas con QR real; pendiente aceptación física en tablet.
- Se detectaron cambios concurrentes ajenos de SEO (env examples, layout, public-site/site, docs públicos y sus tests). Preservar y excluir de los commits de esta tarea, junto al CSS del login. No restaurar esos archivos.
- QR/dispositivos publicados en `ecdb0d2`; kiosco/recepción en `16aa32d`. El cambio concurrente de SEO fue confirmado por su ejecución en `d122453`; no forma parte de esta implementación.
- Cierre de identidad: baja académica independiente del contacto, reactivación sin duplicados, gratuidades sin autorización verificable bloqueadas, migración con revisión de vínculos/scope y sin consumir conversiones modernas sin PRESENT. Profesor distingue cortesías y no ofrece ficha académica a interesados sin perfil activo. Consultas de ficha cancelables y generación de QR bloqueada hasta consultar su estado.
- Validaciones del cierre: suite completa 45 archivos / 441 tests API + 10 web aprobados; después se agregaron dos regresiones de seguridad y pasaron los 15 tests focalizados de identidad/migración. Typecheck/lint y build API aprobados; build web de producción y los 3 E2E aislados aprobados. El total actual de casos API es 443; los dos adicionales se ejecutaron en la suite focalizada.
- Cierre de identidad publicado en `0a3ad35`.
- Recordatorios API completados: política general/programada apagada por defecto, saldo vigente, preferencias, frecuencia, reserva PENDING idempotente y reintentos seguros. Rutas antiguas de cargos/pagos/historial usan el mismo servicio y no permiten eludir la política. Programación conectada al job existente con máximo de 100 intentos nuevos por corrida. Sin SMTP real.
- Validación de recordatorios: 9 tests nuevos (saldo, pago parcial, opt-out, regularización, concurrencia, frecuencia, fallos, crash PENDING, automatización, roles/scope), 9 de pantallas financieras y suite completa aprobada; typecheck y build API aprobados. El envío SMTP se realiza fuera de la transacción y nunca dentro de un callback reintentable.
- API de recordatorios publicada en `b5539af`. Backoffice completado en `/admin/reminders`, con acceso desde Comunicaciones y ficha académica: configuración, búsqueda, vista previa vigente, confirmación e historial. Los cambios de destinatario cancelan las consultas anteriores. E2E de administración aprobó configuración manual, automatización apagada, vista previa y fallo SMTP local registrado sin secretos. Typecheck/lint y build web aprobados.
- Backoffice de recordatorios publicado en `dfb6a29`. Pruebas de recepción aisladas de otros servidores locales mediante `test:e2e:reception`, puertos 3100/4100 y `.next-reception`. Los 3 recorridos Chromium pasaron en 56,5 s, incluyendo decodificación de QR real, tonos capturados, duplicado, error, silenciado, limpieza, ocultar pestaña durante respuesta y administración de QR/dispositivos/email. La solicitud abortada al ocultar el kiosco no vuelve a mostrar datos al regresar. Los archivos generados de Next fueron devueltos a sus imports originales sin tocar código del usuario.
- Pruebas/privacidad publicadas en `f1b6b54`.
- Revisión de interfaz Impeccable: disposición `ship`, sin ajustes visuales materiales; detector ejecutado una vez sin hallazgos. Sistema existente documentado en `apps/web/DESIGN.md` y `.impeccable/design.json`, sin reemplazar PRODUCT ni la identidad existente. Revisión React aplicada a consultas, cancelación, carga diferida y estados de operación.
- No se aplicaron migraciones remotas ni se iniciaron despliegues. Sólo se aplicaron migraciones en replica sets efímeros de tests.

## Cierre del alcance solicitado

| Etapa | Estado comprobado |
|---|---|
| Contactos, interesados y conversión | Implementado: procedencia, preferencias, oportunidades, historial, inscripción directa o desde reserva, identidad estable y reactivación. |
| Prueba única por persona/grupo | Implementado: reserva concreta, exclusión concurrente, consumo sólo por PRESENT, bloqueo irreversible después del consumo. |
| Cortesías | Implementado: autorización administrativa/motivo, independientes de TrialBenefit, sin cargos por asistencia. |
| Credenciales y dispositivos | Implementado: QR opaco, rotación/revocación, activación de un uso, sesión expirable y scope por organización/sede. |
| Registro de asistencia y sonidos | Implementado: QR o DNI, selección de sesión si corresponde, controles táctiles, tonos diferenciados/volumen/silencio, ayuda, reinicio y privacidad al ocultar. |
| Asistencia y administración | Implementado: sesión individual, origen y método QR/DNI, transacción común entre canales, cargos idempotentes, roster histórico y recepción. |
| Deuda sin bloquear | Implementado: balance central, aviso genérico público y desglose sólo administrativo; asistencia persiste independientemente del aviso. |
| Emails cordiales | Implementado: vista previa, saldo vigente, preferencias, frecuencia, historial, idempotencia y programación opcional apagada. |
| Pruebas y documentación | Aprobado: 441 tests API + 10 web en suite completa, luego 15 focalizados (incluyen las 2 regresiones adicionales; total actual 443 API), 3 E2E Chromium, typecheck/lint y builds API/web. |

### Pendiente operativo, sin ejecutar por esta tarea

1. Aceptación en la tablet/celular elegidos: HTTPS, permiso y enfoque de cámara, lectura de QR impreso, volumen real, pantalla completa y retorno al inicio. La cámara de E2E es un video de canvas; no prueba la óptica ni el altavoz físico.
2. Antes de usar datos reales: respaldar, revisar el dry-run en el entorno de destino y autorizar explícitamente la migración/despliegue. El script bloquea `--apply` remoto. Se requiere replica set/cluster con transacciones; no se permite un fallback no atómico.
3. Verificar aceptación/entrega SMTP con destinatario autorizado antes de habilitar emails reales. Ambos interruptores comienzan apagados. SENT sólo confirma aceptación de SMTP; PENDING incierto exige revisión, sin reenvío automático.

No queda una etapa de código del alcance enumerado pendiente. Integración Meta, portal de alumnos, cobro online y fusión automática de identidades no forman parte de este alcance. Los límites y pasos operativos están detallados en `identity-check-in-architecture.md`.

### Registro de commits de esta implementación

| Commit | Funcionalidad |
|---|---|
| `8bd9a8b` | Auditoría inicial. |
| `6db319a` | Asistencia y obligaciones atómicas entre canales. |
| `e6bd1e8` | Parche Next y dependencia de E2E. |
| `fec738e` | Contactos, conversión, pruebas/cortesías y migración. |
| `4ae8fcb` | Backoffice de identidad. |
| `ecdb0d2` | QR y dispositivos autorizados. |
| `16aa32d` | Kiosco, sonidos y recepción financiera. |
| `0a3ad35` | Cierre de identidad, gratuidades y migración. |
| `b5539af` | Servicio seguro de recordatorios. |
| `dfb6a29` | Gestión administrativa de recordatorios. |
| `f1b6b54` | E2E aislados y privacidad del kiosco. |

Todos fueron validados y publicados directamente en `origin/main`, sin ramas, PR, force push ni reescritura. El commit documental de cierre se identifica en `git log` por `docs: record identity reception completion and operating limits`.

Estado esperado al cerrar: `main` sincronizada con `origin/main`, sin cambios propios pendientes; únicamente el cambio previo del usuario en `apps/web/src/app/login/login.module.css` permanece local y sin confirmar. El commit concurrente de SEO `d122453` se conservó sin atribuirlo a este trabajo.
