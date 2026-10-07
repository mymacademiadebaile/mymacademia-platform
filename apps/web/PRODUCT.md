# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Profesores de M&M Academia de Baile que necesitan preparar y llevar adelante sus clases, consultar a sus alumnos y resolver lo inmediato de su jornada.
- Administración de la academia, que opera catálogos, clases, cobros, comunicaciones, reportes y auditoría con permisos separados.

## Product Purpose

M&M Academia Platform organiza la operación de la academia de baile: clases, horarios, alumnos, inscripciones, asistencia operativa y pagos. Para el profesor, el éxito es poder saber qué clase sigue, quién asiste y qué requiere atención sin navegar un backoffice.

## Positioning

Un mismo sistema ofrece dos experiencias según el rol: una consola administrativa para la operación global y un portal de enseñanza, acotado a los alumnos y clases asignados al profesor.

## Operating Context

Los profesores usan el portal antes, durante y entre clases desde teléfono, tablet o computadora. Su rutina prioriza la próxima clase, la agenda, las listas de alumnos y los avisos contextuales. La administración usa una experiencia web de mayor densidad para gestionar el funcionamiento integral de la academia.

## Capabilities and Constraints

- Roles y permisos separados para ADMIN, SUPER_ADMIN y PROFESSOR.
- El profesor gestiona solamente alumnos ya vinculados a sus clases autorizadas; las consultas e inscripciones iniciales se centralizan en la academia.
- El portal de profesor incluye inicio, calendario, clases, alumnos y perfil; mensajes y promociones son acciones contextuales.
- El producto es responsive y debe resultar natural con mouse, teclado y controles táctiles. Las acciones táctiles deben tener áreas amplias y los estados deben expresarse con lenguaje natural.
- La administración conserva una navegación lateral y flujos operativos de mayor densidad. El portal de profesor debe evitar parecer un CRM o backoffice.

## Brand Commitments

M&M Academia de Baile. La experiencia del profesor debe sentirse cercana, clara y orientada a enseñar, diferenciada del panel administrativo sin perder la identidad de la academia.

## Evidence on Hand

- Alcance y reglas de operación: `docs/functional-scope.md`.
- Criterios de experiencia del profesor: `docs/professor-ux.md`.
- Logotipo institucional: `public/mym-academia-logo.png`.
- Implementación actual del portal: `src/app/professor` y `src/components/professor`.

## Product Principles

1. La jornada y la próxima acción orientan al profesor antes que los datos agregados.
2. Cada rol recibe una interfaz acorde a su trabajo y alcance real.
3. La información operativa se vuelve accionable con lenguaje claro y pasos cortos.
4. El diseño se adapta al dispositivo sin reducir la experiencia de escritorio a una maqueta de teléfono.

## Accessibility & Inclusion

Los flujos deben poder usarse con teclado, mouse y tacto. Los estados no deben depender exclusivamente del color y los controles deben conservar etiquetas accesibles.
