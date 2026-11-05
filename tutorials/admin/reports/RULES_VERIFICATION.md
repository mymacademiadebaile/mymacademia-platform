# Verificación de reglas en ejecución

Fecha: 2026-11-04 14:30 · Base: snapshot `after_13_additional_features` (entorno local de capacitación).

Reglas que la locución menciona y que se comprobaron contra la API real, sin mostrarlas en video:

| Regla | Resultado | Respuesta del sistema |
|---|---|---|
| Alta de alumno con DNI repetido es rechazada | ✅ Verificada | `HTTP 409: {"error":"DNI_ALREADY_EXISTS","message":"Ese DNI ya pertenece a otra persona. Buscala y reutilizá su ficha."}` |
| Alta de contacto con el teléfono de otro contacto (cargado desde Contactos) es rechazada | ✅ Verificada | `HTTP 409: {"error":"CONTACT_MATCH_REQUIRES_REVIEW","message":"Ya hay una persona con esos datos. Buscala y reutilizá su contacto"}` |
| Alta de contacto con el teléfono de un alumno cargado desde Alumnos (con espacios y guion) es rechazada | ❌ No se comportó como se esperaba | `No error: the operation was accepted` |
| Alta de alumno con email de un contacto existente es rechazada | ✅ Verificada | `HTTP 409: {"error":"CONTACT_MATCH_REQUIRES_REVIEW","message":"Ya existe un contacto con ese email; reutilizá su identidad desde Contactos"}` |
| No se puede eliminar una clase con historial | ✅ Verificada | `HTTP 409: {"error":"CLASS_HAS_HISTORY","message":"No se puede eliminar la clase porque tiene historial asociado: 7 inscripciones, 11 cargos, 3 sesiones anteriores, 16 registros de alumnos en` |
| No se puede eliminar un profesor con clases vinculadas | ✅ Verificada | `HTTP 409: {"error":"PROFESSOR_IN_USE","message":"No se puede eliminar el profesor porque está vinculado a 2 clase(s). Reasigná esas clases o inactivá el profesor."}` |
| No se puede bajar el cupo por debajo de los inscriptos | ✅ Verificada | `HTTP 409: {"error":"CAPACITY_BELOW_ENROLLMENTS","message":"El cupo no puede ser menor a los 7 alumnos inscriptos en un mismo horario"}` |
| No se pueden superponer dos promociones iguales en la misma clase | ✅ Verificada | `HTTP 409: {"error":"PROMOTION_OVERLAP","message":"Ya hay una promoción activa de esa clase y modalidad en esas fechas"}` |
