import { expect, test } from '@playwright/test'
import type { PublicCatalogProduct, PublicCatalogProfile } from '../src/lib/database.types'
import type { Business } from '../src/lib/database.types'
import type { Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'

const profile: PublicCatalogProfile = {
  catalog_slug: 'arpe-dulce-encanto', name: 'ARPE Dulce Encanto', slogan: 'Hecho con cariño',
  description: 'Repostería artesanal para compartir momentos especiales.', currency: 'NIO',
  public_catalog_logo_path: 'owner-1/business-1/profile/logo.png', whatsapp: '+505 8888-1111',
}
const products: PublicCatalogProduct[] = [
  { id: 'product-1', name: 'Pastel de Chocolate', category: 'Pasteles', description: 'Pastel artesanal con ganache.', unit_label: 'pastel', default_unit_price: 850, default_portions: 20, image_path: 'owner-1/business-1/products/pastel.png', public_price_mode: 'exact', public_sort_order: 1 },
  { id: 'product-2', name: 'Tres Leches', category: 'Postres', description: 'Suave y fresco.', unit_label: 'unidad', default_unit_price: 1200, default_portions: null, image_path: null, public_price_mode: 'from', public_sort_order: 2 },
  { id: 'product-3', name: 'Alfajor especial', category: 'Galletas', description: 'Relleno artesanal.', unit_label: 'unidad', default_unit_price: null, default_portions: null, image_path: null, public_price_mode: 'contact', public_sort_order: 3 },
]
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/4XcAAAAASUVORK5CYII=', 'base64')

test('public catalog is available without login and supports discovery, detail, empty and error states', async ({ page }, testInfo) => {
  const paths: string[] = []
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { (window as Window & { __catalogCopied?: string }).__catalogCopied = value } } })
  })
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', error => pageErrors.push(error.message))

  await page.route('**/*.supabase.co/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.startsWith('/rest/v1/')) paths.push(url.pathname)
    if (url.pathname.startsWith('/storage/v1/object/public/ejnexa-catalog-media/')) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng })
      return
    }
    if (!url.pathname.startsWith('/rest/v1/rpc/')) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Unexpected endpoint' }) })
      return
    }
    const body = request.postDataJSON() as { p_slug?: string }
    const slug = body.p_slug
    if (slug === 'error') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'internal test detail' }) })
      return
    }
    if (url.pathname.endsWith('/ejnexa_get_public_catalog_profile')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(slug === 'no-existe' ? [] : [{ ...profile, catalog_slug: slug, whatsapp: slug === 'sin-whatsapp' ? null : profile.whatsapp }]) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(slug === 'vacio' || slug === 'no-existe' ? [] : products) })
  })

  await gotoPublicCatalog(page, 'arpe-dulce-encanto')
  const origin = new URL(page.url()).origin
  await expect(page).toHaveURL(/\/catalogo\/arpe-dulce-encanto$/)
  await expect(page.getByRole('heading', { name: 'ARPE Dulce Encanto' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Nuestros productos' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Logo de ARPE Dulce Encanto' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver detalle de Pastel de Chocolate' })).toContainText('C$850')
  await expect(page.getByRole('button', { name: 'Ver detalle de Tres Leches' })).toContainText(/Desde C\$1[,.]?200/)
  await expect(page.getByRole('button', { name: 'Ver detalle de Alfajor especial' })).toContainText('Consultar precio')
  await expect(page.getByRole('button', { name: 'Ver detalle de Alfajor especial' })).not.toContainText('0')
  await expect.poll(() => page.title()).toBe('ARPE Dulce Encanto | Catálogo')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', profile.description)
  await expect(page.locator('.public-footer')).toContainText('Catálogo impulsado por EJNEXA Business')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('public-catalog-390.png'), fullPage: true })
  expect(paths.every(path => path.startsWith('/rest/v1/rpc/'))).toBe(true)
  expect(paths.some(path => /arpe_(businesses|catalog_products|quotes|orders|payments)/.test(path))).toBe(false)
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])

  await page.getByRole('button', { name: 'Compartir', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Enlace del catálogo copiado.')
  await expect.poll(() => page.evaluate(() => (window as Window & { __catalogCopied?: string }).__catalogCopied)).toBe(`${origin}/catalogo/arpe-dulce-encanto`)
  let whatsappTarget = ''
  await page.context().route('https://wa.me/**', async route => { whatsappTarget = route.request().url(); await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>intercepted WhatsApp</title>' }) })
  const whatsappPopupPromise = page.waitForEvent('popup')
  await page.getByRole('button', { name: 'Consultar por WhatsApp' }).click()
  const whatsappPopup = await whatsappPopupPromise
  await expect.poll(() => whatsappTarget).toContain('https://wa.me/50588881111?text=')
  await expect.poll(() => decodeURIComponent(whatsappTarget)).toContain('vi su catálogo de ARPE Dulce Encanto')
  await whatsappPopup.close()

  await page.getByRole('button', { name: 'Código QR' }).click()
  const qrDialog = page.getByRole('dialog', { name: 'Código QR del catálogo' })
  await expect(qrDialog).toBeVisible()
  await expect(qrDialog.getByRole('img', { name: /Código QR para abrir/ })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('public-catalog-qr-390.png'), fullPage: true })
  const qrDownloadPromise = page.waitForEvent('download')
  await qrDialog.getByRole('button', { name: 'Descargar QR' }).click()
  expect((await qrDownloadPromise).suggestedFilename()).toBe('catalogo-arpe-dulce-encanto-qr.png')
  await qrDialog.getByRole('button', { name: 'Cerrar', exact: true }).click()

  const pdfDownloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar PDF' }).click()
  const pdfDownload = await pdfDownloadPromise
  expect(pdfDownload.suggestedFilename()).toBe('catalogo-arpe-dulce-encanto.pdf')
  const pdfBytes = await readFile(await pdfDownload.path() ?? '')
  expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('public-catalog-1440.png'), fullPage: true })
})

