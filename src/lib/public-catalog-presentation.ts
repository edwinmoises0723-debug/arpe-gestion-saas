import { publicCatalogPriceLabel } from './catalog'
import type { CatalogCampaignKind, CatalogPromotionType, PublicCatalogProduct } from './database.types'

export type PublicCatalogCampaign = {
  id: string
  kind: CatalogCampaignKind
  promotionType: CatalogPromotionType | null
  name: string
  description: string
  badge: string
  imagePath: string | null
  featured: boolean
  products: PublicCatalogProduct[]
}

export type PublicProductPricePresentation = {
  currentText: string
  previousText: string | null
  savingsText: string | null
  badge: string | null
  offerNote: string | null
  pending: boolean
}

const monetaryPromotions = new Set<CatalogPromotionType>(['percentage', 'fixed_discount', 'fixed_price'])

export function groupPublicCatalogCampaigns(products: PublicCatalogProduct[]): PublicCatalogCampaign[] {
  const groups = new Map<string, PublicCatalogCampaign>()

  for (const product of products) {
    if (!product.campaign_id || !product.campaign_kind) continue
    const existing = groups.get(product.campaign_id)
    if (existing) {
      existing.products.push(product)
      if (!existing.badge && product.promotion_badge) existing.badge = product.promotion_badge
      if (!existing.imagePath && product.campaign_image_path) existing.imagePath = product.campaign_image_path
      continue
    }

    groups.set(product.campaign_id, {
      id: product.campaign_id,
      kind: product.campaign_kind,
      promotionType: product.promotion_type ?? null,
      name: product.campaign_name?.trim() || (product.campaign_kind === 'showcase' ? 'Novedades y destacados' : 'Oferta para ti'),
      description: product.campaign_description?.trim() ?? '',
      badge: product.promotion_badge?.trim() || defaultCampaignBadge(product.campaign_kind, product.promotion_type ?? null),
      imagePath: product.campaign_image_path ?? null,
      featured: product.campaign_featured === true,
      products: [product],
    })
  }

  return [...groups.values()]
}

export function filterPublicCatalogProductsByCampaign(products: PublicCatalogProduct[], campaignId: string | null) {
  return campaignId ? products.filter(product => product.campaign_id === campaignId) : products
}

export function getPublicProductPricePresentation(product: PublicCatalogProduct, currency: string): PublicProductPricePresentation {
  const kind = product.campaign_kind ?? null
  const promotionType = product.promotion_type ?? null
  const badge = kind === 'showcase'
    ? product.promotion_badge?.trim() || 'Destacado'
    : kind === 'promotion'
      ? product.promotion_badge?.trim() || defaultCampaignBadge(kind, promotionType)
      : null
  const offerNote = kind === 'promotion' && promotionType === 'two_for_one'
    ? 'Compra 1 y recibe 2'
    : promotionType === 'fixed_price'
      ? 'Precio especial'
      : promotionType === 'fixed_discount'
        ? 'Descuento aplicado'
        : promotionType === 'percentage'
          ? 'Oferta especial'
          : null

  if (product.public_price_mode === 'contact') {
    return { currentText: 'Precio pendiente', previousText: null, savingsText: null, badge, offerNote, pending: true }
  }

  const regularPrice = product.base_price ?? product.default_unit_price
  const resolvedPrice = monetaryPromotions.has(promotionType ?? 'combo')
    ? product.promotional_price ?? product.default_unit_price
    : product.default_unit_price

  if (resolvedPrice === null) {
    return { currentText: 'Precio no disponible', previousText: null, savingsText: null, badge, offerNote, pending: false }
  }

  const currentText = publicCatalogPriceLabel(product.public_price_mode, resolvedPrice, currency)
  const hasRealDiscount = kind === 'promotion'
    && monetaryPromotions.has(promotionType ?? 'combo')
    && regularPrice !== null
    && resolvedPrice < regularPrice
  const previousText = hasRealDiscount && regularPrice !== null
    ? publicCatalogPriceLabel(product.public_price_mode, regularPrice, currency)
    : null
  const savingsText = hasRealDiscount && product.public_price_mode === 'exact' && regularPrice !== null
    ? `Ahorras ${publicCatalogPriceLabel('exact', regularPrice - resolvedPrice, currency)}`
    : null

  return { currentText, previousText, savingsText, badge, offerNote, pending: false }
}

function defaultCampaignBadge(kind: CatalogCampaignKind, promotionType: CatalogPromotionType | null) {
  if (kind === 'showcase') return 'Destacado'
  if (promotionType === 'two_for_one') return '2x1'
  if (promotionType === 'fixed_price') return 'Precio especial'
  if (promotionType === 'fixed_discount') return 'Oferta'
  if (promotionType === 'percentage') return 'Descuento'
  return 'Oferta'
}
