import { useMemo, useState } from 'react'
import { Image, Search } from 'lucide-react'
import type { Business, CatalogProduct } from '../lib/database.types'
import { catalogImageUrl } from '../lib/catalog'
import { formatCurrency } from '../lib/quotes'
import type { CampaignOfferType } from '../lib/catalog-campaigns'

const monetaryOffers: CampaignOfferType[] = ['percentage', 'fixed_discount', 'fixed_price']

export function CampaignProductPicker({ business, products, offerType, selected, onChange }: {
  business: Business
  products: CatalogProduct[]
  offerType: CampaignOfferType
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const categories = useMemo(() => [...new Set(products.map(product => product.category))].sort((a, b) => a.localeCompare(b)), [products])
  const visible = useMemo(() => {
    const normalized = search.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    return products.filter(product => {
      const content = `${product.name} ${product.category}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      return (!normalized || content.includes(normalized)) && (!category || product.category === category)
    })
  }, [products, search, category])

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter(productId => productId !== id) : [...selected, id])
  }

  if (!products.length) return <div className="campaign-no-products" role="status"><span className="campaign-type-icon"><Image size={21} /></span><div><strong>Primero agrega productos a tu catálogo</strong><p>Después podrás elegir cuáles participan en esta promoción.</p></div></div>

  return <div className="campaign-product-picker">
    <div className="campaign-picker-tools">
      <label>Buscar productos<span className="campaign-search"><Search size={17} aria-hidden="true" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nombre o categoría" /></span></label>
      <label>Categoría<select value={category} onChange={event => setCategory(event.target.value)}><option value="">Todas</option>{categories.map(value => <option value={value} key={value}>{value}</option>)}</select></label>
    </div>
    <p className="campaign-selection-count" aria-live="polite">{selected.length} {selected.length === 1 ? 'producto seleccionado' : 'productos seleccionados'}</p>
    <div className="campaign-product-grid">
      {visible.map(product => {
        const isSelected = selected.includes(product.id)
        const priceBlocked = monetaryOffers.includes(offerType) && product.public_price_mode === 'contact' && !isSelected
        const image = catalogImageUrl(product.image_path)
        return <label key={product.id} className={`campaign-product-option${isSelected ? ' is-selected' : ''}${priceBlocked ? ' is-disabled' : ''}`}>
          <input
            type="checkbox"
            checked={isSelected}
            disabled={priceBlocked}
            onChange={() => toggle(product.id)}
            aria-label={`${isSelected ? 'Quitar' : 'Seleccionar'} ${product.name}`}
          />
          <span className="campaign-product-image">{image ? <img src={image} alt="" loading="lazy" /> : <Image size={21} aria-hidden="true" />}</span>
          <span className="campaign-product-info"><strong>{product.name}</strong><small>{product.category}</small><span className="campaign-product-price">{product.public_price_mode === 'contact' || product.default_unit_price === null ? 'Precio pendiente' : `${product.public_price_mode === 'from' ? 'Desde ' : ''}${formatCurrency(Number(product.default_unit_price), business)} / ${product.unit_label}`}</span><span className="campaign-product-statuses"><small>{product.is_active ? 'Activo' : 'Inactivo'}</small><small>{product.is_public ? 'Público' : 'Privado'}</small></span>
            {priceBlocked && <small className="campaign-product-warning">Este producto tiene Precio pendiente. Define un precio antes de aplicar una promoción monetaria.</small>}
          </span>
        </label>
      })}
      {!visible.length && <p className="campaign-empty-filter" role="status">No encontramos productos con esos filtros.</p>}
    </div>
  </div>
}
