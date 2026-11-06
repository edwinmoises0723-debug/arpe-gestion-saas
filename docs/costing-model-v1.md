# Modelo de Costeo EJNEXA v1.0

## Objetivo

El modelo ayuda a estimar cuánto cuesta producir un producto y explicar cada importe. Cada resultado debe conservar su valor, unidad, fuente y fórmula. Los cálculos son estimaciones de gestión; no sustituyen una factura fiscal ni una medición física.

Los ejemplos de este documento son ilustrativos. Las tarifas reales dependen de las facturas, equipos y configuración de cada negocio.

## Flujo del costo

```text
Ingredientes
+ Merma
+ Gastos directos
+ Mano de obra
+ Electricidad directa
+ Gas directo
+ Agua directa
+ Overhead asignado
= Costo de producción
+ Entrega interna
= Costo interno total
```

```text
Precio sugerido del producto = costo de producción × (1 + markup / 100)
Total sugerido al cliente = precio sugerido del producto + cobro de entrega
Ganancia estimada = precio final elegido − costo interno total
Margen real sobre venta = ganancia estimada ÷ precio final elegido × 100
```

Markup y margen describen cosas distintas. El markup se aplica al costo para sugerir un precio; el margen mide qué parte del precio final representa la ganancia estimada.

## Conceptos y fuentes

| Concepto | Qué representa | Unidad y origen |
| --- | --- | --- |
| Ingredientes | Costo de todos los ingredientes necesarios para el lote | Moneda del negocio; introducido por el usuario hasta disponer de recetas |
| Merma | Desperdicio, sobrantes y pérdidas pequeñas normales | Moneda; calculada como ingredientes × porcentaje de merma ÷ 100 |
| Gasto directo | Material o servicio atribuible a este producto o pedido | Moneda por concepto; importe introducido por el usuario |
| Mano de obra | Reconocimiento del tiempo de trabajo | horas × tarifa configurada por hora |
| Utility | Consumo directo de electricidad, gas o agua de producción | kWh, therm, kg o litros; medido, estimado o configurado según el caso |
| Overhead | Gastos generales compartidos que no se asignan a un producto concreto | costo mensual ÷ horas productivas mensuales × horas asignadas |
| Costo interno | Costo de producción más entrega interna | Moneda del negocio |
| Precio sugerido | Precio calculado para el producto, antes del cobro de entrega al cliente | Costo de producción más markup configurado |
| Configurado | Dato reutilizable definido por el negocio | Ejemplos: tarifa por kWh, tarifa por hora o porcentaje de merma |
| Calculado | Resultado obtenido directamente de entradas explícitas | Ejemplos: merma o costo de agua |
| Estimado | Consumo aproximado obtenido de potencia o consumo nominal y tiempo | Se identifica como estimado en el desglose |
| Medido | Consumo real conocido por ciclo de producción | Se usa cuando el negocio elige el modo medido |

## Merma, directos y mano de obra

Merma = costo de ingredientes × porcentaje de merma ÷ 100. Por ejemplo, con ingredientes de C$420 y una merma de 12%, el resultado ilustrativo es C$50.40.

Los gastos directos incluyen empaque, bases, decoración, personalización, consumibles, servicios externos, comisiones o transporte especial. El usuario introduce el importe; EJNEXA suma los conceptos. La entrega normal del pedido mantiene su sección independiente.

Mano de obra = horas de trabajo × tarifa por hora. En un ejemplo con 2 horas y C$100/h, la mano de obra sería C$200. Cambiar esta tarifa solo modifica mano de obra y los resultados que dependen del costo de producción. No cambia el consumo de utilities ni la tarifa de overhead.

## Electricidad

La potencia se normaliza internamente a kW. Cuando se introduce en watts, kW = W ÷ 1,000.

En modo estimado:

```text
kWh estimados = potencia (kW) × horas de uso
Costo eléctrico = kWh × tarifa configurada por kWh
```

Un ejemplo con 3.5 kW durante 45 minutos produce 2.625 kWh. Con una tarifa ilustrativa de C$10/kWh, el costo sería C$26.25.

En modo medido, el usuario introduce los kWh reales por ciclo y el costo es kWh medidos × tarifa por kWh. La aplicación no mide físicamente los equipos.

## Gas natural y GLP

Para gas natural:

```text
BTU usados = BTU/h × horas
Therms = BTU usados ÷ 100,000
Costo = therms × tarifa configurada por therm
```

