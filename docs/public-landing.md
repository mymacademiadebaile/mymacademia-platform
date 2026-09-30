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
│  │  ├─ clases/[slug]/page.tsx /clases/bachata-sensual-la-plata …
│  │  ├─ profesores/page.tsx    /profesores           (noindex mientras sean mock)
│  │  ├─ profesores/[slug]/…    /profesores/lucia-ferreyra …
│  │  ├─ horarios/page.tsx      /horarios
│  │  └─ contacto/page.tsx      /contacto
│  ├─ robots.ts                 /robots.txt
│  └─ sitemap.ts                /sitemap.xml
├─ components/public/           componentes de la landing (CSS Modules)
└─ lib/public-site/
   ├─ types.ts                  contratos públicos (DanceStyle, PublicProfessor, PublicClass, PublicSchedule, Branch…)
   ├─ site.ts                   datos confirmados: nombre, WhatsApp, URL del sitio, navegación
   ├─ mock-data.ts              CONTENIDO TEMPORAL (único lugar con mocks)
   ├─ queries.ts                capa de datos: fetchPublicDanceStyles(), fetchPublicProfessors()…
   ├─ schedule-utils.ts         lógica pura de horarios y próximas clases (con tests)
   ├─ json-ld.ts                builders de Schema.org
   ├─ maps.ts                   URLs de Google Maps (embed, búsqueda, cómo llegar)
   └─ analytics.ts              nombres de eventos + trackPublicEvent()
```

Reglas:

- Los componentes reciben datos por props. Ningún componente importa `mock-data.ts`: solo `queries.ts` lo hace.
- Todo es server component por defecto. Solo tres componentes son client: `PublicHeader` (estado del scroll y menú mobile), `WeeklySchedule` (filtros) y `AnalyticsListener` (un único listener delegado).
- Los tokens de diseño están en `components/public/site.module.css`, con scope en `.site`, así el tema claro del admin no cambia.
- La home, `/horarios` y las páginas de detalle usan `revalidate = 600`, porque "Próximas clases" depende de la hora.

### Componentes

| Componente | Archivo | Notas |
| --- | --- | --- |
| `PublicHeader` | `public-header.tsx` | transparente → sólido al hacer scroll; menú mobile a pantalla completa con links numerados; Esc cierra y devuelve el foco |
| `Hero` | `hero.tsx` | H1 único, cuenta 5-6-7-8, ubicación, texto vertical, ticker de estilos |
| `Manifesto` | `manifesto.tsx` | tipografía gigante con deriva por scroll, franja de foto, bloque "Qué es M&M Academia" (GEO) |
| `DanceStyles` / `DanceStyleCard` | `dance-styles.tsx` | paneles que se expanden en desktop y carrusel swipeable en mobile; soporta N estilos |
| `ProfessorShowcase` | `professor-showcase.tsx` | grilla editorial escalonada en desktop y carrusel en mobile; tag "Perfil de ejemplo" si `isPlaceholder` |
| `ScheduleSection` / `UpcomingClasses` | `schedule-section.tsx` | sección blanca con próximas clases y CTA |
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

## Qué es temporal (mock)

Todo lo temporal está en `lib/public-site/mock-data.ts`.

| Dato | Estado | Efecto en SEO |
| --- | --- | --- |
| Nombres de estilos (Bachata Sensual, Bachata Zouk, Estilo Femenino) | **real** | — |
| Taglines, descripciones y niveles de los estilos | borrador (`isPlaceholderCopy: true`) | se indexan; revisar el copy |
| Profesores (Lucía Ferreyra, Tomás Acuña, Carla Benítez) | **ficticios** (`isPlaceholder: true`) | `noindex`, fuera del sitemap, sin `Person` JSON-LD, tag visible "Perfil de ejemplo" |
| Horario semanal | **ficticio** (`isPlaceholder: true`) | tag visible "Horario de ejemplo"; sin `Event`/`Course` JSON-LD |
| FAQ con `isPlaceholder` | a confirmar | tag "Respuesta a confirmar" y fuera del `FAQPage` JSON-LD |
| Fotos | stock libre de Unsplash | ver abajo |
| Dirección, WhatsApp | **reales** | — |

No se publican: código postal, coordenadas, horarios de apertura, Instagram, precios, testimonios ni estadísticas.

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

1. Guardá las fotos definitivas en `apps/web/public/landing/` (fuera de `mock/`), en JPG o WebP de 1600–2400 px del lado largo.
2. Actualizá `src`, `width`, `height`, `alt` y `focus` (el `object-position` que mantiene al sujeto en el recorte) en `mockImages` o en el `image`/`avatar` de cada entidad, y sacá `isPlaceholder`.
3. Ningún layout depende de una foto concreta: los recortes usan `object-fit: cover` con `focus`. El collage del salón acepta cualquier trío `[vertical, horizontal, detalle]`.
4. Borrá `public/landing/mock/` cuando no quede ninguna referencia.

## Conectar el backend

Contratos públicos de solo lectura, pensados para `apps/api` (**no implementados todavía**):

| Endpoint | Fuente interna | Devuelve |
| --- | --- | --- |
| `GET /public/styles` | `CatalogItem` (`type: DISCIPLINE`, `isActive`) + campos editoriales nuevos (slug, tagline, descripción, imagen) | `DanceStyle[]` |
| `GET /public/professors` | `Professor` (`isActive`) | `PublicProfessor[]` con **solo** `displayName`, `bio`, `avatarUrl`, `introVideoUrl`, `instagram` y disciplinas |
| `GET /public/schedule` | `DanceClass` (`status` activo) → `schedules[]`, nombres de profesores y niveles ya resueltos | `ScheduleEntry[]` |
| `GET /public/sessions/upcoming` | `ClassSession` futuras no canceladas | `UpcomingClass[]` |

Privacidad: estos endpoints proyectan campos explícitos, nunca devuelven el documento completo. Nunca exponen `User`, emails, teléfonos de profesores, `phone`, alumnos, pagos, inscripciones, precios, capacidad ni `billingMode`. Deben quedar fuera de los middlewares de auth del admin, con rate limit y filtrados por `organizationId`.

Pasos:

1. Implementar el endpoint en `apps/api` con un DTO que respete el tipo de `lib/public-site/types.ts`.
2. Reemplazar el cuerpo de la función correspondiente en `queries.ts`. Por ejemplo:

   ```ts
   export async function fetchPublicDanceStyles(): Promise<DanceStyle[]> {
     const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/public/styles`, { next: { revalidate: 600 } });
     if (!res.ok) throw new Error("public styles unavailable");
     return res.json();
   }
   ```

3. Cuando los profesores y horarios sean reales, poner `isPlaceholder: false`. Eso habilita solo el indexado, el sitemap y el `Person` JSON-LD.
4. Borrar lo que ya no se use de `mock-data.ts`.

Ningún componente cambia.

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
