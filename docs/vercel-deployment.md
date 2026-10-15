# Despliegue en Vercel Services

## Arquitectura

```
1 repositorio de GitHub
        ↓
1 proyecto de Vercel
        ↓
Vercel Services
├── web  → apps/web (Next.js)
└── api  → apps/api (Express)
```

Los dos services se construyen y despliegan en forma coordinada, con un único
dominio público. La configuración está en [`../vercel.json`](../vercel.json) y
usa el modelo actual `services`; no usa el modelo obsoleto
`experimentalServices` ni dos proyectos independientes.

## Routing

Las reglas de nivel superior se evalúan en este orden:

| Solicitud pública | Service | Ruta que recibe el service |
| --- | --- | --- |
| `/api/*` | `api` | `/api/*` |
| `/*` | `web` | la ruta original |

Por ejemplo, `GET /api/health` llega a la ruta Express existente
`/api/health`. Los requests del navegador usan `/api` relativo al mismo origen:
no hay una URL ni un dominio público independiente para la API.

El service `web` también declara un binding privado hacia `api`. Vercel inyecta
`API_INTERNAL_URL` en el runtime de Next.js para que los Server Components
consulten el catálogo público sin salir a Internet. Esa variable es generada
por Vercel, no se carga manualmente ni se expone al navegador.

## Crear el proyecto

1. En Vercel, elegí **Add New → Project** e importá
   `mymacademiadebaile/mymacademia-platform`.
2. Usá el nombre `mymacademia-platform`.
3. Dejá **Root Directory** en `./`.
4. En **Framework Preset**, seleccioná **Services**.
5. Elegí `main` como rama de producción.
6. Cargá las variables de producción antes del primer deploy y desplegá una vez.

No hay que crear proyectos llamados `mymacademia-web` ni `mymacademia-api`.
Los comandos de instalación y build viven dentro de cada service de
`vercel.json`; ambos parten del workspace raíz y el build de `api` incluye
`@mym/shared` mediante Turbo.

## Variables de entorno de producción

### Obligatorias

| Variable | Uso |
| --- | --- |
| `APP_ORIGIN` | URL pública completa del único deployment, sin barra final. También forma los enlaces de recuperación y conserva CORS para desarrollo local. |
| `MONGODB_URI` | URI de MongoDB Atlas u otra base de datos de producción. |
| `JWT_ACCESS_SECRET` | Secreto aleatorio de al menos 32 caracteres para firmar sesiones. |
| `NEXT_PUBLIC_SITE_URL` | URL pública completa, sin barra final, para canonical, sitemap, OpenGraph y JSON-LD. Debe coincidir con `APP_ORIGIN`. |

### Opcionales con valores por defecto

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Ventana del rate limit. |
| `RATE_LIMIT_MAX` | `120` | Máximo de requests por ventana. |
| `AUTH_RATE_LIMIT_WINDOW_MS` | `900000` | Ventana específica para login y recuperación de contraseña. |
| `AUTH_RATE_LIMIT_MAX` | `10` | Máximo de intentos de credenciales por IP en esa ventana. |
| `TRUST_PROXY_HOPS` | `1` en producción, `0` fuera de producción | Cantidad de proxies confiables delante de Express. En Vercel mantener `1`; no usar `true`. |
| `MONGODB_MAX_POOL_SIZE` | `5` | Máximo de sockets de MongoDB por instancia cálida de la API. |
| `MONGODB_MIN_POOL_SIZE` | `0` | No reserva sockets en instancias inactivas. |
| `MONGODB_MAX_CONNECTING` | `2` | Limita handshakes simultáneos del driver por instancia. |
| `MONGODB_MAX_IDLE_TIME_MS` | `30000` | Cierra sockets de pool inactivos después de 30 segundos. |
| `MONGODB_SERVER_SELECTION_TIMEOUT_MS` | `10000` | Límite de selección de servidor de MongoDB. |
| `MONGODB_CONNECT_TIMEOUT_MS` | `10000` | Límite de establecimiento de conexión TCP/TLS. |
| `MONGODB_WAIT_QUEUE_TIMEOUT_MS` | `5000` | Backpressure cuando el pool se encuentra ocupado. |
| `PUBLIC_ORGANIZATION_SLUG` | `mym-academia` | Organización cuyo catálogo público muestra la web. |
| `SMTP_HOST` | `smtp.gmail.com` | Host SMTP. |
| `SMTP_PORT` | `465` | Puerto SMTP. |
| `SMTP_SECURE` | `true` | TLS SMTP. |
| `MAIL_FROM_NAME` | `M&M Academia` | Nombre remitente. |

