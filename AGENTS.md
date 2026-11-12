# Guía permanente de EJNEXA Business

EJNEXA Business se diseña para personas que no necesitan conocimientos técnicos. Cada función debe ser fácil de descubrir, entender y usar, especialmente desde un teléfono.

## Identidad SaaS y arquitectura multirubro

- EJNEXA AI Studio es la compañía desarrolladora; EJNEXA Business es la plataforma SaaS; ARPE Dulce Encanto es el primer cliente/tenant, no la plataforma.
- Diseñar los módulos nuevos como multi-tenant, multirubro, configurables y reutilizables. No codificar categorías, productos, marcas, unidades ni monedas de un tenant en componentes compartidos.
- Las tablas `arpe_*` existentes son nombres históricos conservados por compatibilidad. No renombrarlas en fases acotadas ni crear nuevas tablas `arpe_*`; los módulos nuevos usan nombres neutrales de EJNEXA.
- Las categorías provienen de datos del negocio; usar `business.currency` y `unit_label` en lugar de asumir moneda o unidad.

- Mantener una experiencia premium, cálida, moderna, elegante y profesional.
- Priorizar claridad, fluidez, mínima fricción, estados vacíos útiles, feedback inmediato, jerarquía visual, coherencia y accesibilidad razonable.
- Usar microinteracciones suaves cuando aporten valor sin perjudicar el rendimiento.
- El Dashboard futuro debe usar datos reales del negocio y gráficos útiles, nunca decoración sin propósito.
- La plataforma es EJNEXA Business, producto de EJNEXA AI Studio. Mantener al negocio cliente y su `business.name` como identidad comercial propia; no sustituirlo por la marca de la plataforma.
- Mantener un crédito tecnológico discreto para EJNEXA Business y EJNEXA AI Studio, con reconocimiento visible al fundador Ing. Edwin Nicaragua.
- Preservar autenticación, onboarding, configuración y seguridad existentes al añadir fases nuevas.
- En Supabase, no usar `service_role` ni secretos en frontend; aplicar RLS por negocio y validar también en el servidor.
- En EJNEXA Business el usuario introduce datos; el sistema realiza las matemáticas. Los módulos financieros deben explicar claramente qué representa cada valor y evitar exigir cálculos manuales al usuario.
- Un anticipo requerido es una condición comercial, no un pago recibido. Solo los pagos realmente registrados deben contabilizarse como dinero cobrado y reducir el saldo real por cobrar.
- Los pagos registrados son la única fuente de verdad del dinero recibido por cada negocio. Los montos derivados, anticipos requeridos, cotizaciones o pedidos nunca deben contabilizarse automáticamente como dinero cobrado. Las correcciones financieras son auditables.
- Las entregas derivadas de pedidos deben usar la fecha y hora del pedido como fuente única de verdad. La reprogramación debe actualizar el pedido de forma segura y conservar historial auditable sin duplicar eventos.
- Los documentos destinados al cliente nunca deben exponer costos internos ni información administrativa privada del negocio.
- Los formatos A4, imagen y térmico representan la misma información comercial, pero cada uno debe diseñarse específicamente para su medio; no reducir simplemente A4 para imprimirlo en papel térmico.

- Una cotización o pedido puede contener múltiples productos o servicios. Los ítems deben modelarse de forma independiente; no concatenarlos en un único campo para simular una operación multiproducto.
- Los costos de producción pertenecen al producto/ítem; la entrega pertenece a la cotización/pedido completo y no debe duplicarse por cada producto.
- Seleccionar un ítem del catálogo solo precarga datos. Cotizaciones y pedidos conservan snapshots independientes y nunca deben cambiar retroactivamente cuando cambia el catálogo.
