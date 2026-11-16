import { expect, test, type Page, type TestInfo } from '@playwright/test'
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
  let rejectNextProductUpdate = false
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
    if (path.endsWith('/arpe_catalog_products')) {
      if (method === 'GET') return json(products.filter(product => product.business_id === businessId))
      if (method === 'PATCH' && rejectNextProductUpdate) {
        rejectNextProductUpdate = false
        return json({ code: '23514', message: 'EJNEXA_CAMPAIGN_PRODUCT_PRICE_INVARIANT' }, 400)
      }
      return json({ message: 'Unexpected product write in this test.' }, 405)
    }
    if (path.endsWith('/ejnexa_catalog_campaigns')) {
      if (method === 'GET') {
        const archiveFilter = url.searchParams.get('archived_at')
        return json(campaigns.filter(campaign => campaign.business_id === businessId
          && (archiveFilter === 'not.is.null' ? campaign.archived_at !== null : campaign.archived_at == null)))
      }
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
        featured: args.p_featured, sort_order: args.p_sort_order, archived_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
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
    if (path.endsWith('/rpc/ejnexa_duplicate_catalog_campaign')) {
      const args = request.postDataJSON() as Record<string, unknown>
      const source = campaigns.find(row => row.id === args.p_campaign_id && row.business_id === args.p_business_id)
      if (!source) return json({ code: '42501', message: 'Not authorized' }, 400)
      const duplicate = { ...source, id: `campaign-${++sequence}`, name: `Copia de ${String(source.name)}`.slice(0, 120), active: false, archived_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      campaigns.push(duplicate)
      links.push(...links.filter(link => link.campaign_id === source.id).map(link => ({ ...link, campaign_id: duplicate.id })))
      return json(duplicate)
    }
    if (path.endsWith('/rpc/ejnexa_archive_catalog_campaign')) {
      const args = request.postDataJSON() as Record<string, unknown>
      const campaign = campaigns.find(row => row.id === args.p_campaign_id && row.business_id === args.p_business_id)
      if (!campaign) return json({ code: '42501', message: 'Not authorized' }, 400)
      campaign.active = false
      campaign.archived_at = new Date().toISOString()
      return json(campaign)
    }
    if (path.endsWith('/rpc/ejnexa_restore_catalog_campaign')) {
      const args = request.postDataJSON() as Record<string, unknown>
      const campaign = campaigns.find(row => row.id === args.p_campaign_id && row.business_id === args.p_business_id)
      if (!campaign) return json({ code: '42501', message: 'Not authorized' }, 400)
      campaign.active = false
      campaign.archived_at = null
      return json(campaign)
    }
    if (path.endsWith('/rpc/ejnexa_delete_catalog_campaign')) {
      const args = request.postDataJSON() as Record<string, unknown>
      const index = campaigns.findIndex(row => row.id === args.p_campaign_id && row.business_id === args.p_business_id)
      if (index < 0) return json({ code: '42501', message: 'Not authorized' }, 400)
      const [deleted] = campaigns.splice(index, 1)
      for (let index = links.length - 1; index >= 0; index -= 1) if (links[index].campaign_id === deleted.id) links.splice(index, 1)
      return json(true)
    }
    return json([])
  })

  return {
    campaigns, links, campaignRpcCalls, activationRpcCalls, directMutations,
    seedCampaign(overrides: Record<string, unknown> = {}) {
      const now = new Date().toISOString()
      const campaign = {
        id: `campaign-${++sequence}`, business_id: businessId, name: 'Campaña de prueba', description: 'Una oferta de temporada.',
        campaign_kind: 'promotion', promotion_type: 'percentage', percentage_discount: 20, fixed_discount: null, promo_price: null,
        badge_text: '20% OFF', image_path: null, starts_on: null, ends_on: null, active: true, featured: true, sort_order: 1,
        archived_at: null, created_at: now, updated_at: now, ...overrides,
      }
      campaigns.push(campaign)
      links.push({ campaign_id: campaign.id, business_id: businessId, product_id: 'product-a', position: 1 })
      return campaign
    },
    rejectNextPublication: () => { rejectNextPublication = true },
    rejectNextProductUpdate: () => { rejectNextProductUpdate = true },
  }
}

