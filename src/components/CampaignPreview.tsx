import { Image, Sparkles } from 'lucide-react'
import type { Business, CatalogProduct, PublicCatalogProduct } from '../lib/database.types'
import { catalogImageUrl } from '../lib/catalog'
import { currencies } from '../lib/business'
import { buildCampaignPricePreview, type CampaignDraft } from '../lib/catalog-campaigns'
import { PublicProductPrice } from './public-catalog/PublicProductPrice'
import { CampaignProductVisual } from './CampaignProductVisual'

export function CampaignPreview({ business, draft, products, imageUrl }: {
  business: Business
  draft: CampaignDraft
  products: CatalogProduct[]
  imageUrl?: string | null
}) {
  const selectedProducts = draft.productIds.map(id => products.find(product => product.id === id)).filter((product): product is CatalogProduct => Boolean(product))
  const value = draft.value.trim() ? Number(draft.value) : 0
  const campaignImage = imageUrl ?? (draft.imagePath ? catalogImageUrl(draft.imagePath) : null)
  return <section className="campaign-preview" aria-label="Vista previa de la promoción">
    <div className="campaign-preview-heading"><span className="campaign-preview-icon"><Sparkles size={18} aria-hidden="true" /></span><div><strong>Así podría verse en el catálogo</strong><p>Vista previa con la información de este negocio.</p></div></div>
    {campaignImage && <div className="campaign-preview-campaign-image"><img src={campaignImage} alt={draft.name.trim() ? `Imagen de ${draft.name.trim()}` : 'Imagen de campaña'} /></div>}
    {selectedProducts.length ? <div className="campaign-preview-grid">{selectedProducts.map(product => <CampaignPreviewCard key={product.id} business={business} draft={draft} product={product} value={value} />)}</div>
      : <div className="campaign-preview-empty"><Image size={20} /><span>Selecciona productos para ver la vista previa.</span></div>}
    {draft.featured && <p className="campaign-featured-hint">Esta oferta puede aparecer como destacada cuando configures esa zona del catálogo.</p>}
  </section>
}

function CampaignPreviewCard({ business, draft, product, value }: {
  business: Business
  draft: CampaignDraft
  product: CatalogProduct
  value: number
}) {
  const preview = buildCampaignPricePreview(draft.offerType, product, value, draft.badgeText)
  const publicProduct: PublicCatalogProduct = {
    ...product,
    campaign_id: 'campaign-preview',
    campaign_kind: draft.offerType === 'showcase' ? 'showcase' : 'promotion',
    promotion_type: draft.offerType === 'showcase' ? null : draft.offerType,
    promotion_badge: preview.badge,
    campaign_name: draft.name.trim(),
    campaign_description: draft.description.trim(),
    campaign_image_path: draft.imagePath,
    campaign_featured: draft.featured,
    base_price: preview.before,
    promotional_price: preview.after,
  }
  return <article className="campaign-preview-card">
    <CampaignProductVisual product={product} className="campaign-preview-image" fallbackClassName="campaign-preview-image-empty" />
    <div className="campaign-preview-body">
      <small className="campaign-preview-category">{product.category}</small>
      <h3>{product.name}</h3>
      {draft.description.trim() && <p>{draft.description.trim()}</p>}
      {draft.offerType === 'showcase' && <strong className="campaign-preview-message">{draft.name.trim() || 'Producto destacado'}</strong>}
      <div className="campaign-preview-price"><PublicProductPrice product={publicProduct} currency={currencies.find(currency => currency.code === business.currency)?.symbol ?? ''} compact /><small>/ {product.unit_label}</small></div>
      {product.default_portions !== null && product.default_portions > 0 && <small className="campaign-preview-portions">{product.default_portions} {product.default_portions === 1 ? 'porción' : 'porciones'}</small>}
    </div>
  </article>
}
