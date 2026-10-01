import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { inflateSync } from 'node:zlib'
import type { Business, CatalogProduct, Quote, QuoteBundleHeader, QuoteBundleItem, QuoteItem } from '../src/lib/database.types'

// Browser-only integration fixtures. Every Supabase request is intercepted, including writes.
const business: Business = { id: '22222222-2222-4222-8222-222222222222', owner_id: '11111111-1111-4111-8111-111111111111', name: 'Negocio local de prueba', logo_path: null, slogan: '', description: '', whatsapp: '', email: '', address: '', currency: 'NIO', created_at: '', updated_at: '' }
const catalog: CatalogProduct = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', business_id: business.id, name: 'Pastel de Chocolate Premium', category: 'Pasteles', description: '', unit_label: 'pastel', default_unit_price: 2000, default_portions: 20, default_flavor: 'Chocolate', default_filling: 'Ganache', default_decoration: 'Floral', default_extras: '', is_active: true, created_at: '', updated_at: '' }
const baseQuote: Quote = { id: '33333333-3333-4333-8333-333333333333', business_id: business.id, quote_number: 'ARPE-COT-2026-0001', customer_name: 'Cliente local', customer_phone: '', product: catalog.name, portions: 20, flavor: 'Chocolate', filling: 'Ganache', decoration: 'Floral', extras: '', delivery_date: null, delivery_time: null, notes: '', total_amount: 2000, deposit_type: 'percentage', deposit_value: 50, deposit_required: 1000, status: 'sent', delivery_internal_cost: 0, delivery_customer_charge: 0, created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z' }

async function backend(page: Page, seed = 0) {
  let quote: Quote | null = seed ? { ...baseQuote } : null
  let items: QuoteItem[] = seed ? [{ ...baseQuote, id: 'item-1', quote_id: baseQuote.id, catalog_product_id: catalog.id, position: 1, quantity: 1, unit_label: 'pastel', unit_price: 2000, line_total: 2000 }] : []
  let products = [{ ...catalog }]
  let bundle: QuoteBundleItem[] = []
  if (seed === 3) {
    items = ['Pastel de Chocolate Premium', 'Tres Leches', 'Alfajores'].map((product, index) => ({ ...items[0], id: `item-${index}`, position: index + 1, product, quantity: index === 2 ? 24 : 1, unit_label: 'unidad', unit_price: [2000, 850, 35][index], line_total: [2000, 850, 840][index] }))
    quote = { ...baseQuote, total_amount: 3840, deposit_required: 1920, delivery_customer_charge: 150 }
  }
  const user = { id: business.owner_id, aud: 'authenticated', role: 'authenticated', email: 'local@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
  await page.route('**/*.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url()), table = url.pathname.split('/').at(-1)
    let response: unknown = []
    if (url.pathname.startsWith('/auth/')) response = table === 'user' ? user : { user, access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 }
    else if (table === 'arpe_businesses') response = [business]
    else if (table === 'arpe_catalog_products') {
      if (request.method() === 'PATCH') { products[0] = { ...products[0], ...request.postDataJSON() }; response = products[0] }
      else if (request.method() === 'POST') { const created = { ...catalog, ...request.postDataJSON(), id: 'catalog-new' }; products = [...products, created]; response = created }
      else response = products
    } else if (table === 'arpe_cost_settings') response = [{ business_id: business.id, waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60 }]
    else if (table === 'arpe_quotes') response = quote ? [quote] : []
    else if (table === 'arpe_quote_items') response = items
    else if (table === 'arpe_quote_item_costs') response = bundle.flatMap((item, index) => item.cost ? [{ ...item.cost, quote_item_id: items[index].id }] : [])
    else if (table === 'arpe_quote_item_cost_items') response = bundle.flatMap((item, index) => item.direct_costs.map(d => ({ ...d, quote_item_id: items[index].id })))
    else if (table === 'arpe_orders' && seed === 3) response = [{ ...quote, id: 'order-1', quote_id: baseQuote.id, order_number: 'ARPE-PED-2026-0001', source_quote_number: baseQuote.quote_number, status: 'confirmed', internal_cost_total: 999, estimated_profit: 2841, real_margin_percent: 73.98 }]
    else if (table === 'arpe_order_items' && seed === 3) response = items.map(item => ({ ...item, order_id: 'order-1', source_quote_item_id: item.id, internal_cost_total: 333, estimated_profit: 100, real_margin_percent: 30 }))
    else if (table === 'arpe_save_quote_bundle') {
      const input = request.postDataJSON() as { p_header: QuoteBundleHeader; p_items: QuoteBundleItem[] }
      bundle = structuredClone(input.p_items)
      items = bundle.map((item, index) => ({ ...item, id: `item-${index}`, business_id: business.id, quote_id: baseQuote.id, position: index + 1, line_total: Math.round(item.quantity * item.unit_price * 100) / 100, created_at: '', updated_at: '' }))
      const total = items.reduce((sum, i) => sum + i.line_total, 0) + input.p_header.delivery_customer_charge
      quote = { ...baseQuote, ...input.p_header, product: items[0].product, total_amount: total, deposit_required: input.p_header.deposit_type === 'percentage' ? total * input.p_header.deposit_value / 100 : input.p_header.deposit_value }
      response = [quote]
    } else if (!['arpe_orders', 'arpe_order_items', 'arpe_payments', 'arpe_order_delivery_history'].includes(table ?? '')) return route.fulfill({ status: 500, body: `Unexpected mock request: ${table}` })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) })
  })
  await page.goto('/')
  await page.getByLabel('Correo electrónico').fill('local@example.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('Example-password-123')
  await page.getByRole('button', { name: 'Entrar a mi negocio' }).click()
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeVisible()
}

