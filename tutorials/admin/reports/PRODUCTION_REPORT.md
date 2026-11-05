# Informe de producción — Videotutorial de administración

## 1. Resultado

| Entregable | Ubicación |
|---|---|
| A. Video completo con portada, índice visual y marcadores de capítulo | `tutorials/admin/videos/complete_admin_tutorial.mp4` |
| B. 14 videos independientes | `tutorials/admin/videos/00_introduction.mp4` … `13_additional_features.mp4` |
| C. Subtítulos integrados en cada MP4 + archivos SRT (y ASS) | `tutorials/admin/subtitles/` |
| D. Guiones de locución con tiempos reales | `tutorials/admin/scripts/` |
| E. Inventario de funcionalidades | `docs/tutorials/ADMIN_FUNCTIONAL_INVENTORY.md` |
| F. Scripts de automatización y generación | `tutorials/admin/automation/` (ver su `README.md`) |
| G. Validación audiovisual y funcional | `reports/VIDEO_QA_REPORT.md`, `reports/FUNCTIONAL_COVERAGE.md`, `reports/RULES_VERIFICATION.md` |
| H. Funcionalidades no demostradas y su causa | Sección 6 de este informe |
| Grabaciones en bruto (pantalla sin edición, línea de tiempo y fotogramas) | `tutorials/admin/recordings/<capítulo>/` (no versionado) |

## 2. Entorno utilizado

- **Aislado de producción.** El `.env` de la API apunta a un cluster de MongoDB Atlas. No se usó: se levantó un MongoDB 8.2 local en replica set (`127.0.0.1:27118`, base `mymacademia_tutorial`) y la API recibió su configuración mediante `DOTENV_CONFIG_PATH=tutorials/admin/.local/api.env`, sin modificar ningún archivo del proyecto.
- **Sin efectos externos.** El SMTP apunta a un servidor local que captura los correos en `.local/mail/` (recibos, recordatorios, campañas y recuperación de contraseña) y no los entrega a nadie. Cloudinary no está configurado, así que no se subió ningún archivo. Los enlaces de WhatsApp se respondieron localmente.
- **Puertos propios** (API 4100, web 3100). La web se compiló en producción en un `distDir` separado (`apps/web/.next/tutorial`), lo que da cargas rápidas y sin indicadores de desarrollo.
- **Sin cambios en la lógica de negocio.** No se modificó código de `apps/` ni `packages/`. Tampoco se hicieron commits, push ni deploys.
- **Datos ficticios:** academia de base (`seed_baseline.py`) más los registros creados en cámara. Todos usan emails `@example.com`, teléfonos `221 555-01xx` y la etiqueta `TUTORIAL_ADMIN_2026` en notas y biografías. Para dar historial a la academia de base, sus reglas de horario se retrocedieron 35 días directamente en la base de capacitación, porque la API no permite horarios retroactivos.

## 3. Pipeline audiovisual

1. **Guion como código.** Cada capítulo (`automation/chapters/chNN_*.py`) combina la narración con las acciones reales. La narración es `with rec.say("…"):` y las acciones que contiene empiezan cuando empieza la frase. El bloque espera a que la frase termine, así la voz nunca se adelanta a la pantalla.
2. **Verificación en cada paso.** Las operaciones esperan su aviso real de éxito o el dato esperado (`rec.toast`, `rec.expect_text`, cambio de URL). Si algo falla, la grabación se detiene y el capítulo no se publica.
3. **Captura.** Chromium (Playwright 1.61, modo headless nuevo) con un viewport de 1600×800 a escala 1,2, capturado mediante el screencast de DevTools en JPEG de calidad 93 con marca de tiempo por fotograma. El resultado es una imagen de 1920×960 nítida, sin herramientas de desarrollo visibles.
4. **Cursor y clics.** Un overlay visual dibuja el puntero, que se desplaza con movimientos suaves, un anillo en cada clic y un recuadro de resaltado opcional. No intercepta eventos ni modifica la interfaz.
5. **Voz.** Microsoft Edge TTS, voz femenina `es-AR-ElenaNeural` al −3 % de velocidad, con marcas por palabra. El audio se mezcla en las posiciones exactas de cada frase y se normaliza a −16 LUFS.
6. **Montaje.** Por capítulo: portada con objetivos, grabación y cierre con síntesis. La grabación se pasa a 30 FPS constantes con fundidos suaves, zoom suave en operaciones clave, etiquetas discretas del paso y una banda inferior de 120 px. Las esperas técnicas (síntesis de voz) se recortan automáticamente.
7. **Subtítulos.** Se generan a partir de las marcas por palabra de la voz, en segmentos de hasta dos líneas. Se queman en la banda inferior, que no tapa la interfaz, y se exportan como SRT y ASS.
8. **Video completo.** Portada del curso, índice visual con el minuto de inicio de cada capítulo y los 14 capítulos, unidos sin recodificar. Incluye marcadores de capítulo y un SRT combinado.
9. **Snapshots de base de datos** entre capítulos (`mongodump`/`mongorestore`). Sirven para regrabar cualquier capítulo con los datos exactos que espera.