Para GLP/propano, el peso del cilindro se normaliza a kg. La conversión es 1 lb = 0.45359237 kg.

```text
Costo por kg = precio del cilindro ÷ kg netos
Kg consumidos = kg/h × horas
Costo GLP = kg consumidos × costo por kg
```

Si el denominador de una tarifa no está configurado correctamente, el cálculo debe pedir que se complete el dato en lugar de presentar un costo cero como resultado válido.

## Agua

El negocio puede definir el costo efectivo por litro directamente o calcularlo desde una factura:

```text
Costo efectivo por litro = importe relevante de factura ÷ litros consumidos
Costo del agua de producción = litros utilizados × costo efectivo por litro
```

El usuario decide si incluye agua y alcantarillado. Los cargos fijos pueden tratarse como overhead. Un ejemplo con 12 L y C$0.08/L da C$0.96.

## Overhead y doble conteo

Overhead cubre gastos compartidos como renta, seguro, software, contabilidad, internet, mantenimiento general, limpieza general o depreciación. Se calcula con conceptos mensuales y horas productivas:

```text
Overhead mensual = suma de conceptos activos
Overhead por hora = overhead mensual ÷ horas productivas mensuales
Overhead asignado = overhead por hora × horas productivas asignadas
```

Por ejemplo, C$12,500 mensuales entre 250 horas productivas equivalen a C$50/h. Asignar 2 horas daría C$100. Estos valores son solo un ejemplo.

No incluyas en el overhead consumos que el cálculo ya suma directamente por producto, como electricidad del horno, gas del equipo o agua del lote. Así se evita contar dos veces la misma energía o agua. EJNEXA no intenta adivinar qué cargos incluye una factura general; el negocio debe clasificarlo de forma consistente.

## Trazabilidad

Cada costo del desglose debe responder qué es, de dónde salió, qué valor y unidad usó, qué fórmula aplicó y si el origen fue configurado, medido, estimado o calculado. Por ejemplo, electricidad puede mostrar potencia, tiempo, kWh, tarifa, costo y origen estimado. La mano de obra puede mostrar horas × tarifa y señalar que la tarifa provino de la configuración del negocio.

Los datos derivados de una cotización son snapshots. Un cambio posterior de configuración no debe reescribir cálculos históricos. Los registros anteriores al Modelo EJNEXA v1.0 conservan la fórmula histórica de gastos indirectos por porcentaje para poder interpretarse; nuevos cálculos deben indicar explícitamente su versión.

## Migración y activación

La capacidad del esquema y el modelo activo son conceptos distintos. La capacidad indica si la base de datos ya tiene los campos de configuración avanzada; el modelo activo indica qué fórmula utiliza cada negocio. Que los campos v1 existan no activa por sí solo ese modelo.

La migración agrega `costing_model_version` con valor predeterminado `0` y permite las versiones `0` y `1`. Por eso, al aplicar la migración, los negocios existentes conservan sus porcentajes y tarifas actuales y permanecen en el modelo Clásico. Los nuevos registros también comienzan en Clásico hasta que una persona encargada lo active. En `arpe_cost_settings`, `0` significa Clásico y `1` significa Modelo EJNEXA v1.

Cuando el esquema permite v1 pero el negocio aún está en Clásico, Configuración permite preparar y guardar electricidad, equipos, gas, agua y gastos generales. Guardar esos datos no cambia la fórmula: la Calculadora y las nuevas cotizaciones continúan usando el porcentaje de gastos indirectos clásico. Las utilities que el negocio no utiliza no necesitan configurarse.

La activación es explícita y requiere guardar primero la configuración. Antes de activarla, ARPE valida porcentajes y tarifas, coherencia de equipos activos y horas productivas cuando hay gastos generales. La confirmación cambia únicamente la versión activa del negocio a `1`; no modifica la configuración guardada ni reescribe cotizaciones o pedidos.

Cada nueva cotización conserva su versión y los parámetros usados al crear el costo. Las cotizaciones y pedidos históricos con versión `0` siguen calculándose con la fórmula clásica aunque el negocio active v1 más adelante. No se recalculan ni reinterpretan snapshots existentes.

## Autoridad y trazabilidad

