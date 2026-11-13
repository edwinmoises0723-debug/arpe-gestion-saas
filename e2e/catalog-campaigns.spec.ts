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
  const campaignRpcCalls: Record<string, unknown>[] = []
  const activationRpcCalls: Record<string, unknown>[] = []
  const directMutations: string[] = []
  let rejectNextPublication = false
  let sequence = 0

  await page.context().route('**/auth/v1/**', async route => {
    const url = route.request().url()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(url.includes('/user') ? user : url.includes('/logout') ? {} : session) })
  })
  await page.context().route('**/rest/v1/**', async route => {
    const request = route.request()
    const method = request.method()
    const url = new URL(request.url())
    const path = url.pathname
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })

    if (path.endsWith('/arpe_businesses')) return json([business])
    if (path.endsWith('/arpe_catalog_products')) return json(products.filter(product => product.business_id === businessId))
    if (path.endsWith('/ejnexa_catalog_campaigns')) {
      if (method === 'GET') return json(campaigns.filter(campaign => campaign.business_id === businessId))
      directMutations.push(`campaigns:${method}`)
      return json({ message: 'Campaign writes must use RPC.' }, 405)
    }
    if (path.endsWith('/ejnexa_catalog_campaign_products')) {
      if (method === 'GET') return json(links.filter(link => link.business_id === businessId))
      directMutations.push(`campaign-products:${method}`)
      return json({ message: 'Campaign writes must use RPC.' }, 405)
    }
    if (path.endsWith('/rpc/ejnexa_save_catalog_campaign')) {
      const args = request.postDataJSON() as Record<string, unknown>
      campaignRpcCalls.push(args)
      if (args.p_active === true && rejectNextPublication) {
        rejectNextPublication = false
        return json({ code: '23514', message: 'A product cannot have overlapping active commercial promotions' }, 400)
      }
      const campaignId = typeof args.p_campaign_id === 'string' ? args.p_campaign_id : `campaign-${++sequence}`
      const campaign: Record<string, unknown> = {
        id: campaignId, business_id: args.p_business_id, name: args.p_name, description: args.p_description,
        campaign_kind: args.p_campaign_kind, promotion_type: args.p_promotion_type, percentage_discount: args.p_percentage_discount,
        fixed_discount: args.p_fixed_discount, promo_price: args.p_promo_price, badge_text: args.p_badge_text,
        image_path: args.p_image_path, starts_on: args.p_starts_on, ends_on: args.p_ends_on, active: args.p_active,
        featured: args.p_featured, sort_order: args.p_sort_order, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      const existingIndex = campaigns.findIndex(row => row.id === campaignId)
      if (existingIndex >= 0) campaigns[existingIndex] = campaign
      else campaigns.push(campaign)
      for (let index = links.length - 1; index >= 0; index -= 1) if (links[index].campaign_id === campaignId) links.splice(index, 1)
      const productIds = args.p_product_ids as string[]
      links.push(...productIds.map((product_id, index) => ({ campaign_id: campaignId, business_id: args.p_business_id, product_id, position: index + 1 })))
      return json(campaign)
    }
    if (path.endsWith('/rpc/ejnexa_set_catalog_campaign_active')) {
      const args = request.postDataJSON() as Record<string, unknown>
      activationRpcCalls.push(args)
      const campaign = campaigns.find(row => row.id === args.p_campaign_id && row.business_id === args.p_business_id)
      if (!campaign) return json({ code: '42501', message: 'Not authorized' }, 400)
      campaign.active = args.p_active
      return json(campaign)
    }
    return json([])
  })

  return { campaigns, links, campaignRpcCalls, activationRpcCalls, directMutations, rejectNextPublication: () => { rejectNextPublication = true } }
}

async function openPromotions(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('Example-password-123')
  await page.getByRole('button', { name: 'Entrar a mi negocio' }).click()
  await expect(page.getByRole('banner')).toContainText('Retail Prueba')
  const productsLoaded = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/arpe_catalog_products') && response.status() === 200)
  await page.goto('/catalogo?vista=promociones', { waitUntil: 'domcontentloaded' })
  await productsLoaded
  await expect(page.getByRole('button', { name: 'Nueva promoción' })).toBeEnabled()
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
  expect(backend.campaignRpcCalls).toHaveLength(1)
  expect(backend.campaignRpcCalls[0]).toMatchObject({ p_business_id: businessId, p_campaign_kind: 'promotion', p_promotion_type: 'percentage', p_percentage_discount: 25, p_active: false, p_product_ids: ['product-a'] })
  expect(backend.directMutations).toEqual([])
  expect(backend.links).toEqual([{ campaign_id: 'campaign-1', business_id: businessId, product_id: 'product-a', position: 1 }])
})

test('publishes a campaign through the atomic save RPC', async ({ page }) => {
  const backend = await mockCampaignBackend(page)
  await openPromotions(page)
  await page.getByRole('button', { name: 'Crear mi primera promoción' }).click()
  await page.getByRole('button', { name: /Descuento porcentual/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Seleccionar Camisa de lino').check()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Porcentaje de descuento').fill('12.5')
  await page.getByLabel('Nombre de la campaña').fill('Oferta publicada')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Empieza hoy' }).click()
  await page.getByRole('button', { name: 'Sin fecha final' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Publicar promoción' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Publicar promoción' }).click()
  await expect(page.getByRole('heading', { name: 'Oferta publicada' })).toBeVisible()
  expect(backend.campaignRpcCalls).toHaveLength(1)
  expect(backend.campaignRpcCalls[0]).toMatchObject({ p_percentage_discount: 12.5, p_active: true, p_product_ids: ['product-a'] })
  expect(backend.campaigns[0]).toMatchObject({ active: true, name: 'Oferta publicada' })
  expect(backend.directMutations).toEqual([])
})

test('shows a friendly message when atomic publication is rejected by no-stacking', async ({ page }) => {
  const backend = await mockCampaignBackend(page)
  backend.rejectNextPublication()
  await openPromotions(page)
  await page.getByRole('button', { name: 'Crear mi primera promoción' }).click()
  await page.getByRole('button', { name: /Descuento porcentual/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Seleccionar Camisa de lino').check()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Porcentaje de descuento').fill('12.5')
  await page.getByLabel('Nombre de la campaña').fill('Oferta con conflicto')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Empieza hoy' }).click()
  await page.getByRole('button', { name: 'Sin fecha final' }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Publicar promoción' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Publicar promoción' }).click()
  await expect(page.locator('.campaign-wizard-errors')).toContainText('Uno de los productos ya tiene una promoción activa')
  expect(backend.campaignRpcCalls).toHaveLength(1)
  expect(backend.campaigns).toEqual([])
  expect(backend.links).toEqual([])
  expect(backend.directMutations).toEqual([])
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
