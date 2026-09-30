# Landing pública

Sitio público de M&M Academia de Baile: home en `/` y páginas SEO para clases, profesores, horarios y contacto. Vive separado de los shells privados (`/admin`, `/professor`) y no comparte layout, tokens ni datos con ellos.

## Concepto visual: "Cuenta de ocho"

Una frase de baile se cuenta en ocho tiempos. La home tiene ocho secciones numeradas `01 … 08` y el hero arranca con la cuenta de entrada "5 · 6 · 7 · 8". El scroll funciona como una frase coreográfica:

| Cuenta | Sección | Rol | Fondo |
| --- | --- | --- | --- |
| 01 | Hero | Impacto | `--background` + foto |
| 02 | Manifiesto | Identidad | `--background-2` |
| 03 | Estilos | Descubrimiento | `--background` |
| 04 | Profesores | Personas | `--background-3` |
| 05 | Horarios | Información | `--paper` (corte blanco) |
| 06 | El salón | Espacio | `--background-2` |
| 07 | Ubicación | Mapa | `--background` |
| — | Preguntas frecuentes | GEO / SEO | `--background-2` |
| 08 | ¿Bailamos? | Acción → WhatsApp | foto + seam "BAILAR" hacia el footer |

Tipografía (máximo dos familias, `next/font`):

- **Big Shoulders** (variable, `opsz` + `wght`): display condensada.
- **Archivo** (variable, `wdth` + `wght`): texto. Al 72 % de ancho funciona como la voz "técnica" en labels, botones y metadatos.

## Arquitectura

```text
apps/web/src
├─ app
│  ├─ (public)/                 route group: layout propio, no afecta URLs
│  │  ├─ layout.tsx             fuentes, header, footer, WhatsApp flotante, JSON-LD de la organización
│  │  ├─ page.tsx               home  /
│  │  ├─ opengraph-image.tsx    imagen OG 1200×630 generada en build
│  │  ├─ clases/page.tsx        /clases
│  │  ├─ clases/[slug]/page.tsx /clases/<slug-del-ritmo>-la-plata
│  │  ├─ profesores/page.tsx    /profesores           (noindex si no hay profesores publicados)
│  │  ├─ profesores/[slug]/…    /profesores/lucia-ferreyra …
│  │  ├─ horarios/page.tsx      /horarios
│  │  └─ contacto/page.tsx      /contacto
│  ├─ robots.ts                 /robots.txt
│  └─ sitemap.ts                /sitemap.xml
├─ components/public/           componentes de la landing (CSS Modules)
└─ lib/public-site/
   ├─ types.ts                  contratos públicos (DanceStyle, PublicProfessor, PublicClass, PublicSchedule, Branch…)
   ├─ site.ts                   datos confirmados: nombre, WhatsApp, URL del sitio, navegación
   ├─ api-source.ts             cliente de la API pública + mapeo a los tipos de la web
   ├─ mock-data.ts              contenido ficticio (solo con PUBLIC_DATA_SOURCE=mock) y fotos de marca
   ├─ faq.ts                    preguntas frecuentes y descripciones derivadas de los ritmos reales
   ├─ queries.ts                capa de datos: fetchPublicDanceStyles(), fetchPublicProfessors()…
   ├─ schedule-utils.ts         lógica pura de horarios y próximas clases (con tests)
   ├─ json-ld.ts                builders de Schema.org
   ├─ maps.ts                   URLs de Google Maps (embed, búsqueda, cómo llegar)
   └─ analytics.ts              nombres de eventos + trackPublicEvent()
```

Reglas:

- Los componentes reciben datos por props. Ningún componente importa `mock-data.ts` ni `api-source.ts`: solo `queries.ts` los usa.
- Todo es server component por defecto. Solo tres componentes son client: `PublicHeader` (estado del scroll y menú mobile), `WeeklySchedule` (filtros) y `AnalyticsListener` (un único listener delegado).
- Los tokens de diseño están en `components/public/site.module.css`, con scope en `.site`, así el tema claro del admin no cambia.
- Las páginas públicas se renderizan bajo demanda porque dependen del catálogo publicado y de la hora ("Próximas clases"). Ver "Comportamiento ante fallas".

