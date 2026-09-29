# M&M Academia — Plan maestro de implementación del Administrador

> Documento operativo para continuar el proyecto sin depender del contexto de una conversación.
>
> **Estado de referencia:** 29/09/2026  
> **Repositorio:** `mymacademiadebaile/mymacademia-platform`  
> **Rama de trabajo definida por el propietario:** `main`  
> **Prioridad actual:** convertir la vista ADMIN en un producto funcional end-to-end sobre MongoDB real.

---

## 1. Objetivo de este documento

Este archivo es la fuente de verdad para cualquier persona o IA que continúe el desarrollo.

Antes de modificar código:

1. Leer este documento completo.
2. Leer `docs/functional-scope.md`, `docs/architecture.md`, `docs/admin-ux.md` y `docs/professor-ux.md`.
3. Inspeccionar el código actual antes de asumir que una tarea está pendiente o terminada.
4. Ejecutar `pnpm install`, `pnpm typecheck`, `pnpm test` y `pnpm build` después de cambios relevantes.
5. Trabajar directamente sobre `main`, salvo instrucción explícita del propietario.
6. No declarar una funcionalidad "lista" si solamente existe la interfaz, el modelo o el endpoint de forma aislada. "Lista" significa flujo completo UI → API → DB → validación → estado de error → prueba.

El objetivo de corto plazo es que un administrador de M&M Academia pueda operar el negocio desde el navegador sin datos mock, planillas paralelas ni acciones manuales innecesarias.

---

## 2. Reglas funcionales que NO deben cambiarse

### 2.1 Alcance V1 incluido

La primera versión debe cubrir:

- Login y permisos para `ADMIN` y `PROFESSOR`.
- Organización y preparación para futuras sedes.
- Catálogos maestros administrados por la academia.
- Profesores.
- Alumnos.
- Clases, horarios y cupos.
- Inscripciones de alumnos.
- Pagos, vencimientos, deuda y comprobantes.
- Recordatorios de deuda por email.
- WhatsApp mediante mensaje precargado, sin API paga en V1.
- Recordatorios de clase.
- Promociones/comunicaciones de profesores a sus propios alumnos.
- Dashboard.
- Estadísticas y reportes.
- Exportación Excel/PDF.
- Auditoría de acciones sensibles.

### 2.2 Fuera de V1

No incorporar sin aprobación explícita:

- Asistencia digital.
- Lista de espera.
- Mercado Pago.
- Clases de prueba.
- CRM de interesados.
- Portal del alumno.
- Aplicación nativa.
- Liquidación automática de profesores.

### 2.3 Regla crítica de categorías

Los profesores **no escriben libremente** disciplina, público o nivel.

La administración mantiene los catálogos y las clases referencian IDs.

Tipos mínimos:

- `DISCIPLINE`: Reggaetón, Urbano, Hip Hop, Bachata, Salsa, Jazz, Contemporáneo, K-Pop, Heels, Ritmos Latinos, Tango, Folklore.
- `SEGMENT`: Infantil, Adolescentes, Adultos.
- `LEVEL`: Inicial, Intermedio, Avanzado.

El seed inicial ya contempla estos valores.

---

## 3. UX obligatoria

### 3.1 Administrador

La administración es una aplicación web profesional y responsive.

Desktop:

- sidebar persistente;
- contenido amplio;
- grillas y tablas cuando agregan valor;
- lectura rápida de métricas;
- acciones frecuentes a pocos clics.

Tablet/móvil:

- menú lateral adaptable;
- formularios cómodos para touch;
- tablas responsivas o scroll horizontal controlado;
- sin pérdida de funciones.

No diseñar el ADMIN como si estuviera dentro de un teléfono.

### 3.2 Profesor

La experiencia del profesor usa lenguaje de aplicación móvil pero **no debe mostrarse siempre dentro de un marco de celular**.

