# Guía permanente de ARPE Gestión SaaS

ARPE se construye para personas que no necesitan conocimientos técnicos. Cada función debe ser fácil de descubrir, entender y usar, especialmente desde un teléfono.

- Mantener una experiencia premium, cálida, moderna, elegante y profesional.
- Priorizar claridad, fluidez, mínima fricción, estados vacíos útiles, feedback inmediato, jerarquía visual, coherencia y accesibilidad razonable.
- Usar microinteracciones suaves cuando aporten valor sin perjudicar el rendimiento.
- El Dashboard futuro debe usar datos reales del negocio y gráficos útiles, nunca decoración sin propósito.
- Mantener visible de forma discreta: “Sistema diseñado por Ing. Edwin Nicaragua”.
- Preservar autenticación, onboarding, configuración y seguridad existentes al añadir fases nuevas.
- En Supabase, no usar `service_role` ni secretos en frontend; aplicar RLS por negocio y validar también en el servidor.
- En ARPE el usuario introduce datos; el sistema realiza las matemáticas. Los módulos financieros deben explicar claramente qué representa cada valor y evitar exigir cálculos manuales al usuario.
- En ARPE, un anticipo requerido es una condición comercial, no un pago recibido. Solo los pagos realmente registrados en el módulo Pagos deben contabilizarse como dinero cobrado y reducir el saldo real por cobrar.
- Los pagos registrados son la única fuente de verdad del dinero realmente recibido en ARPE. Los montos derivados, anticipos requeridos, cotizaciones o pedidos nunca deben contabilizarse automáticamente como dinero cobrado. Los registros financieros no se eliminan silenciosamente; las correcciones se realizan mediante anulación auditable.
- Las entregas de Agenda derivadas de pedidos deben usar la fecha y hora del pedido como fuente única de verdad. ARPE no debe obligar al usuario a duplicar una fecha que el sistema ya conoce.
