import type { PublicCatalogProduct } from '../../lib/database.types'
import { getPublicProductPricePresentation } from '../../lib/public-catalog-presentation'

export function PublicProductPrice({ product, currency, compact = false }: {
  product: PublicCatalogProduct
  currency: string
  compact?: boolean
}) {
  const presentation = getPublicProductPricePresentation(product, currency)
  return <span className={`public-price ${compact ? 'is-compact' : ''} ${presentation.pending ? 'is-pending' : ''}`}>
    {presentation.badge && <span className="public-promotion-badge">{presentation.badge}</span>}
    {presentation.previousText
      ? <span className="public-price-comparison"><small>Antes</small><del>{presentation.previousText}</del><small>Ahora</small><strong>{presentation.currentText}</strong></span>
      : <strong className="public-price-current">{presentation.currentText}</strong>}
    {presentation.offerNote && <small className="public-price-note">{presentation.offerNote}</small>}
    {presentation.savingsText && <small className="public-price-savings">{presentation.savingsText}</small>}
  </span>
}