### Componentes

| Componente | Archivo | Notas |
| --- | --- | --- |
| `PublicHeader` | `public-header.tsx` | transparente → sólido al hacer scroll; menú mobile a pantalla completa con links numerados; Esc cierra y devuelve el foco |
| `Hero` | `hero.tsx` | H1 único, cuenta 5-6-7-8, ubicación, texto vertical, ticker de estilos |
| `Manifesto` | `manifesto.tsx` | tipografía gigante con deriva por scroll, franja de foto, bloque "Qué es M&M Academia" (GEO) |
| `DanceStyles` / `DanceStyleCard` | `dance-styles.tsx` | paneles que se expanden en desktop y carrusel swipeable en mobile; soporta N estilos |
| `ProfessorShowcase` | `professor-showcase.tsx` | grilla editorial escalonada en desktop y carrusel en mobile; tag "Perfil de ejemplo" si `isPlaceholder` |
| `ScheduleSection` / `UpcomingClasses` | `schedule-section.tsx` | sección blanca con próximas clases y CTA |
| `ClassesSection` | `classes-section.tsx` | clases de un ritmo o de un profesor, agrupadas por clase con profesor, nivel, días y horas |
| `WeeklySchedule` | `weekly-schedule.tsx` | grilla semanal en desktop, agenda por día en mobile, filtros por estilo y nivel |
| `AcademySpace` | `academy-space.tsx` | collage de 3 fotos con la palabra "LA PLATA" cruzándolo |
| `LocationSection` | `location-section.tsx` | dirección tipográfica y mapa oscurecido con tinte violeta y marcas de corte |
| `FaqSection` | `faq-section.tsx` | `<details>` nativos, sin JS |
| `FinalCta`, `WhatsAppFloat` | `whatsapp-cta.tsx` | cierre ¿Bailamos? y CTA persistente discreto |
| `PublicFooter` | `public-footer.tsx` | logo, dirección, links; "Acceso equipo" lleva a `/login` |
| `SectionHeading`, `PageIntro`, `DetailHero` | — | encabezados reutilizables |

### Motion

Solo CSS, sin librería de animación:

- Reveals y derivas con **scroll-driven animations** (`animation-timeline: view()`) dentro de `@supports`. En navegadores sin soporte, el contenido se muestra estático.
- Todo lo animado respeta `prefers-reduced-motion: reduce`, que apaga derivas, tickers y entradas.
- Solo se animan `transform`, `opacity` y `clip-path`. Nada bloquea la interacción.

## Qué viene del backoffice y qué sigue siendo estático

La landing lee el **catálogo publicado** desde la API pública (ver "Datos reales desde el backoffice"). Lo único que no sale del backoffice todavía:

| Dato | Estado |
| --- | --- |
| Ritmos, profesores, clases, horarios, niveles | **reales**, del backoffice (solo lo publicado) |
| Fotos de ritmos y profesores | las sube el admin a Cloudinary |
| Fotos del hero, manifiesto, salón y cierre | estáticas en `public/landing/mock/` (Unsplash, temporales). Son imágenes de marca, no salen del backoffice |
| FAQ | texto en `lib/public-site/faq.ts`. Las respuestas con `isPlaceholder` no están confirmadas, se ven con el tag "Respuesta a confirmar" y quedan fuera del `FAQPage` JSON-LD |
| Dirección y WhatsApp | reales, en `lib/public-site/site.ts` |
| Instagram de la academia, código postal, coordenadas, horarios de apertura | no publicados hasta confirmarlos |

`PUBLIC_DATA_SOURCE=mock` (en `apps/web`) fuerza el contenido ficticio de `mock-data.ts` para trabajar sin backend: 3 ritmos, 3 profesores y un horario de ejemplo, marcados como "de ejemplo" y con `noindex`.

## Imágenes

Las temporales están en `apps/web/public/landing/mock/`. Son fotos libres de Unsplash, descargadas con un ancho máximo de 1400–2400 px. `next/image` las sirve en AVIF/WebP con `sizes` responsive.