- móvil: navegación inferior y cards táctiles;
- tablet/desktop: layout que aprovecha el ancho, navegación lateral compacta y grillas;
- responsive real;
- misma funcionalidad con touch, mouse y teclado;
- evitar apariencia de CRUD administrativo.

---

## 4. Arquitectura vigente

### Monorepo

```text
mymacademia-platform/
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   └── shared/
├── docs/
└── .github/workflows/
```

### Stack

- Monorepo: pnpm + Turborepo.
- Web: Next.js App Router + React + TypeScript.
- API: Node.js + Express + TypeScript.
- DB: MongoDB Atlas + Mongoose.
- Validación: Zod.
- Auth: JWT almacenado en cookie HTTP-only.
- Passwords: bcrypt.
- Email: Nodemailer sobre SMTP de Gmail.
- Media: Cloudinary.
- Logging HTTP: Pino.
- Tests actuales: Vitest + Supertest.
- CI: GitHub Actions.
- Web prevista: Vercel.
- API productiva: definir hosting Node antes de go-live.

### Variables de entorno de API

La configuración canonical está en `apps/api/src/config/env.ts`.

Runtime:

```env
NODE_ENV=
PORT=
APP_ORIGIN=
MONGODB_URI=
JWT_ACCESS_SECRET=

RATE_LIMIT_WINDOW_MS=
RATE_LIMIT_MAX=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM_NAME=
```

Seed inicial:

```env
ADMIN_PASSWORD=
```

No volver a introducir `GMAIL_USER`, `GMAIL_APP_PASSWORD` ni `MAIL_FROM`; la configuración de email queda centralizada en `SMTP_*`.

Nunca subir `.env` ni secretos al repositorio.

---

## 5. Estado actual verificado en código

La siguiente clasificación describe lo que existe en el repositorio. No significa necesariamente que todos los flujos estén terminados para producción.

### Leyenda

- ✅ Base funcional implementada.
- 🟡 Implementación parcial: existe UI/API/modelo pero faltan casos reales, integración o UX.
- ❌ Pendiente.

### 5.1 Infraestructura técnica

| Área | Estado | Observación |
|---|---|---|
| Monorepo pnpm/Turbo | ✅ | Web, API y shared. |
| TypeScript | ✅ | Compartido entre paquetes. |
| MongoDB/Mongoose | ✅ | Conector y modelos base. |
| Variables de entorno validadas | ✅ | Zod en API. |
| Rate limit | ✅ | Aplicado sobre `/api`. |
| Helmet/CORS | ✅ | Configuración base. |
| Pino HTTP | ✅ | Logging HTTP base. |
| Cloudinary client | 🟡 | Servicio creado; falta flujo de upload usado por módulos reales. |
| CI | ✅ | install/typecheck/test/build. |
| Cobertura de tests | ❌ | Hoy es mínima; no alcanza para operaciones críticas. |

### 5.2 Autenticación

| Función | Estado | Falta |
|---|---|---|
| Login email/password | ✅ | Endurecer mensajes/casos de seguridad. |
| Cookie HTTP-only | ✅ | Revisar estrategia cross-domain en producción. |
| `GET /auth/me` | ✅ | — |
| Logout | ✅ | — |
| Guards por rol | ✅ | ADMIN/PROFESSOR. |
| Refresh token | ❌ | No existe actualmente. Decidir si V1 necesita renovación silenciosa. |
| Recuperar contraseña | ❌ | Flujo completo email/token/password. |
| Cambio de contraseña | ❌ | Admin y profesor. |
| Bloqueo/rate limit específico de login | 🟡 | Hay rate limit general, no protección especializada. |
| Gestión de sesión expirada en UI | 🟡 | Redirección básica; falta UX consistente. |

### 5.3 Seed inicial

Existe `apps/api/src/scripts/seed-admin.ts`.

Debe ser idempotente y crear/actualizar:

- organización `M&M Academia de Baile`;
- sede `La Plata`;
- dirección `Calle 35 entre 3 y 4, La Plata`;
- usuario `ADMIN`;
- catálogos iniciales.

