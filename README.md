# M&M Academia Platform

Plataforma de gestión para **M&M Academia de Baile**.

## Arquitectura

Monorepo con:

- `apps/web`: Next.js + React + TypeScript.
- `apps/api`: Node.js + Express + MongoDB/Mongoose.
- `packages/shared`: contratos, enums y tipos compartidos.
- `docs`: alcance funcional, arquitectura y lineamientos UX.

## Experiencia de usuario

La experiencia de profesores se diseña **mobile-first** y con comportamiento de app: navegación inferior, tarjetas táctiles, acciones rápidas y flujos cortos. No se plantea como un backoffice tradicional.

## Email

El envío de correos se realiza con **Nodemailer + Gmail**. No se usa Resend.

Para desarrollo/producción se debe configurar una contraseña de aplicación de Google en `GMAIL_APP_PASSWORD`. Nunca guardar credenciales reales en el repositorio.

## Desarrollo local

```bash
corepack enable
pnpm install

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000
- Health: http://localhost:4000/api/health

## Alcance V1

Incluye gestión de profesores, alumnos, clases, horarios, catálogos maestros, cupos, pagos, deuda, recordatorios, promociones, reportes y auditoría.

No incluye en V1: asistencia digital, lista de espera, Mercado Pago, clases de prueba, CRM de interesados, portal del alumno ni apps nativas.

Ver `docs/functional-scope.md`.
