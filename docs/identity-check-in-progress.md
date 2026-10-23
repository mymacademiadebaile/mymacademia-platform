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
- Identidad/contactos/pruebas implementados localmente y en cierre de validación. Incluyen inscripción directa, conversión de prueba, cortesías, backoffice y migración aditiva. No se debe reimplementar esta etapa.
- Próxima etapa después del commit de identidad: QR/dispositivos/kiosco, recepción financiera y recordatorios.
- No se aplicaron migraciones ni despliegues.

Este checkpoint se actualiza con resultados concretos al cerrar cada etapa. El pedido integral sigue en ejecución; la documentación inicial no representa funcionalidades completas.