Comando:

```bash
pnpm --filter @mym/api seed:initial
```

El script compila primero `@mym/shared`.

### 5.4 Administrador — módulos actuales

#### Dashboard — 🟡

Existe:

- endpoint `GET /api/admin/summary`;
- UI conectada a la API;
- alumnos activos;
- profesores activos;
- clases activas;
- inscripciones activas;
- pagos pendientes/vencidos;
- monto cobrado.

Falta:

- definir período de cálculo;
- métricas del mes actual;
- comparación con período anterior;
- clases del día reales;
- vencimientos próximos;
- actividad reciente desde auditoría;
- accesos rápidos conectados;
- estados vacíos y fallas de datos refinados.

#### Profesores — 🟡

Existe:

- modelo `User` + `Professor`;
- creación de profesor y usuario;
- listado;
- PATCH de perfil;
- asignación inicial de sede;
- UI de alta/listado.

Falta:

- detalle de profesor;
- edición real desde UI;
- activar/desactivar;
- restablecer contraseña;
- administrar sedes;
- administrar disciplinas del profesor;
- ver clases asignadas;
- ver cantidad real de alumnos;
- historial/comunicaciones;
- validaciones de duplicados y errores de DB amigables.

#### Alumnos — 🟡

Existe:

- listado paginado;
- búsqueda;
- alta;
- PATCH;
- campos de contacto, nacimiento, responsable y notas;
- UI conectada.

Falta:

- vista detalle;
- edición completa;
- activar/desactivar desde UI;
- clases actuales;
- historial de inscripciones;
- estado de cuenta;
- pagos/comprobantes;
- contacto rápido;
- filtros por clase, sede, deuda, edad/segmento;
- soporte UX específico para menores;
- prevención/alerta de duplicados;
- exportación.

#### Catálogos — 🟡

Existe:

- listar;
- crear;
- activar/desactivar;
- disciplina/segmento/nivel;
- UI real.

Falta:

- editar nombre;
- reordenar;
- confirmar desactivación si está en uso;
- impedir inconsistencias al cambiar valores usados;
- mostrar cantidad de clases que usan cada opción.

#### Clases y horarios — 🟡

Existe:

- crear;
- listar;
- obtener por ID;
- PATCH backend;
- profesor;
- disciplina;
- segmento;
- nivel;
- capacidad;
- uno o más schedules en modelo;
- pantalla detalle;
- vínculo hacia inscripciones.

Falta:

- edición desde UI;
- activar/desactivar;
- múltiples horarios desde UI;
- prevención de horarios inválidos;
- detectar solapamientos de un profesor;
- detectar conflictos opcionales de sede/espacio cuando se modele;
- mostrar ocupación real en listado;
- filtros;
- calendario/agenda semanal;
- duplicar clase;
- reglas de eliminación/inactivación segura.

#### Inscripciones/cupos — 🟡

Existe:

- listado por clase;
- alta;
- baja lógica;
- control de capacidad;
- evitar doble inscripción activa;
- control de sede;
- UI en detalle de clase.

Falta:

- inscripción desde ficha del alumno;
- historial;
- mover alumno de clase;
- manejo de reactivación y fechas con reglas claras;
- auditoría;
- reportes;
- mejores mensajes para conflictos.

No agregar lista de espera en V1.

#### Pagos — 🟡

Existe:

- modelo Payment;
- crear cuota;
- listar;
- marcar pagado;
- filtro básico por status en API;
- recordatorio individual por email;
- UI conectada.

Falta:

- definir modelo financiero definitivo;
- edición/cancelación;
- estados automáticos de vencimiento;
- concepto/período normalizado;
- prevención de duplicados de cuota;
- carga y consulta de comprobante;
- Cloudinary para comprobantes;
- emisión de recibo PDF;
- numeración/identificador de recibo;
- medio de pago;
- fecha real de cobro editable;
- observaciones;
- historial del alumno;
- filtros por período, estado, sede y clase;
- totales del período;
- exportación Excel/PDF;
- auditoría.

