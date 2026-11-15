import { Image, Minus, Plus } from 'lucide-react'
import type { PublicCatalogProduct } from '../../lib/database.types'
import { PublicCatalogImage } from './PublicCatalogImage'
import { PublicProductPrice } from './PublicProductPrice'

export function PublicProductCard({ product, currency, quantity, disabled = false, onOpen, onAdd, onQuantity }: {
  product: PublicCatalogProduct
  currency: string
  quantity: number
  disabled?: boolean
  onOpen: () => void
  onAdd: () => void
  onQuantity: (quantity: number) => void
}) {
  const pricePending = product.public_price_mode === 'contact'
  return <article className="public-product-card" data-product-id={product.id}>
    <button type="button" className="public-product-open" onClick={onOpen} aria-label={`Ver detalle de ${product.name}`}>
      <span className="public-product-media">
        <PublicCatalogImage path={product.image_path} alt="" className="public-product-image" fallback={<span><Image size={30} aria-hidden="true" /></span>} />
        {product.promotion_badge && <span className={`public-product-badge ${product.campaign_kind === 'showcase' ? 'is-showcase' : ''}`}>{product.promotion_badge}</span>}
        {!product.promotion_badge && product.promotion_type === 'two_for_one' && <span className="public-product-badge">2x1</span>}
      </span>
      <span className="public-card-copy">
        <span className="public-product-category">{product.category}</span>
        <strong className="public-product-name">{product.name}</strong>
        {product.description && <span className="public-card-description">{product.description}</span>}
        <span className="public-card-price"><PublicProductPrice product={product} currency={currency} compact /><small>/ {product.unit_label}</small></span>
        {product.default_portions !== null && product.default_portions > 0 && <span className="public-portions">{product.default_portions} porciones</span>}
        {pricePending && <span className="sr-only">El precio se confirma con el negocio.</span>}
      </span>
    </button>
    <div className="public-product-actions">
      {quantity === 0
        ? <button type="button" className="public-add-request" disabled={disabled} aria-label={`Agregar ${product.name} a solicitud`} onClick={onAdd}><Plus size={16} aria-hidden="true" /> Agregar</button>
        : <div className="public-product-actions-selection"><span className="public-added-label">Agregado</span><div className="public-quantity-control" aria-label={`Cantidad de ${product.name}`}>
          <button type="button" disabled={disabled} aria-label={`Disminuir cantidad de ${product.name}`} onClick={() => onQuantity(quantity - 1)}><Minus size={15} aria-hidden="true" /></button>
          <span aria-live="polite">{quantity}</span>
          <button type="button" disabled={disabled} aria-label={`Aumentar cantidad de ${product.name}`} onClick={() => onQuantity(quantity + 1)}><Plus size={15} aria-hidden="true" /></button>
        </div></div>}
    </div>
  </article>
}
