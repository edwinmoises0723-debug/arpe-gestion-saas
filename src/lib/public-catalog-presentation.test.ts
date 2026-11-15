import { describe, expect, it } from 'vitest'
import type { PublicCatalogProduct } from './database.types'
import { filterPublicCatalogProductsByCampaign, getPublicProductPricePresentation, groupPublicCatalogCampaigns } from './public-catalog-presentation'

function product(overrides: Partial<PublicCatalogProduct> = {}): PublicCatalogProduct {
  return {
    id: 'product-1', name: 'Producto de prueba', category: 'Categoría real', description: '', unit_label: 'unidad',
    default_unit_price: 80, default_portions: null, image_path: null, public_price_mode: 'exact', public_sort_order: 1,
    campaign_id: 'campaign-1', campaign_kind: 'promotion', promotion_type: 'percentage', promotion_badge: '20% OFF',
    campaign_name: 'Oferta de temporada', campaign_description: 'Una descripción breve.', campaign_image_path: null,
    campaign_featured: true, base_price: 100, promotional_price: 80, ...overrides,
  }
}

describe('presentación del catálogo público', () => {
  it('presenta descuentos porcentuales con precios oficiales y ahorro derivado', () => {
    expect(getPublicProductPricePresentation(product(), '$')).toEqual({
      currentText: '$80', previousText: '$100', savingsText: 'Ahorras $20', badge: '20% OFF', offerNote: 'Oferta especial', pending: false,
    })
  })

  it('presenta descuento fijo y precio especial con comparación de precio real', () => {
    const fixedDiscount = getPublicProductPricePresentation(product({ promotion_type: 'fixed_discount', promotion_badge: 'OFERTA' }), 'C$')
    expect(fixedDiscount).toMatchObject({ currentText: 'C$80', previousText: 'C$100', savingsText: 'Ahorras C$20', badge: 'OFERTA' })
    const fixedPrice = getPublicProductPricePresentation(product({ promotion_type: 'fixed_price', promotion_badge: null }), '$')
    expect(fixedPrice).toMatchObject({ currentText: '$80', previousText: '$100', badge: 'Precio especial', offerNote: 'Precio especial' })
  })

  it('muestra 2x1 sin inventar un porcentaje ni tachar el precio unitario', () => {
    expect(getPublicProductPricePresentation(product({ promotion_type: 'two_for_one', promotion_badge: null, base_price: 100, promotional_price: null }), '$'))
      .toMatchObject({ currentText: '$80', previousText: null, savingsText: null, badge: '2x1', offerNote: 'Compra 1 y recibe 2' })
  })

  it('muestra showcase sin alterar ni tachar el precio habitual', () => {
    expect(getPublicProductPricePresentation(product({ campaign_kind: 'showcase', promotion_type: null, promotion_badge: 'Nuevo', promotional_price: null }), '$'))
      .toMatchObject({ currentText: '$80', previousText: null, savingsText: null, badge: 'Nuevo', offerNote: null })
  })

  it('conserva exact, from y contact, incluso cuando 2x1 coincide con precio pendiente', () => {
    expect(getPublicProductPricePresentation(product({ campaign_id: null, campaign_kind: null, promotion_type: null, base_price: null, promotional_price: null }), 'C$').currentText).toBe('C$80')
    expect(getPublicProductPricePresentation(product({ public_price_mode: 'from' }), '$'))
      .toMatchObject({ currentText: 'Desde $80', previousText: 'Desde $100', savingsText: null })
    expect(getPublicProductPricePresentation(product({ public_price_mode: 'contact', default_unit_price: null, promotion_type: 'two_for_one', promotion_badge: null }), '$'))
      .toMatchObject({ currentText: 'Precio pendiente', badge: '2x1', offerNote: 'Compra 1 y recibe 2', pending: true })
  })

  it('agrupa productos por campaña sin duplicar campañas y permite filtrar por campaña', () => {
    const first = product()
    const second = product({ id: 'product-2', name: 'Segundo producto' })
    const other = product({ id: 'product-3', campaign_id: 'campaign-2', campaign_name: 'Otra oferta', campaign_featured: false })
    const campaigns = groupPublicCatalogCampaigns([first, second, other])
    expect(campaigns).toHaveLength(2)
    expect(campaigns[0]).toMatchObject({ id: 'campaign-1', name: 'Oferta de temporada', featured: true })
    expect(campaigns[0].products).toHaveLength(2)
    expect(filterPublicCatalogProductsByCampaign([first, second, other], 'campaign-1')).toEqual([first, second])
    expect(filterPublicCatalogProductsByCampaign([first, second, other], null)).toEqual([first, second, other])
  })
})
