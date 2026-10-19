import { client } from './supabase'
import type { PublicCatalogPriceMode, PublicCatalogProduct, PublicCatalogProfile } from './database.types'

const priceModes = new Set<PublicCatalogPriceMode>(['exact', 'from', 'contact'])

export async function loadPublicCatalogProfile(slug: string): Promise<PublicCatalogProfile | null> {
  const { data, error } = await client().rpc('ejnexa_get_public_catalog_profile', { p_slug: slug })
  if (error) throw error
  const row = data?.[0]
  if (!row) return null

  return {
    catalog_slug: row.catalog_slug,
    name: row.name,
    slogan: row.slogan,
    description: row.description,
    currency: row.currency,
    public_catalog_logo_path: row.public_catalog_logo_path,
    whatsapp: row.whatsapp,
  }
}

export async function loadPublicCatalogProducts(slug: string): Promise<PublicCatalogProduct[]> {
  const { data, error } = await client().rpc('ejnexa_get_public_catalog_products', { p_slug: slug })
  if (error) throw error
  return (data ?? []).map(row => {
    if (!priceModes.has(row.public_price_mode)) throw new Error('El catálogo contiene una forma de precio no válida.')
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      description: row.description,
      unit_label: row.unit_label,
      default_unit_price: row.default_unit_price,
      default_portions: row.default_portions,
      image_path: row.image_path,
      public_price_mode: row.public_price_mode,
      public_sort_order: row.public_sort_order,
    }
  })
}

export function filterPublicCatalogProducts(products: PublicCatalogProduct[], search: string, category: string) {
  const normalizedSearch = normalize(search.trim())
  return products.filter(product => {
    const matchesSearch = !normalizedSearch || normalize(`${product.name} ${product.category} ${product.description}`).includes(normalizedSearch)
    return matchesSearch && (!category || product.category === category)
  })
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
}
