import { expect, test, type Page } from '@playwright/test'
import type { Business } from '../src/lib/database.types'

const userId = '11111111-1111-4111-8111-111111111111'
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'arpe-test@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
const session = { access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }
const business: Business = {
  id: '22222222-2222-4222-8222-222222222222',
  owner_id: userId,
  name: 'Dulce Encanto',
  slogan: 'Hecho con amor',
  logo_path: null,
  description: '',
  whatsapp: '',
  email: '',
  address: '',
  currency: 'NIO',
  default_deposit_type: 'percentage',
  default_deposit_value: 50,
  default_document_format: 'a4',
  show_slogan_on_documents: true,
  show_description_on_documents: true,
  show_whatsapp_on_documents: true,
  show_email_on_documents: true,
  show_address_on_documents: true,
  document_footer_message: 'Gracias por elegirnos.',
  catalog_slug: null,
  public_catalog_enabled: false,
  public_catalog_show_whatsapp: true,
  public_catalog_logo_path: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

async function mockBackend(page: Page, existing = false, seedOrder = false, seedAnalytics = false) {
  let profile: Record<string, unknown> | null = existing ? { ...business } : null
  let quote: Record<string, unknown> | null = null
  let order: Record<string, unknown> | null = seedOrder ? {
    id: '44444444-4444-4444-8444-444444444444', business_id: business.id, quote_id: '33333333-3333-4333-8333-333333333333',
    order_number: 'ARPE-PED-2026-0001', source_quote_number: 'ARPE-COT-2026-0001', customer_name: 'Ana Pérez',
    customer_phone: '', product: 'Pastel de vainilla', portions: 20, flavor: 'Vainilla', filling: '', decoration: '',
    extras: '', delivery_date: null, delivery_time: null, notes: '', total_amount: 1800, deposit_type: 'fixed',
    deposit_value: 500, deposit_required: 500, internal_cost_total: seedAnalytics ? 1000 : null, estimated_profit: seedAnalytics ? 800 : null, real_margin_percent: seedAnalytics ? 44.44 : null,
    status: 'delivered', created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  } : null
  const payments: Record<string, unknown>[] = seedAnalytics && order ? [{
    id: '55555555-5555-4555-8555-555555555555', business_id: business.id, order_id: order.id,
    payment_number: 'ARPE-PAG-2026-0001', request_id: 'phase3-dashboard-fixture', amount: 500, method: 'cash',
    reference: null, notes: null, paid_at: new Date().toISOString(), status: 'posted', created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(), voided_at: null, void_reason: null,
  }] : []
  let quoteItems: Record<string, unknown>[] = []
  let orderItems: Record<string, unknown>[] = seedAnalytics && order ? [{
    id: '66666666-6666-4666-8666-666666666666', business_id: business.id, order_id: order.id, source_quote_item_id: null,
    product: 'Pastel de vainilla', quantity: 1, unit_label: 'unidad', portions: 20, flavor: 'Vainilla', filling: '',
    decoration: '', extras: '', notes: '', unit_price: 1800, position: 1, line_total: 1800, internal_cost_total: seedAnalytics ? 1000 : null,
    estimated_profit: seedAnalytics ? 800 : null, real_margin_percent: seedAnalytics ? 44.44 : null, created_at: new Date().toISOString(),
  }] : []
  const costSettings = { business_id: business.id, waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60 }
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
  await page.route('**/rest/v1/arpe_quote_items*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(quoteItems) }))
  await page.route('**/rest/v1/arpe_order_items*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(orderItems) }))
  await page.route('**/rest/v1/arpe_quote_item_costs*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/rest/v1/arpe_quote_item_cost_items*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/rest/v1/arpe_catalog_products*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/rest/v1/arpe_cost_settings*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(costSettings) }))
  await page.route('**/rest/v1/arpe_orders*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(order ? [order] : []) }))
  await page.route('**/rest/v1/arpe_payments*', async route => {
    const orderId = new URL(route.request().url()).searchParams.get('order_id')?.replace('eq.', '')
    const rows = payments.filter(payment => !orderId || payment.order_id === orderId)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
  })
  await page.route('**/rest/v1/rpc/arpe_convert_quote_to_order', async route => {
    order = { id: '44444444-4444-4444-8444-444444444444', business_id: business.id, quote_id: quote?.id, order_number: 'ARPE-PED-2026-0001', source_quote_number: quote?.quote_number, customer_name: quote?.customer_name, customer_phone: quote?.customer_phone, product: quote?.product, portions: quote?.portions, flavor: quote?.flavor, filling: quote?.filling, decoration: quote?.decoration, extras: quote?.extras, delivery_date: quote?.delivery_date, delivery_time: quote?.delivery_time, notes: quote?.notes, total_amount: quote?.total_amount, deposit_type: quote?.deposit_type, deposit_value: quote?.deposit_value, deposit_required: quote?.deposit_required, internal_cost_total: null, estimated_profit: null, real_margin_percent: null, status: 'confirmed', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    orderItems = quoteItems.map((item, index) => ({ ...item, id: `order-item-${index + 1}`, order_id: order!.id, source_quote_item_id: item.id, internal_cost_total: null, estimated_profit: null, real_margin_percent: null }))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([order]) })
  })
  await page.route('**/rest/v1/rpc/arpe_save_quote_bundle', async route => {
    const { p_quote_id, p_header, p_items } = route.request().postDataJSON() as { p_quote_id: string | null; p_header: Record<string, unknown>; p_items: Record<string, unknown>[] }
    const now = new Date().toISOString()
    const lines = p_items.map((item, index) => ({ ...item, id: `quote-item-${index + 1}`, business_id: business.id, quote_id: p_quote_id ?? '33333333-3333-4333-8333-333333333333', position: index + 1, line_total: Math.round(Number(item.quantity) * Number(item.unit_price) * 100) / 100, created_at: now, updated_at: now }))
    quoteItems = lines
    const subtotal = lines.reduce((sum, item) => sum + Number(item.line_total), 0)
    const total = subtotal + Number(p_header.delivery_customer_charge)
    const depositRequired = p_header.deposit_type === 'percentage' ? total * Number(p_header.deposit_value) / 100 : Number(p_header.deposit_value)
    quote = { id: p_quote_id ?? '33333333-3333-4333-8333-333333333333', business_id: business.id, quote_number: 'ARPE-COT-2026-0001', customer_name: p_header.customer_name, customer_phone: p_header.customer_phone, product: String(lines[0].product), portions: lines[0].portions, flavor: lines[0].flavor, filling: lines[0].filling, decoration: lines[0].decoration, extras: lines[0].extras, delivery_date: p_header.delivery_date, delivery_time: p_header.delivery_time, notes: p_header.notes, total_amount: total, deposit_type: p_header.deposit_type, deposit_value: p_header.deposit_value, deposit_required: depositRequired, status: p_header.status, delivery_internal_cost: p_header.delivery_internal_cost, delivery_customer_charge: p_header.delivery_customer_charge, created_at: now, updated_at: now }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([quote]) })
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

async function expectDashboardLoaded(page: Page, businessName: string) {
  await expect(page.locator('.app-header').getByRole('link', { name: 'EJNEXA Business Inicio' })).toBeVisible()
  await expect(page.locator('.welcome-card h2')).toHaveText(/^(Buenos días|Buenas tardes|Buenas noches)(, .+)?$/)
  await expect(page.locator('.dashboard-business-heading h2')).toHaveText(businessName)
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
  await expectDashboardLoaded(page, 'Dulce Encanto')
  await page.reload()
  await expectDashboardLoaded(page, 'Dulce Encanto')
  await expect(page.getByText('CRC', { exact: false }).first()).toBeVisible()
  for (const name of ['Cotizar', 'Pedidos', 'Pagos', 'Agenda']) {
    await page.getByRole('navigation').getByRole('link', { name, exact: true }).click()
    if (name === 'Cotizar') await expect(page.getByRole('heading', { name: 'Cotizaciones.' })).toBeVisible()
    if (name === 'Pedidos') await expect(page.getByRole('heading', { name: 'Tus pedidos aparecerán aquí' })).toBeVisible()
    if (name === 'Pagos') await expect(page.getByRole('heading', { name: 'Aún no tienes pedidos' })).toBeVisible()
    if (name === 'Agenda') await expect(page.getByRole('heading', { name: 'Tu agenda está al día' })).toBeVisible()
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      elements: [...document.querySelectorAll('body *')].map(element => {
        const rect = element.getBoundingClientRect()
        return { tag: element.tagName, className: typeof element.className === 'string' ? element.className : '', text: element.textContent?.trim().slice(0, 50), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }
      }).filter(element => element.right > innerWidth + 1 || element.left < -1).slice(0, 12),
    }))
    expect(overflow.scrollWidth, `${name}: horizontal overflow ${JSON.stringify(overflow)}`).toBeLessThanOrEqual(overflow.viewportWidth)
  }
  await page.getByRole('button', { name: 'Abrir menú' }).click()
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
    await expect(header.locator('.header-business strong')).toBeVisible()
    const platformBrand = header.getByRole('link', { name: 'EJNEXA Business Inicio' })
    await expect(platformBrand).toBeVisible()
    await expect(platformBrand.locator('.brand-symbol')).toBeVisible()
    await expect(platformBrand.locator('.brand-symbol')).toHaveAttribute('viewBox', '0 0 256 256')
    await expect(platformBrand.locator('.brand-wordmark')).toHaveText('EJNEXA')
    await expect(platformBrand.locator('.brand-x')).toBeVisible()
    await expect(platformBrand.locator('.brand-symbol')).toHaveCSS('width', `${width <= 359 ? 38 : width < 900 ? 41 : 45}px`)
    await expect(platformBrand.locator('.brand-wordmark')).toHaveCSS('font-size', `${width <= 359 ? 18.4 : 23.68}px`)
    await expect(platformBrand.locator('small')).toHaveCSS('font-size', `${width <= 359 ? 7.84 : 8.8}px`)
    await expect(platformBrand.getByText('BUSINESS')).toBeVisible()
    await expect(header.getByText('Sprout')).toHaveCount(0)
    await expect(header.locator('.header-business .business-logo')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const navigation = page.getByRole('navigation', { name: 'Navegación principal' })
    await expect(navigation.getByRole('link')).toHaveCount(5)
    await expect(navigation.getByRole('link', { name: 'Inicio', exact: true })).toHaveClass(/active/)
    await expect(navigation.getByRole('link', { name: 'Inicio', exact: true })).toHaveCSS('color', 'rgb(23, 79, 180)')
    await page.screenshot({ path: `verification/dashboard-${width}.png`, fullPage: true })
  })
}

test('dashboard and reports charts stay accessible and responsive', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBackend(page, true, true, true)
  await login(page)
  await expectDashboardLoaded(page, 'Dulce Encanto')
  const dashboardChart = page.locator('.dashboard-bar-chart')
  await expect(dashboardChart).toBeVisible()
  await expect(dashboardChart.getByRole('button')).toHaveCount(30)
  await dashboardChart.getByRole('button').last().click()
  await expect(page.locator('.dashboard-page .inline-chart-selection')).toContainText('C$')
  await expect(page.locator('.dashboard-status-counts')).toContainText('Entregados')
  await expect(page.locator('.dashboard-status-visual').getByRole('img', { name: /Total: 1 pedidos/ })).toBeVisible()
  await expect(page.locator('.dashboard-status-visual .order-status-donut-center')).toContainText('Pedidos')
  await expect(page.locator('.dashboard-profit')).toContainText('Ventas con costeo')
  await expect(page.locator('.dashboard-profit')).toContainText('Margen sobre ventas costeadas')
  await page.screenshot({ path: testInfo.outputPath('dashboard-390.png'), fullPage: true })

  for (const width of [320, 360, 390, 768, 884, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Dashboard overflow at ${width}px`).toBe(true)
    await expect(dashboardChart).toBeVisible()
  }
  await page.screenshot({ path: testInfo.outputPath('dashboard-1440.png'), fullPage: true })

  await page.goto('/reportes')
  await expect(page.getByRole('heading', { name: 'Reportes.' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Indicadores del período' }).getByRole('article')).toHaveCount(4)
  const reportChart = page.locator('.reports-chart')
  await expect(reportChart).toBeVisible()
  await expect(reportChart.getByRole('button')).toHaveCount(30)
  await expect(page.locator('.reports-product-ranking .reports-rank-track')).toHaveCount(1)
  await expect(page.locator('.reports-payment-ranking .reports-rank-track')).toHaveCount(1)
  await expect(page.locator('.reports-delivery-list li')).toHaveCount(3)
  await expect(page.locator('.reports-status-visual').getByRole('img', { name: /Total: 1 pedidos/ })).toBeVisible()
  await expect(page.locator('.reports-sales-collection')).toContainText('Ventas vs. Cobros')
  await expect(page.locator('.reports-profitability')).toContainText('Costos estimados')
  await reportChart.getByRole('button').last().click()
  await expect(page.locator('.reports-page .inline-chart-selection')).toContainText('C$')
  await page.locator('.reports-filter select').selectOption('last7')
  await expect(page.locator('.reports-heading-range')).toBeVisible()
  await page.locator('.reports-filter select').selectOption('custom')
  await expect(page.getByLabel('Fecha desde')).toBeVisible()
  await expect(page.getByLabel('Fecha hasta')).toBeVisible()
  await page.locator('.reports-filter select').selectOption('last30')

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Reports overflow at 390px').toBe(true)
  await page.screenshot({ path: testInfo.outputPath('reports-390.png'), fullPage: true })
  for (const width of [320, 360, 390, 768, 884, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Reports overflow at ${width}px`).toBe(true)
    await expect(reportChart).toBeVisible()
  }
  await page.screenshot({ path: testInfo.outputPath('reports-1440.png'), fullPage: true })
})

