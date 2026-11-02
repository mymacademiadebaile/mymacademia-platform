# Análisis de promociones y precios para alumnos

Estado: propuesta funcional y técnica; no implementada. Noviembre de 2026.

## Objetivo

Permitir que administración ofrezca promociones por clase y período sin obligarla a
recordar importes especiales en cada cobro. El alumno debe seguir apareciendo en su
clase, con su asistencia y su estado de cuenta correctos. La pantalla de cobro debe
mostrar el importe final y su explicación antes de confirmar.

## Situación actual comprobada en el código

- `DanceClass` define precio por clase y precios mensuales general, de 4 y de 8 clases
  (`apps/api/src/modules/classes/class.model.ts`). `Enrollment` guarda el plan elegido
  y admite un precio individual en pesos por mes o por clase (`.../enrollments/enrollment.model.ts`).
- `planMonthlyCharge` y `ensureClassCharge` calculan cargos a partir de esos precios.
  El primer mes admite importe completo, proporcional o personalizado
  (`.../billing/charge-service.ts`). El cargo conserva importe base, ajustes, cobros
  y saldo (`.../billing/charge.model.ts`). Su `listCents` puede ser ya el precio
  individual, por lo que no siempre representa el precio público del grupo.
- Hay descuentos manuales en pesos sobre un cargo existente, con motivo y registro de
  auditoría. También se puede descontar al cobrar mediante la API. Ninguno de esos
  mecanismos define una promoción que se repita durante un intervalo
  (`.../billing/collection-service.ts`, `.../admin/billing.routes.ts`).
- El panel de cuenta permite ajustar un cargo manualmente. La pantalla de detalle de
  clase permite escribir el importe a cobrar, pero lo usa como importe del cargo nuevo:
  no aplica `priceCents`, el precio individual, el plan mensual ni la regla del primer
  mes al crear ese cargo (`apps/web/src/components/admin/live/class-detail-charge.ts`,
  `apps/api/src/modules/admin/billing.routes.ts`, ruta `/classes/:id/collect`).
- Persisten entradas de pagos del modelo anterior (`.../admin/payments.routes.ts`) que
  crean pagos con importes libres y luego los reflejan en cargos nuevos. Una regla
  comercial que solo se agregue al generador mensual quedaría eludida por esas rutas.
- La cobertura de las sesiones se decide por cargo de **cada alumno**, no por pareja.
  Un cargo de saldo cero se considera cubierto, pero hoy aparecería como «Pagado»;
  habría que distinguir visualmente «Bonificado» de dinero recibido
  (`.../billing/coverage-service.ts`, `.../billing/balance-service.ts`).
- Los recibos documentan el dinero efectivamente recibido. No muestran actualmente
  precio original ni promoción; una bonificación del 100 % no debe producir un recibo
  de dinero inexistente (`.../payments/receipt-pdf.ts`).

## Alternativas

| Alternativa | Ventaja | Límite | Uso recomendado |
| --- | --- | --- | --- |
| Cambiar a mano el importe al cobrar | Ya existe en una pantalla | Pierde la causa, se olvida en el siguiente período y mezcla precio con pago | Solo corregir casos excepcionales mientras se implementa la solución |
| Precio individual en la inscripción | Se aplica a futuros cargos del alumno | No tiene vigencia ni una campaña asociada; no resuelve la pareja 2x1 | Acuerdos particulares estables |
| Descuento manual sobre un cargo | Deja motivo y precio original | Hay que repetirlo por alumno y cuota | Excepciones aisladas o correcciones |
| Promoción con vigencia y beneficiarios | Se calcula sola, se puede previsualizar y auditar | Requiere un modelo pequeño de reglas y cubrir todas las entradas de cobro | Solución propuesta |

## Solución propuesta

Crear **promociones administradas** con cuatro formas de beneficio:

1. **Porcentaje**: por ejemplo, 20 % menos sobre la cuota o clase aplicable.
2. **Descuento fijo**: por ejemplo, $ 3.000 menos; nunca deja un saldo negativo.
3. **Precio final**: por ejemplo, cuota de $ 25.000; el sistema calcula la diferencia
   respecto del precio base. Un precio final promocional no aumenta el cargo.
