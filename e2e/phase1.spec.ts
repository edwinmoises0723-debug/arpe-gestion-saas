import { expect, test, type Page } from '@playwright/test'

const userId = '11111111-1111-4111-8111-111111111111'
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'arpe-test@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
const session = { access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }
const business = { id: '22222222-2222-4222-8222-222222222222', owner_id: userId, name: 'Dulce Encanto', slogan: 'Hecho con amor', logo_path: null, description: '', whatsapp: '', email: '', address: '', currency: 'NIO', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }

async function mockBackend(page: Page, existing = false, seedOrder = false) {
  let profile: Record<string, unknown> | null = existing ? { ...business } : null
  let quote: Record<string, unknown> | null = null
  let order: Record<string, unknown> | null = seedOrder ? {
    id: '44444444-4444-4444-8444-444444444444', business_id: business.id, quote_id: '33333333-3333-4333-8333-333333333333',
    order_number: 'ARPE-PED-2026-0001', source_quote_number: 'ARPE-COT-2026-0001', customer_name: 'Ana Pérez',
    customer_phone: '', product: 'Pastel de vainilla', portions: 20, flavor: 'Vainilla', filling: '', decoration: '',
    extras: '', delivery_date: null, delivery_time: null, notes: '', total_amount: 1800, deposit_type: 'fixed',
    deposit_value: 500, deposit_required: 500, internal_cost_total: null, estimated_profit: null, real_margin_percent: null,
    status: 'delivered', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  } : null
  const payments: Record<string, unknown>[] = []
  await page.route('**/auth/v1/**', async route => {
    const url = route.request().url()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/user') ? user : url.includes('/logout') || url.includes('/recover') ? {} : session) })
  })
  await page.route('**/rest/v1/arpe_businesses*', async route => {
    const method = route.request().method()
    if (method === 'POST') profile = { ...business, ...route.request().postDataJSON() }
    if (method === 'PATCH') profile = { ...profile, ...route.request().postDataJSON() }
    await route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(method === 'GET' ? profile ? [profile] : [] : profile) })
  })
  await page.route('**/rest/v1/arpe_quotes*', async route => {
    const method = route.request().method()
    if (method === 'POST') quote = { id: '33333333-3333-4333-8333-333333333333', business_id: business.id, quote_number: 'ARPE-COT-2026-0001', customer_name: 'María López', customer_phone: '', product: 'Pastel de chocolate', portions: 12, flavor: '', filling: '', decoration: '', extras: '', delivery_date: null, delivery_time: null, notes: '', total_amount: 1000, deposit_type: 'percentage', deposit_value: 50, deposit_required: 500, status: 'draft', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...route.request().postDataJSON() }
    if (method === 'PATCH' && quote) quote = { ...quote, ...route.request().postDataJSON() }
    if (method === 'DELETE') quote = null
    const body = method === 'GET' ? quote ? [quote] : [] : method === 'DELETE' ? '' : quote
    await route.fulfill({ status: method === 'POST' ? 201 : 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.route('**/rest/v1/arpe_orders*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(order ? [order] : []) }))
  await page.route('**/rest/v1/arpe_payments*', async route => {
    const orderId = new URL(route.request().url()).searchParams.get('order_id')?.replace('eq.', '')
    const rows = payments.filter(payment => !orderId || payment.order_id === orderId)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
  })
  await page.route('**/rest/v1/rpc/arpe_convert_quote_to_order', async route => {
    order = { id: '44444444-4444-4444-8444-444444444444', business_id: business.id, quote_id: quote?.id, order_number: 'ARPE-PED-2026-0001', source_quote_number: quote?.quote_number, customer_name: quote?.customer_name, customer_phone: quote?.customer_phone, product: quote?.product, portions: quote?.portions, flavor: quote?.flavor, filling: quote?.filling, decoration: quote?.decoration, extras: quote?.extras, delivery_date: quote?.delivery_date, delivery_time: quote?.delivery_time, notes: quote?.notes, total_amount: quote?.total_amount, deposit_type: quote?.deposit_type, deposit_value: quote?.deposit_value, deposit_required: quote?.deposit_required, internal_cost_total: null, estimated_profit: null, real_margin_percent: null, status: 'confirmed', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([order]) })
  })
  await page.route('**/rest/v1/rpc/arpe_update_order_status', async route => {
    if (order) order = { ...order, status: route.request().postDataJSON().p_status, updated_at: new Date().toISOString() }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(order ? [order] : []) })
  })
  await page.route('**/rest/v1/rpc/arpe_register_payment', async route => {
    const input = route.request().postDataJSON()
    const duplicate = payments.find(payment => payment.request_id === input.p_request_id)
    if (duplicate) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([duplicate]) })
    const paid = payments.filter(payment => payment.order_id === input.p_order_id && payment.status === 'posted').reduce((sum, payment) => sum + Number(payment.amount), 0)
    const balance = Number(order?.total_amount) - paid
    if (order?.status === 'cancelled') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Payments cannot be registered for cancelled orders' }) })
    if (Number(input.p_amount) <= 0) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Payment amount must be greater than zero' }) })
    if (Number(input.p_amount) > balance) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Payment exceeds remaining balance: ' + balance.toFixed(2) }) })
    const number = payments.length + 1
    const payment = { id: '55555555-5555-4555-8555-' + String(number).padStart(12, '0'), business_id: business.id, order_id: input.p_order_id, payment_number: 'ARPE-PAG-2026-' + String(number).padStart(4, '0'), request_id: input.p_request_id, amount: input.p_amount, method: input.p_method, reference: input.p_reference, notes: input.p_notes, paid_at: input.p_paid_at, status: 'posted', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), voided_at: null, void_reason: null }
    payments.push(payment)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([payment]) })
  })
  await page.route('**/rest/v1/rpc/arpe_void_payment', async route => {
    const input = route.request().postDataJSON()
    const payment = payments.find(row => row.id === input.p_payment_id)
    if (!payment || payment.status !== 'posted') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Only posted payments can be voided' }) })
    Object.assign(payment, { status: 'voided', voided_at: new Date().toISOString(), void_reason: input.p_void_reason, updated_at: new Date().toISOString() })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([payment]) })
  })
}

