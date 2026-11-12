import { beforeEach, describe, expect, it, vi } from 'vitest'
import { filterPublicCatalogProducts, loadPublicCatalogProducts, loadPublicCatalogProfile } from './public-catalog'
import type { PublicCatalogProduct, PublicCatalogProfile } from './database.types'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('./supabase', () => ({ client: () => ({ rpc }) }))

const profile: PublicCatalogProfile = {
  catalog_slug: 'arpe-dulce-encanto', name: 'ARPE Dulce Encanto', slogan: 'Hecho con cariño',
  description: 'Repostería artesanal', currency: 'NIO', public_catalog_logo_path: 'owner/business/profile/logo.png', whatsapp: null,
}
const noCampaign = {
  campaign_id: null,
  campaign_kind: null,
  promotion_type: null,
  promotion_badge: null,
  campaign_name: null,
  campaign_description: null,
  campaign_image_path: null,
  campaign_featured: null,
  base_price: null,
  promotional_price: null,
}
const products: PublicCatalogProduct[] = [
  { ...noCampaign, id: '1', name: 'Pastel de Chocolate', category: 'Pasteles', description: 'Con ganache', unit_label: 'pastel', default_unit_price: 850, default_portions: 20, image_path: 'owner/business/products/pastel.png', public_price_mode: 'exact', public_sort_order: 1 },
  { ...noCampaign, id: '2', name: 'Tres Leches', category: 'Postres', description: 'Consultar sabores', unit_label: 'unidad', default_unit_price: 900, default_portions: null, image_path: null, public_price_mode: 'from', public_sort_order: 2 },
  { ...noCampaign, id: '3', name: 'Alfajor', category: 'Galletas', description: 'Precio a consultar', unit_label: 'unidad', default_unit_price: null, default_portions: null, image_path: null, public_price_mode: 'contact', public_sort_order: 3 },
]

describe('catálogo público', () => {
  beforeEach(() => rpc.mockReset())

  it('carga solo el perfil mediante su RPC y normaliza la respuesta de una fila', async () => {
    rpc.mockResolvedValue({ data: [profile], error: null })
    await expect(loadPublicCatalogProfile(profile.catalog_slug!)).resolves.toEqual(profile)
    expect(rpc).toHaveBeenCalledWith('ejnexa_get_public_catalog_profile', { p_slug: 'arpe-dulce-encanto' })
  })

  it('devuelve null cuando el slug no existe y propaga errores de la RPC', async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null })
    await expect(loadPublicCatalogProfile('no-existe')).resolves.toBeNull()
    const failure = new Error('network unavailable')
    rpc.mockResolvedValueOnce({ data: null, error: failure })
    await expect(loadPublicCatalogProfile('arpe-dulce-encanto')).rejects.toBe(failure)
  })

  it('carga productos por RPC y no devuelve campos administrativos', async () => {
    rpc.mockResolvedValue({ data: products, error: null })
    const result = await loadPublicCatalogProducts('arpe-dulce-encanto')
    expect(rpc).toHaveBeenCalledWith('ejnexa_get_public_catalog_products', { p_slug: 'arpe-dulce-encanto' })
    expect(result).toEqual(products)
    expect(result[0]).not.toHaveProperty('business_id')
    expect(result[0]).not.toHaveProperty('is_active')
  })

  it('uses server-resolved promotion prices and preserves the base price for display', async () => {
    const promoted: PublicCatalogProduct = {
      ...products[0], default_unit_price: 750, campaign_id: 'campaign-1', campaign_kind: 'promotion',
      promotion_type: 'percentage', promotion_badge: '25% OFF', campaign_name: 'Semana dulce',
      campaign_description: 'Oferta de temporada', campaign_image_path: 'owner/business/campaigns/semana.png',
      campaign_featured: true, base_price: 1000, promotional_price: 750,
    }
    rpc.mockResolvedValue({ data: [promoted], error: null })
    const result = await loadPublicCatalogProducts('arpe-dulce-encanto')
    expect(result[0]).toEqual(promoted)
    expect(result[0].default_unit_price).toBe(750)
    expect(result[0].base_price).toBe(1000)
  })

  it('keeps contact-priced products pending when a monetary campaign is not publishable', async () => {
    rpc.mockResolvedValue({ data: [{
      ...products[2], campaign_id: null, campaign_kind: null, promotion_type: null,
      promotion_badge: null, campaign_name: null, campaign_description: null,
      campaign_image_path: null, campaign_featured: null, base_price: null, promotional_price: null,
    }], error: null })
    const [contactProduct] = await loadPublicCatalogProducts('arpe-dulce-encanto')
    expect(contactProduct.public_price_mode).toBe('contact')
    expect(contactProduct.default_unit_price).toBeNull()
    expect(contactProduct.promotional_price).toBeNull()
    expect(contactProduct.campaign_id).toBeNull()
  })

  it('rejects malformed campaign values returned by the public RPC', async () => {
    rpc.mockResolvedValue({ data: [{ ...products[0], promotion_type: 'invented' }], error: null })
    await expect(loadPublicCatalogProducts('arpe-dulce-encanto')).rejects.toThrow('tipo de promoción no válido')
  })

  it('combina búsqueda insensible a mayúsculas y acentos con categoría', () => {
    expect(filterPublicCatalogProducts(products, 'CHOCOLATE', 'Pasteles')).toEqual([products[0]])
    expect(filterPublicCatalogProducts(products, 'chocolate', 'Postres')).toEqual([])
    expect(filterPublicCatalogProducts(products, '', '')).toEqual(products)
  })
})