test('mobile catalog, independent lines, local cost snapshot, save/reload and secondary-product search', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 360, height: 800 })
  await backend(page)
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await expect(page.getByRole('dialog', { name: 'Menú del negocio' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Abrir menú' })).toBeFocused()
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('link', { name: 'Catálogo', exact: true }).click()
  await expect(page.getByRole('heading', { name: catalog.name })).toBeVisible()
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  await page.getByLabel('Precio habitual').fill('2100')
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await page.getByRole('link', { name: 'Cotizar', exact: true }).click()
  await page.getByRole('button', { name: 'Crear mi primera cotización' }).click()
  await page.getByLabel('Nombre del cliente').fill('Cliente multiproducto local')
  const first = page.getByRole('article', { name: 'Producto 1', exact: true })
  await first.getByLabel('Seleccionar del catálogo').selectOption(catalog.id)
  await expect(first.getByLabel('Precio unitario', { exact: true })).toHaveValue('2100')
  await first.getByRole('button', { name: 'Iniciar asistente de costos' }).click()
  await first.getByText('Mostrar asistente de costos', { exact: true }).click()
  await first.getByLabel('Costo de ingredientes para').fill('700')
  await first.getByLabel('Ganancia sobre costo (%)', { exact: false }).fill('80')
  await page.getByRole('button', { name: 'Duplicar producto 1' }).click()
  const second = page.getByRole('article', { name: 'Producto 2', exact: true })
  await second.getByLabel('Producto', { exact: true }).fill('Alfajor exclusivo')
  await second.getByLabel('Cantidad', { exact: true }).fill('24')
  await second.getByLabel('Precio unitario', { exact: true }).fill('35')
  await page.getByRole('button', { name: 'Agregar producto', exact: false }).click()
  const third = page.getByRole('article', { name: 'Producto 3', exact: true })
  await third.getByLabel('Producto', { exact: true }).fill('Tres Leches')
  await third.getByLabel('Precio unitario', { exact: true }).fill('850')
  await page.getByLabel('Cobro de entrega al cliente').fill('150')
  await page.getByLabel('Porcentaje de anticipo (%)').fill('50')
  await page.getByRole('button', { name: 'Guardar cotización' }).click()
  await expect(page.getByText(/se guardó correctamente/)).toBeVisible()
  await page.reload()
  await page.getByPlaceholder('Buscar cliente, cotización o producto').fill('alfajor exclusivo')
  await expect(page.locator('.quote-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Editar ARPE-COT-2026-0001' }).click()
  await expect(page.locator('.bundle-item')).toHaveCount(3)
  await first.getByText('Mostrar asistente de costos', { exact: true }).click()
  await expect(first.getByLabel('Ganancia sobre costo (%)', { exact: false })).toHaveValue('80')
  await expect(second.getByLabel('Producto', { exact: true })).toHaveValue('Alfajor exclusivo')
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 360)
  await page.screenshot({ path: 'test-results/multiproduct-mobile.png', fullPage: true })
})