4. **2x1 para nuevos inscriptos**: administración elige dos personas que se
   incorporan al grupo, quién asume el precio y quién recibe la bonificación. La
   campaña puede admitir inscripciones durante una clase del día, una semana, un
   mes o cualquier rango de fechas. El beneficio otorgado a la pareja también
   puede durar una clase, una semana, un mes o un rango definido. No se infiere
   una pareja por compartir apellido, profesor o asistencia.

Cada promoción tendría nombre visible, clase o clases, modalidad de aplicación,
estado y alcance: todos los alumnos elegibles o alumnos elegidos. En el 2x1 hay
**dos tiempos distintos**: hasta cuándo pueden inscribirse para obtenerlo y hasta
cuándo dura el beneficio que recibieron. **Administración define ambos al crear cada
promoción**; pueden coincidir o ser distintos.
«Una clase», «Una semana» y «Un mes» son atajos de interfaz; «Una clase» guarda
además la sesión concreta para que otra sesión de ese día no reciba el beneficio
por accidente. También se permite elegir fechas personalizadas.
Para el 2x1 se guarda además la pareja y sus roles. La elección por profesor o ritmo
podría añadirse luego; el grupo concreto da una regla comprensible y evita que
cambios de profesor alteren promociones en curso.

La promoción modifica **lo que se debe**, nunca **lo que entró en caja**. La fórmula
de un cargo es:

`precio del grupo y plan → condición individual → primer mes proporcional o personalizado → promoción → saldo → cobro`

Por defecto, la condición individual explícita tiene prioridad y no acumula una
promoción automática. Se admite una sola promoción automática por cargo. El descuento
manual posterior queda como una corrección separada y auditada. Si dos promociones
alcanzan el mismo cargo, la previsualización lo marca como conflicto para que
administración elija una; no se escoge por orden accidental de la base de datos.

### Cómo debe funcionar el 2x1

- **Momento de aplicación:** crear la campaña solo la deja disponible. Al inscribir
  a la pareja dentro de la ventana de inscripción, administración selecciona esa
  promoción, indica quién paga y quién recibe la bonificación, revisa el precio y
  confirma. En esa confirmación queda concedido el beneficio a las dos personas.
  El descuento monetario se registra cuando se genera cada cargo cubierto por las
  fechas de beneficio, aunque esa fecha sea posterior a la inscripción. Cobrar no
  es el momento de decidir si corresponde la promoción: el cargo ya debe mostrar
  su importe neto.
- Ejemplo: la campaña acepta inscripciones del 9 al 15 de noviembre y concede 2x1
  durante diciembre. Una pareja que se inscribe el 10 de noviembre queda vinculada
  ese día. Sus cargos de noviembre no reciben ese 2x1 (conservan la política de
  precio del primer mes); al generar las cuotas o clases de diciembre, aparece la
  bonificación del beneficiario. La
  pareja conserva ese derecho durante diciembre aunque uno se dé de baja después.
- La promoción se ofrece a **nuevas inscripciones en ese grupo**. Al activar la
  pareja se comprueba que son dos alumnos distintos de la organización, que ambas
  incorporaciones califican dentro de la ventana de inscripción y que pertenecen
  al grupo. Se guardan sus inscripciones, identidades, roles y fechas. «Nuevo» se
  interpreta por ahora como nuevo en el grupo; queda por confirmar si una
  reinscripción debe contar.
- El 2x1 es una condición comercial concedida a esas dos personas **hasta el fin
  de la promoción**. La baja, ausencia o cambio posterior de uno de ellos no
  acorta la vigencia ni quita el
  beneficio al otro y no cambia cargos ya emitidos. Solo una corrección explícita de
  administración puede anular o modificar la concesión.
- Si ambos siguen cursando, ocupan dos lugares y registran dos asistencias. Si uno
  deja de cursar, no se le generan cargos nuevos por clases que ya no toma, pero la
  asignación 2x1 sigue vigente. Si vuelve durante el intervalo, vuelve a aplicar;
  tampoco se sustituye automáticamente por otra persona.
- Para cobro por clase, el beneficio corresponde a cada sesión cuya fecha cae dentro
  del intervalo, o únicamente a la sesión elegida en «Una clase». Cada alumno que
  participa tiene su cargo; el del beneficiario recibe la bonificación completa.
  La identidad de una sesión reprogramada debe mantenerse para no duplicar el
  beneficio. La sesión debe mostrar los cargos y el estado bonificado antes de
  ofrecer la acción de cobro.
