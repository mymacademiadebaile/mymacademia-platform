# Brechas funcionales y operativas

Fecha: 28/10/2026. Severidad según impacto comprobado; los límites operativos no se presentan como defectos reproducidos.

| Severidad | Descripción e impacto | Causa / estado | Evidencia y siguiente acción |
|---|---|---|---|
| MEDIUM | Recordatorios **de clase** aparecen en el plan administrativo, pero no hay un generador ni política de envío para ellos. Las clases no producen ese aviso automáticamente. | El job existente sólo genera sesiones, mensualidades y recordatorios de deuda. Crear recordatorios de clase exige definir destinatarios, consentimiento, anticipación y cancelaciones; no se inventó esa regla comercial en QA. | `docs/admin-implementation-plan.md` y búsqueda en `apps/api/src`; acordar reglas y construirlo como una etapa independiente. |
| OPERATIONAL | Cron diario configurado, sin prueba de ejecución en producción. Un `CRON_SECRET` ausente deja el endpoint en 401; la precisión horaria depende del plan Vercel. | No hubo despliegue ni cambios de secretos autorizados. | `vercel.json`, `daily-jobs.test.ts`; tras desplegar, revisar secreto, invocación y logs `daily-job-completed`/`daily-job-failed`. |
| OPERATIONAL | Cámara, lectura de QR impreso y altavoz de la tablet real no verificados. | Chromium usa video de canvas y audio del navegador local. | `check-in.spec.ts`; hacer aceptación física con HTTPS y dispositivos elegidos. |
| OPERATIONAL | Entrega real de email no verificada. | QA bloqueó SMTP en `127.0.0.1:1` y los recordatorios automáticos empiezan apagados. | `debt-reminder.flows.test.ts`, `reception-management.spec.ts`; probar con un destinatario autorizado antes de habilitar. |
| OPERATIONAL | El nuevo job de navegador en CI/Node 22 todavía requiere su primera ejecución de GitHub Actions. | La máquina local usa Node 24.11.1; no se hizo push. | `.github/workflows/ci.yml`; revisar el primer check remoto. |
| LOW | La cookie de tablet tiene una vida técnica máxima de diez años y sigue válida hasta revocación o eliminación local. Si alguien copia el navegador autorizado, el acceso persiste. | Persistencia hasta revocación solicitada para la operación. Hash sólo en base, cookie HttpOnly/SameSite Strict y revocación verificada en cada registro. | `check-in.routes.ts`, `check-in-service.ts`; mantener control físico de tablets y procedimiento de revocación al perder una. |

## Defectos corregidos durante esta auditoría

| Severidad original | Corrección | Regresión |
|---|---|---|
| HIGH | Respuesta HTTP 204 de revocación interpretada como fallo y estado de tablet perdido tras recarga. | `reception-management.spec.ts`, `check-in.flows.test.ts`. |
| HIGH | Mensualidades dependían de visitar «Por cobrar» pese a existir un job diario. | `daily-jobs.test.ts` y `vercel.json`. |
| MEDIUM | E2E de tablet y autenticación usaban login/puerto/textos anteriores; se aislaron y actualizaron. | Playwright completo. |
| LOW | Selector de sede ocupaba altura excesiva en móvil. | `reception-management.spec.ts` comprueba altura máxima. |

No se observó una duplicación financiera ni una referencia huérfana en el recorrido integral ejecutado. Las pruebas no demuestran ausencia de defectos fuera de los escenarios descritos en `full-system-e2e-report.md`.