No incorporar Mercado Pago en V1.

#### Comunicaciones — 🟡

Existe:

- envío email con Gmail/Nodemailer;
- audiencia ALL/DEBT/CLASS;
- reemplazo `{{nombre}}`;
- registro `NotificationLog`;
- WhatsApp usando `wa.me`;
- UI básica.

Falta:

- historial visible de envíos;
- reintentar fallidos;
- plantillas;
- vista previa;
- confirmación antes de envío masivo;
- protección para evitar doble envío;
- filtros/segmentación segura;
- registrar WhatsApp manual en historial cuando corresponda;
- promociones del profesor restringidas a sus alumnos;
- recordatorios de clase operativos.

En V1 no introducir WhatsApp Business API salvo decisión comercial posterior.

#### Reportes — 🟡

Existe:

- pantalla conectada al summary.

Falta casi toda la capa real de reporting:

- período;
- ingresos;
- deuda;
- altas/bajas;
- ocupación por clase;
- alumnos por disciplina/segmento/nivel;
- profesores y carga;
- exportación Excel;
- exportación PDF;
- filtros por sede.

#### Configuración — 🟡

Existe:

- organización;
- sede principal;
- nombre;
- email;
- teléfono;
- timezone;
- UI conectada.

Falta:

- administración completa de múltiples sedes;
- configuración de vencimientos;
- conceptos/tarifas;
- parámetros de recibos;
- plantillas;
- configuración visible de integraciones sin exponer secretos.

#### Auditoría — ❌ funcionalmente

Existe `AuditLogModel`, pero no está integrada en los casos de uso importantes.

Debe registrar, como mínimo:

- alta/edición/inactivación de profesor;
- alta/edición/inactivación de alumno;
- alta/edición/inactivación de clase;
- inscripción/baja/movimiento;
- creación/edición/cancelación/pago;
- recordatorios;
- cambios de configuración;
- cambios de catálogos.

La auditoría debe ser append-only desde la lógica de negocio.

---

## 6. Modelos actuales

Modelos base ya presentes:

- `Organization`
- `Branch`
- `User`
- `Professor`
- `Student`
- `CatalogItem`
- `DanceClass`
- `Enrollment`
- `Payment`
- `NotificationLog`
- `AuditLog`

Antes de agregar un modelo nuevo, comprobar si el concepto puede resolverse extendiendo uno de estos sin crear duplicación.

### Relaciones esperadas

```text
Organization
├── Branch
├── User
│   └── ProfessorProfile
├── Student
├── CatalogItem
├── DanceClass
│   ├── Professor
│   ├── CatalogItem[]
│   └── Enrollment[]
├── Payment
├── NotificationLog
└── AuditLog
```

Todo dato de negocio que corresponda debe mantener scope de `organizationId`; cuando aplique, también `branchId`.

---

## 7. Plan de ejecución prioritario

## FASE 0 — Base real y entorno local estable

**Objetivo:** que cualquier desarrollador pueda levantar y usar el sistema contra una DB real.

### Tareas

- [ ] Confirmar que `apps/api/.env` carga correctamente.
- [ ] Confirmar conexión a MongoDB Atlas.
- [ ] Ejecutar `seed:initial`.
- [ ] Verificar en DB organización, sede, ADMIN y catálogos.
- [ ] Levantar API en `:4000`.
- [ ] Levantar web en `:3000`.
- [ ] Login real del ADMIN.
- [ ] Verificar cookies en localhost.
- [ ] Documentar troubleshooting local.
- [ ] Eliminar cualquier dato mock que siga visible en rutas ADMIN activas.
- [ ] Revisar `.env.example` raíz y eliminar configuraciones duplicadas/obsoletas si no tiene función real.

### Aceptación

Un entorno limpio puede hacer:

```bash
pnpm install
pnpm --filter @mym/api seed:initial
pnpm dev
```