| Archivo | Uso | Autor (Unsplash) |
| --- | --- | --- |
| `hero-couple-smoke.jpg` | hero, OG | Graham Mansfield |
| `manifesto-motion-blur.jpg` | franja del manifiesto | Ahmad Odeh |
| `style-bachata-sensual.jpg` | estilo 01 | HamZa NOUASRIA |
| `style-bachata-zouk.jpg` | estilo 02 | Nihal Demirci |
| `style-estilo-femenino.jpg` | estilo 03 | a verificar (`photo-1638317875669-719f70b4c27c`) |
| `professor-01.jpg` … `professor-03.jpg` | profesores mock | Marcin Sajur, Karsten Winegeart, Alexander Jawfox |
| `space-studio-barre.jpg`, `space-group-overhead.jpg`, `space-class-mirror.jpg` | el salón | Andrey K, Ardian Lumi, Danielle Cerullo |
| `space-social-floor.jpg` | reserva | Preillumination SeTh |
| `cta-purple-light.jpg` | cierre | a verificar (`photo-1604277598647-eadc8645952c`) |

### Cómo reemplazar imágenes

- **Ritmos y profesores:** se cargan desde el admin (Ficha web del ritmo y foto del profesor). No requieren cambios de código. Para los ritmos conviene una imagen vertical 4:5 de al menos 1000 px de ancho; el recorte usa `object-fit: cover`.
- **Fotos de marca (hero, manifiesto, salón, cierre):** guardá las definitivas en `apps/web/public/landing/` (fuera de `mock/`), en JPG o WebP de 1600–2400 px del lado largo, y actualizá `src`, `alt` y `focus` (el `object-position` que mantiene al sujeto en el recorte) en `mockImages` de `mock-data.ts`, sacando `isPlaceholder`. El collage del salón acepta cualquier trío `[vertical, horizontal, detalle]`.
- Borrá `public/landing/mock/` cuando no quede ninguna referencia.

## Datos reales desde el backoffice

```text
Admin (catálogos, profesores, clases)
        │  PATCH /admin/...   (campos web + check "Publicar en la web")
        ▼
MongoDB ──► apps/api  GET /api/public/catalog | /styles | /professors | /schedule
                         │  proyección con lista blanca (public-projection.ts), caché 60 s
                         ▼
apps/web  lib/public-site/api-source.ts  (fetch server-side, caché de datos 60 s)
                         ▼
               queries.ts ──► páginas y componentes (iguales con mock o con API)
```

Un cambio del admin se ve en la web en ~1–2 minutos (60 s de caché en la API + 60 s en Next).

### Qué carga el admin

| Dónde | Qué | Regla de visibilidad |
| --- | --- | --- |
| Configuración → Ritmos → **Ficha web** | imagen de portada, descripción corta (160), descripción larga (2000, párrafos separados por línea en blanco), URL (slug), **Publicar en la web** | ritmo **activo + publicado**, con imagen y descripción corta |
| Profesores → detalle | foto, **descripción corta para la web** (160), **biografía completa** (2000), Instagram, video de presentación, **Publicar en la web** | profesor **activo + publicado**, con foto y descripción corta |
| Clases → detalle | **Mostrar en la web** (por defecto activo) | clase **activa + no oculta** y de un ritmo publicado |

Reglas de relación:

- El ritmo es la entrada principal: `/clases` lista los ritmos publicados y `/clases/<slug>-la-plata` muestra su descripción, sus niveles, sus profesores y **sus clases con días y horarios** (una tarjeta por clase: profesor, nivel, días y horas).
- Un profesor aparece en un ritmo si da una clase de ese ritmo o lo tiene asignado entre sus disciplinas. Su página `/profesores/<slug>` muestra la biografía completa, el video y sus clases.
- Solo se nombran profesores publicados: en una clase con un profesor sin publicar, ese nombre no aparece.
- Una clase de varios ritmos figura en cada uno. En el horario general se muestra con el primero (orden del catálogo).
- Si se desactiva un ritmo, un profesor o una clase, o se quita la foto o la imagen, desaparece de la web. Quitar la imagen de un ritmo además lo despublica.
- El slug se genera al publicar por primera vez (`bachata-zouk-souk`) y queda fijo; se puede editar, pero rompe los links compartidos. La URL pública es `/clases/<slug>-la-plata`.
- "Próximas clases" se calcula del horario semanal en hora de Buenos Aires. Las sesiones (`ClassSession`) se crean bajo demanda, así que todavía no reflejan feriados ni clases canceladas.

