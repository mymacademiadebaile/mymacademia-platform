# Remediación de saturación MongoDB Atlas y Vercel

**Fecha de auditoría:** 15 de octubre de 2026

**Rama:** `codex/mongodb-vercel-security-remediation-2026-10-15`
**Alcance:** conexión MongoDB/Mongoose, ejecución serverless de Vercel, orden de middleware, endpoints públicos, protección de abuso y diagnósticos. No se modificaron datos, colecciones, índices, reglas de negocio ni cálculos de pagos.

## A. Resumen ejecutivo

Atlas alertó que el porcentaje de conexiones configuradas de `Cluster0` superó el 80 % entre `2026-10-15T17:40:34Z` y `2026-10-15T17:50:44Z` (10 min 10 s). En un cluster M0 esto puede degradar o interrumpir solicitudes de alumnos, profesores y administración cuando nuevas instancias no consiguen abrir un socket.

La auditoría confirmó riesgos de agotamiento evitables: la API no establecía límites explícitos de pool ni timeouts del driver, intentaba preparar MongoDB antes de limitar solicitudes, y el sitio público dinámico podía volver a consultar la API en cada render. Se corrigieron sin introducir clientes MongoDB adicionales ni desconectar por request.

La evidencia disponible no permite atribuir la alerta a tráfico malicioso, un bot, un deploy, procesos externos o un bug específico. La clasificación del posible incidente es **inconclusa**. La aplicación ahora limita la presión por instancia y deja trazabilidad segura para que una futura ocurrencia pueda correlacionarse con un `X-Request-ID`.

## B. Hallazgos confirmados y correcciones

| Severidad | Hallazgo y evidencia | Corrección implementada | Validación |
| --- | --- | --- | --- |
| Alta | La ruta de producción tenía una única abstracción de conexión, pero no configuraba tamaño de pool, conexiones simultáneas, inactividad, selección de servidor, conexión ni espera de cola. El único camino de runtime es `connectDatabase`; `server.ts` lo usa para Node autónomo y `app.ts` para Vercel. | [`apps/api/src/database/connect.ts`](../apps/api/src/database/connect.ts) crea un pool Mongoose reutilizable por instancia cálida, con `maxPoolSize=5`, `minPoolSize=0`, `maxConnecting=2`, inactividad de 30 s y timeouts de 10/10/5 s. Los valores se validan y pueden ajustarse por entorno en [`env.schema.ts`](../apps/api/src/config/env.schema.ts). | `connect.test.ts`: 4 pruebas pasan: opciones, reutilización ya conectada, deduplicación concurrente y recuperación después de rechazo. |
| Alta | Las solicitudes podían alcanzar la inicialización de base antes de ser rechazadas por rate limit. Un burst de rutas inválidas, credenciales o rutas públicas podía contribuir a arrancar pools en instancias frías. | [`apps/api/src/app.ts`](../apps/api/src/app.ts) monta casco/CORS/logs, límite específico de credenciales y límite global **antes** del middleware de Mongo. Salud y 404 de API tampoco abren base; el job interno valida su secreto antes de Mongo. Los errores de conexión devuelven un `503 DATABASE_UNAVAILABLE` seguro. | `app.database-middleware.test.ts`: salud, 404, cron no autorizado y solicitudes limitadas no llaman a Mongo. |
| Alta | El layout público conserva `dynamic = "force-dynamic"` ([`apps/web/src/app/(public)/layout.tsx:36`](../apps/web/src/app/(public)/layout.tsx)), por lo que sus datos se solicitan en cada render. | [`apps/web/src/lib/public-site/api-source.ts`](../apps/web/src/lib/public-site/api-source.ts) y [`public.routes.ts`](../apps/api/src/modules/public/public.routes.ts) no retienen datos editoriales; la API responde con `Cache-Control: no-store, max-age=0`. | La prueba de rutas públicas verifica que cada solicitud lee el estado actual. No se expone información privada. |
| Media | El limitador de Express usa memoria local: protege una instancia pero no es una cuota global entre instancias de Vercel. Además, la IP solo es fiable tras configurar correctamente el proxy. | Límites de login, recuperación y reset se aplican antes de DB; se agregaron `AUTH_RATE_LIMIT_*` y `TRUST_PROXY_HOPS`. En producción el valor por defecto es un salto de proxy; no se confía ciegamente en todos los encabezados. La limitación distribuida queda como control de plataforma, no se agregó un servicio pago sin evidencia. | Prueba de rate limit sin inicialización DB; configuración documentada para Firewall/WAF. |
| Media | Los errores y eventos de conexión no tenían telemetría estructurada segura para correlacionar futuras alarmas y podían terminar en logs demasiado verbosos. | [`apps/api/src/observability/logger.ts`](../apps/api/src/observability/logger.ts), [`connect.ts`](../apps/api/src/database/connect.ts), [`app.ts`](../apps/api/src/app.ts), [`error-handler.ts`](../apps/api/src/middleware/error-handler.ts) y [`server.ts`](../apps/api/src/server.ts) registran estado, duración, tamaño configurado de pool, nombre de error, método, ruta normalizada, estado HTTP y `requestId`. Se redaccionan cabeceras de auth/cookies y no se registran URI, token, body, query, IP, alumno ni pago. | Compilación, typecheck y suite completa pasan. Los logs se silencian solo en `NODE_ENV=test` para no alterar tests de integración sensibles a tiempo. |
| Baja / operativa | Existen conexiones directas en tests y en el script manual `seed-professor-demo.ts`; los demás scripts usan `connectDatabase()` y cierran al finalizar. No hay otra conexión directa en la ruta de runtime de Vercel. Los scripts no se ejecutan por cada request. | No se alteraron scripts de mantenimiento ni datos. Se documenta que deben ejecutarse solo bajo control operacional, nunca desde un proceso escalado por request. | Búsqueda completa de `mongoose.connect`, `MongoClient`, `createConnection`, `connectDatabase` y `disconnectDatabase`. |

