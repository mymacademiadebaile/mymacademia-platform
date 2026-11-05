# Informe de control de calidad audiovisual

Capítulos analizados: 14 · Duración total de los capítulos: 73:57 (mm:ss).

Comprobaciones automáticas por archivo (ffprobe/ffmpeg) y sobre los subtítulos:

| Cap. | Archivo | Duración | Resolución | FPS | Video | Audio | Sonoridad (LUFS) | Silencios > 7 s | Negros > 1,2 s | Subtítulos | Líneas > 56 car. | > 2 líneas | > 21 car/s | Solapes subt. | Solapes voz |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 01 | `00_introduction.mp4` | 04:48 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.1 | 0 | 0 | 66 | 0 | 0 | 0 | 0 | 0 |
| 02 | `01_configuration.mp4` | 07:56 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.1 | 0 | 0 | 115 | 0 | 0 | 0 | 0 | 0 |
| 03 | `02_teachers.mp4` | 04:47 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.1 | 0 | 0 | 64 | 0 | 0 | 0 | 0 | 0 |
| 04 | `03_classes.mp4` | 05:57 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.3 | 0 | 0 | 87 | 0 | 0 | 0 | 0 | 0 |
| 05 | `04_promotions.mp4` | 05:46 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.2 | 0 | 0 | 86 | 0 | 0 | 0 | 0 | 0 |
| 06 | `05_students.mp4` | 04:46 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.2 | 0 | 0 | 66 | 0 | 0 | 0 | 0 | 0 |
| 07 | `06_enrollments.mp4` | 06:00 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.2 | 0 | 0 | 93 | 0 | 0 | 0 | 0 | 0 |
| 08 | `07_payments.mp4` | 05:56 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.1 | 0 | 0 | 84 | 0 | 0 | 0 | 0 | 0 |
| 09 | `08_contacts.mp4` | 04:32 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.2 | 0 | 0 | 66 | 0 | 0 | 0 | 0 | 0 |
| 10 | `09_attendance.mp4` | 05:14 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.1 | 0 | 0 | 78 | 0 | 0 | 0 | 0 | 0 |
| 11 | `10_schedule.mp4` | 05:09 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.2 | 0 | 0 | 77 | 0 | 0 | 0 | 0 | 0 |
| 12 | `11_reports.mp4` | 03:24 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.1 | 0 | 0 | 48 | 0 | 0 | 0 | 0 | 0 |
| 13 | `12_daily_workflow.mp4` | 03:13 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.2 | 0 | 0 | 45 | 0 | 0 | 0 | 0 | 0 |
| 14 | `13_additional_features.mp4` | 06:22 | 1920x1080 | 30/1 | h264 | aac 2ch | -16.1 | 1 | 0 | 89 | 0 | 0 | 0 | 0 | 0 |

## Criterios

- Resolución 1920×1080, 16:9, 30 FPS, H.264 + AAC estéreo 48 kHz.
- Sonoridad objetivo −16 LUFS (normalización de voz).
- Silencios de más de 7 segundos y tramos negros de más de 1,2 segundos se reportan como posibles tiempos muertos o cortes (las transiciones de portada duran 0,45 s).
- Subtítulos: máximo dos líneas, hasta 56 caracteres por línea y 21 caracteres por segundo; sin solapamientos.
- Solapes de voz: una frase no debe empezar antes de que termine la anterior.

## Incidencias registradas durante la grabación

- Ninguna: todas las operaciones grabadas finalizaron con el resultado esperado.

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