## 4. Escenario de ejemplo (conectado de punta a punta)

Configuración → pista **Salón B** y ritmo **Dancehall** → profesora **Carla Romero** → clase **Dancehall Inicial** (miércoles 21 h y sábado 11 h, por clase $7.500 o mensual $25.000/$44.000, clase de prueba) → promoción **2x1 Dancehall de noviembre** (pareja Sofía Medina / Tomás Aguirre) y **Semana de la salsa** (15 %) → alumna **Valentina Ríos** (mensual en Dancehall, por clase en Salsa, clase suelta en Bachata) → cobros, recibos y anulación → contacto **Julieta Paz** (prueba gratuita, conversión, inscripción) → asistencia, recepción y tablet por DNI → cambios de calendario (suplencia, reprogramación, cancelación, clase extra, cambio recurrente) → reportes → día típico con **Martina Sosa** → funciones adicionales.

## 5. Hallazgos de la plataforma registrados durante la producción

Los 14 hallazgos están listados en `docs/tutorials/ADMIN_FUNCTIONAL_INVENTORY.md` §15. Los números 12 a 14 aparecieron durante la ejecución:

- **2x1**: la lista de inscriptos no se refresca después de inscribir la pareja. El video lo explica y recarga la página.
- **Duplicados de teléfono**: no se detecta el teléfono de un alumno guardado con formato. Por eso la locución del capítulo 9 se ajustó para afirmar solo lo verificado: el DNI de otra persona o el teléfono de otro contacto.
- **Fecha en UTC**: el historial muestra la fecha del día siguiente para las clases nocturnas.

Ninguno se corrigió en el código: la consigna era no modificar la plataforma.

## 6. Funcionalidades que no pudieron demostrarse (H)

| Funcionalidad | Causa |
|---|---|
| Subir fotos de la landing, imagen de portada de ritmos, foto y video de profesores, comprobantes de transferencia | Dependen de Cloudinary. En el entorno de capacitación no hay credenciales, y usar las reales subiría archivos a la cuenta de la academia. |
| Registro de asistencia con QR en la tablet | Requiere cámara física. Se demostró el registro por DNI y la generación de la credencial QR. |
| Restablecer contraseña desde el enlace del correo | El enlace llega por email: se mostró la solicitud y el correo quedó capturado localmente. |
| Cambiar la propia contraseña | Cierra la sesión usada para grabar: se mostró y explicó el formulario. |
| Envío real de emails y WhatsApp | Por seguridad, los correos se capturan localmente y WhatsApp no se abre. Las operaciones se ejecutaron y quedaron registradas en el historial. |
| Arrastrar y soltar en el calendario | Existe, pero no se grabó. Se explicó y se demostró "Reprogramar", que produce el mismo resultado. |
| Exportación de pagos, devoluciones, ajustes, saldo a favor, reportes en PDF, contactos generados, conversiones, rendimiento por profesor, estados de seguimiento de contactos | No existen en la interfaz actual. No se presentan como existentes. |

## 7. Limpieza de datos

`automation/cleanup_tutorial_data.py` identifica todo lo creado por el tutorial con un corte temporal sobre los ObjectId. Así se borran juntos padres e hijos (cargos, cobros, asistencias, sesiones, auditoría). Antes de borrar, el script verifica las etiquetas y restaura la configuración previa desde el snapshot `seed_only`. Por defecto corre en seco. Solo opera sobre la base local de capacitación. **La limpieza no se ejecutó**: así se pueden regrabar escenas sin volver a sembrar. Se ejecuta con `--apply` cuando se den por aprobados los videos.

## 8. Cómo actualizar los videos

Ver `tutorials/admin/automation/README.md`. Si la interfaz cambia un texto o un botón, se ajusta el capítulo correspondiente y se ejecuta `produce.py <capítulo>`, después `assemble.py` y `build_reports.py`.