### Diseño de conexión resultante

- Hay **un camino de conexión de producción**, `apps/api/src/database/connect.ts`; Node autónomo conecta en bootstrap y Vercel conecta solo cuando una ruta que requiere DB lo necesita.
- `globalThis.__mymDatabaseConnectionCache` solo almacena la promesa pendiente, de modo que módulos recargados dentro de una instancia cálida comparten el mismo intento; no crea un segundo `MongoClient` ni un segundo pool.
- Si Mongoose está conectado se reutiliza inmediatamente. Si falla un intento, la promesa se limpia en `finally`; la siguiente demanda puede reintentar una vez, sin loop ni timer de reintento.
- No se llama a `disconnect()` después de solicitudes serverless. Sí se conserva el cierre explícito de scripts de línea de comandos.
- `maxPoolSize=5` es un punto de partida deliberadamente conservador para M0. El máximo colectivo sigue dependiendo del número de instancias Vercel: `instancias cálidas × 5`, más scripts externos. Por eso no es correcto prometer que el código por sí solo evita cualquier alerta de Atlas.

### Referencias exactas de auditoría

- Pool, promesa pendiente, limpieza tras error y eventos: `apps/api/src/database/connect.ts:33-105, 125-138`.
- Variables, límites y validación cruzada de pools: `apps/api/src/config/env.schema.ts:34-50, 66-84, 134-136`.
- Orden de proxy/logs/limitadores, salud y acceso DB por ruta: `apps/api/src/app.ts:38-116, 130-133`.
- Límite global y de credenciales: `apps/api/src/middleware/rate-limit.ts:4-27`; middleware de cron: `apps/api/src/modules/internal/internal.routes.ts:17-31`.
- Coalescencia en API pública: `apps/api/src/modules/public/public.routes.ts:21-60, 64-160`; cache de Next: `apps/web/src/lib/public-site/api-source.ts:148-194`; layout dinámico: `apps/web/src/app/(public)/layout.tsx:36`.
- Test de persistencia de configuración y de conexión: `apps/api/src/database/connect.test.ts:1-92`; pruebas de orden de middleware: `apps/api/src/app.database-middleware.test.ts:1-70`.

## C. Investigación del posible incidente de seguridad

**Clasificación: inconclusa.**

Hechos disponibles:

