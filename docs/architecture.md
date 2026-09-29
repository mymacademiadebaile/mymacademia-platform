# Arquitectura

## Principios

1. Propiedad del cliente desde el inicio.
2. Monorepo para compartir contratos sin duplicación.
3. Backend modular; sin microservicios en V1.
4. Multi-organización y multi-sede preparados desde el modelo.
5. Roles iniciales: ADMIN y PROFESSOR.
6. Profesor con experiencia mobile-first; administración con más densidad de información.
7. Secretos exclusivamente por variables de entorno.

## Componentes

```text
apps/web
  Next.js
  ├─ landing
  ├─ admin
  └─ professor mobile UI

apps/api
  Express
  ├─ auth
  ├─ organizations
  ├─ branches
  ├─ catalogs
  ├─ professors
  ├─ students
  ├─ classes
  ├─ enrollments
  ├─ payments
  ├─ notifications
  ├─ promotions
  ├─ reports
  └─ audit

packages/shared
  tipos y enums compartidos
```

## Infraestructura prevista

- Web: Vercel.
- API: a definir entre Vercel/servicio Node dedicado según carga.
- Base de datos: MongoDB Atlas.
- Media: Cloudinary.
- Email: Gmail mediante Nodemailer.
- Repositorio: GitHub del cliente.

## Seguridad

- JWT de acceso corto.
- Passwords con bcrypt.
- CORS restringido.
- Helmet.
- Validación Zod en bordes de entrada.
- Scope por organizationId y branchId.
- Auditoría para acciones sensibles.
