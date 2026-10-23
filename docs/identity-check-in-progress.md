# Checkpoint de identidad y recepción

## Reglas de continuación

Trabajar en `main`, sin ramas ni PR, preservar cambios del usuario y publicar sólo con validaciones aprobadas y sin divergencias. No desplegar, enviar correos reales ni migrar bases remotas. Leer `identity-check-in-audit.md` antes de continuar.

## Estado

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
- Recordatorios: implementación y pruebas listas para los siguientes commits. Política general/programada apagada por defecto, saldo vigente, preferencias, frecuencia, reserva PENDING idempotente y reintentos seguros. Sin SMTP real.
- Revisión de interfaz Impeccable: disposición `ship`, sin ajustes visuales materiales; detector ejecutado una vez sin hallazgos. Manual/sistema visual en preparación de cierre.
- No se aplicaron migraciones ni despliegues.

Este checkpoint se actualiza con resultados concretos al cerrar cada etapa. El pedido integral sigue en ejecución; la documentación inicial no representa funcionalidades completas.