- El intervalo y el umbral de Atlas fueron proporcionados, pero no se disponía de métricas históricas de conexiones, logs de requests de Vercel, distribución por endpoint/IP/user-agent/geografía ni trazas de cold starts para ese intervalo.
- El repositorio no contiene un vínculo local de proyecto Vercel con el que consultar logs/analytics del incidente. Se comprobó acceso al cluster `Cluster0`, pero no se expusieron métricas históricas suficientes para correlación.
- La configuración revisada no declara un cron Vercel. El handler `/api/internal/jobs/daily` existe y ahora autentica antes de abrir DB; un job externo legítimo sigue siendo una hipótesis que debe cotejarse en los logs de Vercel.
- El binding privado `web → api` de [`vercel.json`](../vercel.json) evita enviar esas llamadas internas por el navegador, pero la API sigue teniendo endpoints públicos y puede escalar en más de una instancia.

No se efectuaron pruebas agresivas contra producción, intentos de credenciales, carga, escaneos ni mutaciones de Atlas. Tampoco se declara actividad maliciosa sin datos. La revisión de los entrypoints cubiertos no halló una autorización de cron abierta ni un cambio que debilite roles/sesiones; una revisión de penetración completa de todos los endpoints queda fuera de lo que la evidencia permite afirmar.

## D. Resumen de implementación

Cambios de aplicación:

- `apps/api/src/database/connect.ts`: caché de promesa por instancia cálida, opciones explícitas y eventos de ciclo de vida seguros.
- `apps/api/src/config/env.schema.ts`, `.env.example`, `apps/api/.env.example`: configuración validada de Mongo, proxy y protección de credenciales.
- `apps/api/src/app.ts`, `middleware/rate-limit.ts`, `modules/auth/auth.routes.ts`, `modules/internal/internal.routes.ts`: orden de middleware y límites antes de DB; cron autenticado antes de DB; identificador de correlación.
- `apps/api/src/observability/logger.ts`, `middleware/error-handler.ts`, `server.ts`: logging estructurado con allowlist y sin secretos.
- `apps/api/src/modules/public/public.routes.ts` y `apps/web/src/lib/public-site/api-source.ts`: cacheo oportuno y coalescencia de misses.
- `apps/api/vitest.config.ts`: desactiva paralelismo entre archivos porque las pruebas de integración comparten `mongodb-memory-server`; antes producía timeouts intermitentes de 5 s. No afecta el runtime de producción.
- `docs/vercel-deployment.md`: variables, protección de borde, región y correlación.

Pruebas agregadas o ampliadas:

- `apps/api/src/database/connect.test.ts`
- `apps/api/src/app.database-middleware.test.ts`
- `apps/api/src/config/env.test.ts`
- `apps/api/src/modules/public/public.routes.test.ts`

Las modificaciones preexistentes de scheduling/clases que estaban sin commit en el árbol de trabajo no forman parte de esta remediación ni deben incluirse en este cambio.

## E. Resultados de validación

Ejecutado en esta rama:

| Comando | Resultado real |
| --- | --- |
| `pnpm typecheck` | Correcto. 4 tareas Turbo exitosas. |
| `pnpm test` | Correcto. 4 tareas Turbo exitosas; API: 41 archivos / **394 pruebas** correctas; web: 7 correctas. Duración aproximada: 2 min 2 s. |
| `pnpm build` | Correcto. API y web compilaron y el build optimizado Next finalizó. |

Durante el build, `opengraph-image` registró que el endpoint de imágenes públicas respondió 404 en la generación estática. Es un warning ya manejado por la aplicación: el build terminó con código 0. Debe observarse en preview porque puede indicar que el backend no está disponible durante esa fase de build, pero no bloquea esta remediación.

Antes de estabilizar la configuración de Vitest, el comando paralelo mostró timeouts intermitentes en `scheduling-billing.flows.test.ts` pese a que el archivo aislado pasaba 18/18. La ejecución completa sin paralelismo dio 41/41 y 394/394; por ello la configuración quedó fijada a un modo reproducible, no se ocultó una falla.

## F. Checklist de despliegue seguro

No se desplegó ni se fusionó ningún cambio automáticamente.

