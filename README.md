# ARPE Gestión SaaS

Sistema SaaS de gestión para pastelerías, reposterías y pequeños negocios.

Sistema diseñado por Ing. Edwin Nicaragua.

## Fase 1

React + TypeScript + Vite, Supabase Auth/Postgres/Storage y PWA. Interfaz en español,
mobile-first, con navegación inferior y adaptación a teléfonos estrechos, Galaxy Z Fold
cerrado/desplegado y escritorio. Fuentes e iconos se sirven desde la propia aplicación.

Incluye:

- Bienvenida, registro con correo/contraseña, confirmación de correo, inicio/cierre de sesión y recuperación de contraseña.
- Sesión persistente y protección de todas las pantallas del negocio.
- Onboarding y configuración: nombre, logo privado, eslogan, descripción, WhatsApp, correo, dirección y moneda.
- NIO/C$, USD/$, EUR/€ y CRC/₡. Un negocio por propietario en esta fase.
- Dashboard con perfil real del negocio y accesos a Inicio, Cotizar, Pedidos, Pagos y Agenda.
- Los cuatro módulos avanzados muestran un estado «Próxima fase»; no crean cotizaciones, pedidos, pagos ni eventos todavía.
- PWA con manifest, iconos PNG/maskable, instalación cuando el navegador la ofrece, aviso de actualización y apertura de la interfaz sin conexión.
- Crédito del diseñador en las pantallas de acceso, onboarding y espacio de trabajo.

## Ejecutar localmente

Requiere Node.js **22.12 o superior**; verificado con Node 24 y npm 11.

```powershell
npm ci
Copy-Item .env.example .env.local
```

**En esta máquina ya existe `.env.local` configurado. No lo sobrescribas.**
En una instalación nueva, completa el archivo con los valores de Supabase → Project Settings → API Keys:

```dotenv
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TU_CLAVE_PUBLICA
```

```powershell
npm run dev
```