test('public catalog handles filters, detail, responsive widths and unavailable states', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.route('**/*.supabase.co/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.startsWith('/storage/v1/object/public/ejnexa-catalog-media/')) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng })
      return
    }
    if (!url.pathname.startsWith('/rest/v1/rpc/')) {
      await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Unexpected endpoint' }) })
      return
    }
    const slug = (request.postDataJSON() as { p_slug?: string }).p_slug
    if (slug === 'error') {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'internal test detail' }) })
      return
    }
    if (url.pathname.endsWith('/ejnexa_get_public_catalog_profile')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(slug === 'no-existe' ? [] : [{ ...profile, catalog_slug: slug, whatsapp: slug === 'sin-whatsapp' ? null : profile.whatsapp }]) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(slug === 'vacio' || slug === 'no-existe' ? [] : products) })
  })

  await gotoPublicCatalog(page, 'sin-whatsapp')
  await expect(page.getByRole('button', { name: 'Consultar por WhatsApp' })).toHaveCount(0)
  await page.getByRole('searchbox', { name: 'Buscar productos' }).fill('chocolate')
  await page.getByRole('button', { name: 'Pasteles', exact: true }).click()
  await expect(page.locator('.public-product-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Ver detalle de Pastel de Chocolate' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Buscar productos' }).fill('bizcocho')
  await expect(page.getByText('No encontramos productos con esos filtros.')).toBeVisible()
  await page.getByRole('button', { name: 'Limpiar filtros' }).click()
  await expect(page.locator('.public-product-card')).toHaveCount(3)
  await page.getByRole('button', { name: 'Ver detalle de Pastel de Chocolate' }).click()
  const dialog = page.getByRole('dialog', { name: 'Pastel de Chocolate' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('20 porciones')
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  for (const width of [320, 360, 390, 768, 884, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
    expect(dimensions.content, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport)
  }
  await gotoPublicCatalog(page, 'vacio')
  await expect(page.getByText('Muy pronto encontrarás nuestros productos aquí.')).toBeVisible()
  await gotoPublicCatalog(page, 'no-existe')
  await expect(page.getByRole('heading', { name: 'Este catálogo no está disponible' })).toBeVisible()
  await expect(page.getByText('ARPE Dulce Encanto')).toHaveCount(0)
  await gotoPublicCatalog(page, 'error')
  await expect(page.getByRole('heading', { name: 'No pudimos cargar el catálogo' })).toBeVisible()
  await page.getByRole('button', { name: 'Intentar de nuevo' }).click()
  await expect(page.getByRole('heading', { name: 'No pudimos cargar el catálogo' })).toBeVisible()
  expect(pageErrors).toEqual([])
})

test('public catalog persists a request once and keeps sharing attached to its receipt', async ({ page }, testInfo) => {
  const directTableRequests: string[] = []
  const submissionPayloads: Record<string, unknown>[] = []
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', error => pageErrors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value: string) => { (window as Window & { __requestCopied?: string }).__requestCopied = value } } })
  })
  await page.route('**/*.supabase.co/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.startsWith('/rest/v1/') && !url.pathname.includes('/rpc/')) directTableRequests.push(url.pathname)
    if (!url.pathname.startsWith('/rest/v1/rpc/')) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng })
      return
    }
    const payload = request.postDataJSON() as Record<string, unknown>
    const slug = payload.p_slug as string | undefined
    if (url.pathname.endsWith('/ejnexa_submit_catalog_request')) {
      submissionPayloads.push(payload)
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'request-id', request_number: 'SOL-2026-0001', status: 'new', submitted_at: new Date().toISOString() }]) })
      return
    }
    if (url.pathname.endsWith('/ejnexa_get_public_catalog_profile')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ ...profile, catalog_slug: slug, whatsapp: slug === 'sin-whatsapp' ? null : profile.whatsapp }]) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) })
  })

  await gotoPublicCatalog(page, 'arpe-dulce-encanto')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Ver detalle de Pastel de Chocolate' }).click()
  const productDetail = page.getByRole('dialog', { name: 'Pastel de Chocolate' })
  await productDetail.getByRole('button', { name: 'Agregar Pastel de Chocolate a solicitud' }).click()
  await expect(productDetail.getByText('Agregado')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(productDetail).not.toBeVisible()
  const pastelCard = page.locator('.public-product-card').filter({ has: page.getByRole('button', { name: 'Ver detalle de Pastel de Chocolate' }) })
  await pastelCard.getByRole('button', { name: 'Aumentar cantidad de Pastel de Chocolate' }).click()
  await page.screenshot({ path: testInfo.outputPath('public-catalog-selected-390.png'), fullPage: true })
  await page.getByRole('button', { name: 'Postres', exact: true }).click()
  const tresLechesCard = page.locator('.public-product-card').filter({ has: page.getByRole('button', { name: 'Ver detalle de Tres Leches' }) })
  await tresLechesCard.getByRole('button', { name: 'Agregar Tres Leches a solicitud' }).click()
  await page.getByRole('button', { name: /Mi solicitud · 2 productos/ }).click()
  const panel = page.getByRole('dialog', { name: 'Mi solicitud' })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('2 productos distintos')
  await expect(panel).toContainText('3 unidades en total')
  await expect(panel).toContainText('Los precios mostrados son referencias')
  await page.screenshot({ path: testInfo.outputPath('request-panel-390.png'), fullPage: true })
  await panel.getByLabel('Tu nombre').fill('María Gómez')
  const future = new Date()
  future.setDate(future.getDate() + 7)
  const futureDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`
  await panel.getByLabel(/¿Para qué fecha lo necesitas/).fill(futureDate)
  await panel.getByLabel(/Cuéntanos lo que necesitas/).fill('Pastel azul con temática de fútbol')
  await expect(panel.getByRole('region', { name: 'Revisa tu solicitud' })).toContainText('María Gómez')
  await page.screenshot({ path: testInfo.outputPath('request-review-390.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('public-catalog-selected-1440.png'), fullPage: true })
  await page.screenshot({ path: testInfo.outputPath('request-panel-1440.png'), fullPage: true })

  await panel.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(panel.getByRole('heading', { name: 'Solicitud enviada' })).toBeVisible()
  await expect(panel.getByText('SOL-2026-0001')).toBeVisible()
  expect(submissionPayloads).toHaveLength(1)
  expect(Object.keys(submissionPayloads[0]).sort()).toEqual(['p_client_request_key', 'p_customer_name', 'p_customer_phone', 'p_desired_date', 'p_details', 'p_items', 'p_slug'].sort())
  expect(submissionPayloads[0]).toMatchObject({ p_slug: 'arpe-dulce-encanto', p_customer_name: 'María Gómez', p_customer_phone: '', p_desired_date: futureDate, p_details: 'Pastel azul con temática de fútbol', p_items: [{ product_id: 'product-1', quantity: 2 }, { product_id: 'product-2', quantity: 1 }] })
  expect(String(submissionPayloads[0].p_client_request_key)).toMatch(/^[0-9a-f-]{36}$/i)
  expect(Object.keys(submissionPayloads[0])).not.toEqual(expect.arrayContaining(['business_id', 'owner_id', 'price', 'snapshot', 'image_path', 'category', 'name']))
  expect((submissionPayloads[0].p_items as Record<string, unknown>[]).every(item => Object.keys(item).sort().join(',') === 'product_id,quantity')).toBe(true)

  let whatsappTarget = ''
  await page.context().route('https://wa.me/**', async route => { whatsappTarget = route.request().url(); await route.fulfill({ status: 200, contentType: 'text/html', body: '<title>intercepted WhatsApp</title>' }) })
  const popupPromise = page.waitForEvent('popup')
  await panel.getByRole('button', { name: 'Continuar por WhatsApp' }).click()
  const popup = await popupPromise
  await expect.poll(() => whatsappTarget).toContain('https://wa.me/50588881111?text=')
  const decoded = decodeURIComponent(whatsappTarget)
  expect(decoded).toContain('Mi nombre es María Gómez')
  expect(decoded).toContain('Pastel de Chocolate')
  expect(decoded).toContain('Cantidad: 2 pastel')
  expect(decoded).toContain('Tres Leches')
  expect(decoded).toContain('Pastel azul con temática de fútbol')
  expect(decoded).toContain('Número de solicitud: SOL-2026-0001')
  expect(decoded).toContain('/catalogo/arpe-dulce-encanto')
  expect(decoded).not.toContain('product-1')
  await popup.close()
  expect(directTableRequests).toEqual([])
  expect(submissionPayloads).toHaveLength(1)
  await panel.getByRole('button', { name: 'Copiar solicitud' }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { __requestCopied?: string }).__requestCopied)).toContain('SOL-2026-0001')
  expect(submissionPayloads).toHaveLength(1)

  await page.keyboard.press('Escape')
  await expect(panel).not.toBeVisible()
  await gotoPublicCatalog(page, 'sin-whatsapp')
  const productCard = page.locator('.public-product-card').filter({ has: page.getByRole('button', { name: 'Ver detalle de Pastel de Chocolate' }) })
  await productCard.getByRole('button', { name: 'Agregar Pastel de Chocolate a solicitud' }).click()
  await page.getByRole('button', { name: /Mi solicitud · 1 producto/ }).click()
  const noWhatsAppPanel = page.getByRole('dialog', { name: 'Mi solicitud' })
  await noWhatsAppPanel.getByLabel('Tu nombre').fill('Carlos Ramírez')
  await expect(noWhatsAppPanel.getByRole('button', { name: 'Solicitar cotización por WhatsApp' })).toHaveCount(0)
  await expect(noWhatsAppPanel.getByText(/Este negocio no tiene WhatsApp público habilitado/)).toHaveCount(0)
  await noWhatsAppPanel.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(noWhatsAppPanel.getByRole('heading', { name: 'Solicitud enviada' })).toBeVisible()
  await expect(noWhatsAppPanel.getByText('La solicitud quedó guardada.', { exact: false })).toBeVisible()
  expect(submissionPayloads).toHaveLength(2)
  await noWhatsAppPanel.getByRole('button', { name: 'Copiar solicitud' }).click()
  await expect(noWhatsAppPanel.locator('.catalog-request-notice')).toContainText('Solicitud copiada.')
  await expect.poll(() => page.evaluate(() => (window as Window & { __requestCopied?: string }).__requestCopied)).toContain('Carlos Ramírez')
  await noWhatsAppPanel.getByRole('button', { name: 'Compartir solicitud' }).click()
  await expect(noWhatsAppPanel.locator('.catalog-request-notice')).toContainText('Solicitud copiada.')
  await page.evaluate(() => Object.defineProperty(navigator, 'share', { configurable: true, value: async ({ text }: { text: string }) => { (window as Window & { __requestShared?: string }).__requestShared = text } }))
  await noWhatsAppPanel.getByRole('button', { name: 'Compartir solicitud' }).click()
  await expect(noWhatsAppPanel.locator('.catalog-request-notice')).toContainText('Solicitud lista para compartir.')
  await expect.poll(() => page.evaluate(() => (window as Window & { __requestShared?: string }).__requestShared)).toContain('Carlos Ramírez')
  await page.keyboard.press('Escape')
  await expect(noWhatsAppPanel).not.toBeVisible()
  await page.getByRole('button', { name: /Mi solicitud · 1 producto/ }).click()
  await expect(page.getByRole('dialog', { name: 'Mi solicitud' })).toBeVisible()
  await noWhatsAppPanel.getByRole('button', { name: 'Crear otra solicitud' }).click()
  await expect(noWhatsAppPanel.getByText('Aún no agregas productos.')).toBeVisible()
  expect(submissionPayloads).toHaveLength(2)
  for (const width of [320, 360, 390, 768, 884, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
    expect(dimensions.content, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport)
  }
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})

test('public catalog retries the exact pending payload with one idempotency key', async ({ page }) => {
  const submissions: Record<string, unknown>[] = []
  let attempts = 0
  await page.route('**/*.supabase.co/**', async route => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.pathname.endsWith('/ejnexa_submit_catalog_request')) {
      const payload = request.postDataJSON() as Record<string, unknown>
      submissions.push(payload)
      attempts += 1
      if (attempts === 1) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'sensitive SQL detail must not be shown' }) })
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'retry-request-id', request_number: 'SOL-2026-0002', status: 'new', submitted_at: new Date().toISOString() }]) })
      }
      return
    }
    if (url.pathname.endsWith('/ejnexa_get_public_catalog_profile')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([profile]) })
    } else if (url.pathname.endsWith('/ejnexa_get_public_catalog_products')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) })
    } else {
      await route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng })
    }
  })
  await gotoPublicCatalog(page, 'arpe-dulce-encanto')
  await page.getByRole('button', { name: 'Agregar Pastel de Chocolate a solicitud' }).click()
  await page.getByRole('button', { name: /Mi solicitud · 1 producto/ }).click()
  const panel = page.getByRole('dialog', { name: 'Mi solicitud' })
  await panel.getByLabel('Tu nombre').fill('Lucía Prueba')
  await panel.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(panel.getByRole('alert')).toContainText('No pudimos confirmar el envío')
  await expect(panel.getByRole('alert')).not.toContainText('sensitive SQL detail')
  await panel.getByRole('button', { name: 'Reintentar envío' }).click()
  await expect(panel.getByText('SOL-2026-0002')).toBeVisible()
  expect(submissions).toHaveLength(2)
  expect(submissions[1]).toEqual(submissions[0])
  for (const width of [320, 360, 390, 768]) {
    await page.setViewportSize({ width, height: 900 })
    const dimensions = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }))
    expect(dimensions.content, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(dimensions.viewport)
  }
})

test('public catalog submits once when the send action is activated repeatedly', async ({ page }) => {
  let submissionCount = 0
  let releaseSubmission: (() => void) | undefined
  const submissionGate = new Promise<void>(resolve => { releaseSubmission = resolve })
  await page.route('**/*.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/ejnexa_submit_catalog_request')) {
      submissionCount += 1
      await submissionGate
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'double-click-request', request_number: 'SOL-2026-0003', status: 'new', submitted_at: new Date().toISOString() }]) })
    } else if (url.pathname.endsWith('/ejnexa_get_public_catalog_profile')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([profile]) })
    } else if (url.pathname.endsWith('/ejnexa_get_public_catalog_products')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) })
    } else {
      await route.fulfill({ status: 200, contentType: 'image/png', body: tinyPng })
    }
  })
  await gotoPublicCatalog(page, 'arpe-dulce-encanto')
  await page.getByRole('button', { name: 'Agregar Pastel de Chocolate a solicitud' }).click()
  await page.getByRole('button', { name: /Mi solicitud · 1 producto/ }).click()
  const panel = page.getByRole('dialog', { name: 'Mi solicitud' })
  await panel.getByLabel('Tu nombre').fill('Prueba Doble')
  await panel.getByRole('button', { name: 'Enviar solicitud' }).evaluate(button => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await expect.poll(() => submissionCount).toBe(1)
  await expect(panel.getByRole('status')).toContainText('Enviando tu solicitud')
  releaseSubmission?.()
  await expect(panel.getByText('SOL-2026-0003')).toBeVisible()
  expect(submissionCount).toBe(1)
})

const internalUserId = '11111111-1111-4111-8111-111111111111'
const internalUser = { id: internalUserId, aud: 'authenticated', role: 'authenticated', email: 'catalog-test@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
const internalSession = { access_token: 'catalog-test-token', refresh_token: 'catalog-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: internalUser }
const internalBusiness: Business = {
  id: '22222222-2222-4222-8222-222222222222', owner_id: internalUserId, name: 'Dulce Encanto', logo_path: null, slogan: 'Hecho con cariño', description: 'Postres artesanales', whatsapp: '+505 8888-1111', email: '', address: '', currency: 'NIO',
  default_deposit_type: 'percentage', default_deposit_value: 50, default_document_format: 'a4', show_slogan_on_documents: true, show_description_on_documents: true,
  show_whatsapp_on_documents: true, show_email_on_documents: true, show_address_on_documents: true, document_footer_message: 'Gracias por elegirnos.',
  catalog_slug: 'dulce-encanto', public_catalog_enabled: true, public_catalog_show_whatsapp: true, public_catalog_logo_path: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}

async function gotoPublicCatalog(page: Page, slug: string) {
  const profileResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/ejnexa_get_public_catalog_profile'))
  const productsResponse = page.waitForResponse(response => response.url().includes('/rest/v1/rpc/ejnexa_get_public_catalog_products'))
  await page.goto(`/catalogo/${slug}`, { waitUntil: 'domcontentloaded' })
  await Promise.all([profileResponse, productsResponse])
}

async function mockInternalCatalogBackend(page: Page) {
  await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/auth/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(route.request().url().includes('/user') ? internalUser : internalSession) }))
  await page.route('**/rest/v1/arpe_businesses*', async route => {
    if (route.request().method() === 'PATCH') Object.assign(internalBusiness, route.request().postDataJSON())
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(internalBusiness) })
  })
  await page.route('**/rest/v1/rpc/ejnexa_get_public_catalog_profile', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([profile]) }))
  await page.route('**/rest/v1/rpc/ejnexa_get_public_catalog_products', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) }))
}

test('internal catalog exposes sharing tools only while published and builds PDF from public RPCs', async ({ page }, testInfo) => {
  await mockInternalCatalogBackend(page)
  await page.goto('/')
  const origin = new URL(page.url()).origin
  await page.getByLabel('Correo electrónico').fill('catalog-test@example.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('Example-password-123')
  const dashboardTables = ['arpe_quotes', 'arpe_quote_items', 'arpe_orders', 'arpe_order_items', 'arpe_payments']
  const dashboardResponses = dashboardTables.map(table => page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/rest/v1/${table}`)))
  await page.getByRole('button', { name: 'Entrar a mi negocio' }).click()
  await Promise.all(dashboardResponses)
  await expect(page.getByRole('heading', { name: 'Dulce Encanto' })).toBeVisible()
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('navigation', { name: 'Módulos complementarios' }).getByRole('link', { name: 'Catálogo' }).click()

  const distribution = page.getByRole('region', { name: 'Compartir catálogo' })
  await expect(distribution).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('catalog-internal-share-390.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('catalog-internal-share-1440.png'), fullPage: true })
  await expect(distribution.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', `${origin}/catalogo/dulce-encanto`)
  await expect(distribution.getByRole('button', { name: 'Mostrar QR' })).toBeVisible()
  await expect(distribution.getByRole('button', { name: 'Descargar PDF' })).toBeVisible()
  await expect(distribution.getByRole('button', { name: 'WhatsApp' })).toBeVisible()

  const publicRpcCalls: string[] = []
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname
    if (pathname.includes('/rest/v1/rpc/ejnexa_get_public_catalog_')) publicRpcCalls.push(pathname)
  })
  const pdfDownloadPromise = page.waitForEvent('download')
  await distribution.getByRole('button', { name: 'Descargar PDF' }).click()
  expect((await pdfDownloadPromise).suggestedFilename()).toBe('catalogo-dulce-encanto.pdf')
  expect(publicRpcCalls).toEqual(expect.arrayContaining(['/rest/v1/rpc/ejnexa_get_public_catalog_profile', '/rest/v1/rpc/ejnexa_get_public_catalog_products']))
  expect(publicRpcCalls.every(path => path.includes('/rpc/ejnexa_get_public_catalog_'))).toBe(true)

  await page.getByLabel('Activar catálogo público').uncheck()
  await page.getByRole('button', { name: 'Guardar catálogo público' }).click()
  await expect(page.getByText('Publica tu catálogo para comenzar a compartirlo.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Configurar catálogo' })).toHaveAttribute('href', '#catalog-settings-form')
  await expect(distribution.getByRole('button', { name: 'Descargar PDF' })).toHaveCount(0)
})