y luego ingresar como ADMIN y navegar sin `ERR_CONNECTION_REFUSED`, datos mock ni errores críticos.

---

## FASE 1 — Shell ADMIN y experiencia consistente

**Objetivo:** cerrar la estructura de navegación antes de profundizar CRUDs.

### Tareas

- [ ] Revisar cada ruta del sidebar.
- [ ] Estado activo correcto.
- [ ] Header contextual por módulo.
- [ ] Breadcrumbs en detalles.
- [ ] Loading skeletons consistentes.
- [ ] Empty states.
- [ ] Error states.
- [ ] Toast/feedback global.
- [ ] Confirm dialogs para acciones destructivas.
- [ ] Responsive desktop/tablet/mobile.
- [ ] Accesibilidad básica: labels, focus, teclado, contrastes.
- [ ] Eliminar componentes demo antiguos si ya no se usan.

### Aceptación

Todas las rutas ADMIN comparten patrones visuales y de feedback. Ninguna acción parece ejecutarse si realmente falló.

---

## FASE 2 — Alumnos end-to-end

**Prioridad alta.**

### Flujo final

```text
Listado
→ Alta
→ Ficha
→ Edición
→ Clases
→ Estado de cuenta
→ Contacto
→ Historial
```

### Backend

- [ ] `GET /admin/students/:id`.
- [ ] filtros por estado/sede/clase/deuda;
- [ ] endpoint de detalle agregado con clases y resumen financiero;
- [ ] PATCH robusto;
- [ ] inactivación lógica;
- [ ] detección razonable de duplicados;
- [ ] validación de responsable en menores según regla de negocio acordada.

### Frontend

- [ ] `/admin/students/[id]`;
- [ ] tabs/resumen;
- [ ] editar datos;
- [ ] ver inscripciones;
- [ ] ver pagos;
- [ ] enviar WhatsApp/email;
- [ ] activar/desactivar.

### Tests

- [ ] alta;
- [ ] búsqueda;
- [ ] edición;
- [ ] aislamiento por organización;
- [ ] inactivación;
- [ ] errores de ObjectId/validación.

---

## FASE 3 — Profesores end-to-end

### Flujo final

```text
Listado
→ Alta + usuario
→ Ficha
→ Sedes/disciplinas
→ Clases asignadas
→ Edición
→ Activar/desactivar
→ Reset de acceso
```

### Decisión de modelo

Definir disciplinas del profesor como referencias a `CatalogItem` de tipo `DISCIPLINE`; no guardarlas como texto libre.

### Tareas

- [ ] extender `Professor` con disciplinas referenciadas;
- [ ] detalle;
- [ ] edición;
- [ ] activar/desactivar sincronizando User/Professor;
- [ ] reset de contraseña;
- [ ] clases reales;
- [ ] alumnos alcanzados por sus clases;
- [ ] tests de permisos.

---

## FASE 4 — Clases, horarios e inscripciones

### Clases

- [ ] UI de edición;
- [ ] múltiples schedules;
- [ ] validación start < end;
- [ ] conflictos de profesor;
- [ ] filtros;
- [ ] ocupación real;
- [ ] calendario semanal;
- [ ] activar/desactivar.

### Inscripciones

- [ ] historial;
- [ ] movimiento entre clases;
- [ ] inscripción desde alumno;
- [ ] confirmación de baja;
- [ ] auditoría;
- [ ] manejo correcto de reactivación.

### Aceptación

La administración puede crear la oferta semanal, asignar profesores, inscribir alumnos y conocer cupos sin tocar MongoDB manualmente.

---

## FASE 5 — Finanzas completas

Esta fase requiere especial cuidado porque impacta información económica.

### Definir antes de programar

- unidad financiera V1: cuota individual por alumno;
- períodos: formato canonical `YYYY-MM`;
- moneda: ARS inicialmente;
- concepto;
- vencimiento;
- estado;
- medio de pago;
- comprobante;
- recibo.

