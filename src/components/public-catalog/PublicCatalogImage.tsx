import { useState, type ReactNode } from 'react'
import { catalogImageUrl } from '../../lib/catalog'

export function PublicCatalogImage({ path, alt, className, fallback, priority = false }: {
  path: string | null | undefined
  alt: string
  className: string
  fallback: ReactNode
  priority?: boolean
}) {
  const [failedPath, setFailedPath] = useState<string | null>(null)
  const url = catalogImageUrl(path)

  return <span className={className}>
    {url && failedPath !== path
      ? <img src={url} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : 'auto'} onError={() => setFailedPath(path ?? null)} />
      : fallback}
  </span>
}
