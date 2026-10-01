# UX Administración

El panel de administración prioriza velocidad operativa y lectura visual, evitando un backoffice denso.

## Módulos

- Inicio / dashboard
- Profesores
- Alumnos
- Clases y horarios
- Pagos y cuotas
- Catálogos maestros
- Comunicaciones
- Reportes
- Configuración

## Principios

- Desktop: sidebar persistente, contenido amplio y tarjetas de lectura rápida.
- Tablet/móvil: menú lateral deslizable y tablas con scroll horizontal cuando corresponde.
- Alta frecuencia: altas, búsquedas, pagos, recordatorios y exportaciones disponibles a pocos clics.
- Catálogos: administración central para impedir strings libres en clases.
- Finanzas: prioridad visual para deuda vencida y cobros.
- Profesor: mantiene una experiencia distinta, mobile-first tipo aplicación.

## Reportes

Los reportes no usan una única cifra de "ingresos". Cada consulta acepta un rango de fechas y, opcionalmente, una sede, y separa tres lecturas:

- **Actividad:** turnos que fueron creados en `Clase del día` y asistencias que efectivamente se cargaron. Un turno sin asistencia no se interpreta como ausencia.
- **Facturación:** cargos vinculados a la fecha de una clase para `PER_CLASS` y al mes calendario para `MONTHLY`. Expone su estado vigente (pagado, pendiente, vencido o anulado).
- **Caja:** sólo pagos `PAID` cuya `paidAt` cae dentro del rango. Así, una mensualidad de septiembre cobrada en octubre pertenece a la facturación de septiembre y a la caja de octubre.

La pantalla muestra el desglose por modalidad y por clase. La ocupación que aparece junto a cada clase es intencionalmente **actual**, no una reconstrucción histórica: el modelo de inscripciones mantiene el estado vigente. Las exportaciones Excel conservan el mismo criterio en hojas separadas de resumen, facturación/caja y actividad por clase.
