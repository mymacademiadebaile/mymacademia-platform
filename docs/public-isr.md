# Caché de la web pública

Las páginas del grupo `(public)` y `/sitemap.xml` usan ISR con `revalidate = 300` segundos. Las páginas de clases y profesores generan en el build los slugs publicados mediante `generateStaticParams`; los nuevos slugs pueden generarse cuando se visitan por primera vez. Las rutas de admin, profesor, check-in, asistencia y autenticación no pertenecen al grupo público.

El build consulta los endpoints públicos de `https://www.mymacademiadebaile.com.ar/api`. Si la API no responde o el catálogo no contiene estilos publicados, el build falla. No se genera un catálogo vacío. La variable opcional `PUBLIC_BUILD_API_URL` permite elegir otra URL base que termine en `/api` para pruebas locales; no afecta la URL utilizada en runtime. En Vercel no hace falta configurarla mientras el dominio oficial siga siendo el origen público correcto. El runtime continúa usando `API_INTERNAL_URL` cuando existe y, si no, `NEXT_PUBLIC_API_URL` o el fallback local.

Los errores del catálogo, enlaces sociales o imágenes se propagan. Durante una regeneración fallida, ISR conserva la última respuesta correcta. En un despliegue nuevo no existe una versión anterior: por eso el build falla antes de publicar si no puede obtener datos válidos. Un slug publicado después del build que todavía no tenga página cacheada también depende de que la API responda en su primera visita.

## Etapa posterior: invalidación al publicar

La revalidación temporal es el único mecanismo implementado ahora. Para reflejar una publicación inmediatamente, agregar más adelante un endpoint autenticado en la web con un secreto compartido con la API. Después de confirmar una mutación pública en catálogos, profesores, clases o imágenes/configuración, la API debe llamar a ese endpoint. Debe invalidar el tag `public-site`, las páginas afectadas y `/sitemap.xml`. El fallo del aviso no debe convertir una escritura administrativa ya confirmada en un error aparente; registrar el fallo y dejar la revalidación temporal como respaldo. Esta etapa requiere acordar la URL del endpoint y una variable secreta en ambos servicios. No se agregaron ahora endpoints ni variables de revalidación.
