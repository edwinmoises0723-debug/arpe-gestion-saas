import { expect, test, type Page } from '@playwright/test'
import type { Business, CatalogRequest, CatalogRequestItem } from '../src/lib/database.types'

const ownerId = '11111111-1111-4111-8111-111111111111'
const businessId = '22222222-2222-4222-8222-222222222222'
const user = { id: ownerId, aud: 'authenticated', role: 'authenticated', email: 'inbox@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
const session = { access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }
const business: Business = {
  id: businessId, owner_id: ownerId, name: 'Dulce Encanto', slogan: '', logo_path: null, description: '', whatsapp: '', email: '', address: '', currency: 'NIO',
  default_deposit_type: 'percentage', default_deposit_value: 50, default_document_format: 'a4', show_slogan_on_documents: true,
  show_description_on_documents: true, show_whatsapp_on_documents: true, show_email_on_documents: true, show_address_on_documents: true,
  document_footer_message: '', catalog_slug: null, public_catalog_enabled: false, public_catalog_show_whatsapp: true, public_catalog_logo_path: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}
const requests: CatalogRequest[] = [
  { id: 'request-a', business_id: businessId, request_number: 'SOL-2026-0001', client_request_key: 'key-a', customer_name: 'María Gómez', customer_phone: '+505 8888 1111', desired_date: '2026-11-02', details: 'Sin nueces', status: 'new', converted_quote_id: null, submitted_at: '2026-10-24T18:30:00.000Z', updated_at: '2026-10-24T18:30:00.000Z', reviewed_at: null, converted_at: null },
  { id: 'request-b', business_id: businessId, request_number: 'SOL-2026-0002', client_request_key: 'key-b', customer_name: 'Carlos Ruiz', customer_phone: '', desired_date: null, details: '', status: 'reviewing', converted_quote_id: null, submitted_at: '2026-10-24T17:30:00.000Z', updated_at: '2026-10-24T17:30:00.000Z', reviewed_at: '2026-10-24T17:31:00.000Z', converted_at: null },
]
const requestItems: CatalogRequestItem[] = [
  { id: 'item-a', request_id: 'request-a', business_id: businessId, catalog_product_id: 'product-a', position: 1, product_name_snapshot: 'Pastel de Chocolate', category_snapshot: 'Pasteles', quantity: 2, unit_label_snapshot: 'unidad', default_portions_snapshot: 12, public_price_mode_snapshot: 'exact', public_unit_price_snapshot: 850, created_at: '2026-10-24T18:30:00.000Z' },
  { id: 'item-b', request_id: 'request-a', business_id: businessId, catalog_product_id: 'product-b', position: 2, product_name_snapshot: 'Topper personalizado', category_snapshot: 'Decoración', quantity: 1, unit_label_snapshot: 'servicio', default_portions_snapshot: null, public_price_mode_snapshot: 'contact', public_unit_price_snapshot: null, created_at: '2026-10-24T18:30:00.000Z' },
]

async function mockBackend(page: Page) {
  const requestsState = structuredClone(requests)
  let quoteSaveCalls = 0
  await page.route('**/auth/v1/**', async route => {
    const url = route.request().url()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/user') ? user : url.includes('/logout') ? {} : session) })
  })
  await page.route('**/rest/v1/arpe_businesses*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([business]) }))
  await page.route('**/rest/v1/arpe_catalog_requests*', async route => {
    if (route.request().method() === 'HEAD') {
      const count = requestsState.filter(request => request.status === 'new').length
      return route.fulfill({ status: 200, headers: { 'content-range': `*/${count}`, 'access-control-expose-headers': 'content-range' }, body: '' })
    }
    const query = new URL(route.request().url()).searchParams
    const rows = query.get('business_id') === `eq.${businessId}` ? requestsState : []
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
  })
  await page.route('**/rest/v1/arpe_catalog_request_items*', async route => {
    const query = new URL(route.request().url()).searchParams
    const rows = requestItems.filter(item => query.get('business_id') === `eq.${businessId}` && query.get('request_id')?.includes(item.request_id))
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
  })
  await page.route('**/rest/v1/rpc/ejnexa_mark_catalog_request_reviewing', async route => {
    const input = route.request().postDataJSON() as { p_request_id: string }
    const request = requestsState.find(row => row.id === input.p_request_id)
    if (!request || request.status !== 'new') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Request unavailable' }) })
    request.status = 'reviewing'
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('reviewing') })
  })
  await page.route('**/rest/v1/arpe_catalog_products*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
    { id: 'product-a', business_id: businessId, name: 'Current catalog cake', category: 'Pasteles', description: '', unit_label: 'unidad', default_unit_price: 999, default_portions: 10, default_flavor: '', default_filling: '', default_decoration: '', default_extras: '', is_active: true, image_path: null, is_public: true, public_price_mode: 'exact', public_sort_order: 0, created_at: '', updated_at: '' },
  ]) }))
  await page.route('**/rest/v1/arpe_cost_settings*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().method() === 'GET' ? [] : [{ business_id: businessId, waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 0, markup_percent: 60 }]) }))
  await page.route('**/rest/v1/arpe_quotes*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/rest/v1/arpe_quote_items*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/rest/v1/arpe_orders*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/rest/v1/arpe_order_items*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/rest/v1/arpe_payments*', async route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }))
  await page.route('**/rest/v1/rpc/arpe_save_quote_bundle', async route => {
    quoteSaveCalls += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'saved-quote', quote_number: 'COT-2026-0001' }]) })
  })
  return { quoteSaveCalls: () => quoteSaveCalls }
}

