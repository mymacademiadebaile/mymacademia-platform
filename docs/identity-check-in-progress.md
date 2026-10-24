# Checkpoint de identidad y recepción

## Reglas de continuación

Trabajar en `main`, sin ramas ni PR, preservar cambios del usuario y publicar sólo con validaciones aprobadas y sin divergencias. No desplegar, enviar correos reales ni migrar bases remotas. Leer `identity-check-in-audit.md` antes de continuar.

## Estado

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
| Kiosco y sonidos | Implementado: cámara local, selección de sesión si corresponde, controles táctiles, tonos diferenciados/volumen/silencio, ayuda, reinicio y privacidad al ocultar. |
| Asistencia y administración | Implementado: sesión individual y origen, transacción común para admin/profesor/kiosco, cargos idempotentes, roster histórico y recepción. |
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
