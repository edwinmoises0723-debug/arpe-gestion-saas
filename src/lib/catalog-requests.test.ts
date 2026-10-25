import { describe, expect, it } from 'vitest'
import type { CatalogRequest, CatalogRequestItem } from './database.types'
import { filterCatalogRequests, formatCatalogRequestDate, isCatalogRequestQuotePreparation, pendingCatalogRequestPriceNames, prepareCatalogRequestQuote } from './catalog-requests'

const request = (overrides: Partial<CatalogRequest> = {}): CatalogRequest => ({
  id: 'request-a', business_id: 'business-a', request_number: 'SOL-2026-0001', client_request_key: 'key-a',
  customer_name: 'María Gómez', customer_phone: '+505 8888 1111', desired_date: '2026-11-02', details: 'Sin nueces',
  status: 'new', converted_quote_id: null, submitted_at: '2026-10-24T18:30:00Z', updated_at: '2026-10-24T18:30:00Z',
  reviewed_at: null, converted_at: null, ...overrides,
})

const item = (overrides: Partial<CatalogRequestItem> = {}): CatalogRequestItem => ({
  id: 'item-a', request_id: 'request-a', business_id: 'business-a', catalog_product_id: 'product-a', position: 1,
  product_name_snapshot: 'Pastel de Chocolate', category_snapshot: 'Pasteles', quantity: 2,
  unit_label_snapshot: 'unidad', default_portions_snapshot: 12, public_price_mode_snapshot: 'exact',
  public_unit_price_snapshot: 850, created_at: '2026-10-24T18:30:00Z', ...overrides,
})

describe('solicitudes internas del catálogo', () => {
  it('busca por número o cliente sin distinguir mayúsculas ni acentos y filtra por estado', () => {
    const requests = [request(), request({ id: 'request-b', request_number: 'SOL-2026-0002', customer_name: 'Carlos Ruiz', status: 'reviewing' })]
    expect(filterCatalogRequests(requests, 'maria gomez', 'all').map(value => value.id)).toEqual(['request-a'])
    expect(filterCatalogRequests(requests, 'SOL-2026-0002', 'reviewing').map(value => value.id)).toEqual(['request-b'])
    expect(filterCatalogRequests(requests, 'Carlos', 'new')).toEqual([])
  })

  it('prepara una cotización con cliente, fecha, notas, productos y precio histórico del snapshot', () => {
    const result = prepareCatalogRequestQuote(request(), [
      item({ position: 2, id: 'item-contact', catalog_product_id: 'product-contact', product_name_snapshot: 'Topper personalizado', public_price_mode_snapshot: 'contact', public_unit_price_snapshot: null }),
      item(),
    ])
    expect(result.header).toEqual({ customer_name: 'María Gómez', customer_phone: '+505 8888 1111', delivery_date: '2026-11-02', notes: 'Sin nueces' })
    expect(result.items.map(value => value.product)).toEqual(['Pastel de Chocolate', 'Topper personalizado'])
    expect(result.items[0].unit_price).toBe(850)
    expect(result.items[1].unit_price).toBe(0)
    expect(result.items[1].catalog_product_id).toBe('product-contact')
    expect(result.itemsWithoutPublishedPrice).toEqual(['Topper personalizado'])
    expect(result.items.every(value => value.cost === null && value.direct_costs.length === 0)).toBe(true)
  })

  it('no acepta estado de navegación preparado para otro negocio', () => {
    const preparation = prepareCatalogRequestQuote(request(), [item()])
    expect(isCatalogRequestQuotePreparation(preparation, 'business-a')).toBe(true)
    expect(isCatalogRequestQuotePreparation(preparation, 'business-b')).toBe(false)
  })

  it('marca precio contact pendiente por catalog_product_id y libera al definirlo o retirar/reemplazar el producto', () => {
    const preparation = prepareCatalogRequestQuote(request(), [item({
      catalog_product_id: 'product-contact',
      product_name_snapshot: 'Topper personalizado',
      public_price_mode_snapshot: 'contact',
      public_unit_price_snapshot: null,
    })])
    const pendingItem = preparation.items[0]

    expect(pendingCatalogRequestPriceNames(preparation, [pendingItem])).toEqual(['Topper personalizado'])
    expect(pendingCatalogRequestPriceNames(preparation, [{ ...pendingItem, unit_price: 150 }])).toEqual([])
    expect(pendingCatalogRequestPriceNames(preparation, [])).toEqual([])
    expect(pendingCatalogRequestPriceNames(preparation, [{ ...pendingItem, catalog_product_id: 'different-product' }])).toEqual([])
  })

  it('mantiene bloqueado un duplicado contact sin precio y permite precios cero legítimos', () => {
    const contactPreparation = prepareCatalogRequestQuote(request(), [item({
      catalog_product_id: 'product-contact',
      product_name_snapshot: 'Topper personalizado',
      public_price_mode_snapshot: 'contact',
      public_unit_price_snapshot: null,
    })])
    const pendingItem = contactPreparation.items[0]
    expect(pendingCatalogRequestPriceNames(contactPreparation, [pendingItem, { ...pendingItem }])).toEqual(['Topper personalizado'])

    const exactFreePreparation = prepareCatalogRequestQuote(request(), [item({ public_unit_price_snapshot: 0 })])
    const fromFreePreparation = prepareCatalogRequestQuote(request(), [item({ public_price_mode_snapshot: 'from', public_unit_price_snapshot: 0 })])
    expect(pendingCatalogRequestPriceNames(exactFreePreparation, exactFreePreparation.items)).toEqual([])
    expect(pendingCatalogRequestPriceNames(fromFreePreparation, fromFreePreparation.items)).toEqual([])
  })

  it('formatea fechas date-only sin desplazamiento de zona horaria y omite fechas vacías', () => {
    expect(formatCatalogRequestDate('2026-11-02', { day: 'numeric', month: 'long', year: 'numeric' })).toContain('2')
    expect(formatCatalogRequestDate(null)).toBeNull()
  })
})