1. Revisar el diff y aprobar la PR desde esta rama. Confirmar que no incluya archivos de scheduling/clases ajenos a esta remediación.
2. En las variables del servicio API de Vercel, cargar `MONGODB_URI` de producción y mantener secretos existentes fuera de logs. No cargar manualmente `NODE_ENV` ni `PORT`.
3. Configurar o confirmar estos valores de producción en el servicio API:

   | Variable | Valor inicial |
   | --- | --- |
   | `TRUST_PROXY_HOPS` | `1` |
   | `AUTH_RATE_LIMIT_WINDOW_MS` | `900000` |
   | `AUTH_RATE_LIMIT_MAX` | `10` |
   | `MONGODB_MAX_POOL_SIZE` | `5` |
   | `MONGODB_MIN_POOL_SIZE` | `0` |
   | `MONGODB_MAX_CONNECTING` | `2` |
   | `MONGODB_MAX_IDLE_TIME_MS` | `30000` |
   | `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | `10000` |
   | `MONGODB_CONNECT_TIMEOUT_MS` | `10000` |
   | `MONGODB_WAIT_QUEUE_TIMEOUT_MS` | `5000` |

4. Mantener activado Vercel Firewall/WAF y agregar reglas de rate limit o challenge para bursts anómalos, especialmente sobre `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password` y endpoints públicos costosos. Es el control global recomendado frente al limitador local por instancia.
5. Si el plan lo permite, ubicar el servicio API en `gru1` (São Paulo) o confirmar una región próxima a `sa-east-1`. No aplicar ese cambio sin revisar disponibilidad, coste y comportamiento de Vercel Services.
6. Crear primero un preview; verificar salud, carga del catálogo público, login, operación administrativa autorizada y el job interno con su secreto. Confirmar que respuestas incluyen `X-Request-ID` y que los logs no contienen URI, tokens, cookies ni bodies.
7. Antes de producción, revisar Atlas: límite del tier, usuarios de base, allowlist/red privada, gráficos de conexiones y procesos externos. La suma de todas las instancias y herramientas debe permanecer con margen frente al límite de M0.
8. Promover el preview solo tras completar ese control. No ejecutar seeds, migraciones, syncs ni backfills durante el despliegue de esta remediación.

## G. Verificación posterior y rollback

### Monitorización

| Ventana | Revisar | Acción esperada |
| --- | --- | --- |
| Primeros 30 min (cada 5 min) | conexiones Atlas, porcentaje de límite, inicializaciones/fallos Mongo, 5xx/503, 429, p95 de API y `X-Request-ID` | Comparar contra baseline; confirmar que el número de conexiones se estabiliza tras cold starts. |
| Primeras 2 h (cada 15 min) | endpoints más solicitados, 401/403/404/429/5xx, user-agents, regiones/IPs si Vercel los expone, WAF | Identificar crawlers o bursts; ajustar reglas de borde antes que agrandar pools. |
| Primeras 24 h | máximos por hora de Atlas, latencia, reintentos, datos públicos que cambian, errores de cache | Confirmar que el TTL de 60 s es aceptable para publicación y que no hay contenido privado cacheado. |
| Siguientes 7 días | recurrencia de alertas, instancias concurrentes, crecimiento de conexiones y presupuesto M0 | Decidir con métricas si se ajusta pool, región o tier; no aumentar valores a ciegas. |

### Triggers de rollback

Revertir al deployment anterior y conservar logs/IDs de correlación si ocurre cualquiera de estos casos tras confirmar que no es una caída externa de Atlas:

- nueva alerta de Atlas superior al 80 % sostenida durante 5 minutos o cualquier agotamiento de conexiones;
- incremento sostenido de 5xx/`DATABASE_UNAVAILABLE` respecto del baseline durante 10 minutos;
- fallo funcional reproducible de login, administración, datos públicos o job autorizado;
- regresión de contenido público no tolerable durante más del TTL documentado;
- latencia p95 sostenida por encima del baseline y correlacionada con esta versión.

Para rollback: promover el deployment Vercel anterior, restaurar las variables a los valores previamente documentados si fueron modificadas y comprobar Atlas/Vercel antes de intentar un nuevo rollout. No es necesario ni seguro borrar datos, resetear Atlas o alterar colecciones para este rollback.

## H. Evaluación final de release

**READY WITH WARNINGS.**

Las puertas requeridas de typecheck, tests y build pasaron, y la remediación es acotada y compatible hacia atrás. La advertencia no es una falla de código: todavía falta correlación de telemetría histórica y la protección de rate limit global depende de configurar Vercel Firewall/WAF o un servicio distribuido si los datos justifican esa inversión. La promoción debe seguir el checklist y la observación reforzada indicada arriba.
