import { Image, Sparkles } from 'lucide-react'
import type { Business, CatalogProduct } from '../lib/database.types'
import { catalogImageUrl } from '../lib/catalog'
import { buildCampaignPricePreview, type CampaignDraft } from '../lib/catalog-campaigns'
import { formatCurrency } from '../lib/quotes'

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
    {selectedProducts.length ? <div className="campaign-preview-grid">{selectedProducts.map(product => <CampaignPreviewCard key={product.id} business={business} draft={draft} product={product} imageUrl={campaignImage} value={value} />)}</div>
      : <div className="campaign-preview-empty"><Image size={20} /><span>Selecciona productos para ver la vista previa.</span></div>}
    {draft.featured && <p className="campaign-featured-hint">Esta oferta puede aparecer como destacada cuando configures esa zona del catálogo.</p>}
  </section>
}

function CampaignPreviewCard({ business, draft, product, imageUrl, value }: {
  business: Business
  draft: CampaignDraft
  product: CatalogProduct
  imageUrl: string | null
  value: number
}) {
  const preview = buildCampaignPricePreview(draft.offerType, product, value, draft.badgeText)
  const productImage = catalogImageUrl(product.image_path)
  const image = imageUrl || productImage
  const isMonetary = ['percentage', 'fixed_discount', 'fixed_price'].includes(draft.offerType)
  const showDiscounted = isMonetary && preview.before !== null && preview.after !== null
  return <article className="campaign-preview-card">
    {image ? <img className="campaign-preview-image" src={image} alt="" /> : <div className="campaign-preview-image campaign-preview-image-empty"><Image size={24} aria-hidden="true" /></div>}
    <div className="campaign-preview-body">
      <span className="campaign-preview-badge">{preview.badge}</span>
      <small className="campaign-preview-category">{product.category}</small>
      <h3>{product.name}</h3>
      {draft.description.trim() && <p>{draft.description.trim()}</p>}
      {draft.offerType === 'showcase' && <strong className="campaign-preview-message">{draft.name.trim() || 'Producto destacado'}</strong>}
      {draft.offerType === 'two_for_one' && <strong className="campaign-preview-message">Compra 1 y recibe 2</strong>}
      {product.public_price_mode === 'contact' || preview.after === null
        ? <strong className="campaign-preview-pending">Precio pendiente</strong>
        : <div className="campaign-preview-price">{showDiscounted && <del>{formatCurrency(preview.before!, business)}</del>}<strong>{formatCurrency(preview.after, business)}</strong>{product.public_price_mode === 'from' && <small>Desde</small>}</div>}
      {draft.offerType === 'two_for_one' && product.public_price_mode !== 'contact' && <small className="campaign-preview-unit">{formatCurrency(Number(product.default_unit_price), business)} / {product.unit_label}</small>}
    </div>
  </article>
}