### API pública (solo lectura, sin autenticación)

| Endpoint | Devuelve |
| --- | --- |
| `GET /api/public/catalog` | `{ styles, professors, schedule }` (lo consume la web) |
| `GET /api/public/styles` | ritmos: slug, nombre, descripción corta y larga, imagen, niveles, profesores |
| `GET /api/public/professors` | nombre, `bioShort`, `bio` (párrafos), foto, Instagram (URL), video (https), disciplinas |
| `GET /api/public/schedule` | una fila por día y horario: clase, ritmo, profesores publicados, niveles |

Privacidad: cada consulta elige campos explícitos y la respuesta se arma con una lista blanca en `apps/api/src/modules/public/public-projection.ts`. Nunca salen `User`, email, teléfono, `userId`, `organizationId`, precios, capacidad, facturación, alumnos, pagos ni inscripciones. Hay tests que lo verifican (`public-projection.test.ts` y `public.routes.test.ts`). El video y las fotos solo se aceptan por https, y el Instagram se normaliza a una URL de instagram.com o se descarta. Las respuestas llevan `Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.

La organización se elige con `PUBLIC_ORGANIZATION_SLUG` (por defecto `mym-academia`).

### Variables de entorno

| Variable | App | Para qué |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | web | URL de la API (ya existía) |
| `NEXT_PUBLIC_SITE_URL` | web | origen canónico del sitio |
| `PUBLIC_DATA_SOURCE` | web | `api` (por defecto) o `mock` |
| `PUBLIC_ORGANIZATION_SLUG` | api | organización que se publica |
| `CLOUDINARY_*` | api | fotos de ritmos y profesores (ya existían) |

### Comportamiento ante fallas

- Si la API no responde, el sitio sigue sirviendo: las secciones sin datos se ocultan, el horario muestra un mensaje y el siguiente pedido reintenta (los errores no se cachean).
- Las páginas públicas se renderizan **bajo demanda** (`force-dynamic`) y solo la respuesta de la API se cachea. Así el build no depende del backend. El costo es más TTFB que una página estática; si hace falta, se puede pasar a ISR con `revalidate` una vez que el build corra con la API disponible.
- Las fotos remotas solo se aceptan desde `res.cloudinary.com` (`images.remotePatterns` en `next.config.ts`).
- Las subidas de imagen tienen tope de 4 MB por el límite de 4,5 MB del cuerpo de las funciones serverless de Vercel.

## SEO

- **Metadata** (`layout.tsx` y cada página): title con template `%s | M&M Academia de Baile`, description con intención local, canonical, Open Graph (`es_AR`), Twitter `summary_large_image`, robots y `formatDetection` desactivado.
- **URL del sitio**: `NEXT_PUBLIC_SITE_URL` (ver `.env.example`). Por defecto vale `http://localhost:3000`, y **hay que configurarla en producción** porque canonical, sitemap, OG y JSON-LD dependen de ella.
- **robots.txt**: permite `/` y bloquea `/admin`, `/professor`, `/login`, `/forgot-password` y `/reset-password`.
- **sitemap.xml**: home, `/clases`, cada `/clases/[seoSlug]`, `/horarios` y `/contacto`. Los profesores entran solo cuando son reales.
- **HTML semántico**: un solo `h1` por página, jerarquía h2 → h3, `header`/`nav`/`main`/`section`/`article`/`footer`/`address`, migas de pan con `aria-current`.
- **Páginas por estilo** (`/clases/*-la-plata`): H1 "Clases de {estilo} en La Plata", descripción, niveles, profesores, horarios filtrados, FAQ, CTA con mensaje de WhatsApp prellenado y links a los otros estilos. Se generan con `generateStaticParams` a partir de los datos (`dynamicParams = false`), así no se crean páginas vacías.
- **GEO**: el bloque "Qué es M&M Academia" y la FAQ responden de forma directa qué es, dónde está, qué clases hay, quién enseña, cómo anotarse y cómo llegar. Las entidades (nombre, dirección, teléfono) son idénticas en todo el sitio.