- Para una promoción que cubre la mensualidad completa, se genera el cargo de cada
  alumno que sigue inscripto para el mes. El del titular conserva su importe y el
  del beneficiario queda bonificado al 100 %, sin atribuirle dinero recibido ni
  generar un recibo de caja.
- Una semana en la que se pueden inscribir no significa necesariamente una semana
  de cuota bonificada. La duración del descuento se fija al conceder la promoción.
  Si realmente cubre solo parte de una mensualidad, el cálculo de esa parte debe
  definirse y mostrarse antes de emitir el cargo; no corresponde asumir que toda
  inscripción hecha esa semana paga una mensualidad parcialmente bonificada.
- Que el titular todavía deba dinero no crea una deuda para el beneficiario. Si el
  negocio quiere condicionar el acceso del segundo al pago efectivo del primero,
  eso exige otra regla de cobertura y debe decidirse expresamente.
- Si se da de baja el titular durante la promoción, el beneficiario conserva el
  descuento hasta el vencimiento pactado. Si se da de baja el beneficiario, el
  titular sigue debiendo su precio habitual; la pareja no se reasigna sola.

### Modelo y puntos de integración

Agregar una entidad `Promotion` con alcance, ventana de inscripción, regla de
duración del beneficio, sesión opcional, tipo, valor y estado; y una asignación
`PromotionPair` para los dos alumnos del 2x1. La asignación guarda el inicio y fin
del beneficio concedido, la fecha de asignación, quién paga y quién recibe el
beneficio, junto con los identificadores de ambas inscripciones,
independientemente de su estado posterior. Guardar en cada aplicación un
identificador de promoción, versión o copia de sus términos, importe bonificado,
beneficiario y, si corresponde, pareja. Esto permite explicar cargos antiguos aunque
la campaña se cierre o se edite. Una clave única por promoción y cargo evita aplicar
el mismo beneficio dos veces.

Conservar `Charge.listCents` como precio efectivo antes de la política del primer mes
y `Charge.amountCents` como importe base después de esa política. Si se quiere mostrar
también el precio público del grupo, agregarlo a la copia de la cotización: hoy
`listCents` puede contener un precio individual. Registrar la promoción como ajuste
negativo trazable, enlazado a `FinancialAdjustment`; `balanceCents` y `status` deben
quedar correctos en la **misma transacción** que crea el cargo. El generador mensual
actual usa `insertMany`, por lo que habrá que adaptar ese tramo para crear cargo y
aplicación de forma atómica e idempotente. Un beneficio del 100 % deja un cargo de
saldo cero, con estado financiero saldado y etiqueta de interfaz «Bonificado».

Centralizar una función de cotización que usen la previsualización mensual, el cobro
desde clase, el cobro desde sesión y cualquier alta de cargo aplicable. Las rutas
anteriores de `Payment` deben pasar por ese mismo cálculo o dejar de aceptar nuevos
cargos promocionables; de otro modo habrá importes diferentes según la pantalla.
El cobro recibe el importe neto cotizado y solo registra el dinero entregado.

La cotización debe entregar: precio de referencia, política del primer mes, condición
individual, promoción elegida, descuento, total, deuda previa y motivo de cualquier
conflicto. La API valida de nuevo al confirmar; el navegador no decide el precio.

### Inscripción y cuota ya emitida

El flujo preferido permite **inscribir a los dos alumnos y elegir el 2x1 antes de
emitir las primeras cuotas**. Hoy `POST /admin/enrollments` inscribe a una persona y
crea su primera mensualidad inmediatamente después, por lo que el alta de pareja
necesita un flujo específico que cotice y registre ambos beneficios antes de
confirmar las cuotas. Si el primero se inscribió durante la ventana, su
cuota podría haberse emitido antes de que se registrara la segunda persona. La
vista previa de la pareja debe separar los cargos futuros de los existentes:

- Cargo sin cobros: aplicar el beneficio como ajuste identificado por promoción.
- Cargo parcialmente cobrado: reducir solo el saldo pendiente y mostrar si la
  bonificación excede ese saldo.
- Cargo totalmente cobrado, o bonificación mayor que el saldo: mostrar la diferencia
  para resolverla como saldo a favor o devolución. No reescribir el cobro ni el recibo
  ya emitidos. La activación debe indicar cuántos casos requieren esa decisión.

