import { expect, test, type Page } from '@playwright/test'
import type { Business, CatalogProduct } from '../src/lib/database.types'

const userId = '71111111-1111-4111-8111-111111111111'
const businessId = '72222222-2222-4222-8222-222222222222'
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'campaign-test@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() }
const session = { access_token: 'campaign-test-token', refresh_token: 'campaign-test-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }
const business: Business = {
  id: businessId, owner_id: userId, name: 'Retail Prueba', logo_path: null, slogan: '', description: '', whatsapp: '', email: '', address: '', currency: 'USD',
  default_deposit_type: 'percentage', default_deposit_value: 50, default_document_format: 'a4', show_slogan_on_documents: true, show_description_on_documents: true,
  show_whatsapp_on_documents: true, show_email_on_documents: true, show_address_on_documents: true, document_footer_message: 'Gracias.',
  catalog_slug: 'retail-prueba', public_catalog_enabled: true, public_catalog_show_whatsapp: true, public_catalog_logo_path: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}
const products: CatalogProduct[] = [
  { id: 'product-a', business_id: businessId, name: 'Camisa de lino', category: 'Ropa', description: 'Camisa ligera.', unit_label: 'unidad', default_unit_price: 100, default_portions: null, default_flavor: '', default_filling: '', default_decoration: '', default_extras: '', is_active: true, image_path: null, is_public: true, public_price_mode: 'exact', public_sort_order: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'product-b', business_id: businessId, name: 'Cinturón', category: 'Accesorios', description: '', unit_label: 'unidad', default_unit_price: 50, default_portions: null, default_flavor: '', default_filling: '', default_decoration: '', default_extras: '', is_active: true, image_path: null, is_public: false, public_price_mode: 'from', public_sort_order: 2, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 'product-c', business_id: businessId, name: 'Ajuste personalizado', category: 'Servicios', description: '', unit_label: 'servicio', default_unit_price: 30, default_portions: null, default_flavor: '', default_filling: '', default_decoration: '', default_extras: '', is_active: true, image_path: null, is_public: true, public_price_mode: 'contact', public_sort_order: 3, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
]

async function mockCampaignBackend(page: Page) {
  const campaigns: Record<string, unknown>[] = []
  const links: Record<string, unknown>[] = []
  const campaignInserts: Record<string, unknown>[] = []
  let sequence = 0

  await page.route('**/rest/v1/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/auth/v1/**', async route => {
    const url = route.request().url()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/user') ? user : url.includes('/logout') ? {} : session) })
  })
  await page.route('**/rest/v1/arpe_businesses*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([business]) })
  })
  await page.route('**/rest/v1/arpe_catalog_products*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products.filter(product => product.business_id === businessId)) })
  })
  await page.route('**/rest/v1/ejnexa_catalog_campaigns*', async route => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const campaignId = url.searchParams.get('id')?.replace('eq.', '')
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(campaigns.filter(campaign => campaign.business_id === businessId)) })
    if (method === 'POST') {
      const input = request.postDataJSON() as Record<string, unknown>
      const campaign = { ...input, id: `campaign-${++sequence}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      campaigns.push(campaign)
      campaignInserts.push(campaign)
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(campaign) })
    }
    if (method === 'PATCH') {
      const existing = campaigns.find(campaign => campaign.id === campaignId)
      if (existing) Object.assign(existing, request.postDataJSON())
      const wantsRepresentation = request.headers().prefer?.includes('return=representation')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wantsRepresentation ? existing : null) })
    }
    if (method === 'DELETE') {
      const index = campaigns.findIndex(campaign => campaign.id === campaignId)
      if (index >= 0) campaigns.splice(index, 1)
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fulfill({ status: 200, body: '' })
  })
  await page.route('**/rest/v1/ejnexa_catalog_campaign_products*', async route => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    if (method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(links.filter(link => link.business_id === businessId)) })
    if (method === 'POST') {
      const values = request.postDataJSON() as Record<string, unknown>[]
      links.push(...values)
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(values) })
    }
    if (method === 'DELETE') {
      const id = url.searchParams.get('campaign_id')?.replace('eq.', '')
      for (let index = links.length - 1; index >= 0; index -= 1) if (links[index].campaign_id === id) links.splice(index, 1)
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fulfill({ status: 200, body: '' })
  })

  return { campaigns, links, campaignInserts }
}

async function openPromotions(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('Example-password-123')
  await page.getByRole('button', { name: 'Entrar a mi negocio' }).click()
  await expect(page.getByRole('heading', { name: 'Retail Prueba' })).toBeVisible()
  await page.goto('/catalogo?vista=promociones', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Promociones', exact: true })).toBeVisible()
}

test('promotion wizard previews and saves a percentage offer as an inactive draft', async ({ page }) => {
  const backend = await mockCampaignBackend(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await openPromotions(page)
  await expect(page.getByText('Aún no has creado promociones')).toBeVisible()
  await page.getByRole('button', { name: 'Crear mi primera promoción' }).click()
  await page.getByRole('button', { name: /Descuento porcentual/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Seleccionar Camisa de lino').check()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Porcentaje de descuento').fill('25')
  await page.getByLabel('Nombre de la campaña').fill('Temporada de verano')
  await page.getByLabel('Badge de promoción').fill('25% OFF')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Empieza hoy' }).click()
  await page.getByRole('button', { name: 'Sin fecha final' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByText('Camisa de lino')).toBeVisible()
  await expect(page.getByText('25% OFF').first()).toBeVisible()
  await expect(page.getByText(/\$\s*75,00/)).toBeVisible()
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(page.getByRole('heading', { name: 'Temporada de verano' })).toBeVisible()
  await expect(page.getByText('Inactiva')).toBeVisible()
  expect(backend.campaignInserts).toHaveLength(1)
  expect(backend.campaignInserts[0]).toMatchObject({ business_id: businessId, campaign_kind: 'promotion', promotion_type: 'percentage', percentage_discount: 25, active: false })
  expect(backend.links).toEqual([{ campaign_id: 'campaign-1', business_id: businessId, product_id: 'product-a', position: 1 }])
})

test('2x1 offer keeps its non-monetary rule and contact-price products remain available', async ({ page }) => {
  await mockCampaignBackend(page)
  await openPromotions(page)
  await page.getByRole('button', { name: 'Crear mi primera promoción' }).click()
  await page.getByRole('button', { name: /2x1/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByLabel('Seleccionar Ajuste personalizado')).toBeEnabled()
  await page.getByLabel('Seleccionar Ajuste personalizado').check()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByText('No hace falta calcular ningún porcentaje ni ingresar otro precio.')).toBeVisible()
  await expect(page.getByLabel('Precio especial')).toHaveCount(0)
  await page.getByLabel('Nombre de la campaña').fill('Doble beneficio')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByText('Compra 1 y recibe 2').first()).toBeVisible()
  await expect(page.getByText('Precio pendiente').first()).toBeVisible()
})

test('promotion selector, picker, stepper and preview fit target widths without horizontal overflow', async ({ page }) => {
  await mockCampaignBackend(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await openPromotions(page)
  await page.getByRole('button', { name: 'Crear mi primera promoción' }).click()
  const widths = [320, 360, 390, 400, 768, 884, 1440]
  const expectNoOverflow = async () => {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `horizontal overflow at ${width}px`).toBeLessThanOrEqual(width + 1)
    }
  }
  await expectNoOverflow()
  await page.setViewportSize({ width: 390, height: 900 })
  await page.getByRole('button', { name: /Descuento porcentual/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expectNoOverflow()
  await page.setViewportSize({ width: 390, height: 900 })
  await page.getByLabel('Seleccionar Camisa de lino').check()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Porcentaje de descuento').fill('25')
  await page.getByLabel('Nombre de la campaña').fill('Prueba adaptable')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expectNoOverflow()
})