### Integraciones que habilitan funcionalidades

| Variables | Funcionalidad |
| --- | --- |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Carga de imágenes y archivos. |
| `SMTP_USER`, `SMTP_PASSWORD` | Recuperación de contraseña por email. `SMTP_PASSWORD` es una contraseña de aplicación de Google. |

### Solo seed inicial

`ADMIN_PASSWORD` es requerido únicamente por `pnpm --filter @mym/api
seed:initial`. `ADMIN_EMAIL` es opcional y, si falta, el seed utiliza
`SMTP_USER`. No cargues `ADMIN_PASSWORD` como variable permanente de runtime
en Vercel.

### Desarrollo local

Copiá `apps/api/.env.example` como `apps/api/.env` y
`apps/web/.env.example` como `apps/web/.env.local`. Para el desarrollo
separado, `NEXT_PUBLIC_API_URL=http://localhost:4000/api` mantiene:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- Health: `http://localhost:4000/api/health`

### Variables que no hay que cargar manualmente en Vercel

- `PORT` y `NODE_ENV`: Vercel las administra.
- `NEXT_PUBLIC_API_URL`: en producción la app usa `/api` same-origin. Solo es
  necesaria para el desarrollo local separado.
- `API_INTERNAL_URL`: la genera el binding de Services para el runtime web.
- `VERCEL_URL`: no se usa.
- `ADMIN_PASSWORD`: salvo una ejecución puntual y controlada del seed.
- Cualquier secreto con prefijo `NEXT_PUBLIC_`.

## Cookies, autenticación y CORS

La sesión sigue usando una cookie `HttpOnly` con `Path=/`, `SameSite=Lax` y
`Secure` en producción. No se fija `Domain`, por lo que el navegador la asocia
correctamente al único dominio público. El cliente conserva
`credentials: "include"` para login, logout y sesión persistente.

La API mantiene `APP_ORIGIN` y CORS para el desarrollo local
`localhost:3000 → localhost:4000`; en producción frontend y API comparten
origen, por lo que no hay dependencia de una segunda URL de API.

## Verificación de producción

Después del deploy, comprobá:

- [ ] `/` carga el sitio.
- [ ] `/api/health` responde correctamente.
- [ ] Login, logout y sesión persistente.
- [ ] Recuperación de contraseña y envío de email.
- [ ] Navegación de administración.
- [ ] Navegación del portal de profesor.
- [ ] Carga y visualización de imágenes de Cloudinary.
- [ ] Conexión a MongoDB y catálogo público publicado.

## Controles de capacidad y abuso

La API reutiliza el pool de Mongoose dentro de cada instancia cálida, pero una
plataforma serverless puede crear varias instancias y cada una conserva su propio
pool. Por eso, los límites de la aplicación son una primera barrera, no un límite
global de tráfico. Antes de producción:

- Configurá `MONGODB_MAX_POOL_SIZE=5` como punto de partida para Atlas M0 y no
  aumentes el valor sin revisar la métrica de conexiones, los cold starts y la
  concurrencia real de Vercel.
- Mantené activo Vercel Firewall/WAF y agregá reglas de rate limit o challenge
  para rutas públicas anormalmente solicitadas si la telemetría lo justifica.
  Es la capa compartida entre instancias; el store de `express-rate-limit` es
  intencionalmente local a cada instancia.
- Si el plan de Vercel lo permite, ubicá el servicio `api` en `gru1` para
  acercarlo a Atlas en `sa-east-1`; verificá primero que no cambie el alcance de
  regiones contratado.
- No cargues secretos ni datos de estudiantes en logs. Cada respuesta de API
  devuelve `X-Request-Id`, útil para correlacionar los logs seguros con Atlas.

## Desarrollo y validación

El flujo local existente no cambia:

```bash
pnpm dev
```

Para simular la tabla de routing de Services localmente, con una versión actual
del CLI de Vercel, se puede usar desde la raíz:

```bash
vercel dev -L
```

Antes de publicar cambios, ejecutar:

```bash
pnpm typecheck
pnpm build
pnpm test
```
