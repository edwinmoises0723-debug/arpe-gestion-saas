# Multiproducto, catálogo y compatibilidad histórica

## Migración pendiente de revisión

`supabase/migrations/20261001023927_multi_product_catalog_workflow.sql`

La migración NO se aplica como parte del desarrollo. La aplicación nueva requiere este esquema antes de habilitarla contra el proyecto remoto. No publicar esta versión en producción antes de revisar y aplicar la migración autorizada.

Ejecutar el archivo completo en una transacción, nunca fragmentos. Antes de aplicarlo: disponer de respaldo recuperable, revisar el SQL y ejecutar las pruebas en un entorno local o de ensayo. La migración bloquea temporalmente cotizaciones, pedidos, costos y pagos para impedir escrituras concurrentes mientras comprueba los históricos. No ejecutar durante actividad de usuarios.

## Modelo y fuentes de verdad

- `arpe_catalog_products`: datos habituales por negocio, con activación/desactivación. Seleccionar copia los datos; editar el catálogo no cambia propuestas ni pedidos anteriores.
- `arpe_quote_items`: productos independientes, cantidad hasta tres decimales, unidad, precio unitario a dos decimales y subtotal generado por PostgreSQL.
- `arpe_quote_item_costs` y `arpe_quote_item_cost_items`: parámetros snapshot y gastos de la cantidad completa del ítem. Producción excluye entrega.
- `arpe_order_items`: copia independiente al convertir. La referencia al ítem de origen sirve para trazabilidad; los documentos del pedido nunca leen el catálogo ni la cotización para reconstruir sus productos.
- Las cabeceras conservan las columnas antiguas `product`, `portions`, `flavor`, `filling`, `decoration`, `extras`. Para nuevas cotizaciones/pedidos reflejan temporalmente el primer ítem. Nunca contienen nombres concatenados. El detalle completo proviene de las tablas de ítems.
- La entrega se guarda una sola vez en la cabecera. Cotizaciones: valores no negativos conocidos. Pedidos nuevos: snapshot conocido, incluido cero. Pedidos legacy: `NULL` significa desglose desconocido y se omite esa fila en los documentos.

## Escrituras y cálculos

`arpe_save_quote_bundle` llama a una función privada que autentica al usuario, obtiene su negocio y guarda cabecera, ítems, costos y gastos en una transacción. No acepta un total calculado por el navegador. Cada guardado reemplaza los ítems de una cotización aún no convertida con IDs nuevos asignados por el servidor; duplicar tampoco conserva IDs. Las cotizaciones convertidas no se pueden editar ni eliminar.

Cantidad × precio unitario = subtotal de línea (redondeado a dos decimales). Suma de líneas + entrega cobrada = total. Se mantienen las reglas actuales de anticipo. El anticipo requerido no es un pago recibido.

El trigger de costos calcula merma, mano de obra, indirectos y precio sugerido en PostgreSQL con las mismas fórmulas del frontend. «Usar precio sugerido» divide el precio sugerido de la línea entre la cantidad y redondea el precio unitario a centavos; se muestra el subtotal resultante. Esta decisión puede producir una diferencia de centavos frente al precio sugerido de la línea.

Si falta el costeo de un producto, el costo agregado y la ganancia se consideran desconocidos. No se trata el costo faltante como cero. Cuando todos los productos tienen costeo: costo agregado = suma de producción + entrega interna; ganancia = total − costo agregado; margen = ganancia / total × 100 cuando el total es positivo.

`arpe_convert_quote_to_order` mantiene el bloqueo de fila, la validación de aceptación, la numeración y la idempotencia. Copia todos los ítems, costos y entrega en una sola transacción. Pagos continúan contra `order.total_amount`; Agenda mantiene una entrega por pedido. Los listados cargan ítems por negocio y los agrupan, sin consultas por cada tarjeta.

RLS se aplica a las cinco tablas nuevas. Las referencias compuestas impiden enlazar entidades de otro negocio. El catálogo permite select/insert/update al propietario; los ítems son de solo lectura para el cliente y se escriben por RPC. Las funciones privilegiadas comprueban `auth.uid()` y pertenencia, usan `search_path` explícito y excluyen `PUBLIC`/`anon`. Se revocan las escrituras directas antiguas sobre costos y cabeceras de cotización (salvo estado y eliminación autorizada).

## Tratamiento legacy e invariantes

1. Cotización con costeo: el cobro actual de entrega pasa a su cabecera; el precio del único ítem es total histórico menos ese cobro. Su costo interno es el costo total legacy menos entrega interna. Se copian los gastos directos sin borrar las tablas antiguas.
2. Cotización sin costeo: entrega cero y único ítem por el total histórico.
3. Pedido antiguo: único ítem con sus propios datos históricos, cantidad uno y precio igual al total del pedido. Ambas entregas nuevas quedan `NULL`. Costo, ganancia y margen del ítem quedan `NULL`; los agregados históricos del pedido permanecen intactos. Nunca se usa el costeo actual de la cotización para reconstruir el pedido.
4. No usar ítems legacy para afirmar rentabilidad/costos precisos por producto. Los agregados históricos del pedido siguen siendo utilizables cuando existen.
5. Se aborta si entrega cobrada supera el total de la cotización, entrega interna supera costo total, o producción no coincide con costo total menos entrega.
6. Las comprobaciones finales comparan TODAS las columnas antiguas de cotizaciones/pedidos y TODOS los pagos, incluidos IDs, números, importes, estados, entregas y timestamps. La igualdad de las filas de pedidos y pagos preserva el saldo derivado.
7. Cada cotización/pedido existente obtiene al menos un ítem. Se valida total = suma de líneas + entrega (con `coalesce` únicamente en la comprobación matemática legacy). Se valida costo legacy = costo nuevo por ítem + entrega interna.

## Pruebas

- Unitarias: `npm run test -- src/lib/products.test.ts src/lib/costs.test.ts src/lib/documents.test.tsx src/lib/document-pagination.test.ts src/lib/quote-list.test.ts src/lib/agenda.test.ts src/lib/dashboard.test.ts src/lib/payments.test.ts`
- Navegador con backend simulado y sin escrituras remotas: `npm run test:e2e -- e2e/multi-product.spec.ts`.
- TypeScript: `npm run typecheck`; compilación: `npm run build`.
- SQL: `supabase/tests/multi_product_catalog.sql`, SOLO en una base local desechable con las migraciones aplicadas. Crea fixtures aislados y termina con `ROLLBACK`. Valida costos, totales, anticipo, rollback, conversión/idempotencia, restricciones de escritura y aislamiento de dos negocios.
- Las comprobaciones de migración validan el backfill sobre los datos que realmente encuentre. Las pruebas SQL no sustituyen una ejecución de ensayo de la migración sobre un respaldo.

## Revisión manual después de aplicar la migración autorizada

Comprobar los números, total, anticipo, pagos y saldo de los pedidos antiguos; comprobar que no aparece una entrega ficticia de cero. En una cotización existente con costeo, revisar la separación de entrega y la conservación del total.

Crear una propuesta con 1 producto y otra con 3; cambiar cantidad, precio, anticipo y entrega; duplicar y eliminar; comprobar aviso al intentar eliminar el último. Iniciar y ajustar el costeo de cada línea, usar el sugerido y recargar. Cambiar después el catálogo: la propuesta debe conservar sus valores. Convertir una propuesta aceptada y repetir: debe existir un solo pedido con todos sus productos. Revisar pagos, Agenda y documentos A4/PNG/PDF/80 mm/58 mm. Verificar con dos usuarios que cada uno solo ve su negocio.