Abre [http://localhost:5173](http://localhost:5173). Crea una cuenta, confirma el correo,
inicia sesión y completa el onboarding. Luego abre Configuración desde el engranaje.
Las cuentas anteriores del mismo Supabase pueden iniciar sesión; sus perfiles antiguos no se importan automáticamente.

## Supabase: lo aplicado y lo pendiente

La aplicación local está conectada al proyecto existente **ARPE Gestion** (`hvbocwqdlhnucyvfnpwt`).
Se aplicó `supabase/migrations/20260927233824_arpe_phase1_businesses.sql`:

- Tabla `public.arpe_businesses`, con RLS, índice único por propietario y validación de moneda, longitudes y ruta del logo.
- Lectura, creación y actualización únicamente del propietario. El usuario no puede cambiar `owner_id`, identificadores ni fechas mediante la API.
- Bucket privado `arpe-business-logos`, límite de 2 MB y formatos PNG/JPEG/WebP. Políticas por carpeta del usuario, visualización mediante URL firmada y reemplazo por una ruta nueva.
- Las tablas, datos y políticas preexistentes de la versión anterior se conservaron.

**No necesitas volver a ejecutar la migración en este proyecto.** Para un Supabase nuevo,
ejecuta ese SQL una sola vez en SQL Editor; incluye tabla, permisos, RLS y bucket.
El repositorio contiene únicamente la migración de esta fase, no el historial completo del Supabase antiguo:
no uses `db reset` o `db push` indiscriminadamente sobre el proyecto existente.

Pendiente de revisar/configurar en el panel de Supabase:

1. **Authentication → URL Configuration:** Site URL `http://localhost:5173` para desarrollo y Redirect URLs `http://localhost:5173`, `http://localhost:5173/auth/recovery`, `http://localhost:4173`, `http://localhost:4173/auth/recovery`. Al publicar, añade el dominio HTTPS real y su ruta `/auth/recovery`, y úsalo como Site URL.
2. **Authentication → Email / SMTP:** configurar un proveedor de correo para confirmaciones y recuperación dirigido a usuarios reales. El servicio de correo de prueba de Supabase tiene límites y restricciones de destinatarios. No se enviaron correos de prueba ni se modificó SMTP en esta fase.
3. Mantener Email habilitado y confirmación de correo activa; ambos se verificaron mediante la API pública. Validar los enlaces reales con tu correo una vez configurados los puntos anteriores.
4. El asesor de seguridad reportó **Leaked Password Protection Disabled**. Activar la protección contra contraseñas filtradas si está disponible en tu plan. No aparecieron alertas nuevas sobre las tablas de esta fase.

## Seguridad y límites de esta fase

Las variables `VITE_*` son **públicas y se incluyen en el JavaScript del navegador**.
Solo se acepta una publishable key `sb_publishable_*`; nunca una clave secreta ni `service_role`.
`.env.local` está excluido de Git. La seguridad de los datos depende de las políticas RLS,
no de ocultar la clave pública ni de los filtros de la interfaz.

Las consultas filtran por usuario y Supabase vuelve a imponer el aislamiento en el servidor.
Los logos se guardan bajo `<auth.uid()>/<uuid>.<extensión>`. Las URLs firmadas duran una hora;
no deben compartirse. La app renueva la vista mientras permanece abierta.
No hay borrado de negocios, invitaciones, equipos o múltiples negocios por cuenta todavía.
Para ampliar el modelo, añadir `business_id` y políticas coherentes a las tablas futuras.

La PWA almacena solamente archivos estáticos. No cachea Auth, respuestas de la base de datos
ni logos privados. Consultar o guardar datos requiere conexión. La sesión de Supabase persiste
en el navegador; usa Cerrar sesión en equipos compartidos.

## Comprobaciones

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
node scripts/check-supabase.mjs
```

- Vitest: validación de logos/monedas, conservación del formulario ante errores y rechazo de nombres vacíos.
- Playwright: autenticación simulada, onboarding, persistencia, configuración, navegación, logout,
  registro, recuperación, logos y ausencia de desbordamiento en 320, 360, 390, 768, 884 y 1440 px.
  Usa Edge en Windows y Chromium en otros sistemas (`npx playwright install chromium`).
  Puedes elegir otro canal con `PLAYWRIGHT_CHANNEL`.
- Las pruebas de navegador simulan la API; **no demuestran entrega de emails reales**.
- `check-supabase.mjs`: prueba HTTP real, de solo lectura, de Auth y denegación de acceso anónimo.
- `supabase/tests/phase1_rls.sql`: prueba real de aislamiento bajo roles `authenticated` y `anon`,
  con fixtures en una transacción que se revierte. Requiere un usuario Auth sin negocio de fase 1.
- GitHub Actions ejecuta tipos, lint, pruebas, build y navegador sin credenciales reales.

Para probar la PWA de producción:

```powershell
npm run build
npm run preview -- --port 4173 --strictPort
```

Abre [http://localhost:4173](http://localhost:4173). En otra terminal ejecuta
`node scripts/check-pwa.mjs` para verificar manifest, service worker y apertura sin conexión.
El service worker está desactivado durante `npm run dev`.

Para revisar el diseño en Android, abre la dirección de red que muestra Vite desde un teléfono
en la misma Wi-Fi (si el firewall lo permite). Para instalar la PWA en un teléfono se necesita
un origen HTTPS; una IP de la red local por HTTP no cumple este requisito.
El comportamiento físico de plegado, teclado e instalación debe validarse en un Galaxy Z Fold real.

## Organización

```text
src/auth/          Sesión y recuperación de acceso
src/components/    Identidad, logos, avisos y estado PWA
src/pages/         Acceso, formulario de negocio, dashboard y módulos reservados
src/lib/           Cliente Supabase, tipos, repositorio de negocio, monedas y navegación
supabase/          Migración y prueba de seguridad SQL
e2e/               Flujos de navegador con API simulada
scripts/           Generación de iconos y verificaciones de conexión/PWA
```

El despliegue de la SPA necesita HTTPS y fallback de rutas a `index.html`.
Esta fase publica el código en GitHub; no despliega un sitio de producción.

Referencias: [Auth por contraseña](https://supabase.com/docs/guides/auth/passwords),
[acceso a Storage](https://supabase.com/docs/guides/storage/security/access-control),
[Vite PWA](https://vite-pwa-org.netlify.app/guide/).
