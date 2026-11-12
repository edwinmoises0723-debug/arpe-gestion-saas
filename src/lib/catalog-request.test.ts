import { describe, expect, it } from 'vitest'
import { addCatalogRequestItem, buildCatalogRequestSubmissionPayload, buildQuoteRequestMessage, buildQuoteRequestWhatsAppUrl, calculateCatalogReference, CATALOG_OFFER_CHANGED_MESSAGE, formatRequestedDate, isCatalogOfferChangedError, isCatalogRequestStatus, removeCatalogRequestItem, setCatalogRequestQuantity, validateCatalogRequest, type CatalogRequestForm, type CatalogRequestItem } from './catalog-request'
import type { PublicCatalogProduct } from './database.types'

const products: PublicCatalogProduct[] = [
  { id: 'pastel-id', name: 'Pastel Premium', category: 'Pasteles', description: '', unit_label: 'pastel', default_unit_price: 850, default_portions: 20, image_path: 'private/path/should-not-leak.png', public_price_mode: 'exact', public_sort_order: 1, campaign_id: 'campaign-1', campaign_kind: 'promotion', promotion_type: 'percentage', promotion_badge: '15% OFF', base_price: 1000, promotional_price: 850 },
  { id: 'alfajor-id', name: 'Alfajor artesanal', category: 'Galletas', description: '', unit_label: 'unidad', default_unit_price: 35, default_portions: null, image_path: null, public_price_mode: 'from', public_sort_order: 2 },
  { id: 'custom-id', name: 'Diseño personalizado', category: 'Especiales', description: '', unit_label: 'pieza', default_unit_price: null, default_portions: null, image_path: null, public_price_mode: 'contact', public_sort_order: 3 },
]
const validForm: CatalogRequestForm = { customerName: 'María Gómez', desiredDate: '2026-10-25', details: 'Decoración azul' }

