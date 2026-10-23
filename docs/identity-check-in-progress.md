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
- Próxima etapa después del commit de identidad: QR/dispositivos/kiosco, recepción financiera y recordatorios.
- No se aplicaron migraciones ni despliegues.

Este checkpoint se actualiza con resultados concretos al cerrar cada etapa. El pedido integral sigue en ejecución; la documentación inicial no representa funcionalidades completas.