Una edición posterior de la campaña no vuelve a calcular cargos históricos. La
primera aplicación sobre un cargo existente queda documentada con la fecha de
concesión, el derecho adquirido por la pareja y el importe aplicado. Para
promociones porcentuales o de precio fijo dirigidas a alumnos existentes, este
mismo mecanismo permite mostrar y resolver cargos ya emitidos.

## Experiencia de administración

En la **ficha del grupo → Promociones**, una creación breve:

1. El grupo ya está elegido. Definir el plazo para inscribirse y cuánto dura el
   beneficio: «Un encuentro puntual», «Una semana del grupo», «Un mes del grupo»
   o fechas libres. Por ejemplo, «Inscripción 2x1 a Bachata con Iri y Jero, del 9
   al 15 de noviembre».
2. Elegir beneficio: porcentaje, descuento fijo, precio final o 2x1. Si el grupo
   admite mensualidad y pago por clase, la misma promoción cubre ambas modalidades.
   Los horarios semanales pertenecen al mismo grupo y no se seleccionan por separado,
   salvo cuando el beneficio corresponde a un único encuentro.
3. Elegir alumnos cuando corresponda. Para 2x1, poder inscribir a las dos personas
   en un mismo flujo y seleccionar titular y beneficiario antes de crear las cuotas.
   Antes de activar, mostrar una vista previa con importe original, descuento e
   importe final por alumno y período o sesión.

En la ficha del alumno y en la clase debe verse una etiqueta de la promoción activa.
Al abrir **Cobrar**, mostrar el saldo ya calculado y su desglose; el campo editable
de importe debe significar «dinero recibido» o «pago parcial», no «nuevo precio».
Para una excepción puntual, ofrecer «Aplicar descuento a este cargo» con porcentaje,
importe a descontar o precio final y motivo. La vista de deudas muestra el importe
neto. El recibo de cobro muestra solo dinero recibido y puede agregar una línea
informativa con promoción y precio neto. Un alumno bonificado sin cobro no genera
recibo de pago.

## Reglas operativas que evitan errores

- La ventana para acceder al 2x1 se valida con la fecha de inscripción. La vigencia
  concedida se valida con fechas de servicio (`YYYY-MM-DD`) en horario de Argentina,
  con `sessionId` cuando cubre una sola clase del día. Si abarca solo parte de una
  mensualidad, la regla de cálculo de esa parte debe quedar definida en la campaña.
  Registrar además cuándo se creó o cambió la campaña. No recalcular cargos ya
  emitidos al editar una promoción. Una corrección retroactiva requiere un ajuste,
  anulación o devolución explícitos.
- Validar que ambas personas del 2x1 pertenecen a la misma organización y grupo,
  que sus nuevas inscripciones califican dentro de la ventana, que los alumnos son
  distintos, que no ocupan otra pareja para el mismo alcance y que un beneficio no
  deja el cargo por debajo de cero. La elegibilidad se comprueba al conceder el 2x1;
  no se vuelve a condicionar el beneficio del alumno que continúa a que su compañero
  siga inscripto o asistiendo.
- Un descuento sobre un cargo parcialmente pagado no puede superar el saldo pendiente
  con el mecanismo actual. Si se concede después del pago total, se necesita una
  devolución o crédito explícito; jamás editar el cobro histórico.
- No acumular promociones automáticas en la primera versión. Mantener separado el
  reporte de facturación (precio, bonificación, neto) del reporte de caja (cobros y
  devoluciones reales).
- Los planes mensuales de 4/8 clases son opciones de precio existentes. Confirmar su
  significado comercial antes de prometer un límite de asistencias: la cobertura
  actual de mensualidad no limita la cantidad de sesiones.

## Implementación incremental

1. **Unificar el precio antes de cobrar.** Hacer que el detalle de clase y los otros
   puntos de entrada consulten el cálculo canónico, respeten plan, condición
   individual y primer mes, y distingan importe del cargo de dinero recibido.
2. **Descuento puntual simple.** Añadir en la cuenta del alumno las tres maneras de
   ingresar un descuento sobre un cargo y mostrar la cuenta final antes de guardarlo.
   Reutilizar `FinancialAdjustment` y su auditoría.