## Datos estructurados (JSON-LD)

Se sirven como un documento `@graph` por página y se escapan para no romper el `<script>`.

| Nodo | Dónde | Notas |
| --- | --- | --- |
| `EducationalOrganization` + `LocalBusiness` | todas las páginas públicas | nombre, url, logo, teléfono, `PostalAddress` (calle, localidad, región, país), `hasMap`, `areaServed`, `knowsAbout`, `contactPoint`. `geo`, `postalCode` y `sameAs` se agregan solos cuando se cargan en `Branch` / `SITE` |
| `WebSite` | todas | publisher = organización |
| `FAQPage` | home, `/contacto`, páginas de estilo | solo preguntas visibles **y** confirmadas. Google limita hoy los rich results de FAQ a sitios de salud y gobierno; el marcado sigue siendo válido y útil para motores generativos |
| `BreadcrumbList` | páginas internas | — |
| `Person` | `/profesores/[slug]` | solo si `isPlaceholder: false` |

No se usan `Course`/`Event` hasta tener horarios reales. Cuando existan, `Course` con `hasCourseInstance` (`courseMode: "onsite"`, `courseSchedule`) encaja con cada estilo.

## Mapa

Embed de Google Maps sin API key (`maps.ts`). Se busca "Calle 3 164, La Plata, Buenos Aires, Argentina", porque con "entre 35 y 36" Google ubicaba mal el punto. **Falta verificar el pin en el lugar.** Cuando exista el perfil de Google Business, conviene pasar a un embed por Place ID. El filtro CSS oscurece el mapa y un overlay `mix-blend-mode: color` lo tiñe de violeta sin bloquear la interacción.

## WhatsApp

`whatsappHref(message)` en `site.ts` arma `https://wa.me/5492215968108?text=…` con `encodeURIComponent`. Mensajes:

- general: "Hola, vi la web de M&M Academia y quisiera consultar por las clases."
- cierre: "…quiero probar una clase."
- por estilo o profesor: incluye el nombre.

## Analytics (preparado, sin proveedor)

Eventos en `lib/public-site/analytics.ts`:

| Evento | Disparo |
| --- | --- |
| `whatsapp_click` | cualquier CTA de WhatsApp (`label`: header, hero, floating, schedule, final-cta, style-*, professor-*…) |
| `view_style` | click en "Ver clase" |
| `view_professor` | click en "Conocer a …" |
| `schedule_view` | la sección de horarios entra en viewport (una vez) |
| `directions_click` | "Cómo llegar" |

El markup declara `data-track` / `data-track-view`. `AnalyticsListener` hace `window.dataLayer.push(...)` si existe y emite `mym:analytics` en `window`. Para conectar GA4 o GTM alcanza con cargar el snippet: el `dataLayer` ya recibe los eventos.

## Performance

Medido con el build de producción en local:

- Home: 3,6 kB propios, 114 kB de First Load JS (102 kB compartidos con el resto de la app).
- Desktop: LCP ≈ 0,6 s (foto del hero), CLS ≈ 0,01.
- Mobile con CPU 4× y red lenta: LCP ≈ 1,1 s, CLS 0.
- Solo el hero y el logo usan `priority`; el resto de las imágenes carga lazy. El iframe del mapa usa `loading="lazy"`.
- Big Shoulders no tiene métricas de fallback en `next/font`, así que se usa `adjustFontFallback: false` con Impact / Arial Narrow como fallback condensado. Next no genera el preload de las fuentes dentro del route group; hoy no afecta las métricas medidas, pero conviene revisarlo al actualizar Next.

## Tests

`pnpm --filter @mym/web test` corre `node --test` sobre `src/**/*.test.ts`, con type stripping nativo de Node 24. Cubre la resolución del horario y el cálculo de próximas clases en la zona horaria `America/Argentina/Buenos_Aires`.
