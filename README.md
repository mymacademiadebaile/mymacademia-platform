# M&M Academia Platform

Plataforma de gestión para **M&M Academia de Baile**.

## Arquitectura

Monorepo con:

- `apps/web`: Next.js + React + TypeScript.
- `apps/api`: Node.js + Express + MongoDB/Mongoose.
- `packages/shared`: contratos, enums y tipos compartidos.
- `docs`: alcance funcional, arquitectura y lineamientos UX.

## Plan maestro de implementación

El estado actual, pendientes, orden de ejecución, criterios de aceptación y protocolo para continuar el proyecto están documentados en:

**[`docs/admin-implementation-plan.md`](docs/admin-implementation-plan.md)**

Ese documento debe leerse antes de continuar el desarrollo del ADMIN.

## Experiencia de usuario

La experiencia de profesores utiliza patrones de app mobile-first pero es responsive de forma real: en tablet y desktop aprovecha el ancho disponible y no se presenta permanentemente dentro de un marco de teléfono.

La administración es una aplicación web responsive con mayor densidad de información, navegación lateral y flujos operativos.

## Email

El envío de correos se realiza con **Nodemailer + Gmail**. No se usa Resend.

Para desarrollo/producción se usa SMTP de Gmail mediante `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` y `SMTP_PASSWORD`. `SMTP_PASSWORD` debe ser una contraseña de aplicación de Google. Nunca guardar credenciales reales en el repositorio.

## Desarrollo local

```bash
corepack enable
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

pnpm --filter @mym/api seed:initial
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000
- Health: http://localhost:4000/api/health

## Alcance V1

Incluye gestión de profesores, alumnos, clases, horarios, catálogos maestros, cupos, pagos, deuda, recordatorios, promociones, reportes y auditoría.

No incluye en V1: asistencia digital, lista de espera, Mercado Pago, clases de prueba, CRM de interesados, portal del alumno ni apps nativas.

Ver `docs/functional-scope.md`.

## Variables de entorno

La API valida desde `apps/api/src/config/env.ts` únicamente la configuración necesaria para runtime: aplicación, MongoDB, JWT, rate limit, Cloudinary y SMTP. El seed inicial usa además `ADMIN_PASSWORD`; el email del administrador se toma de `SMTP_USER`.

Las variables antiguas `GMAIL_USER`, `GMAIL_APP_PASSWORD` y `MAIL_FROM` no se utilizan. La configuración de Gmail se centraliza en las variables `SMTP_*` y `MAIL_FROM_NAME`.

## Despliegue en Vercel

El frontend y la API se despliegan juntos, dentro de un único proyecto de
Vercel Services y un único dominio. La configuración, las variables de
producción y el checklist de publicación están en
[`docs/vercel-deployment.md`](docs/vercel-deployment.md).