### Modelo sugerido de Payment

Mantener el modelo actual y agregar sólo lo necesario:

- `paymentMethod`;
- `receiptNumber`;
- `proofUrl`;
- `paidAt`;
- `createdByUserId`;
- `cancelledAt/cancelledBy/reason` si se implementa cancelación;
- índice único apropiado para evitar duplicar una cuota cuando corresponda.

### Tareas

- [ ] estados derivados/normalizados;
- [ ] filtros;
- [ ] editar;
- [ ] cancelar sin borrar historial;
- [ ] registrar cobro;
- [ ] comprobante Cloudinary;
- [ ] recibo PDF;
- [ ] vista estado de cuenta del alumno;
- [ ] totales;
- [ ] deuda;
- [ ] recordatorio;
- [ ] auditoría;
- [ ] tests de monto/estado/transiciones.

Nunca borrar un pago cobrado para "corregirlo"; usar corrección/cancelación auditada.

---

## FASE 6 — Comunicaciones reales

### Administración

- [ ] historial de NotificationLog;
- [ ] filtros por canal/tipo/estado;
- [ ] plantillas;
- [ ] preview;
- [ ] confirmación masiva;
- [ ] reintentos controlados;
- [ ] recordatorio de clase;
- [ ] deuda individual y masiva.

### Profesor

Implementar sólo después de tener la relación profesor → clases → alumnos sólida.

Un PROFESSOR sólo puede comunicarse con alumnos pertenecientes a sus clases activas.

No confiar en IDs enviados por frontend: validar ownership/scope en backend.

---

## FASE 7 — Dashboard y reportes

Primero consolidar datos operativos; luego estadísticas.

### Dashboard

Debe responder preguntas concretas del día/mes:

- cuántos alumnos activos;
- nuevas altas del mes;
- clases de hoy;
- ocupación;
- ingresos cobrados del mes;
- monto pendiente;
- cuotas vencidas;
- próximos vencimientos;
- últimas acciones importantes.

### Reportes V1

- alumnos activos/inactivos;
- alumnos por disciplina;
- alumnos por segmento;
- ocupación por clase;
- ingresos por período;
- deuda por período;
- cuotas pagadas/pendientes/vencidas;
- carga por profesor.

### Exportaciones

- Excel: ExcelJS.
- PDF: PDFKit o React PDF, elegir una sola estrategia y documentarla.

Los reportes deben aceptar período y sede cuando aplique.

---

## FASE 8 — Auditoría

Crear un servicio central, por ejemplo:

```text
modules/audit/audit.service.ts
```

API conceptual:

```ts
audit({
  organizationId,
  actorUserId,
  action,
  entityType,
  entityId,
  metadata
});
```

Integrarlo en servicios/casos de uso, no dispersar escrituras ad-hoc desde UI.

Agregar pantalla ADMIN de auditoría sólo si aporta valor inmediato; primero garantizar que los eventos se registren.

---

## FASE 9 — Profesor real

La vista actual define la dirección UX, pero el producto del profesor debe conectarse a datos reales.

### Inicio

- próxima clase;
- clases de hoy;
- cantidad real de alumnos;
- avisos.

### Clases

El profesor ve exclusivamente sus clases.

### Alumnos

El profesor ve exclusivamente alumnos inscriptos en sus clases.

### Comunicaciones/promociones

Sólo a su universo permitido.

### Perfil

- datos;
- disciplinas;
- contraseña;
- preferencias permitidas.

Nunca exponer finanzas globales ni funciones ADMIN.

---

## FASE 10 — Hardening y producción

### Seguridad

- [ ] revisar cookies `secure`, `sameSite` y dominios de web/API;
- [ ] revisar CORS;
- [ ] rotar credenciales que hayan sido compartidas fuera del gestor de secretos;
- [ ] password reset seguro;
- [ ] rate limit específico auth;
- [ ] sanitizar errores de MongoDB;
- [ ] verificar isolation por `organizationId`;
- [ ] verificar autorización por recurso;
- [ ] no exponer secretos en logs.