async function login(page: Page) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico').fill('arpe-test@example.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('Example-password-123')
  await page.getByRole('button', { name: 'Entrar a mi negocio' }).click()
}

test('onboarding, persistence, settings, navigation and logout', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await mockBackend(page)
  await login(page)
  await expect(page.getByRole('heading', { name: /Tu negocio merece/ })).toBeVisible()
  await page.getByLabel('Nombre del negocio').fill('Dulce Encanto')
  await page.getByLabel('Eslogan').fill('Hecho con amor')
  await page.getByLabel('Descripción').fill('Pastelería artesanal')
  await page.getByLabel('WhatsApp').fill('+505 8888 8888')
  await page.getByLabel('Correo del negocio').fill('hola@example.com')
  await page.getByLabel('Dirección').fill('Managua')
  await page.getByLabel('Moneda principal').selectOption('CRC')
  await page.getByRole('button', { name: 'Crear mi negocio' }).click()
  await expect(page.getByRole('heading', { name: /Todo empieza/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: /Todo empieza/ })).toBeVisible()
  await expect(page.getByText('CRC', { exact: false }).first()).toBeVisible()
  for (const name of ['Cotizar', 'Pedidos', 'Pagos', 'Agenda']) {
    await page.getByRole('navigation').getByRole('link', { name, exact: true }).click()
    if (name === 'Pedidos' || name === 'Pagos') await expect(page.getByRole('heading', { name: 'Aún no tienes pedidos' })).toBeVisible()
    else await expect(page.getByRole('heading', { name: 'Estamos preparando este espacio' })).toBeVisible()
  }
  await page.getByRole('link', { name: 'Configuración', exact: true }).click()
  await page.getByLabel('Nombre del negocio').fill('Dulce Encanto Nicaragua')
  await page.getByLabel('Moneda principal').selectOption('USD')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('status')).toContainText('se guardaron correctamente')
  await page.reload()
  await expect(page.getByLabel('Nombre del negocio')).toHaveValue('Dulce Encanto Nicaragua')
  await expect(page.getByLabel('Moneda principal')).toHaveValue('USD')
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page.getByRole('heading', { name: 'Qué gusto tenerte aquí' })).toBeVisible()
  await page.goto('/configuracion')
  await expect(page.getByRole('heading', { name: 'Qué gusto tenerte aquí' })).toBeVisible()
})