async function captureVisual(page: Page, testInfo: TestInfo, filename: string, scrollTarget?: string) {
  if (scrollTarget) await page.locator(scrollTarget).scrollIntoViewIfNeeded()
  else await page.evaluate(() => window.scrollTo(0, 0))
  if (scrollTarget === '.campaign-wizard-actions') await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  await page.addStyleTag({ content: '.skip-link:focus { top: -100px !important; }' })
  await page.screenshot({ path: testInfo.outputPath(`visual-review/${filename}.png`) })
}

async function openPromotions(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Correo electrónico').fill(user.email)
  await page.getByLabel('Contraseña', { exact: true }).fill('Example-password-123')
  const signedIn = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/auth/v1/token') && response.ok())
  await page.getByRole('button', { name: 'Entrar a mi negocio' }).click()
  await signedIn
  await expect(page.locator('.header-business strong')).toHaveText('Retail Prueba')
  await page.goto('/catalogo?vista=promociones', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Catálogo', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Nueva promoción' })).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Promociones', exact: true })).toBeVisible()
}

test('promotion wizard previews and saves a percentage offer as an inactive draft', async ({ page }, testInfo) => {
  test.setTimeout(90000)
  const backend = await mockCampaignBackend(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await openPromotions(page)
  await expect(page.getByText('Aún no has creado promociones')).toBeVisible()
  const emptyCta = page.getByRole('button', { name: 'Crear mi primera promoción' })
  await emptyCta.scrollIntoViewIfNeeded()
  const emptyCtaBounds = await emptyCta.boundingBox()
  const emptyNavBounds = await page.locator('.bottom-nav').boundingBox()
  if (!emptyCtaBounds || !emptyNavBounds) throw new Error('Empty state CTA or bottom navigation is missing from the mobile layout.')
  expect(emptyCtaBounds.y + emptyCtaBounds.height).toBeLessThanOrEqual(emptyNavBounds.y)
  await captureVisual(page, testInfo, '390-promotions-empty', '.campaign-empty-state .primary')
  await page.getByRole('button', { name: 'Crear mi primera promoción' }).click()
  await expect(page.locator('.campaign-stepper-summary')).toContainText('Paso 1 de 5')
  await captureVisual(page, testInfo, '390-offer-selector', '.campaign-type-grid')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await captureVisual(page, testInfo, '1440-offer-selector', '.campaign-type-grid')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: /Descuento porcentual/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  const productOption = page.locator('.campaign-product-option').filter({ hasText: 'Camisa de lino' })
  const productCheckbox = productOption.getByRole('checkbox')
  await expect(page.getByRole('img', { name: 'Sin imagen para Camisa de lino' })).toBeVisible()
  await productCheckbox.check()
  await expect(productCheckbox).toBeChecked()
  await expect(productOption).toHaveClass(/is-selected/)
  await expect(productOption).toContainText('Seleccionado')
  await captureVisual(page, testInfo, '390-product-picker-selected', '.campaign-product-option.is-selected')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Porcentaje de descuento').fill('25')
  await page.getByLabel('Nombre de la campaña').fill('Temporada de verano')
  await page.getByLabel('Descripción comercial').fill('Una selección ligera para los días de verano.')
  await page.getByLabel('Badge de promoción').fill('25% OFF')
  await captureVisual(page, testInfo, '390-campaign-details', '.campaign-image-actions')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByRole('button', { name: 'Empieza hoy' }).click()
  await page.getByRole('button', { name: 'Sin fecha final' }).click()
  await expect(page.getByText('Empieza hoy · Sin fecha final')).toBeVisible()
  await captureVisual(page, testInfo, '390-schedule-summary', '.campaign-schedule-summary')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect(page.getByText('Camisa de lino')).toBeVisible()
  await expect(page.getByText('25% OFF').first()).toBeVisible()
  await expect(page.getByText('$75', { exact: true })).toBeVisible()
  await expect(page.getByText('Compra 1 y recibe 2', { exact: true })).toHaveCount(0)
  await captureVisual(page, testInfo, '390-campaign-preview', '.campaign-wizard-actions')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await captureVisual(page, testInfo, '1440-campaign-preview', '.campaign-preview-card')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(page.getByRole('heading', { name: 'Temporada de verano' })).toBeVisible()
  await expect(page.getByText('Inactiva')).toBeVisible()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await captureVisual(page, testInfo, '1440-promotions-list')
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
  await expect(page.locator('.campaign-wizard')).toHaveCount(0)
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

test('shows a friendly message when an active promotion blocks a product price-mode change', async ({ page }) => {
  const backend = await mockCampaignBackend(page)
  await openPromotions(page)
  await page.goto('/catalogo', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Editar' }).first().click()
  await page.getByLabel('Cómo mostrar el precio').selectOption('contact')
  backend.rejectNextProductUpdate()
  await page.getByRole('button', { name: 'Guardar producto' }).click()
  await expect(page.getByText('Este producto tiene una promoción activa que depende de su precio actual. Ajusta o desactiva la promoción antes de cambiar el precio.')).toBeVisible()
  await expect(page.getByText('EJNEXA_CAMPAIGN_PRODUCT_PRICE_INVARIANT')).toHaveCount(0)
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
  await expect(page.getByRole('region', { name: 'Vista previa de la promoción' }).getByText('2x1', { exact: true })).toBeVisible()
  await expect(page.getByText('Compra 1 y recibe 2', { exact: true }).last()).toBeVisible()
  await expect(page.getByText('Precio pendiente').first()).toBeVisible()
  await expect(page.getByText(/50% OFF/i)).toHaveCount(0)
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
      const stepper = page.locator('.campaign-stepper')
      expect(await stepper.evaluate(element => element.scrollWidth - element.clientWidth), `stepper clipping at ${width}px`).toBeLessThanOrEqual(1)
      if (width <= 400) await expect(stepper.locator('.campaign-stepper-summary')).toBeVisible()
      else await expect(stepper.locator('.campaign-stepper-summary')).toBeHidden()
    }
  }
  await expectNoOverflow()
  await expect(page.locator('.campaign-stepper-summary')).toContainText('Oferta')
  await page.setViewportSize({ width: 390, height: 900 })
  await page.getByRole('button', { name: /Descuento porcentual/ }).click()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expectNoOverflow()
  await expect(page.locator('.campaign-stepper-summary')).toContainText('Productos')
  await page.setViewportSize({ width: 390, height: 900 })
  await page.getByLabel('Seleccionar Camisa de lino').check()
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.getByLabel('Porcentaje de descuento').fill('25')
  await page.getByLabel('Nombre de la campaña').fill('Prueba adaptable')
  await expectNoOverflow()
  await expect(page.locator('.campaign-stepper-summary')).toContainText('Detalles')
  await page.setViewportSize({ width: 390, height: 900 })
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expectNoOverflow()
  await expect(page.locator('.campaign-stepper-summary')).toContainText('Vigencia')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expectNoOverflow()
  await expect(page.locator('.campaign-stepper-summary')).toContainText('Vista previa')
  await page.setViewportSize({ width: 390, height: 900 })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  const actionBar = await page.locator('.campaign-wizard-actions').boundingBox()
  const bottomNavigation = await page.locator('.bottom-nav').boundingBox()
  if (!actionBar || !bottomNavigation) throw new Error('Wizard actions or bottom navigation are missing from the mobile layout.')
  expect(bottomNavigation.y - (actionBar.y + actionBar.height)).toBeGreaterThanOrEqual(12)
})

test('campaign lifecycle duplicates, archives, restores and safely deletes from the archived list', async ({ page }) => {
  test.setTimeout(90_000)
  const backend = await mockCampaignBackend(page)
  const source = backend.seedCampaign()
  await page.setViewportSize({ width: 390, height: 844 })
  await openPromotions(page)
  await expect(page.getByRole('heading', { name: 'Campaña de prueba', exact: true })).toBeVisible()

  const sourceMenu = page.locator('.campaign-more-options > summary[aria-label="Más opciones para Campaña de prueba"]')
  await sourceMenu.click()
  await page.getByRole('button', { name: 'Duplicar campaña' }).click()
  await expect(page.getByRole('heading', { name: 'Copia de Campaña de prueba' })).toBeVisible()
  expect(backend.campaigns).toHaveLength(2)
  expect(backend.campaigns[1]).toMatchObject({ name: 'Copia de Campaña de prueba', active: false, archived_at: null, image_path: null })
  expect(backend.links.filter(link => link.campaign_id === backend.campaigns[1].id)).toEqual([
    expect.objectContaining({ product_id: 'product-a', business_id: businessId }),
  ])

  await sourceMenu.click()
  const archiveResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/rpc/ejnexa_archive_catalog_campaign'))
  await expect(page.getByRole('button', { name: 'Archivar', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Archivar', exact: true }).click()
  await archiveResponse
  await expect(page.getByText('La campaña quedó archivada.', { exact: true })).toBeVisible()
  await expect(page.locator('.campaign-loading-state')).toBeHidden()
  await expect(page.getByRole('heading', { name: String(source.name), exact: true })).toHaveCount(0)
  expect(backend.campaigns[0]).toMatchObject({ active: false })
  expect(backend.campaigns[0].archived_at).toEqual(expect.any(String))

  await page.getByRole('tab', { name: 'Archivadas' }).click()
  await expect(page.getByRole('heading', { name: String(source.name), exact: true })).toBeVisible()
  await expect(page.getByText('Archivada', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: `Restaurar ${String(source.name)}` }).click()
  await expect(page.locator('.campaign-loading-state')).toBeHidden()
  await expect(page.getByRole('heading', { name: String(source.name), exact: true })).toBeVisible()
  await expect(page.getByText('Inactiva', { exact: true }).first()).toBeVisible()
  expect(backend.campaigns[0]).toMatchObject({ active: false, archived_at: null })

  await sourceMenu.click()
  const rearchiveResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/rpc/ejnexa_archive_catalog_campaign'))
  await expect(page.getByRole('button', { name: 'Archivar', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Archivar', exact: true }).click()
  await rearchiveResponse
  await expect(page.getByText('La campaña quedó archivada.', { exact: true })).toBeVisible()
  await expect(page.locator('.campaign-loading-state')).toBeHidden()
  await page.getByRole('tab', { name: 'Archivadas' }).click()
  await page.getByRole('button', { name: `Eliminar campaña ${String(source.name)}` }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Eliminar campaña definitivamente' })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText(String(source.name))
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: `Eliminar campaña ${String(source.name)}` })).toBeFocused()
  await page.getByRole('button', { name: `Eliminar campaña ${String(source.name)}` }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar definitivamente' }).click()
  await expect(page.getByRole('heading', { name: String(source.name), exact: true })).toHaveCount(0)
  expect(backend.campaigns.some(campaign => campaign.id === source.id)).toBe(false)
  expect(backend.directMutations).toEqual([])
})

test('campaign lifecycle tabs, menu and delete dialog fit all target widths', async ({ page }) => {
  test.setTimeout(90_000)
  const backend = await mockCampaignBackend(page)
  backend.seedCampaign()
  backend.seedCampaign({ name: 'Campaña archivada', active: false, archived_at: new Date().toISOString() })
  await page.setViewportSize({ width: 390, height: 844 })
  await openPromotions(page)

  for (const width of [320, 360, 390, 400, 768, 884, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth), `horizontal overflow at ${width}px`).toBeLessThanOrEqual(width + 1)
    const menu = page.locator('.campaign-more-options > summary[aria-label="Más opciones para Campaña de prueba"]')
    await expect(menu).toBeVisible()
    await menu.click()
    await expect(page.getByRole('button', { name: 'Duplicar campaña' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Archivar', exact: true })).toBeVisible()
    await menu.click()
    await page.getByRole('tab', { name: 'Archivadas' }).click()
    const deleteButton = page.getByRole('button', { name: 'Eliminar campaña Campaña archivada' })
    await expect(deleteButton).toBeVisible()
    await deleteButton.click()
    const dialog = page.getByRole('alertdialog', { name: 'Eliminar campaña definitivamente' })
    const bounds = await dialog.boundingBox()
    if (!bounds) throw new Error(`Delete confirmation is missing at ${width}px.`)
    expect(bounds.x, `dialog left edge at ${width}px`).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width, `dialog right edge at ${width}px`).toBeLessThanOrEqual(width + 1)
    await page.getByRole('button', { name: 'Cancelar' }).click()
    await page.getByRole('tab', { name: 'Promociones' }).click()
  }
})