### Datos

- [ ] índices;
- [ ] backups Atlas;
- [ ] validación de migraciones/seeds;
- [ ] estrategia de soft delete;
- [ ] timezone Argentina;
- [ ] fechas consistentes.

### Deploy

- [ ] Vercel web;
- [ ] hosting API;
- [ ] variables de entorno en cada servicio;
- [ ] `NEXT_PUBLIC_API_URL`;
- [ ] dominio;
- [ ] HTTPS;
- [ ] health check;
- [ ] logs;
- [ ] smoke test productivo.

---

## 8. Trabajo técnico transversal pendiente

### Servicios y arquitectura

Los archivos `admin/*.routes.ts` contienen actualmente bastante lógica de negocio.

A medida que cada módulo madure, extraer a servicios:

```text
modules/students/student.service.ts
modules/professors/professor.service.ts
modules/classes/class.service.ts
modules/enrollments/enrollment.service.ts
modules/payments/payment.service.ts
modules/communications/communication.service.ts
```

Objetivo:

```text
route/controller
  → validate
  → service
  → model
  → audit
```

Evitar que la lógica crítica quede duplicada entre rutas.

### Errores

Definir códigos estables, por ejemplo:

- `STUDENT_NOT_FOUND`
- `PROFESSOR_NOT_FOUND`
- `CLASS_NOT_FOUND`
- `CLASS_CAPACITY_REACHED`
- `PAYMENT_NOT_FOUND`
- `EMAIL_ALREADY_EXISTS`

Frontend debe mapearlos a mensajes en español comprensibles.

### Fechas

- DB en UTC.
- UI presenta zona `America/Argentina/Buenos_Aires`.
- Períodos financieros como string canonical `YYYY-MM`.
- No depender de parsing ambiguo de fechas.

---

## 9. Estrategia de tests

Hoy la suite es insuficiente.

### Pirámide mínima

#### Unitarios

- validadores;
- normalizadores;
- transiciones de pago;
- reglas de cupo;
- helpers de fechas/períodos.

#### Integración API

Usar Supertest con DB de test aislada.

Prioridad:

1. auth;
2. students;
3. professors;
4. classes;
5. enrollments;
6. payments;
7. communications;
8. authorization/scope.

#### UI

Agregar tests de componentes sólo para flujos críticos donde aporten valor. No buscar cobertura artificial.

### Casos obligatorios de seguridad

Para cada recurso scoped:

- otro `organizationId` no puede leer;
- no puede modificar;
- no puede borrar/inactivar;
- PROFESSOR no puede llamar endpoints ADMIN.

---

## 10. Definición de terminado

Una tarea no se marca finalizada hasta cumplir:

- [ ] comportamiento funcional implementado;
- [ ] validación backend;
- [ ] permisos backend;
- [ ] UI conectada a API real;
- [ ] loading;
- [ ] empty;
- [ ] error;
- [ ] responsive;
- [ ] datos persistidos;
- [ ] auditoría si es acción sensible;
- [ ] tests relevantes;
- [ ] `pnpm typecheck` pasa;
- [ ] `pnpm test` pasa;
- [ ] `pnpm build` pasa;
- [ ] documentación actualizada si cambió contrato/modelo.

No marcar una tarea como lista sólo porque "compila".

---

## 11. Protocolo para cualquier IA que continúe

### Antes de tocar código

1. Ejecutar `git status`.
2. Ejecutar `git pull` si se trabaja desde una copia local.
3. Leer este documento.
4. Inspeccionar los archivos reales involucrados.
5. Identificar modelo, API y UI afectados.
6. Confirmar que la tarea pertenece a V1.

### Durante