async function openInbox(page: Page) {
  await page.goto('/')
  await page.getByLabel('Correo electrónico').fill('inbox@example.test')
  await page.getByLabel('Contraseña', { exact: true }).fill('Example-password-123')
  await page.getByRole('button', { name: 'Entrar a mi negocio' }).click()
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible()
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await expect(page.locator('.workspace-request-count')).toHaveText('1')
  await page.getByRole('link', { name: /Solicitudes/ }).click()
  await expect(page.getByRole('heading', { name: 'Solicitudes.' })).toBeVisible()
}

async function expectNoHorizontalOverflow(page: Page) {
  const result = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
  expect(result.document, `horizontal overflow at ${result.viewport}px`).toBeLessThanOrEqual(result.viewport)
}

test('inbox muestra snapshots, filtros y detalle sin overflow en móvil, Fold y desktop', async ({ page }) => {
  await mockBackend(page)
  await openInbox(page)
  await expect(page.getByRole('button', { name: /SOL-2026-0001/ })).toBeVisible()
  await page.getByLabel('Buscar por número o cliente').fill('maria gomez')
  await expect(page.getByRole('button', { name: /SOL-2026-0001/ })).toBeVisible()
  await page.getByLabel('Buscar por número o cliente').fill('')
  await page.getByRole('button', { name: /En revisión 1/ }).click()
  await expect(page.getByRole('button', { name: /SOL-2026-0002/ })).toBeVisible()
  await page.getByRole('button', { name: /Todas 2/ }).click()

  for (const width of [320, 360, 390, 768, 884, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expectNoHorizontalOverflow(page)
    await page.getByRole('button', { name: /SOL-2026-0001/ }).click()
    await expect(page.getByText('Topper personalizado', { exact: true })).toBeVisible()
    await expect(page.getByText('Consultar', { exact: true })).toBeVisible()
    await expectNoHorizontalOverflow(page)
    if (width < 768) await page.getByRole('button', { name: 'Volver a solicitudes' }).click()
  }
})

test('marca en revisión, actualiza badge y prepara una cotización editable desde snapshots', async ({ page }) => {
  const backend = await mockBackend(page)
  await openInbox(page)
  await page.getByRole('button', { name: /SOL-2026-0001/ }).click()
  await page.getByRole('button', { name: 'Marcar en revisión' }).click()
  await expect(page.locator('.request-detail-heading').getByText('En revisión')).toBeVisible()
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await expect(page.locator('.workspace-request-count')).toHaveCount(0)
  await page.getByRole('link', { name: /Solicitudes/ }).click()
  await page.getByRole('button', { name: 'Preparar cotización' }).click()
  await expect(page.getByRole('heading', { name: 'Preparar cotización' })).toBeVisible()
  await expect(page.getByLabel('Nombre del cliente')).toHaveValue('María Gómez')
  await expect(page.getByLabel('Fecha')).toHaveValue('2026-11-02')
  await expect(page.getByLabel('Observaciones generales')).toHaveValue('Sin nueces')
  await expect(page.getByRole('textbox', { name: 'Producto' }).first()).toHaveValue('Pastel de Chocolate')
  await expect(page.getByText(/Precio pendiente de definir: Topper personalizado/i)).toBeVisible()
  await page.getByRole('button', { name: 'Guardar cotización' }).click()
  await expect(page.getByRole('alert')).toContainText('Define un precio mayor que cero para: Topper personalizado.')
  expect(backend.quoteSaveCalls()).toBe(0)
  await page.getByLabel('Precio unitario').nth(1).fill('150')
  await expect(page.getByText(/Precio pendiente de definir/i)).toHaveCount(0)
  await page.getByRole('button', { name: 'Guardar cotización' }).click()
  await expect.poll(() => backend.quoteSaveCalls()).toBe(1)
})
