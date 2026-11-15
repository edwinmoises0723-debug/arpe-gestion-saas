import { useEffect, useRef } from 'react'
import { Image, Minus, Plus, X } from 'lucide-react'
import type { PublicCatalogProduct } from '../../lib/database.types'
import { PublicCatalogImage } from './PublicCatalogImage'
import { PublicProductPrice } from './PublicProductPrice'

export function PublicProductDialog({ product, currency, quantity, disabled, onClose, onAdd, onQuantity }: {
  product: PublicCatalogProduct | null
  currency: string
  quantity: number
  disabled: boolean
  onClose: () => void
  onAdd: () => void
  onQuantity: (quantity: number) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (product && dialog.current && !dialog.current.open) dialog.current.showModal()
    if (!product && dialog.current?.open) dialog.current.close()
  }, [product])

  return <dialog
    ref={dialog}
    className="public-product-dialog"
    aria-labelledby="public-dialog-title"
    onClose={onClose}
    onClick={event => { if (event.target === dialog.current) dialog.current?.close() }}
  >
    {product && <div className="public-dialog-content">
      <button type="button" className="public-dialog-close" aria-label="Cerrar detalle" onClick={() => dialog.current?.close()}><X size={19} aria-hidden="true" /></button>
      <PublicCatalogImage path={product.image_path} alt={product.name} className="public-dialog-image" fallback={<span><Image size={34} aria-hidden="true" />Imagen no disponible</span>} />
      <div className="public-dialog-copy">
        <span className="public-product-category">{product.category}</span>
        <h2 id="public-dialog-title">{product.name}</h2>
        {product.description && <p className="public-dialog-description">{product.description}</p>}
        <PublicProductPrice product={product} currency={currency} />
        <p className="public-unit">/ {product.unit_label}</p>
        {product.default_portions !== null && product.default_portions > 0 && <p className="public-portions">{product.default_portions} porciones</p>}
        {quantity === 0
          ? <button type="button" className="public-add-request public-dialog-add" disabled={disabled} aria-label={`Agregar ${product.name} a solicitud`} onClick={onAdd}><Plus size={16} aria-hidden="true" /> Agregar a solicitud</button>
          : <div className="public-dialog-selected"><span>En tu solicitud</span><div className="public-quantity-control" aria-label={`Cantidad de ${product.name}`}><button type="button" disabled={disabled} aria-label={`Disminuir cantidad de ${product.name}`} onClick={() => onQuantity(quantity - 1)}><Minus size={15} aria-hidden="true" /></button><span aria-live="polite">{quantity}</span><button type="button" disabled={disabled} aria-label={`Aumentar cantidad de ${product.name}`} onClick={() => onQuantity(quantity + 1)}><Plus size={15} aria-hidden="true" /></button></div></div>}
      </div>
    </div>}
  </dialog>
}