La base de datos lee el modelo activo y la configuración oficial desde `arpe_cost_settings` al guardar una cotización. Si una línea nueva declara una versión distinta, la RPC la rechaza para que un navegador/PWA desactualizado no pueda elegir otra fórmula. Las tarifas y los perfiles de electricidad, gas, GLP y overhead usados en una línea v1 salen de la configuración del negocio; el JSON del navegador no puede reemplazarlos.

El navegador envía datos propios del lote, como ingredientes, horas de trabajo, gastos directos, equipos usados, duraciones, litros y horas de asignación de overhead. El trigger SQL valida esos datos y recalcula los importes. Para una lectura eléctrica medida, el asistente admite kWh por ciclo configurados o kWh ingresados para esa cotización; cuando el equipo se usa, uno de esos valores debe ser mayor que cero.

En cada costo v1 nuevo, el servidor guarda `version`, `config_snapshot`, consumos y horas de overhead. Al editar una cotización, la RPC usa el ID de ítem solo para localizar una fila de esa cotización y negocio, conserva la versión y configuración histórica desde la base, y rechaza referencias a otra cotización/negocio. Si el payload omite un costo que ya existe, se conserva junto con sus gastos directos en vez de borrarlo en silencio. La conversión a pedido copia el snapshot almacenado.

Una línea nueva se crea con el modelo que esté activo en el negocio al momento de guardar. Por eso, si se agrega una línea a una cotización clásica después de activar v1, la cotización puede contener snapshots de modelos distintos; cada línea conserva su propia versión. No existe todavía una acción para recalcular una cotización completa con un modelo nuevo.

La función TypeScript `saveQuoteCost()` no tiene llamadas en la aplicación actual y escribe las tablas legacy `arpe_quote_costs` / `arpe_quote_cost_items`, cuyas escrituras están revocadas a `authenticated`. El flujo activo de costeo multiproducto usa `saveQuoteBundle()` y la RPC protegida `arpe_save_quote_bundle`; la función legacy se conserva por ahora y no es una ruta de escritura disponible para el cliente.

## Parámetros predeterminados

Guardar parámetros reutilizables actualiza únicamente la configuración del negocio elegida para reutilización, como merma, tarifa de mano de obra y markup, además de los parámetros globales expresamente incluidos en la pantalla. No guarda el nombre del producto, ingredientes del pedido, horas del lote, gastos directos, consumos del pedido, entrega ni precio final.

Al guardar, la aplicación debe confirmar el resultado o comunicar el error. Restablecer la calculadora usa los parámetros predeterminados vigentes.

## Glosario

- **Ingrediente:** insumo comestible que forma parte del lote.
- **Merma:** pérdida o sobrante normal de producción.
- **Costo directo:** gasto atribuible al producto o pedido específico.
- **Mano de obra:** horas de trabajo multiplicadas por la tarifa por hora.
- **Utility:** electricidad, gas o agua consumidos para producir.
- **Overhead:** gastos generales compartidos asignados según horas productivas.
- **kW:** unidad de potencia; no representa energía consumida.
- **kWh:** energía consumida por una potencia durante un tiempo.
- **BTU/h:** potencia térmica nominal de un equipo a gas natural.
- **Therm:** unidad de energía de gas; en este modelo equivale a 100,000 BTU.
- **GLP:** gas licuado de petróleo, también llamado propano en algunos mercados.
- **Markup o ganancia sobre costo:** porcentaje aplicado al costo para sugerir un precio.
- **Margen:** ganancia estimada dividida entre el precio final elegido.
- **Costo interno:** costo de producción más costo interno de entrega.
- **Precio sugerido:** precio que calcula EJNEXA antes de que el usuario elija el precio final.
- **Medido:** dato de consumo real conocido por el usuario.
- **Estimado:** consumo aproximado calculado con parámetros nominales y duración.
- **Configurado:** valor reutilizable que indicó el negocio.
- **Calculado:** valor que resulta de aplicar una fórmula a los datos introducidos.

## Capacitación

1. Revisa primero que la unidad de cada entrada corresponda al equipo y a la factura.
2. Configura tarifas desde recibos reales del negocio; los ejemplos no son tarifas universales.
3. Registra como directos los materiales propios del lote y reserva overhead para gastos compartidos.
4. Evita sumar en overhead utilities que ya se calculan directamente por producto.
5. Compara el consumo estimado con una lectura medida cuando se disponga de ella.
6. Explica el precio sugerido con el costo, markup y entrega por separado; el precio final sigue siendo una decisión del negocio.
