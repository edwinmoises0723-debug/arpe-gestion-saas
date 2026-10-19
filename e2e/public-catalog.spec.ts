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

  await page.goto('/catalogo/arpe-dulce-encanto', { waitUntil: 'domcontentloaded' })
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
  await expect.poll(() => page.evaluate(() => (window as Window & { __catalogCopied?: string }).__catalogCopied)).toBe('http://127.0.0.1:5175/catalogo/arpe-dulce-encanto')
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
  await page.goto('/catalogo/sin-whatsapp', { waitUntil: 'domcontentloaded' })
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

  await page.goto('/catalogo/vacio', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Muy pronto encontrarás nuestros productos aquí.')).toBeVisible()
  await page.goto('/catalogo/no-existe', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Este catálogo no está disponible' })).toBeVisible()
  await expect(page.getByText('ARPE Dulce Encanto')).toHaveCount(0)
  await page.goto('/catalogo/error', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'No pudimos cargar el catálogo' })).toBeVisible()
  await page.getByRole('button', { name: 'Intentar de nuevo' }).click()
  await expect(page.getByRole('heading', { name: 'No pudimos cargar el catálogo' })).toBeVisible()
  expect(pageErrors).toEqual([])
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
  await page.getByLabel('Correo electrónico').fill('catalog-test@example.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('Example-password-123')
  await page.getByRole('button', { name: 'Entrar a mi negocio' }).click()
  await expect(page.getByRole('heading', { name: 'Dulce Encanto' })).toBeVisible()
  await page.getByRole('button', { name: 'Abrir menú' }).click()
  await page.getByRole('navigation', { name: 'Módulos complementarios' }).getByRole('link', { name: 'Catálogo' }).click()

  const distribution = page.getByRole('region', { name: 'Compartir catálogo' })
  await expect(distribution).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('catalog-internal-share-390.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: testInfo.outputPath('catalog-internal-share-1440.png'), fullPage: true })
  await expect(distribution.getByRole('link', { name: 'Ver catálogo' })).toHaveAttribute('href', 'http://127.0.0.1:5175/catalogo/dulce-encanto')
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
