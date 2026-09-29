# Alcance funcional V1

## Incluido

- Autenticación y permisos ADMIN / PROFESSOR.
- Organización y futura multi-sede.
- Catálogos maestros:
  - disciplina/estilo;
  - público/segmento;
  - nivel.
- Profesores.
- Alumnos.
- Clases y horarios.
- Vista de clases por tarjetas y calendario semanal.
- Precio/cuota mensual configurable por clase.
- Clase gratuita de prueba configurable por clase, con agenda, estado y conversión a inscripción regular.
- Una o varias categorías predefinidas por clase.
- Cupos e inscripciones.
- Gestión de pagos, vencimientos, deuda y comprobantes, vinculados al alumno y a la clase.
- Recordatorios de deuda por email y WhatsApp con mensaje precargado.
- Recordatorios de clase.
- Promociones del profesor a sus propios alumnos/clientes.
- Dashboard y reportes.
- Exportación Excel/PDF.
- Auditoría.

## Fuera de V1

- Asistencia digital.
- Lista de espera.
- Mercado Pago.
- CRM de interesados.
- Portal del alumno.
- App nativa.
- Liquidación automática a profesores.

## Regla de catálogos

Los profesores no escriben categorías libres al crear una clase. Seleccionan opciones administradas por la academia para evitar inconsistencias de datos.


## Reglas comerciales confirmadas

- Las consultas de personas interesadas y la inscripción inicial se centralizan en un contacto designado por la academia.
- No se deriva un lead público directamente al WhatsApp personal de un profesor.
- Los profesores gestionan únicamente alumnos ya vinculados a sus clases dentro del alcance autorizado.
- La mayoría de las disciplinas no tiene un límite etario rígido; las excepciones se modelan con Público/Segmento (por ejemplo, una clase infantil).
- Las clases pueden habilitar una prueba gratuita. La administración puede agendarla para un alumno, marcarla como realizada/cancelada y convertirla en inscripción regular.
- El teléfono/WhatsApp público de consultas debe ser configurable desde ADMIN y no quedar hardcodeado en frontend.

## Modelo de cobro actualizado (29/09/2026)

La clase define una modalidad de cobro:
- Por clase.
- Mensual.
- Por clase o mensual.
- Sin cargo.

La modalidad predeterminada para nuevas clases es **por clase**, ya que refleja la operatoria habitual de la academia.

Cuando una clase admite ambas modalidades, cada inscripción guarda la preferencia actual del alumno (`PER_CLASS` o `MONTHLY`) y puede modificarse posteriormente sin alterar pagos históricos.

El módulo de pagos debe priorizar el cobro rápido: alumno -> clase -> fecha/período -> importe sugerido -> medio de pago -> registrar. También permite generar un pago pendiente para seguimiento posterior.
