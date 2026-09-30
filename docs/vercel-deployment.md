# Despliegue en Vercel

El repositorio se despliega como **dos proyectos de Vercel**:

| Proyecto | Directorio raíz | Framework | URL resultante |
| --- | --- | --- | --- |
| Web | `apps/web` | Next.js | `https://app.tu-dominio.com` |
| API | `apps/api` | Express | `https://api.tu-dominio.com` |

La API exporta Express desde `src/app.ts`, por lo que Vercel la ejecuta como
una Function. No se debe configurar un comando `start`, ni una variable `PORT`:
Vercel gestiona ambos.

## Antes de importar

1. Subí el repositorio a GitHub, GitLab o Bitbucket, sin archivos `.env`.
2. Creá una base de datos MongoDB Atlas y permití conexiones desde Vercel.
3. Elegí dos dominios bajo el mismo dominio raíz, por ejemplo
   `app.tu-dominio.com` y `api.tu-dominio.com`. Así las cookies de sesión siguen
   siendo *same-site*.

## Proyecto API

En Vercel, importá el repositorio y elegí `apps/api` como **Root Directory**.
Dejá habilitada la opción de incluir archivos fuente fuera del directorio raíz:
la API depende de `packages/shared`.

Usá este Build Command:

```bash
cd ../.. && pnpm exec turbo run build --filter=@mym/api...
```

Configurá estas variables en **Production**:

```env
APP_ORIGIN=https://app.tu-dominio.com
MONGODB_URI=mongodb+srv://...
JWT_ACCESS_SECRET=<secreto-aleatorio-de-al-menos-32-caracteres>

RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120

CLOUDINARY_CLOUD_NAME=<cloud-name>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_API_SECRET=<api-secret>

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<cuenta-remitente>
SMTP_PASSWORD=<contrasena-de-aplicacion-de-google>
MAIL_FROM_NAME=M&M Academia
```

`CLOUDINARY_*` es necesario para las cargas de archivos y `SMTP_*` para el
restablecimiento de contraseña. Si esos flujos no se usan aún, la API inicia
igual, pero responde con un error de servicio no configurado al invocarlos.

No configures `PORT`. Vercel provee `NODE_ENV=production` automáticamente.

## Proyecto web

Importá el mismo repositorio por segunda vez y elegí `apps/web` como **Root
Directory**. El framework debe quedar en **Next.js**. Usá este Build Command:

```bash
cd ../.. && pnpm exec turbo run build --filter=@mym/web...
```

En **Production**, agregá:

```env
NEXT_PUBLIC_API_URL=https://api.tu-dominio.com/api
NEXT_PUBLIC_SITE_URL=https://app.tu-dominio.com
```

Estas variables se incorporan al build del navegador: cambiarlas requiere un
redeploy. No cargues secretos en variables `NEXT_PUBLIC_*`.

## Orden de publicación

1. Desplegá primero la API y comprobá `https://api.tu-dominio.com/api/health`.
2. Asigná el dominio definitivo de la API y usalo en `NEXT_PUBLIC_API_URL` del
   proyecto web.
3. Desplegá el frontend y asigná su dominio definitivo.
4. Actualizá `APP_ORIGIN` de la API con la URL final del frontend y redeplegá la
   API.
5. Ejecutá una prueba de inicio de sesión, cierre de sesión y recuperación de
   contraseña desde el dominio público.

## Seed inicial

El seed no se ejecuta durante el deploy. Una sola vez, con las variables de
producción cargadas localmente, ejecutá:

```bash
pnpm --filter @mym/api seed:initial
```

Requiere `MONGODB_URI`, `ADMIN_PASSWORD` y, opcionalmente, `ADMIN_EMAIL`
(si se omite, se utiliza `SMTP_USER`). Nunca pongas `ADMIN_PASSWORD` en las
variables de Vercel salvo que tengas un motivo puntual para ejecutar el seed
desde allí.

## Previews

La configuración actual está pensada para producción. Antes de habilitar
previews que permitan login, configurá URLs de preview específicas para ambos
proyectos y una política CORS que las autorice. No apuntes un preview a la base
de datos de producción.