test('single product A4 PNG/PDF and thermal document layouts', async ({ page }) => {
  test.setTimeout(120000)
  await backend(page, 1)
  await page.goto(`/documento/cotizacion/${baseQuote.id}`)
  const document = page.locator('.client-document')
  await expect(document.getByText(catalog.name, { exact: true })).toBeVisible()
  await expect(document.getByRole('heading', { name: 'Detalle del producto' })).toBeVisible()
  const title = document.locator('[data-document-section="product"] h3')
  expect(await title.evaluate(el => getComputedStyle(el).whiteSpace)).toBe('nowrap')
  await page.screenshot({ path: 'test-results/multiproduct-a4.png', fullPage: true })
  const pngPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guardar imagen' }).click()
  const png = await pngPromise; await png.saveAs('test-results/multiproduct-export.png')
  expect((await readFile(await png.path())).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  const pdfPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar PDF' }).click()
  const pdf = await pdfPromise; await pdf.saveAs('test-results/multiproduct-export.pdf')
  const pdfText = (await readFile(await pdf.path())).toString('latin1')
  expect(pdfText.match(/\/Type \/Page\b/g)).toHaveLength(1)
  for (const format of ['Térmica 80 mm', 'Térmica 58 mm']) {
    await page.getByRole('button', { name: 'Imprimir', exact: true }).click()
    await page.getByRole('radio', { name: new RegExp(format) }).check()
    await page.getByRole('button', { name: 'Vista previa de impresión', exact: true }).click()
    const productTop = await document.locator('.document-product-item').evaluate(el => el.getBoundingClientRect().top)
    const titleBottom = await title.evaluate(el => el.getBoundingClientRect().bottom)
    expect(productTop).toBeGreaterThan(titleBottom)
    await page.screenshot({ path: `test-results/multiproduct-${format.includes('80') ? '80' : '58'}.png`, fullPage: true })
    await page.getByRole('button', { name: 'Volver al documento', exact: true }).click()
  }
})

test('three products stay independent in order details, documents and multipage exports', async ({ page }) => {
  test.setTimeout(120000)
  await page.setViewportSize({ width: 768, height: 1024 })
  await backend(page, 3)
  await page.goto('/pedidos?order=order-1')
  await expect(page.getByRole('heading', { name: 'Productos del pedido' })).toBeVisible()
  await expect(page.locator('.order-product-item')).toHaveCount(3)
  await page.goto('/documento/pedido/order-1')
  const document = page.locator('.client-document')
  await expect(document.locator('.document-product-item')).toHaveCount(3)
  await expect(document).not.toContainText('Costo interno')
  await expect(document).not.toContainText('Ganancia')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar PDF' }).click()
  const download = await downloadPromise
  await download.saveAs('test-results/three-products.pdf')
  const pdf = (await readFile(await download.path())).toString('latin1')
  const pages = pdf.match(/\/Type \/Page\b/g) ?? []
  expect(pages.length).toBeGreaterThan(1)
  // Every PDF page contains an image; no trailing empty page is created.
  const contents = [...pdf.matchAll(/\/Contents (\d+) 0 R/g)]
  expect(contents).toHaveLength(pages.length)
  for (const content of contents) {
    const stream = pdf.match(new RegExp(`${content[1]} 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\r?\\n([\\s\\S]*?)\\r?\\nendstream`))
    expect(stream).not.toBeNull()
    const bytes = Buffer.from(stream![2], 'latin1')
    const commands = (stream![1].includes('FlateDecode') ? inflateSync(bytes) : bytes).toString('latin1')
    expect(commands).toMatch(/\/I\d+ Do/)
  }
  const pngPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Guardar imagen' }).click()
  await (await pngPromise).saveAs('test-results/three-products.png')
  for (const label of ['Térmica 80 mm', 'Térmica 58 mm']) {
    await page.getByRole('button', { name: 'Imprimir', exact: true }).click()
    await page.getByRole('radio', { name: new RegExp(label) }).check()
    await page.getByRole('button', { name: 'Vista previa de impresión', exact: true }).click()
    const boxes = await document.locator('.document-product-item').evaluateAll(els => els.map(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom })))
    for (let i = 1; i < boxes.length; i++) expect(boxes[i].top).toBeGreaterThan(boxes[i - 1].bottom)
    await page.emulateMedia({ media: 'print' })
    expect(await document.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.emulateMedia({ media: 'screen' })
    await page.getByRole('button', { name: 'Volver al documento', exact: true }).click()
  }
})