describe('public catalog quote request', () => {
  it('adds once, increments duplicates, keeps positive integer quantities and removes products', () => {
    const once = addCatalogRequestItem([], products[0])
    expect(once).toHaveLength(1)
    const twice = addCatalogRequestItem(once, products[0])[0]
    expect(twice.quantity).toBe(2)
    expect(twice).toMatchObject({ campaignId: 'campaign-1', publicUnitPrice: 850, promotionType: 'percentage', promotionBadge: '15% OFF' })
    const quantity = setCatalogRequestQuantity(once, 'pastel-id', 0)
    expect(quantity[0].quantity).toBe(1)
    expect(setCatalogRequestQuantity(once, 'pastel-id', 2.5)[0].quantity).toBe(1)
    expect(removeCatalogRequestItem(once, 'pastel-id')).toEqual([])
  })

  it('validates empty items, trimmed name, date boundaries and observation length', () => {
    expect(validateCatalogRequest([], { ...validForm, customerName: ' ' }, '2026-10-18')).toMatchObject({ items: expect.any(String), customerName: expect.any(String) })
    const item = addCatalogRequestItem([], products[0])
    expect(validateCatalogRequest(item, { ...validForm, desiredDate: '2026-10-17' }, '2026-10-18')).toHaveProperty('desiredDate')
    expect(validateCatalogRequest(item, { ...validForm, desiredDate: '2026-10-18' }, '2026-10-18')).toEqual({})
    expect(validateCatalogRequest(item, { ...validForm, details: 'x'.repeat(1001) }, '2026-10-18')).toHaveProperty('details')
    expect(validateCatalogRequest(Array.from({ length: 51 }, (_, index) => ({ ...item[0], productId: `product-${index}` })), validForm, '2026-10-18')).toHaveProperty('items')
    expect(validateCatalogRequest([{ ...item[0], quantity: 10000 }], validForm, '2026-10-18')).toHaveProperty('items')
    expect(setCatalogRequestQuantity(item, 'pastel-id', 10000)[0].quantity).toBe(9999)
  })

  it('sends client offer expectations as consistency checks without sending authority snapshots or tenant identifiers', () => {
    const selected = products.map(product => addCatalogRequestItem([], product)[0])
    const payload = buildCatalogRequestSubmissionPayload({ slug: 'dulce-encanto', requestKey: 'request-key', form: validForm, items: selected })
    expect(Object.keys(payload).sort()).toEqual(['p_client_request_key', 'p_customer_name', 'p_customer_phone', 'p_desired_date', 'p_details', 'p_items', 'p_slug'].sort())
    expect(payload).toEqual({ p_slug: 'dulce-encanto', p_client_request_key: 'request-key', p_customer_name: 'María Gómez', p_customer_phone: '', p_desired_date: '2026-10-25', p_details: 'Decoración azul', p_items: [
      { product_id: 'pastel-id', quantity: 1, expected_campaign_id: 'campaign-1', expected_public_unit_price: 850 },
      { product_id: 'alfajor-id', quantity: 1, expected_campaign_id: null, expected_public_unit_price: 35 },
      { product_id: 'custom-id', quantity: 1, expected_campaign_id: null, expected_public_unit_price: null },
    ] })
    expect(Object.keys(payload)).not.toEqual(expect.arrayContaining(['business_id', 'owner_id', 'price', 'snapshot', 'image_path', 'category', 'name']))
    expect(payload.p_items.every(item => Object.keys(item).sort().join(',') === 'expected_campaign_id,expected_public_unit_price,product_id,quantity')).toBe(true)
    expect(payload.p_items[2].expected_public_unit_price).toBeNull()
  })

  it('recognizes only the safe stale-offer response from the server', () => {
    expect(isCatalogOfferChangedError({ message: CATALOG_OFFER_CHANGED_MESSAGE })).toBe(true)
    expect(isCatalogOfferChangedError({ message: 'internal SQL detail' })).toBe(false)
    expect(isCatalogOfferChangedError(null)).toBe(false)
  })

  it('recognizes only valid persisted request statuses for idempotent replays', () => {
    for (const status of ['new', 'reviewing', 'converted', 'declined', 'archived']) expect(isCatalogRequestStatus(status)).toBe(true)
    expect(isCatalogRequestStatus('processing')).toBe(false)
    expect(isCatalogRequestStatus('')).toBe(false)
  })

  it('calculates only a complete exact-price reference', () => {
    const exact = addCatalogRequestItem([], products[0])
    expect(calculateCatalogReference(exact)).toBe(850)
    const two = addCatalogRequestItem(exact, products[0])
    expect(calculateCatalogReference(two)).toBe(1700)
    expect(calculateCatalogReference([...exact, ...addCatalogRequestItem([], products[1])])).toBeNull()
    expect(calculateCatalogReference(addCatalogRequestItem([], products[2]))).toBeNull()
  })

  it('builds a clear WhatsApp message with exact/from/contact prices and no private identifiers', () => {
    let items: CatalogRequestItem[] = []
    for (const product of products) items = addCatalogRequestItem(items, product)
    const message = buildQuoteRequestMessage({ businessName: 'Dulce Encanto', customerName: validForm.customerName, items, desiredDate: validForm.desiredDate, details: validForm.details, catalogUrl: 'https://example.test/catalogo/dulce-encanto', currencySymbol: 'C$' })
    expect(message).toContain('Mi nombre es María Gómez')
    expect(message).not.toContain('Número de solicitud:')
    expect(message).toContain('Precio publicado: C$ 850,00')
    expect(message).toContain('Precio publicado: Desde C$ 35,00')
    expect(message).toContain('Precio publicado: Consultar precio')
    expect(message).toContain('25 de octubre de 2026')
    expect(message).toContain('Decoración azul')
    expect(message).toContain('https://example.test/catalogo/dulce-encanto')
    expect(message).not.toContain('pastel-id')
    expect(message).not.toContain('image_path')
    expect(message).not.toContain('private/path')
    expect(buildQuoteRequestWhatsAppUrl('+505 (8888) 1111', message)).toContain('https://wa.me/50588881111?text=')
    expect(buildQuoteRequestWhatsAppUrl(null, message)).toBeNull()
  })

  it('formats a requested date in Spanish and allows no date', () => {
    expect(formatRequestedDate('2026-10-25')).toBe('25 de octubre de 2026')
    const item = addCatalogRequestItem([], products[0])
    const message = buildQuoteRequestMessage({ businessName: 'Dulce Encanto', customerName: 'María', items: item, desiredDate: '', details: '', catalogUrl: 'https://example.test/catalogo/dulce', currencySymbol: 'C$' })
    expect(message).not.toContain('Fecha deseada:')
    const savedMessage = buildQuoteRequestMessage({ businessName: 'Dulce Encanto', customerName: 'María', items: item, desiredDate: '', details: '', catalogUrl: 'https://example.test/catalogo/dulce', currencySymbol: 'C$', requestNumber: 'SOL-2026-0001' })
    expect(savedMessage).toContain('Número de solicitud: SOL-2026-0001')
  })
})