for (const width of [320, 360, 390, 768, 884, 1440]) {
  test(`responsive login and dashboard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mockBackend(page, true)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Qué gusto tenerte aquí' })).toBeVisible()
    const authBrandSymbol = page.locator('.auth-page .brand-symbol:visible').first()
    await expect(authBrandSymbol).toBeVisible()
    await expect(authBrandSymbol).toHaveAttribute('viewBox', '0 0 256 256')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await login(page)
    const header = page.locator('.app-header')
    await expect(header.locator('.header-business strong')).toHaveText('Dulce Encanto')
    const platformBrand = header.getByRole('link', { name: 'EJNEXA Business Inicio' })
    await expect(platformBrand).toBeVisible()
    await expect(platformBrand.locator('.brand-symbol')).toBeVisible()
    await expect(platformBrand.locator('.brand-symbol')).toHaveAttribute('viewBox', '0 0 256 256')
    await expect(platformBrand.locator('.brand-wordmark')).toHaveText('EJNEXA')
    await expect(platformBrand.locator('.brand-x')).toBeVisible()
    await expect(platformBrand.locator('.brand-symbol')).toHaveCSS('width', `${width <= 359 ? 38 : width < 900 ? 41 : 45}px`)
    await expect(platformBrand.getByText('BUSINESS')).toBeVisible()
    await expect(header.getByText('Sprout')).toHaveCount(0)
    await expect(header.locator('.header-business .business-logo')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: `verification/dashboard-${width}.png`, fullPage: true })
  })
}

test('official platform and active business identities stay separate across modules', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBackend(page, true)
  await login(page)

  for (const path of ['/', '/configuracion', '/cotizar', '/pedidos', '/pagos', '/reportes']) {
    await page.goto(path)
    const header = page.locator('.app-header')
    const platformBrand = header.getByRole('link', { name: 'EJNEXA Business Inicio' })
    await expect(platformBrand.locator('.brand-symbol')).toBeVisible()
    await expect(platformBrand.locator('.brand-symbol')).toHaveAttribute('viewBox', '0 0 256 256')
    await expect(header.locator('.header-business strong')).toHaveText('Dulce Encanto')
    await expect(header.locator('.header-business .business-logo')).toBeVisible()
    await expect(header.getByText('Sprout')).toHaveCount(0)
    const headerBounds = await header.evaluate(element => {
      const bounds = (selector: string) => {
        const rect = element.querySelector(selector)!.getBoundingClientRect()
        return { left: rect.left, right: rect.right }
      }
      return {
        platform: bounds('a[aria-label="EJNEXA Business Inicio"]'),
        business: bounds('.header-business'),
        menu: bounds('.settings-button'),
        viewportWidth: innerWidth,
      }
    })
    expect(headerBounds.platform.right, `${path}: platform logo must fit before the business identity`).toBeLessThanOrEqual(headerBounds.business.left)
    expect(headerBounds.business.right, `${path}: business identity must fit before the menu`).toBeLessThanOrEqual(headerBounds.menu.left)
    expect(headerBounds.menu.right, `${path}: menu must stay inside the viewport`).toBeLessThanOrEqual(headerBounds.viewportWidth)
  }
})

test('quote heading and new quote action fit mobile and desktop widths', async ({ page }) => {
  await mockBackend(page, true)
  await login(page)

  for (const width of [320, 360, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/cotizar')
    const heading = page.locator('.quotes-page-heading')
    const action = page.getByRole('button', { name: 'Nueva cotización' })
    await expect(heading).toBeVisible()
    await expect(action).toBeVisible()

    const layout = await page.evaluate(() => {
      const heading = document.querySelector('.quotes-page-heading')!
      const intro = heading.firstElementChild!.getBoundingClientRect()
      const action = heading.querySelector('.new-quote-button')!.getBoundingClientRect()
      const main = document.querySelector('.main-content')!.getBoundingClientRect()
      return {
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        direction: getComputedStyle(heading).flexDirection,
        introBottom: intro.bottom,
        actionTop: action.top,
        actionLeft: action.left,
        actionRight: action.right,
        mainLeft: main.left,
        mainRight: main.right,
      }
    })

    expect(layout.scrollWidth, `Cotizar at ${width}px must not scroll horizontally`).toBeLessThanOrEqual(width)
    expect(layout.actionLeft).toBeGreaterThanOrEqual(layout.mainLeft)
    expect(layout.actionRight).toBeLessThanOrEqual(layout.mainRight)
    if (width <= 459) {
      expect(layout.direction).toBe('column')
      expect(layout.actionTop).toBeGreaterThan(layout.introBottom)
    } else {
      expect(layout.direction).toBe('row')
    }
    if (width === 390 || width === 1440) await page.screenshot({ path: `verification/quotes-${width}.png`, fullPage: true })
  }
})

test('failed login and password recovery request', async ({ page }) => {
  await page.route('**/auth/v1/token*', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ msg: 'Invalid login credentials', error_code: 'invalid_credentials' }) }))
  await page.route('**/auth/v1/recover*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
  await login(page)
  await expect(page.getByRole('alert')).toHaveText('El correo o la contraseña no son correctos.')
  await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click()
  await page.getByRole('button', { name: 'Enviar enlace' }).click()
  await expect(page.getByRole('status')).toContainText('recibirás un enlace')
})

test('signup confirmation and recovery password form', async ({ page }) => {
  await page.route('**/auth/v1/signup*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click()
  await page.getByLabel('Correo electrónico').fill('arpe-test@example.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('Example-password-123')
  await page.getByRole('button', { name: 'Crear mi cuenta' }).click()
  await expect(page.getByRole('status')).toContainText('confirma tu cuenta')
  await mockBackend(page, true)
  await page.evaluate(() => sessionStorage.setItem('arpe:recovery', 'true'))
  await login(page)
  await expect(page.getByRole('heading', { name: 'Una nueva contraseña' })).toBeVisible()
  await page.getByLabel('Contraseña', { exact: true }).fill('Updated-password-456')
  await page.getByRole('button', { name: 'Guardar contraseña' }).click()
  await expect(page.getByRole('heading', { name: /Todo empieza/ })).toBeVisible()
})

test('logo upload, signed preview and removal', async ({ page }) => {
  await mockBackend(page, true)
  const storageCalls: string[] = []
  await page.route('**/storage/v1/**', async route => {
    const method = route.request().method()
    storageCalls.push(method)
    if (method === 'GET') return route.fulfill({ path: 'public/icons/icon-192.png', contentType: 'image/png' })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/sign/') ? { signedURL: '/object/sign/arpe-business-logos/test.png?token=test' } : { Key: 'test.png' }) })
  })
  await login(page)
  await page.getByRole('link', { name: 'Configuración', exact: true }).click()
  await page.getByLabel('Logo del negocio').setInputFiles('public/icons/icon-192.png')
  await expect(page.getByAltText('Vista previa del nuevo logo')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('status')).toContainText('se guardaron correctamente')
  await expect(page.getByAltText('Logo de Dulce Encanto').first()).toBeVisible()
  await page.getByRole('button', { name: 'Quitar logo' }).click()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('status')).toContainText('se guardaron correctamente')
  await expect(page.getByAltText('Logo de Dulce Encanto')).toHaveCount(0)
  expect(storageCalls).toContain('DELETE')
})

test('quotes: create, accept, convert once and track order snapshot/status', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await mockBackend(page, true)
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Cotizar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Cotizaciones.' })).toBeVisible()
  await page.getByRole('button', { name: /Nueva cotización/ }).click()
  await page.getByLabel('Nombre del cliente').fill('María López')
  await page.getByLabel('Producto').fill('Pastel de chocolate')
  await page.getByLabel('Porciones').fill('12')
  await page.getByLabel('Precio total').fill('1000')
  await page.getByLabel('Valor del anticipo').fill('50')
  await expect(page.getByText(/C\$ 500/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(page.getByText('ARPE-COT-2026-0001', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Editar ARPE-COT-2026-0001' }).click()
  await page.getByLabel('Producto').fill('Pastel de chocolate premium')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Pastel de chocolate premium')).toBeVisible()
  await page.getByLabel('Estado de ARPE-COT-2026-0001').selectOption('accepted')
  await expect(page.getByText('ahora está aceptada')).toBeVisible()
  await page.getByRole('button', { name: /Convertir en pedido/ }).click()
  await expect(page.getByRole('alertdialog')).toContainText('ARPE-COT-2026-0001')
  await page.getByRole('button', { name: 'Crear pedido' }).click()
  await expect(page.getByRole('dialog')).toContainText('ARPE-PED-2026-0001')
  await page.getByRole('button', { name: 'Ver pedido' }).click()
  await expect(page.getByRole('heading', { name: 'ARPE-PED-2026-0001' })).toBeVisible()
  await expect(page.getByText('Pastel de chocolate premium')).toBeVisible()
  await expect(page.getByText('Anticipo requerido', { exact: true })).toBeVisible()
  await expect(page.getByText(/no registra pagos recibidos/)).toBeVisible()
  await page.getByLabel('Estado').selectOption('in_preparation')
  await expect(page.getByLabel('Estado')).toHaveValue('in_preparation')
  await page.getByLabel('Estado').selectOption('delivered')
  await expect(page.getByRole('alertdialog')).toContainText('¿Cambiar a entregado?')
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await expect(page.getByLabel('Estado')).toHaveValue('delivered')
  await page.getByRole('button', { name: 'Pedidos' }).click()
  await expect(page.getByRole('button', { name: /ARPE-PED-2026-0001/ })).toBeVisible()
  await page.getByRole('navigation').getByRole('link', { name: 'Cotizar', exact: true }).click()
  await expect(page.getByText('Esta cotización ya generó un pedido.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Convertir en pedido/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Eliminar ARPE-COT-2026-0001' })).toHaveCount(0)
})

test('payments: received money, running balance, void audit and cancelled warning', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await mockBackend(page, true, true)
  await login(page)
  await page.getByRole('navigation').getByRole('link', { name: 'Pagos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pagos.' })).toBeVisible()
  await expect(page.getByText('Dinero recibido', { exact: true })).toBeVisible()
  await expect(page.locator('.payment-overview-card').first()).toContainText('C$')
  await page.getByRole('button', { name: /ARPE-PED-2026-0001/ }).click()
  await expect(page.getByRole('heading', { name: 'ARPE-PED-2026-0001' })).toBeVisible()
  await expect(page.getByText('Saldo real pendiente')).toBeVisible()
  await expect(page.getByText('Anticipo requerido', { exact: true })).toBeVisible()
  await expect(page.getByText(/Faltan.*500/)).toBeVisible()

  await page.getByRole('button', { name: 'Registrar pago' }).click()
  await page.getByRole('button', { name: 'Completar anticipo' }).click()
  await expect(page.getByLabel('Monto recibido *')).toHaveValue('500.00')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Confirmar pago' }).click()
  await expect(page.getByRole('heading', { name: 'ARPE-PAG-2026-0001' })).toBeVisible()
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByText('Anticipo cubierto')).toBeVisible()
  await expect(page.getByText('Pagado realmente').locator('..')).toContainText('C$')
  await expect(page.getByText('Saldo real pendiente').locator('..')).toContainText('C$')

  await page.getByRole('button', { name: 'Registrar pago' }).click()
  await page.getByLabel('Monto recibido *').fill('1000')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Confirmar pago' }).click()
  await expect(page.getByRole('heading', { name: 'ARPE-PAG-2026-0002' })).toBeVisible()
  await page.getByRole('button', { name: 'Listo' }).click()
  await page.getByRole('button', { name: 'Registrar pago' }).click()
  await page.getByLabel('Monto recibido *').fill('400')
  await expect(page.getByText('Este pago supera el saldo pendiente')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled()
  await page.getByLabel('Monto recibido *').fill('300')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Confirmar pago' }).click()
  await expect(page.getByRole('heading', { name: 'ARPE-PAG-2026-0003' })).toBeVisible()
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByText('Pagado', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0)

  const thirdPayment = page.locator('.payment-record').filter({ hasText: 'ARPE-PAG-2026-0003' })
  await thirdPayment.getByRole('button', { name: 'Anular pago' }).click()
  await expect(page.getByRole('button', { name: 'Confirmar anulación' })).toBeDisabled()
  await page.getByLabel('Motivo de anulación').fill('Monto ingresado por error')
  await page.getByRole('button', { name: 'Confirmar anulación' }).click()
  await expect(page.getByText('El pago ARPE-PAG-2026-0003 fue anulado')).toBeVisible()
  await expect(page.getByText('Pagado realmente').locator('..')).toContainText('C$')
  await expect(page.getByText('Saldo real pendiente').locator('..')).toContainText('C$')
  await expect(thirdPayment.getByText('Anulado')).toBeVisible()
  await expect(thirdPayment.getByText('Motivo: Monto ingresado por error')).toBeVisible()
  await page.reload()
  await expect(page.getByText('Pagado realmente').locator('..')).toContainText('C$')

  await page.getByRole('navigation').getByRole('link', { name: 'Pedidos', exact: true }).click()
  await page.getByRole('button', { name: /ARPE-PED-2026-0001/ }).click()
  await page.getByLabel('Estado').selectOption('cancelled')
  await expect(page.getByRole('alertdialog')).toContainText('Cancelarlo no anulará ni devolverá automáticamente esos pagos')
  await page.getByRole('button', { name: 'Confirmar' }).click()
  await page.getByRole('navigation').getByRole('link', { name: 'Pagos', exact: true }).click()
  await page.getByRole('button', { name: /ARPE-PED-2026-0001/ }).click()
  await expect(page.getByText('Este pedido está cancelado y tiene pagos registrados')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0)
})