test('official platform and active business identities stay separate across modules', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBackend(page, true)
  await login(page)

  for (const path of ['/', '/configuracion', '/cotizar', '/pedidos', '/pagos', '/agenda', '/reportes']) {
    await page.goto(path)
    const header = page.locator('.app-header')
    const platformBrand = header.getByRole('link', { name: 'EJNEXA Business Inicio' })
    await expect(platformBrand.locator('.brand-symbol')).toBeVisible()
    await expect(platformBrand.locator('.brand-symbol')).toHaveAttribute('viewBox', '0 0 256 256')
    await expect(header.locator('.header-business strong')).toHaveText('Dulce Encanto')
    await expect(header.locator('.header-business strong')).toBeVisible()
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
    const navigation = page.getByRole('navigation', { name: 'Navegación principal' })
    await expect(navigation.getByRole('link')).toHaveCount(5)
    const activeLink = navigation.locator('a.active')
    if (['/', '/cotizar', '/pedidos', '/pagos', '/agenda'].includes(path)) {
      await expect(activeLink).toHaveCount(1)
      await expect(activeLink).toHaveAttribute('href', path)
    } else await expect(activeLink).toHaveCount(0)
    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      elements: [...document.querySelectorAll('body *')].map(element => {
        const rect = element.getBoundingClientRect()
        return { tag: element.tagName, className: typeof element.className === 'string' ? element.className : '', text: element.textContent?.trim().slice(0, 50), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width) }
      }).filter(element => element.right > innerWidth + 1 || element.left < -1).slice(0, 12),
    }))
    expect(layout.scrollWidth, `${path}: horizontal overflow ${JSON.stringify(layout)}`).toBeLessThanOrEqual(layout.viewportWidth)
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
  await expectDashboardLoaded(page, 'Dulce Encanto')
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
  await page.getByRole('button', { name: 'Abrir menú' }).click()
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
  const firstProduct = page.locator('.bundle-item').first()
  await firstProduct.getByRole('textbox', { name: 'Producto', exact: true }).fill('Pastel de chocolate')
  await page.getByLabel('Porciones').fill('12')
  await firstProduct.getByLabel('Precio unitario').fill('1000')
  await page.getByLabel('Porcentaje de anticipo (%)').fill('50')
  await expect(page.getByText(/C\$ 500/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Guardar cotización' }).click()
  await expect(page.getByText('ARPE-COT-2026-0001', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Editar ARPE-COT-2026-0001' }).click()
  await page.locator('.bundle-item').first().getByRole('textbox', { name: 'Producto', exact: true }).fill('Pastel de chocolate premium')
  await page.getByRole('button', { name: 'Guardar cotización' }).click()
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
  await expect(page.getByText('Solo los pagos registrados cuentan como dinero recibido.')).toBeVisible()
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
test('appearance persists, follows system changes and remains a local preference', async ({ page }) => {
  await mockBackend(page, true)
  await page.emulateMedia({ colorScheme: 'light' })
  await login(page)
  await expectDashboardLoaded(page, 'Dulce Encanto')
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('button', { name: 'Oscuro', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expectDashboardLoaded(page, 'Dulce Encanto')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await page.evaluate(() => localStorage.getItem('ejnexa-theme'))).toBe('dark')
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('button', { name: 'Claro', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.getByRole('button', { name: 'Sistema', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('login theme controls stay readable and responsive', async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await mockBackend(page)
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(() => localStorage.setItem('ejnexa-theme', 'dark'))
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByLabel('Correo electrónico')).toBeVisible()
  await expect(page.getByRole('group', { name: 'Apariencia' })).toBeVisible()
  for (const width of [320, 360, 390, 400, 768, 884, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Login overflow at ${width}px`).toBe(true)
    if ([360, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`login-dark-${width}.png`), fullPage: true })
  }
  await expect(page.getByRole('button', { name: 'Claro' })).toHaveCSS('min-height', '44px')
  expect(errors).toEqual([])
})

for (const theme of ['light', 'dark'] as const) {
  test(`design system ${theme}: responsive modules and visual evidence`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
    await mockBackend(page, true, true, true)
    await login(page)
    await expectDashboardLoaded(page, 'Dulce Encanto')
    for (const width of [320, 360, 390, 400, 768, 884, 1440]) {
      await page.setViewportSize({ width, height: 960 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Dashboard overflow at ${width}px in ${theme}`).toBe(true)
      if ([320, 360, 884, 1440].includes(width)) {
        await page.getByRole('button', { name: 'Abrir menú' }).click()
        const menu = page.getByRole('dialog', { name: 'Menú del negocio' })
        await expect(menu).toBeVisible()
        const bounds = await menu.evaluate(element => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right, viewport: innerWidth }))
        expect(bounds.left).toBeGreaterThanOrEqual(0)
        expect(bounds.right).toBeLessThanOrEqual(bounds.viewport)
        await expect(menu.getByRole('group', { name: 'Apariencia' })).toBeVisible()
        await page.keyboard.press('Escape')
        await expect(menu).not.toBeVisible()
      }
      if ([360, 884, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`dashboard-${theme}-${width}.png`), fullPage: true })
    }

    const visit = async (route: string) => {
      const bottomNavLinks: Record<string, string> = { '/': 'Inicio', '/cotizar': 'Cotizar', '/pedidos': 'Pedidos', '/pagos': 'Pagos', '/agenda': 'Agenda' }
      if (bottomNavLinks[route]) {
        await page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link', { name: bottomNavLinks[route], exact: true }).click()
      } else {
        const menuLabels: Record<string, string> = { '/solicitudes': 'Solicitudes', '/reportes': 'Reportes', '/catalogo': 'Catálogo', '/calculadora-costos': 'Calculadora de costo', '/configuracion': 'Configuración' }
        await page.getByRole('button', { name: 'Abrir menú' }).click()
        await page.getByRole('dialog', { name: 'Menú del negocio' }).getByRole('link', { name: new RegExp(menuLabels[route]) }).click()
      }
      await expect(page).toHaveURL(new RegExp(`${route.replaceAll('/', '\\/')}$`))
      await expect(page.locator('.app-shell h1').first()).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    }
    for (const route of ['/solicitudes', '/reportes', '/cotizar', '/pedidos', '/pagos', '/agenda', '/catalogo', '/calculadora-costos', '/configuracion']) {
      await visit(route)
      for (const width of [360, 884]) {
        await page.setViewportSize({ width, height: 960 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${route} overflow at ${width}px in ${theme}`).toBe(true)
        if (['/solicitudes', '/cotizar'].includes(route)) await page.screenshot({ path: testInfo.outputPath(`${route.slice(1)}-${theme}-${width}.png`), fullPage: true })
      }
    }
    expect(errors).toEqual([])
  })
}

test('EJNEXA costing v1 calculates and traces product utilities with overhead', async ({ page }) => {
  await page.setViewportSize({ width: 884, height: 1024 })
  await mockBackend(page, true)
  const costingConfig = {
    electricity_rate_per_kwh: 10, natural_gas_rate_per_therm: 2, lpg_cylinder_price: 300, lpg_net_kg: 15,
    water_rate_per_liter: 0.08, monthly_overhead_total: 12500, productive_hours_per_month: 250,
    overhead_items: [{ name: 'Renta', category: 'Renta', monthly_cost: 12500, active: true }],
    electricity_equipment: [{ id: 'oven', name: 'Horno eléctrico', active: true, power_kw: 3.5, calculation_mode: 'estimated' }],
    natural_gas_equipment: [{ id: 'gas', name: 'Horno de gas', active: true, btu_per_hour: 100000 }],
    lpg_equipment: [{ id: 'lpg', name: 'Quemador GLP', active: true, consumption_kg_per_hour: 0.25 }],
  }
  await page.route('**/rest/v1/arpe_cost_settings*', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ business_id: business.id, waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60, costing_model_version: 1, costing_config: costingConfig }) }))
  await login(page)
  await expectDashboardLoaded(page, 'Dulce Encanto')
  await page.goto('/calculadora-costos')
  await page.getByLabel('Costo total de ingredientes').fill('420')
  await page.getByLabel('Horas estimadas de trabajo').fill('2')
  await page.getByRole('button', { name: 'Agregar gasto' }).click()
  await page.getByRole('button', { name: 'Caja', exact: true }).click()
  await page.getByLabel('Costo del gasto').fill('80')
  await page.getByRole('button', { name: 'Electricidad', exact: true }).click()
  await page.getByLabel('Equipo').nth(0).selectOption('oven')
  await page.getByLabel('Tiempo de uso (minutos)').nth(0).fill('45')
  await page.getByRole('button', { name: 'Gas natural', exact: true }).click()
  await page.getByLabel('Equipo').nth(1).selectOption('gas')
  await page.getByLabel('Tiempo de uso (minutos)').nth(1).fill('30')
  await page.getByRole('button', { name: 'GLP / Propano', exact: true }).click()
  await page.getByLabel('Equipo').nth(2).selectOption('lpg')
  await page.getByLabel('Tiempo de uso (minutos)').nth(2).fill('45')
  await page.getByRole('button', { name: 'Agua', exact: true }).click()
  await page.getByLabel('Litros utilizados').fill('12')
  await page.getByRole('button', { name: 'Configurar' }).click()
  await page.getByLabel('Costo interno de entrega').fill('100')
  await page.getByLabel('Cobro de entrega al cliente').fill('150')
  const formatNio = (value: number) => `C$ ${new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
  await expect(page.locator('.cost-suggested-price')).toContainText(formatNio(1411.78))
  await expect(page.locator('.cost-suggested-total')).toContainText(formatNio(1561.78))
  await page.locator('.quick-cost-breakdown > summary').click()
  await expect(page.locator('.cost-trace-list')).toContainText('2.625 kWh')
  await expect(page.locator('.cost-trace-list')).toContainText('0.5 therm')
  await expect(page.locator('.cost-trace-list')).toContainText('0.1875 kg')
  await expect(page.locator('.cost-trace-list')).toContainText(formatNio(0.96))
  await expect(page.locator('.cost-trace-list')).toContainText('Overhead asignado')
})

test('cost settings save tenant rates, profiles, water and overhead in normalized units', async ({ page }) => {
  await mockBackend(page, true)
  const initialConfig = {
    electricity_rate_per_kwh: 0, natural_gas_rate_per_therm: 0, lpg_cylinder_price: 0, lpg_net_kg: 0,
    water_rate_per_liter: 0, monthly_overhead_total: 0, productive_hours_per_month: 0,
    overhead_items: [], electricity_equipment: [], natural_gas_equipment: [], lpg_equipment: [],
  }
  let savedConfig: Record<string, unknown> | null = null
  let activationPayload: Record<string, unknown> | null = null
  let settingsRow: Record<string, unknown> = { business_id: business.id, waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60, costing_model_version: 0, costing_config: initialConfig }
  await page.route('**/rest/v1/arpe_cost_settings*', async route => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settingsRow) })
      return
    }
    const payload = route.request().postDataJSON() as Record<string, unknown>
    if (method === 'POST') {
      savedConfig = payload.costing_config as Record<string, unknown>
      settingsRow = { ...settingsRow, ...payload }
    } else if (method === 'PATCH' && Object.keys(payload).length === 1 && payload.costing_model_version === 1) {
      activationPayload = payload
      settingsRow = { ...settingsRow, ...payload }
    } else if (method === 'PATCH') {
      savedConfig = payload.costing_config as Record<string, unknown>
      settingsRow = { ...settingsRow, ...payload }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(settingsRow) })
  })
  await login(page)
  await expectDashboardLoaded(page, 'Dulce Encanto')
  const openModule = async (label: string) => {
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.getByRole('dialog', { name: 'Menú del negocio' }).getByRole('link', { name: new RegExp(label) }).click()
  }
  await openModule('Configuración')
  await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible()

  await page.getByLabel('Tarifa eléctrica por kWh').fill('10.82')
  await page.getByRole('button', { name: 'Agregar equipo eléctrico' }).click()
  await page.getByLabel('Nombre', { exact: true }).fill('Horno principal')
  await page.getByLabel('Potencia (W)').fill('3500')
  await page.getByLabel('Modo').selectOption('measured')
  await page.getByLabel('kWh medidos por ciclo').fill('2.4')

  const gas = page.locator('.form-section').filter({ has: page.getByRole('heading', { name: 'Gas natural y GLP' }) })
  await gas.getByLabel('Tarifa por therm (gas natural)').fill('2')
  await gas.getByRole('button', { name: 'Agregar equipo de gas natural' }).click()
  await gas.getByLabel('Equipo gas natural').fill('Horno de gas')
  await gas.getByLabel('BTU/h').fill('100000')
  await gas.getByLabel('Precio del cilindro GLP').fill('300')
  await gas.locator('select').selectOption('lb')
  await gas.locator('input[aria-label="Peso neto del cilindro"]').fill('25')
  await gas.getByRole('button', { name: 'Agregar equipo GLP' }).click()
  await gas.getByLabel('Consumo (kg/h)').fill('0.25')

  const water = page.locator('.form-section').filter({ has: page.getByRole('heading', { name: 'Agua' }) })
  await water.getByLabel('Costo efectivo por litro').fill('0.08')
  const overhead = page.locator('.form-section').filter({ has: page.getByRole('heading', { name: 'Overhead mensual' }) })
  await overhead.getByRole('button', { name: 'Agregar gasto mensual' }).click()
  await overhead.getByLabel('Concepto').fill('Renta')
  await overhead.getByLabel('Categoría').fill('Renta')
  await overhead.getByLabel('Costo mensual').fill('12500')
  await overhead.getByLabel('Horas productivas mensuales').fill('250')
  await page.getByRole('button', { name: 'Guardar configuración' }).click()
  await expect(page.getByText('Configuración de costeo guardada.')).toBeVisible()

  expect(savedConfig).not.toBeNull()
  expect(savedConfig?.electricity_rate_per_kwh).toBe(10.82)
  expect((savedConfig?.electricity_equipment as { power_kw: number; calculation_mode: string; measured_kwh_per_cycle: number }[])[0]).toMatchObject({ power_kw: 3.5, calculation_mode: 'measured', measured_kwh_per_cycle: 2.4 })
  expect(savedConfig?.natural_gas_rate_per_therm).toBe(2)
  expect((savedConfig?.natural_gas_equipment as { btu_per_hour: number }[])[0].btu_per_hour).toBe(100000)
  expect(savedConfig?.lpg_cylinder_price).toBe(300)
  expect(savedConfig?.lpg_net_kg).toBeCloseTo(25 * 0.45359237, 8)
  expect(savedConfig?.water_rate_per_liter).toBe(0.08)
  expect(savedConfig?.monthly_overhead_total).toBe(12500)
  expect(savedConfig?.productive_hours_per_month).toBe(250)
  expect((savedConfig?.overhead_items as { monthly_cost: number }[])[0].monthly_cost).toBe(12500)
  expect(settingsRow.costing_model_version).toBe(0)

  await openModule('Calculadora de costo')
  await expect(page.locator('.cost-calculator-page [role="status"]')).toContainText('Modelo actual: Clásico')
  await expect(page.getByRole('heading', { name: 'Consumos de producción' })).toHaveCount(0)
  await page.getByLabel('Costo total de ingredientes').fill('100')
  await page.locator('.quick-cost-breakdown > summary').click()
  await expect(page.locator('.cost-detailed-summary')).toContainText('Gastos indirectos (12%)')
  await openModule('Configuración')
  await expect(page.getByRole('heading', { name: 'Configuración' })).toBeVisible()
  await page.getByRole('button', { name: 'Activar Modelo EJNEXA v1' }).click()
  const activationDialog = page.getByRole('alertdialog', { name: 'Activar Modelo EJNEXA v1' })
  await expect(activationDialog).toContainText('Tus cotizaciones y pedidos históricos conservarán los costos con los que fueron creados.')
  await activationDialog.getByRole('button', { name: 'Activar modelo v1' }).click()
  await expect(page.getByText('Modelo EJNEXA v1 activo. Configuración de costeo guardada.')).toBeVisible()
  expect(activationPayload).toEqual({ costing_model_version: 1 })
  expect(settingsRow.costing_model_version).toBe(1)
  expect(settingsRow.costing_config).toEqual(savedConfig)
  await openModule('Calculadora de costo')
  await expect(page.getByRole('heading', { name: 'Consumos de producción' })).toBeVisible()
})

test('legacy costing schema loads basic settings without v1 reads or writes', async ({ page }) => {
  await mockBackend(page, true)
  const legacySettings = { business_id: business.id, waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  const selectedColumns: string[] = []
  const writes: Record<string, unknown>[] = []
  const writeUrls: string[] = []
  await page.route('**/rest/v1/arpe_cost_settings*', async route => {
    const request = route.request()
    if (request.method() === 'GET') {
      const select = new URL(request.url()).searchParams.get('select') ?? ''
      selectedColumns.push(select)
      if (select.includes('costing_model_version') || select.includes('costing_config')) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST204', message: "Could not find the 'costing_model_version' column of 'arpe_cost_settings' in the schema cache" }) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(legacySettings) })
      return
    }
    const payload = request.postDataJSON() as Record<string, unknown>
    writes.push(payload)
    writeUrls.push(request.url())
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ...legacySettings, ...payload }) })
  })

  await login(page)
  await expectDashboardLoaded(page, 'Dulce Encanto')
  await page.goto('/calculadora-costos')
  await expect(page.getByText('No pudimos leer tus valores guardados')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Consumos de producción' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Editar parámetros' }).click()
  await expect(page.getByLabel('Merma (%)')).toHaveValue('12')
  await expect(page.getByLabel('Gastos indirectos (%)')).toHaveValue('12')
  await expect(page.getByLabel('Costo por hora')).toHaveValue('100')
  await expect(page.getByLabel('Ganancia sobre costo (%)')).toHaveValue('60')
  await expect(page.getByRole('alert')).toHaveCount(0)

  await page.goto('/configuracion')
  await expect(page.getByLabel('Gastos indirectos (%)')).toHaveValue('12')
  await expect(page.getByRole('heading', { name: 'Electricidad' })).toHaveCount(0)
  await page.getByLabel('Gastos indirectos (%)').fill('18')
  await page.getByRole('button', { name: 'Guardar configuración' }).click()
  await expect(page.getByText('Configuración de costeo guardada.')).toBeVisible()

  expect(selectedColumns.some(select => select.includes('costing_model_version'))).toBe(true)
  expect(selectedColumns.some(select => !select.includes('costing_model_version') && !select.includes('costing_config'))).toBe(true)
  expect(writes).toHaveLength(1)
  expect(writes[0]).toMatchObject({ waste_percent: 12, indirect_percent: 18, labor_hourly_rate: 100, markup_percent: 60 })
  expect(new URL(writeUrls[0]).searchParams.get('business_id')).toBe(`eq.${business.id}`)
  expect(writes[0]).not.toHaveProperty('costing_model_version')
  expect(writes[0]).not.toHaveProperty('costing_config')
})

for (const theme of ['light', 'dark'] as const) {
  test(`welcome and cost calculator are clear and responsive in ${theme}`, async ({ page }) => {
    const hour = theme === 'light' ? 9 : 20
    await page.emulateMedia({ colorScheme: theme, reducedMotion: 'no-preference' })
    await page.addInitScript(savedTheme => localStorage.setItem('ejnexa-theme', savedTheme), theme)
    await page.addInitScript(localHour => { Date.prototype.getHours = function () { return localHour } }, hour)
    await mockBackend(page, true)
    await login(page)
    await expectDashboardLoaded(page, 'Dulce Encanto')

    const welcome = page.locator('.welcome-card')
    await expect(welcome.getByRole('heading', { name: hour < 12 ? 'Buenos días' : 'Buenas noches', exact: true })).toBeVisible()
    await expect(welcome.locator('.welcome-card-eyebrow')).toHaveText(hour < 12 ? 'UN NUEVO DÍA PARA AVANZAR' : 'CIERRA EL DÍA CON CLARIDAD')
    await expect(welcome).toContainText('Todo listo para avanzar con Dulce Encanto.')
    await expect(welcome).not.toHaveAttribute('aria-live', /.+/)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

    for (const width of [320, 360, 390, 400, 768, 884, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Welcome overflow at ${width}px in ${theme}`).toBe(true)
      await expect(welcome).toBeVisible()
    }

    await page.setViewportSize({ width: 320, height: 720 })
    const menuButton = page.getByRole('button', { name: 'Abrir menú' })
    const buttonSize = await menuButton.evaluate(element => [element.offsetWidth, element.offsetHeight])
    const buttonBounds = await menuButton.boundingBox()
    if (!buttonBounds) throw new Error('No se encontró el botón de menú.')
    await page.mouse.move(buttonBounds.x + buttonBounds.width / 2, buttonBounds.y + buttonBounds.height / 2)
    await page.mouse.down()
    expect(await menuButton.evaluate(element => getComputedStyle(element).transform)).not.toBe('none')
    expect(await menuButton.evaluate(element => [element.offsetWidth, element.offsetHeight])).toEqual(buttonSize)
    await page.mouse.up()

    const menu = page.getByRole('dialog', { name: 'Menú del negocio' })
    await expect(menu).toBeVisible()
    const menuNavigation = menu.getByRole('navigation', { name: 'Módulos complementarios' })
    const menuLinks = menuNavigation.getByRole('link')
    await expect(menuLinks).toHaveCount(5)
    await expect(menuLinks.nth(2)).toHaveText('Calculadora de costo')
    const calculatorTarget = await menuLinks.nth(2).boundingBox()
    expect(calculatorTarget?.height).toBeGreaterThanOrEqual(44)
    const menuRoutes = ['/solicitudes', '/catalogo', '/calculadora-costos', '/reportes', '/configuracion']
    for (const route of menuRoutes) {
      await menuNavigation.locator(`a[href="${route}"]`).click()
      await expect(page).toHaveURL(new URL(route, page.url()).href)

      if (route === '/calculadora-costos') {
        await expect(page.getByRole('heading', { name: 'Calculadora de costo' })).toBeVisible()
        await expect(page.getByText('Estos datos solo se usan en este cálculo.')).toBeVisible()
        await expect(page.getByText('Parámetros aplicados')).toBeVisible()
        await expect(page.getByLabel('Merma (%)')).toHaveCount(0)
        await page.getByRole('button', { name: 'Editar parámetros' }).click()
        await expect(page.getByLabel('Merma (%)')).toHaveValue('12')
        await expect(page.getByText('El overhead se asigna por horas productivas.')).toBeVisible()
        await expect(page.getByLabel('Costo por hora')).toHaveValue('100')
        await expect(page.getByLabel('Ganancia sobre costo (%)')).toHaveValue('60')
        await expect(page.getByText('Agrega tus costos para ver el resultado.')).toBeVisible()
        const bottomNavigation = page.getByRole('navigation', { name: 'Navegación principal' })
        await expect(bottomNavigation.getByRole('link')).toHaveCount(5)
      }

      await page.getByRole('button', { name: 'Abrir menú' }).click()
      await expect(menu).toBeVisible()
      const activeLinks = menuNavigation.locator('a[aria-current="page"]')
      await expect(activeLinks).toHaveCount(1)
      await expect(activeLinks).toHaveAttribute('href', route)

      for (const width of [320, 360, 390, 400, 768, 884, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Menu overflow at ${width}px in ${theme} on ${route}`).toBe(true)
        expect(await menu.evaluate(element => element.scrollWidth <= element.clientWidth), `Menu panel overflow at ${width}px in ${theme} on ${route}`).toBe(true)
        await expect(activeLinks).toHaveCount(1)
        await expect(activeLinks).toHaveAttribute('href', route)
        await expect(menuNavigation.locator('a[href="/calculadora-costos"]')).toContainText('Calculadora de costo')
      }
    }

    await menu.getByRole('button', { name: 'Cerrar menú' }).click()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const calculatorButton = page.getByRole('button', { name: 'Abrir menú' })
    const reducedMotionBounds = await calculatorButton.boundingBox()
    if (!reducedMotionBounds) throw new Error('No se encontró el botón de menú con movimiento reducido.')
    await page.mouse.move(reducedMotionBounds.x + reducedMotionBounds.width / 2, reducedMotionBounds.y + reducedMotionBounds.height / 2)
    await page.mouse.down()
    expect(await calculatorButton.evaluate(element => getComputedStyle(element).transform)).toBe('none')
    await page.mouse.up()
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`quick cost calculator calculates locally and resets in ${theme}`, async ({ page }) => {
    const pageErrors: string[] = []
    const calculatorWrites: string[] = []
    const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.emulateMedia({ colorScheme: theme })
    await page.addInitScript(savedTheme => localStorage.setItem('ejnexa-theme', savedTheme), theme)
    await mockBackend(page, true)
    let calculatorSettings = {
      business_id: business.id,
      waste_percent: 12,
      indirect_percent: 12,
      labor_hourly_rate: 100,
      markup_percent: 60,
      costing_model_version: 1,
      costing_config: {},
    }
    await page.route('**/rest/v1/arpe_cost_settings*', async route => {
      if (route.request().method() !== 'GET') calculatorSettings = { ...calculatorSettings, ...route.request().postDataJSON() }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(calculatorSettings) })
    })
    await login(page)
    await expectDashboardLoaded(page, 'Dulce Encanto')

    const trackCalculatorWrites = (request: { url(): string; method(): string }) => {
      const url = request.url()
      if (writeMethods.has(request.method()) && /\/rest\/v1\/|\/rpc\//.test(url)) calculatorWrites.push(`${request.method()} ${url}`)
    }
    page.on('request', trackCalculatorWrites)
    await page.getByRole('button', { name: 'Abrir menú' }).click()
    await page.getByRole('navigation', { name: 'Módulos complementarios' }).getByRole('link', { name: 'Calculadora de costo' }).click()
    await expect(page).toHaveURL(/\/calculadora-costos$/)
    await expect(page.getByText('Merma', { exact: false }).first()).toBeVisible()
    await expect(page.getByLabel('Ganancia sobre costo (%)')).toHaveCount(0)
    await expect(page.getByText('Ninguno agregado')).toBeVisible()
    await expect(page.getByText('Sin entrega')).toBeVisible()
    await expect(page.getByLabel('Costo interno de entrega')).toHaveCount(0)
    await page.getByRole('button', { name: 'Editar parámetros' }).click()
    await expect(page.getByLabel('Merma (%)')).toHaveValue('12')
    await expect(page.getByText('El overhead se asigna por horas productivas.')).toBeVisible()
    await expect(page.getByLabel('Costo por hora')).toHaveValue('100')
    await expect(page.getByLabel('Ganancia sobre costo (%)')).toHaveValue('60')
    await expect(page.getByText('Agrega tus costos para ver el resultado.')).toBeVisible()
    await expect(page.locator('.cost-inline-result')).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Navegación principal' }).getByRole('link')).toHaveCount(5)

    const formatNio = (amount: number) => `C$ ${new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
    await page.getByLabel('Nombre del producto').fill('Cupcakes de vainilla')
    await page.getByLabel('Cantidad o rendimiento').fill('24')
    await page.getByLabel('Unidad').fill('cupcakes')
    await page.getByLabel('Costo total de ingredientes').fill('420')
    await page.getByLabel('Horas estimadas de trabajo').fill('2')
    await page.getByRole('button', { name: 'Agregar gasto' }).click()
    await page.getByRole('button', { name: 'Caja', exact: true }).click()
    await page.getByLabel('Categoría del gasto').selectOption('packaging')
    await page.getByLabel('Descripción del gasto').fill('Caja')
    await page.getByLabel('Costo del gasto').fill('80')
    await page.getByRole('button', { name: 'Configurar' }).click()
    await page.getByLabel('Costo interno de entrega').fill('100')
    await page.getByLabel('Cobro de entrega al cliente').fill('150')
    const productionCostRow = page.locator('.cost-result-row').filter({ hasText: 'Costo de producción' })
    await expect(productionCostRow).toContainText(formatNio(750.4))
    await expect(page.locator('.cost-suggested-price')).toContainText(formatNio(1200.64))
    await expect(page.locator('.cost-suggested-price')).toContainText(`${formatNio(50.03)} / cupcakes`)
    await expect(page.locator('.cost-suggested-total')).toContainText(formatNio(1350.64))
    await expect(page.getByText('Indica un precio final para conocer tu ganancia y margen real.')).toBeVisible()
    await expect(page.getByText('Ganancia estimada', { exact: true })).toHaveCount(0)

    await page.getByRole('button', { name: 'Usar precio sugerido' }).click()
    await expect(page.getByLabel('Precio que piensas cobrar')).toHaveValue('1350.64')
    await expect(page.getByText('Ganancia estimada', { exact: true })).toBeVisible()
    await expect(page.getByText('Margen real sobre venta', { exact: true })).toBeVisible()

    await page.getByLabel('Precio que piensas cobrar').fill('1600')
    await expect(page.getByText('Ganancia estimada', { exact: true }).locator('..')).toContainText(formatNio(749.6))
    await expect(page.getByText('Margen real sobre venta', { exact: true }).locator('..')).toContainText('46.85%')
    await page.getByLabel('Precio que piensas cobrar').fill('800')
    await expect(page.getByText('Este precio no cubre el costo estimado.')).toBeVisible()
    await page.getByLabel('Ganancia sobre costo (%)').fill('80')
    await expect(page.locator('.cost-suggested-price')).toContainText(formatNio(1350.72))
    await page.getByRole('button', { name: 'Guardar como predeterminados' }).click()
    await expect(page.getByText('Valores predeterminados guardados')).toBeVisible()
    await page.getByRole('button', { name: 'Restablecer' }).click()
    await expect(page.getByLabel('Nombre del producto')).toHaveValue('')
    await expect(page.getByLabel('Cantidad o rendimiento')).toHaveValue('1')
    await expect(page.getByLabel('Unidad')).toHaveValue('unidad')
    await expect(page.getByLabel('Costo total de ingredientes')).toHaveValue('')
    await expect(page.getByLabel('Ganancia sobre costo (%)')).toHaveCount(0)
    await page.getByRole('button', { name: 'Editar parámetros' }).click()
    await expect(page.getByLabel('Ganancia sobre costo (%)')).toHaveValue('80')
    await expect(page.getByText('Agrega tus costos para ver el resultado.')).toBeVisible()

    page.off('request', trackCalculatorWrites)
    expect(calculatorWrites).toHaveLength(1)
    expect(calculatorWrites[0]).toContain('/rest/v1/arpe_cost_settings')
    expect(calculatorWrites.some(write => /arpe_quotes|arpe_orders|arpe_quote_items/.test(write))).toBe(false)
    expect(pageErrors).toEqual([])
  })
}

for (const theme of ['light', 'dark'] as const) {
  test(`quick cost calculator layout is clear at target sizes in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 739 })
    await page.emulateMedia({ colorScheme: theme })
    await page.addInitScript(savedTheme => localStorage.setItem('ejnexa-theme', savedTheme), theme)
    await mockBackend(page, true)
    await login(page)
    await expectDashboardLoaded(page, 'Dulce Encanto')
    await page.goto('/calculadora-costos')
    await expect(page.getByRole('heading', { name: 'Calculadora de costo.' })).toBeVisible()
    await page.getByRole('button', { name: 'Editar parámetros' }).click()
    await page.getByLabel('Costo total de ingredientes').fill('420')
    await page.getByRole('button', { name: 'Agregar gasto' }).click()
    await page.getByRole('button', { name: 'Caja', exact: true }).click()
    await page.getByLabel('Descripción del gasto').fill('Caja')
    await page.getByLabel('Costo del gasto').fill('80')
    await page.getByRole('button', { name: 'Configurar' }).click()
    await page.getByLabel('Costo interno de entrega').fill('100')
    await page.getByLabel('Cobro de entrega al cliente').fill('150')
    await page.getByRole('button', { name: 'Usar precio sugerido' }).click()
    await page.locator('.quick-cost-breakdown > summary').click()

    await expect(page.locator('.quick-cost-item select[aria-label="Categoría del gasto"]')).toBeVisible()
    await expect(page.locator('.quick-cost-item input[aria-label="Descripción del gasto"]')).toBeVisible()
    await expect(page.locator('.quick-cost-item input[aria-label="Costo del gasto"]')).toBeVisible()
    await expect(page.locator('.quick-cost-item .cost-remove-item')).toBeVisible()

    const calculatorViewports = [[320, 739], [360, 800], [390, 844], [400, 739], [768, 1024], [884, 1024], [1440, 900]] as const
    for (const [width, height] of calculatorViewports) {
      await page.setViewportSize({ width, height })
      await page.evaluate(() => window.scrollTo(0, 0))
      const geometry = await page.evaluate(() => {
        const overlaps: string[] = []
        const expenseItem = document.querySelector('.quick-cost-item')
        const expenseControls = expenseItem
          ? Array.from(expenseItem.querySelectorAll('select, input, .cost-remove-item'))
          : []
        if (expenseControls.length !== 4) overlaps.push('expense item fields/delete button missing')
        for (let firstIndex = 0; firstIndex < expenseControls.length; firstIndex += 1) {
          const first = expenseControls[firstIndex].getBoundingClientRect()
          for (let secondIndex = firstIndex + 1; secondIndex < expenseControls.length; secondIndex += 1) {
            const second = expenseControls[secondIndex].getBoundingClientRect()
            if (first.right > second.left + 1 && first.left < second.right - 1 && first.bottom > second.top + 1 && first.top < second.bottom - 1) {
              overlaps.push('expense item control overlap')
            }
          }
        }
        for (const label of Array.from(document.querySelectorAll('.cost-calculator-page label'))) {
          const control = label.querySelector('input,select,textarea')
          if (!control) continue
          const controlBox = control.getBoundingClientRect()
          const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT)
          let node: Node | null
          while ((node = walker.nextNode())) {
            if (!node.textContent?.trim() || (node.parentElement && node.parentElement.closest('small'))) continue
            const range = document.createRange()
            range.selectNodeContents(node)
            for (const textBox of Array.from(range.getClientRects())) {
              if (textBox.width > 0 && textBox.height > 0 && textBox.bottom > controlBox.top + 1 && textBox.top < controlBox.bottom - 1) {
                overlaps.push(`label/input: ${label.textContent?.trim().slice(0, 42)}`)
              }
            }
          }
        }
        for (const section of Array.from(document.querySelectorAll('.cost-calculator-page .cost-step, .cost-calculator-page .quick-cost-settings'))) {
          const heading = section.querySelector('.section-title, .quick-cost-settings-heading')
          const control = section.querySelector('input,select,textarea')
          if (!heading || !control) continue
          if (heading.getBoundingClientRect().bottom > control.getBoundingClientRect().top + 1) overlaps.push(`heading/input: ${section.className}`)
        }
        return { scrollWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth, overlaps }
      })
      expect(geometry.scrollWidth, `Calculator overflow at ${width}px in ${theme}`).toBeLessThanOrEqual(geometry.viewportWidth)
      expect(geometry.overlaps, `Calculator content overlaps at ${width}px in ${theme}`).toEqual([])
      await page.screenshot({ path: testInfo.outputPath(`quick-cost-${theme}-${width}x${height}.png`) })
      if ([320, 400, 768, 1440].includes(width)) {
        await page.locator('.cost-calculator-results').evaluate(element => {
          window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 12)
        })
        await page.screenshot({ path: testInfo.outputPath(`quick-cost-result-${theme}-${width}x${height}.png`) })
        await page.evaluate(() => window.scrollTo(0, 0))
      }
    }

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    const bottomSpacing = await page.evaluate(() => ({
      contentBottom: document.querySelector('.cost-calculator-roadmap')?.getBoundingClientRect().bottom ?? 0,
      navTop: document.querySelector('.bottom-nav')?.getBoundingClientRect().top ?? innerHeight,
    }))
    expect(bottomSpacing.contentBottom, `Bottom navigation covers calculator content in ${theme}`).toBeLessThanOrEqual(bottomSpacing.navTop)
  })
}
