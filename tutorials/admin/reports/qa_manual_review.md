## Revisión visual manual

Cada capítulo se revisó con hojas de contacto (`automation/qa_sheet.py`), que muestran un fotograma por frase narrada junto con su texto. En cada fotograma se comprobó:

- que la acción narrada ya estuviera en pantalla o empezara en ese momento;
- que los campos completados fueran legibles;
- que el cursor y los clics fueran visibles;
- que los subtítulos quedaran en la banda inferior sin tapar la interfaz;
- que no aparecieran consola, herramientas de desarrollo, contraseñas visibles ni datos reales.

Correcciones aplicadas después de la revisión:

| Capítulo | Problema detectado | Corrección |
|---|---|---|
| 10 · Presentismo | La pantalla de bienvenida de la tablet dura 7 segundos y la narración la describía cuando ya había vuelto al inicio. | El clic y la descripción se unieron en una sola frase corta. Capítulo regrabado. |
| 9 · Contactos | La locución afirmaba que se detecta cualquier teléfono repetido. La verificación por API mostró que no detecta alumnos con teléfono formateado. | La frase se ajustó a lo verificado. Capítulo regrabado. |
| 13 · Día típico y 14 · Funciones adicionales | Hubo tramos de 8 y 23 segundos sin narración mientras se completaban formularios. | Los tramos se dividieron en pasos narrados. Capítulos regrabados. |
| 5 · Promociones | La lista de inscriptos no se refresca después del 2x1, por un comportamiento de la plataforma. | Se explica en la locución y se recarga la página en pantalla. |

Silencio remanente aceptado: en el capítulo 14, en el minuto 04:08, hay 8,5 segundos sin voz. Corresponden a la selección visible de profesor, disciplina, público y nivel (doce clics con cursor y anillos), así que no es tiempo muerto.

Datos sensibles: el formulario de ingreso viene precargado con el email real de la academia y se vació antes de empezar a grabar. Las contraseñas se ven siempre enmascaradas. Todos los nombres, teléfonos (221 555-01xx) y emails (@example.com) son ficticios.
