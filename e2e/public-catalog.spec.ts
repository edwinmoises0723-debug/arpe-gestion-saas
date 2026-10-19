import { expect, test } from '@playwright/test'
import type { PublicCatalogProduct, PublicCatalogProfile } from '../src/lib/database.types'

const profile: PublicCatalogProfile = {
  catalog_slug: 'arpe-dulce-encanto', name: 'ARPE Dulce Encanto', slogan: 'Hecho con cariño',
  description: 'Repostería artesanal para compartir momentos especiales.', currency: 'NIO',
  public_catalog_logo_path: 'owner-1/business-1/profile/logo.png', whatsapp: null,
}
const products: PublicCatalogProduct[] = [
  { id: 'product-1', name: 'Pastel de Chocolate', category: 'Pasteles', description: 'Pastel artesanal con ganache.', unit_label: 'pastel', default_unit_price: 850, default_portions: 20, image_path: 'owner-1/business-1/products/pastel.png', public_price_mode: 'exact', public_sort_order: 1 },
  { id: 'product-2', name: 'Tres Leches', category: 'Postres', description: 'Suave y fresco.', unit_label: 'unidad', default_unit_price: 1200, default_portions: null, image_path: null, public_price_mode: 'from', public_sort_order: 2 },
  { id: 'product-3', name: 'Alfajor especial', category: 'Galletas', description: 'Relleno artesanal.', unit_label: 'unidad', default_unit_price: null, default_portions: null, image_path: null, public_price_mode: 'contact', public_sort_order: 3 },
]
const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/4XcAAAAASUVORK5CYII=', 'base64')

test('public catalog is available without login and supports discovery, detail, empty and error states', async ({ page }) => {
  const paths: string[] = []
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(slug === 'no-existe' ? [] : [{ ...profile, catalog_slug: slug }]) })
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
  expect(paths.every(path => path.startsWith('/rest/v1/rpc/'))).toBe(true)
  expect(paths.some(path => /arpe_(businesses|catalog_products|quotes|orders|payments)/.test(path))).toBe(false)
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])

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
