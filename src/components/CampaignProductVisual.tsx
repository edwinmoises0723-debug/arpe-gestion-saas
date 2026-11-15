import { Package } from 'lucide-react'
import type { CatalogProduct } from '../lib/database.types'
import { PublicCatalogImage } from './public-catalog/PublicCatalogImage'

export function CampaignProductVisual({ product, className, fallbackClassName }: {
  product: Pick<CatalogProduct, 'image_path' | 'name'>
  className: string
  fallbackClassName: string
}) {
  return <PublicCatalogImage
    path={product.image_path}
    alt=""
    className={className}
    fallback={<span className={fallbackClassName} role="img" aria-label={`Sin imagen para ${product.name}`}><Package size={25} aria-hidden="true" /><small>Sin imagen</small></span>}
  />
}