3. **Campañas con vigencia.** Crear porcentaje, descuento fijo y precio final por
   grupo/período, con previsualización, aplicación atómica e identificación en
   cargos e informes. La aplicación atómica requiere una transacción real en el
   entorno de ejecución; verificar el comportamiento del desarrollo local sin
   replica set antes de habilitar campañas allí.
4. **2x1 para nuevos inscriptos.** Añadir la ventana de inscripción, la asignación
   de pareja y la vigencia concedida a cada una. Verificar bajas durante la vigencia
   y cómo aparece «Bonificado» en cuenta, asistencia y comunicaciones.

Pruebas indispensables: cálculo y redondeo en centavos; primer mes proporcional;
plan mensual e importe individual; dos promociones superpuestas; generación repetida
y solicitudes simultáneas; un 2x1 con saldo cero sin cobro; clase reprogramada;
baja o cambio de modalidad de una pareja sin caducidad de la promoción; sesión única,
semana, mes y rango personalizado; inscripción dentro y fuera de la ventana;
cuota emitida antes de vincular la pareja; pago parcial; descuento posterior al
cobro; recibo y reportes de caja.

## Criterios confirmados y definiciones pendientes

1. **Confirmado:** el 2x1 es para nuevos inscriptos y puede configurarse para una
   clase del día, una semana, un mes o el intervalo que defina la promoción.
2. **Confirmado:** la baja de cualquiera de las dos personas no cancela el 2x1;
   la concesión a la pareja permanece hasta que venza la promoción.
3. **Confirmado:** al crear cada promoción, administración define por separado la
   ventana para nuevas inscripciones y la duración del beneficio que recibe cada
   pareja. Por ejemplo, se puede admitir el alta durante una semana de noviembre
   y conceder el 2x1 para todo diciembre.
4. **Definido para esta entrega:** «nuevo» significa que nunca estuvo inscripto
   en esa clase. Las reinscripciones previas quedan fuera del 2x1 automático.
5. **Definido para esta entrega:** si el beneficio cubre solo parte de una
   mensualidad, el descuento es proporcional a las clases programadas incluidas.

La pareja se valida al conceder el beneficio; las ausencias posteriores tampoco
lo anulan. Así se puede informar el precio antes de la clase y mantener la regla
de vigencia confirmada para quienes dejen de asistir.

Estas decisiones no bloquean el descuento puntual ni las campañas simples. La
implementación propuesta mantiene la pantalla de cobro sencilla y deja visible por
qué cada alumno debe el importe que figura en su cuenta.

## Implementación de esta entrega

La sección **Clase → Promociones** permite crear campañas para el grupo con descuento
porcentual, importe fijo a descontar, precio final o 2x1. Se define la vigencia
del beneficio por fecha para todos sus horarios, o por un encuentro concreto.
Si el grupo tiene cobro mensual o por clase, ambos quedan cubiertos por la misma
campaña. En el 2x1 se define además la
ventana para inscribir a dos alumnos nuevos en un mismo paso, con titular y
beneficiario explícitos. La vista previa muestra la primera cuota o el precio
por clase antes de confirmar el alta.

El 2x1 se asigna al inscribir la pareja, antes de emitir la primera cuota. Los
cargos posteriores consultan las fechas concedidas a esa pareja. Una baja o el
cierre de la campaña para nuevas altas no anula el beneficio ya concedido. Una
corrección administrativa de pareja exige un motivo y solo afecta cargos futuros.
Los cargos ya emitidos conservan el descuento y su ajuste contable.

Para una mensualidad cubierta parcialmente, el descuento se prorratea por el
número de clases programadas incluidas sobre el total programado del mes para
esa inscripción. La primera cuota anterior a la vigencia del beneficio se cobra
normalmente. Se considera «nuevo» a quien nunca estuvo inscripto en esa clase;
una reinscripción anterior no califica automáticamente.

Las campañas generales aplican sus descuentos a cargos nuevos y a cargos ya
emitidos sin otra promoción y con saldo pendiente suficiente. Si el descuento supera el saldo
pendiente, la activación se rechaza sin modificar cobros o recibos. En esta
entrega la devolución o el crédito posterior a un cobro requieren resolución
manual; tampoco se añadió el descuento puntual por cargo propuesto arriba.
El importe de la pantalla de cobro representa dinero recibido y el 2x1
bonificado no crea una cobranza ficticia.
