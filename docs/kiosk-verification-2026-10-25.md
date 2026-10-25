# Kiosco: corrección del acceso y verificación integral

Fecha: 25/10/2026. Base: `main` en `2c7dee6`. Reporte: no abre o vuelve al login.

## Falla reproducida en producción

Se enviaron solicitudes anónimas, sin cookies ni datos personales, con cuerpo vacío a `POST https://www.mymacademiadebaile.com.ar/api/check-in/authorize`. No se registraron asistencias, dispositivos, cargos ni envíos reales.

| Origin | Respuesta anterior a la corrección |
|---|---|
| `https://www.mymacademiadebaile.com.ar` | 403 `INVALID_ORIGIN` |
| `https://mymacademiadebaile.com.ar` | 401 `AUTH_REQUIRED`, esperable sin login |
| `https://example.invalid` | 403 `INVALID_ORIGIN`, correcto |

El guard comparaba literalmente el origen con `APP_ORIGIN`. El sitio usa `www` y la configuración operativa publicada usa el apex. La denegación ocurría antes de revisar el login. El frontend trataba también los errores de origen/servidor como una solicitud de login, haciendo que el administrador volviera a la misma pantalla.

La validación anterior sólo comprobó HTTP 200 de la página y E2E con el mismo origen local para ambos componentes. Eso no cubría la divergencia real entre el dominio canónico y la configuración publicada. El hallazgo figuraba en `seo-phase-2-2026-10-23.md`; se corrige aquí sin modificar ni desplegar variables remotas.

## Corrección

- CORS y el guard del kiosco comparten `isTrustedAppOrigin`. Sólo para los dos hosts oficiales HTTPS, se acepta el apex y `www` cuando cualquiera de ellos está configurado. Se conserva el protocolo/puerto y el origen exacto para desarrollo y otros entornos. No se confía en Host ni X-Forwarded-Host, no se usan comodines ni se aceptan otros subdominios.
- La sesión administrativa sigue siendo suficiente para abrir el kiosco. QR, scopes, transacciones y beneficio de prueba no cambian.
- Se acepta ADMIN y SUPER_ADMIN, igual que el panel. El login sin destino explícito lleva ambos roles a administración; el kiosco verifica además cuenta activa y organización/sede.
- Sólo 401 o una cuenta sin rol administrativo muestran login. Los errores de servidor/conexión/origen muestran un estado recuperable, con reintento y acceso a recepción. No se crea una nueva autorización si el servicio de estado está caído.
- Las consultas de apertura tienen límite de 15 segundos; la cancelación alcanza también al refresh del login. La cámara se detiene al perder el acceso.

## Cobertura

Validación final después de alinear ADMIN/SUPER_ADMIN: **459 tests aprobados en 46 archivos**, más **13 tests web**, **8 E2E Chromium**, typecheck completo y builds API/web aprobados. No se cambiaron los límites de tiempo de los tests. Antes de este ajuste de roles también pasó la suite completa de 458 tests y los siete E2E de navegador; la validación final agrega el login SUPER_ADMIN.

| Recorrido | Evidencia automatizada |
|---|---|
| Origen real de producción | API con `APP_ORIGIN` apex, Origin `www`, JWT admin, autorización, escaneo, presente persistido y cargo único; repetición desde apex devuelve advertencia. |
| Orígenes ajenos | Rechazo de dominio externo, sufijos engañosos, otros subdominios, HTTP, puertos y URLs que no son un Origin válido. |
| Login | Entrada desde formulario real; renovación de cookie de acceso vencida sin pedir login otra vez; rol y cuenta activa; sedes. |
| Fallos de apertura | 403 de origen y 503 del servicio producen estado de error recuperable, sin falso logout ni nueva autorización; reintento abre el kiosco. |
| Cámara/QR/audio | QR real decodificado desde video de canvas, presente/cargo por API, tonos de éxito/advertencia/error, duplicado, silenciado y limpieza; permiso denegado ofrece ayuda y no envía escaneos. |
| Privacidad | Sin montos públicos, limpieza temporizada, ocultar y volver durante una respuesta demorada sin restaurar datos personales. |
| Identidad/pruebas/cortesías | Suite completa existente: concurrencia, una prueba por persona/grupo consumida por PRESENT, cortesías independientes, conversión/reactivación y migración aditiva. |
| Finanzas y emails | Suite completa existente: cargos atómicos e idempotentes por canal, modalidades/cobertura, saldos vigentes, preferencias, frecuencia, reserva de envío y reintentos seguros. SMTP mock/local, sin emails reales. |

## Límites de la comprobación

Las pruebas de escritura usan exclusivamente replica sets efímeros. No se ejecutaron migraciones remotas, cambios de variables ni despliegues manuales. El acceso al proyecto correcto no está disponible mediante la conexión Vercel de esta sesión; el estado del despliegue automático se consulta mediante el check Vercel del commit en GitHub y mediante HTTP público.

La cámara/altavoz físicos y un login administrativo real en producción requieren el navegador/dispositivo del operador: no hay un navegador conectado en esta sesión. Las pruebas automatizadas no demuestran calidad óptica ni entrega real de correo.

## Evidencia posterior a la publicación del arreglo principal

Commit `cb8e1cc`, publicado directamente en `origin/main`. El check Vercel de GitHub pasó a `success` y se repitieron las solicitudes anónimas contra el dominio real:

| Origin | HTTP publicado después de la corrección | Access-Control-Allow-Origin |
|---|---|---|
| `https://www.mymacademiadebaile.com.ar` | 401 `AUTH_REQUIRED`, esperable sin sesión | `https://www.mymacademiadebaile.com.ar` |
| `https://mymacademiadebaile.com.ar` | 401 `AUTH_REQUIRED`, esperable sin sesión | `https://mymacademiadebaile.com.ar` |
| `https://example.invalid` | 403 `INVALID_ORIGIN` | No emitido |

Esto comprueba que el bloqueo de dominio fue eliminado en producción y que la restricción de orígenes ajenos permanece. La autorización con login y la escritura completa se prueban sobre la base efímera, sin usar cuentas ni generar asistencias/cargos reales de la academia.
