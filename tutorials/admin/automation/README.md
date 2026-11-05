# Automatización del videotutorial de administración

Scripts para regenerar los videos cuando cambie la plataforma. Todo corre contra un **entorno local aislado**: nunca contra la base de producción.

## Requisitos (Windows, Git Bash)

- Node + pnpm (el monorepo ya instalado), Python 3.12+, FFmpeg/ffprobe en el `PATH`.
- MongoDB Database Tools (`mongodump`, `mongorestore`) en `C:/Program Files/MongoDB/Tools/100/bin`.
- Un binario `mongod` 8.x (se usa el de la caché de `mongodb-memory-server`: `~/.cache/mongodb-binaries/mongod-x64-win32-8.2.6.exe`).
- Conexión a internet para la voz (Microsoft Edge TTS, `es-AR-ElenaNeural`). Solo se envía el texto del guion.

## Preparación (una vez)

```bash
cd tutorials/admin
python -m venv .local/venv
.local/venv/Scripts/python -m pip install edge-tts aiosmtpd playwright==1.61.0 pillow pymongo
```

Crear `tutorials/admin/.local/api.env` (no se versiona) con:

```dotenv
NODE_ENV=development
PORT=4100
APP_ORIGIN=http://localhost:3100
MONGODB_URI=mongodb://127.0.0.1:27118/mymacademia_tutorial?replicaSet=rs0
JWT_ACCESS_SECRET=<64 caracteres aleatorios>
PUBLIC_ORGANIZATION_SLUG=mym-academia
RATE_LIMIT_MAX=5000
AUTH_RATE_LIMIT_MAX=500
SMTP_HOST=127.0.0.1
SMTP_PORT=2525
SMTP_SECURE=false
SMTP_USER=admin.tutorial@example.com
SMTP_PASSWORD=local-sink
MAIL_FROM_NAME=M&M Academia (Tutorial)
ADMIN_EMAIL=admin.tutorial@example.com
ADMIN_PASSWORD=<contraseña de al menos 10 caracteres>
```

La API carga este archivo mediante `DOTENV_CONFIG_PATH`, así que el `.env` del proyecto no se toca. Sin variables de Cloudinary, las subidas de imágenes quedan deshabilitadas. El correo va a `automation/smtp_sink.py`, que lo guarda en `.local/mail/` y no lo entrega a nadie.

## Levantar el entorno

```bash
bash tutorials/admin/automation/start_env.sh            # agregar --rebuild si cambió el frontend
```

Levanta MongoDB (replica set `rs0`, puerto 27118), el SMTP falso (2525), la API (4100) y la web compilada (3100, `distDir` `apps/web/.next/tutorial`). Primera vez, con la base vacía:

```bash
cd apps/api && DOTENV_CONFIG_PATH=../../tutorials/admin/.local/api.env pnpm seed:initial && cd -
cd tutorials/admin
.local/venv/Scripts/python -c "import sys; sys.path.insert(0,'automation'); import produce; produce.snapshot('seed_only')"
.local/venv/Scripts/python automation/seed_baseline.py
.local/venv/Scripts/python -c "import sys; sys.path.insert(0,'automation'); import produce; produce.snapshot('baseline')"
```

`seed_baseline.py` crea una academia ficticia que ya está operando: pista, 2 profesores, 3 clases con historial de una semana, 12 alumnos, inscripciones, asistencias, cobros y 2 contactos. Todo queda etiquetado con `TUTORIAL_ADMIN_2026` o con emails `@example.com`.

## Producir

```bash
cd tutorials/admin
.local/venv/Scripts/python automation/produce.py all                # graba y renderiza los 14 capítulos en orden
.local/venv/Scripts/python automation/produce.py 06_enrollments     # un capítulo (restaura el snapshot del anterior)
.local/venv/Scripts/python automation/produce.py 06_enrollments --render-only   # re-render sin regrabar
.local/venv/Scripts/python automation/assemble.py                   # video completo + índice + SRT combinado
.local/venv/Scripts/python automation/build_reports.py              # cobertura y QA
.local/venv/Scripts/python automation/verify_rules.py               # reglas verificadas por API
.local/venv/Scripts/python automation/qa_sheet.py 06_enrollments    # hojas de contacto para revisión visual
```

Antes de grabar un capítulo, la base se restaura desde el snapshot que dejó el capítulo anterior (`.local/snapshots/after_<id>`), así cada capítulo se puede regrabar solo, con los datos que espera.

Los capítulos que usan "hoy" (clase del día, tablet, prueba gratuita) dependen del día de la semana: el guion está pensado para un miércoles, día en que hay clases de Salsa, Bachata y Dancehall. Si se graba otro día, revisá `chapters/ch06`, `ch08`, `ch09` y `ch12`.

## Estructura

| Archivo | Función |
|---|---|
| `studio/recorder.py` | Navegador (Playwright, Chromium headless nuevo) + captura CDP con marcas de tiempo, cursor visible, clics resaltados, desplazamientos suaves, zoom, etiquetas y narración sincronizada (`with rec.say(...)`). |
| `studio/cursor_overlay.js` | Cursor y anillo de clic dibujados sobre la página sin interceptar eventos. |
| `studio/tts.py` | Locución es-AR (Edge TTS) con caché y marcas por palabra. |
| `studio/render.py` | Frames → MP4 1080p30 con banda de subtítulos, zoom suave, fundidos, mezcla de voz normalizada a −16 LUFS, SRT/ASS y subtítulos integrados. |
| `studio/cards.py` | Portadas, resúmenes e índice (HTML → PNG). |
| `chapters/chNN_*.py` | Guion y acciones de cada capítulo (`META` con objetivos, introducción y resumen; `run(rec)` con la demostración). |
| `produce.py` | Orquestador: snapshots, grabación, render, guion con tiempos. |
| `assemble.py` | Video completo con portada, índice visual y marcadores de capítulo. |
| `cleanup_tutorial_data.py` | Borra todo lo creado por el tutorial (en seco por defecto). |
| `seed_baseline.py`, `api_client.py`, `tutorial_env.py` | Datos de base y utilidades. |
| `smtp_sink.py`, `start_env.sh` | Entorno aislado. |

## Limpieza

```bash
.local/venv/Scripts/python automation/cleanup_tutorial_data.py           # muestra qué se borraría
.local/venv/Scripts/python automation/cleanup_tutorial_data.py --apply   # borra solo lo creado por el tutorial
.local/venv/Scripts/python automation/cleanup_tutorial_data.py --drop-database --apply   # elimina la base de capacitación completa
```

Solo opera sobre `127.0.0.1:27118/…tutorial…`; rechaza cualquier otra base.