- Trabajar sobre `main`.
- Hacer cambios coherentes y de alcance controlado.
- No introducir secretos.
- No reemplazar APIs reales por mocks.
- No modificar datos productivos destructivamente.
- No crear servicios externos nuevos si ya existe una decisión tecnológica.
- Mantener Gmail/Nodemailer, MongoDB Atlas y Cloudinary.
- Mantener el modelo preparado para `organizationId` y `branchId`.

### Después

Ejecutar:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Si cambia DB/schema:

- revisar índices;
- indicar si hace falta migración/seed;
- evitar cambios incompatibles silenciosos.

Commit directo a `main` con mensaje claro.

---

## 12. Próxima secuencia recomendada

No saltar directamente a reportes o decoraciones visuales. La secuencia recomendada desde el estado actual es:

```text
0. Entorno real estable + seed
   ↓
1. Shell ADMIN consistente
   ↓
2. Alumnos end-to-end
   ↓
3. Profesores end-to-end
   ↓
4. Clases + horarios + inscripciones
   ↓
5. Pagos + comprobantes + recibos
   ↓
6. Comunicaciones
   ↓
7. Dashboard + reportes + exportaciones
   ↓
8. Auditoría transversal
   ↓
9. Profesor conectado a datos reales
   ↓
10. Hardening + deploy
```

### Primer bloque concreto a implementar ahora

**ADMIN / Alumnos end-to-end**, porque es la entidad central que conecta clases, inscripciones, pagos y comunicaciones.

Entrega esperada:

- detalle de alumno;
- edición;
- clases;
- estado de cuenta;
- contacto;
- activar/desactivar;
- filtros;
- pruebas de API;
- auditoría básica de cambios.

Luego continuar con profesores y clases.

---

## 13. Decisiones comerciales/técnicas ya tomadas

- No fijar un abono mensual de soporte dentro del producto/propuesta inicial.
- La continuidad técnica se conversa luego de la entrega inicial según necesidades reales.
- El proyecto debe poder quedar completamente en manos del cliente.
- No usar Resend.
- Gmail + Nodemailer.
- No Mercado Pago en V1.
- No asistencia en V1.
- No lista de espera en V1.
- No CRM de interesados en V1.
- No portal alumno en V1.
- No apps nativas en V1.
- Profesores usan catálogos predefinidos.
- Profesor: experiencia tipo app, responsive real, no "teléfono dibujado" permanente.
- Administrador: web app responsive, productiva y eficiente.

---

## 14. Riesgos actuales

1. **Poca cobertura automática:** cambios rápidos pueden romper flujos existentes.
2. **Lógica en routes:** aumentará la complejidad si no se extraen services.
3. **Finanzas incompletas:** no asumir que Payment actual cubre recibos/comprobantes/auditoría.
4. **Auditoría no integrada:** riesgo de cambios sensibles sin trazabilidad.
5. **Sesión:** JWT corto sin refresh puede generar fricción; definir estrategia antes de producción.
6. **Infraestructura productiva no cerrada:** hosting API y cookies cross-domain deben probarse temprano.
7. **Credenciales:** cualquier secreto compartido fuera del gestor correspondiente debe rotarse antes de go-live.
8. **Repositorio público:** revisar si la visibilidad pública es intencional antes de producción.

---

## 15. Criterio de éxito de V1

La V1 se considera operativa cuando una administradora puede completar, sin acceder a MongoDB ni editar código, este flujo:

```text
Ingresar
→ configurar catálogos
→ crear profesor
→ crear alumno
→ crear clase
→ asignar profesor
→ inscribir alumno
→ controlar cupo
→ generar cuota
→ registrar pago
→ emitir/consultar comprobante o recibo
→ identificar deuda
→ enviar recordatorio
→ consultar dashboard/reporte
→ exportar información
```

Y un profesor puede:

```text
Ingresar
→ ver sus clases
→ ver sus alumnos
→ consultar su agenda
→ comunicarse únicamente con sus alumnos habilitados
→ administrar su perfil permitido
```

Todo lo anterior debe respetar permisos, scope de organización/sede, responsive design y trazabilidad de acciones sensibles.
