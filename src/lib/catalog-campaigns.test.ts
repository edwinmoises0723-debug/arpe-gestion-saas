import { describe, expect, it } from 'vitest'
import type { CatalogProduct } from './database.types'
import { buildCampaignInput, buildCampaignPricePreview, campaignErrorMessage, defaultCampaignBadge, getCampaignDisplayStatus, validateCampaignDraft } from './catalog-campaigns'

const products: CatalogProduct[] = [
  { id: 'p1', business_id: 'b1', name: 'Item A', category: 'Retail', description: '', unit_label: 'unidad', default_unit_price: 100, default_portions: null, default_flavor: '', default_filling: '', default_decoration: '', default_extras: '', is_active: true, image_path: null, is_public: true, public_price_mode: 'exact', public_sort_order: 0, created_at: '', updated_at: '' },
  { id: 'p2', business_id: 'b1', name: 'Item B', category: 'Retail', description: '', unit_label: 'par', default_unit_price: 50, default_portions: null, default_flavor: '', default_filling: '', default_decoration: '', default_extras: '', is_active: true, image_path: null, is_public: false, public_price_mode: 'from', public_sort_order: 1, created_at: '', updated_at: '' },
  { id: 'p3', business_id: 'b1', name: 'Custom Item', category: 'Services', description: '', unit_label: 'servicio', default_unit_price: 25, default_portions: null, default_flavor: '', default_filling: '', default_decoration: '', default_extras: '', is_active: true, image_path: null, is_public: true, public_price_mode: 'contact', public_sort_order: 2, created_at: '', updated_at: '' },
]

const validDraft = (overrides: Partial<Parameters<typeof validateCampaignDraft>[0]> = {}) => ({
  offerType: 'percentage' as const, name: 'Temporada', description: '', badgeText: '', value: '25', productIds: ['p1'], startsOn: '', endsOn: '', ...overrides,
})

describe('campaign offers and previews', () => {
  it('builds price previews for percentage, fixed discount and fixed price', () => {
    expect(buildCampaignPricePreview('percentage', products[0], 25)).toMatchObject({ before: 100, after: 75, badge: '25% OFF' })
    expect(buildCampaignPricePreview('fixed_discount', products[0], 20)).toMatchObject({ before: 100, after: 80, badge: 'Oferta' })
    expect(buildCampaignPricePreview('fixed_price', products[0], 79, 'Especial')).toMatchObject({ before: 100, after: 79, badge: 'Especial' })
  })

  it('keeps 2x1 and showcase non-monetary and supports contact prices', () => {
    expect(buildCampaignPricePreview('two_for_one', products[0], 0)).toMatchObject({ before: 100, after: 100, message: 'Compra 1 y recibe 2 del mismo producto.' })
    expect(buildCampaignPricePreview('showcase', products[0], 0)).toMatchObject({ before: 100, after: 100, message: 'Producto destacado' })
    expect(buildCampaignPricePreview('two_for_one', products[2], 0)).toMatchObject({ before: null, after: null, message: 'Precio pendiente' })
    expect(buildCampaignPricePreview('showcase', products[2], 0)).toMatchObject({ before: null, after: null, message: 'Precio pendiente' })
  })

  it('validates type-specific values and contact-priced products', () => {
    expect(validateCampaignDraft(validDraft({ value: '101' }), products)).toContain('El descuento debe ser un número entero entre 1 y 100.')
    expect(validateCampaignDraft(validDraft({ offerType: 'percentage', productIds: ['p3'] }), products)).toContain('Los productos con Precio pendiente no pueden tener descuentos monetarios.')
    expect(validateCampaignDraft(validDraft({ offerType: 'fixed_discount', value: '51', productIds: ['p2'] }), products)).toContain('El descuento no puede ser mayor que el precio habitual de un producto seleccionado.')
    expect(validateCampaignDraft(validDraft({ offerType: 'fixed_price', value: '0', productIds: ['p1'] }), products)).toEqual([])
    expect(validateCampaignDraft(validDraft({ offerType: 'two_for_one', value: '', productIds: ['p3'] }), products)).toEqual([])
    expect(validateCampaignDraft(validDraft({ offerType: 'showcase', value: '', productIds: ['p3'] }), products)).toEqual([])
  })

  it('requires products, valid dates, and a badge within the database limit', () => {
    expect(validateCampaignDraft(validDraft({ productIds: [] }), products)).toContain('Selecciona al menos un producto.')
    expect(validateCampaignDraft(validDraft({ startsOn: '2026-10-20', endsOn: '2026-10-19' }), products)).toContain('La fecha final debe ser igual o posterior a la fecha de inicio.')
    expect(validateCampaignDraft(validDraft({ badgeText: 'x'.repeat(61) }), products)).toContain('El badge no puede superar 60 caracteres.')
  })

  it('builds the correct database snapshots for each offer kind', () => {
    expect(buildCampaignInput({ ...emptyCampaignDraft(), offerType: 'percentage', value: '25' }, 'b1')).toMatchObject({
      business_id: 'b1', campaign_kind: 'promotion', promotion_type: 'percentage', percentage_discount: 25, fixed_discount: null, promo_price: null, active: false,
    })
    expect(buildCampaignInput({ ...emptyCampaignDraft(), offerType: 'showcase' }, 'b1')).toMatchObject({ campaign_kind: 'showcase', promotion_type: null, percentage_discount: null, fixed_discount: null, promo_price: null })
    expect(defaultCampaignBadge('fixed_price')).toBe('Precio especial')
  })

  it('derives inactive, scheduled, active and finished labels from campaign fields', () => {
    const today = '2026-11-12'
    expect(getCampaignDisplayStatus({ active: false, starts_on: null, ends_on: null }, today)).toBe('inactive')
    expect(getCampaignDisplayStatus({ active: true, starts_on: '2026-11-13', ends_on: null }, today)).toBe('scheduled')
    expect(getCampaignDisplayStatus({ active: true, starts_on: null, ends_on: '2026-11-12' }, today)).toBe('active')
    expect(getCampaignDisplayStatus({ active: true, starts_on: null, ends_on: '2026-11-11' }, today)).toBe('finished')
  })

  it('translates overlap and database errors into safe Spanish copy', () => {
    expect(campaignErrorMessage({ code: '23514', message: 'A product cannot have overlapping active commercial promotions' })).toContain('Uno de los productos ya tiene una promoción activa')
    expect(campaignErrorMessage({ code: '23514', message: 'raw SQL detail' })).toBe('No pudimos guardar la promoción. Revisa sus productos, fechas y valores.')
    expect(campaignErrorMessage({ code: 'PGRST', message: 'raw SQL detail' })).not.toContain('raw SQL')
  })
})

function emptyCampaignDraft() {
  return { offerType: 'percentage' as const, name: 'Temporada', description: '', badgeText: '', value: '', productIds: ['p1'], startsOn: '', endsOn: '', featured: false, imagePath: null, imageFile: null, removeImage: false }
}
