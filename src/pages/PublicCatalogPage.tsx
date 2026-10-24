import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { ClipboardList, Image, Minus, Plus, Search, X } from 'lucide-react'
import { catalogImageUrl, publicCatalogPriceLabel } from '../lib/catalog'
import { filterPublicCatalogProducts, loadPublicCatalogProducts, loadPublicCatalogProfile } from '../lib/public-catalog'
import { currencies } from '../lib/business'
import type { PublicCatalogProduct, PublicCatalogProfile } from '../lib/database.types'
import { CatalogDistributionActions } from '../components/CatalogDistributionActions'
import { CatalogRequestPanel } from '../components/CatalogRequestPanel'
import { addCatalogRequestItem, removeCatalogRequestItem, setCatalogRequestQuantity, type CatalogRequestItem } from '../lib/catalog-request'
import './styles-public-catalog.css'

type CatalogState = { status: 'loading' } | { status: 'error' } | { status: 'unavailable' } | { status: 'ready'; profile: PublicCatalogProfile; products: PublicCatalogProduct[] }

export function PublicCatalogPage() {
  const { slug = '' } = useParams()
  const [storedState, setStoredState] = useState<{ slug: string; value: CatalogState }>({ slug: '', value: { status: 'loading' } })
  const [retry, setRetry] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [selected, setSelected] = useState<PublicCatalogProduct | null>(null)
  const [requestSelection, setRequestSelection] = useState<{ slug: string; items: CatalogRequestItem[] }>({ slug: '', items: [] })
  const [requestOpenSlug, setRequestOpenSlug] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    let active = true
    Promise.all([loadPublicCatalogProfile(slug), loadPublicCatalogProducts(slug)])
      .then(([profile, products]) => {
        if (active) {
          setSearch('')
          setCategory('')
          setStoredState({ slug, value: profile ? { status: 'ready', profile, products } : { status: 'unavailable' } })
        }
      })
      .catch(error => {
        if (active) {
          if (import.meta.env.DEV) console.error('No se pudo cargar el catálogo público.', error)
          setStoredState({ slug, value: { status: 'error' } })
        }
      })
    return () => { active = false }
  }, [slug, retry])

  const state = useMemo(() => storedState.slug === slug ? storedState.value : { status: 'loading' as const }, [storedState, slug])
  const profile = state.status === 'ready' ? state.profile : null
  const requestItems = requestSelection.slug === slug ? requestSelection.items : []
  const requestOpen = requestOpenSlug === slug
  const selectedById = new Map(requestItems.map(item => [item.productId, item]))
  const totalUnits = requestItems.reduce((total, item) => total + item.quantity, 0)
  const updateRequestItems = (update: (items: CatalogRequestItem[]) => CatalogRequestItem[]) => setRequestSelection(current => ({ slug, items: update(current.slug === slug ? current.items : []) }))
  useEffect(() => {
    if (!profile) return
    const previousTitle = document.title
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const previousDescription = description?.content
    document.title = `${profile.name} | Catálogo`
    if (description) description.content = (profile.description || `Catálogo de ${profile.name}`).trim().slice(0, 160)
    return () => {
      document.title = previousTitle
      if (description && previousDescription !== undefined) description.content = previousDescription
    }
  }, [profile])

  useEffect(() => {
    const dialog = dialogRef.current
    if (selected && dialog && !dialog.open) dialog.showModal()
  }, [selected])

  const categories = useMemo(() => state.status === 'ready'
    ? [...new Set(state.products.map(product => product.category))].sort((a, b) => a.localeCompare(b, 'es'))
    : [], [state])
  const visibleProducts = useMemo(() => state.status === 'ready'
    ? filterPublicCatalogProducts(state.products, search, category)
    : [], [state, search, category])

  if (state.status === 'loading') return <PublicCatalogSkeleton />
  if (state.status === 'unavailable') return <PublicCatalogMessage title="Este catálogo no está disponible" message="El enlace puede haber cambiado o el catálogo todavía no está publicado." />
  if (state.status === 'error') return <PublicCatalogMessage title="No pudimos cargar el catálogo" message="Revisa tu conexión e inténtalo de nuevo." onRetry={() => setRetry(value => value + 1)} />

  const currencySymbol = currencies.find(currency => currency.code === state.profile.currency)?.symbol ?? ''
  const initials = state.profile.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()

  return <div className="public-catalog">
    <a className="public-skip-link" href="#main">Saltar a los productos</a>
    <header className="public-hero">
      <div className="public-hero-inner">
        <div className="public-brand-mark"><CatalogImage path={state.profile.public_catalog_logo_path} alt={`Logo de ${state.profile.name}`} className="public-logo-image" fallback={<span aria-hidden="true">{initials}</span>} /></div>
        <div className="public-brand-copy">
          <span className="public-eyebrow">CATÁLOGO OFICIAL</span>
          <h1>{state.profile.name}</h1>
          {state.profile.slogan.trim() && <p className="public-slogan">{state.profile.slogan}</p>}
          {state.profile.description.trim() && <p className="public-description">{state.profile.description}</p>}
        </div>
        {requestItems.length > 0 && <button type="button" className="catalog-request-indicator" onClick={() => setRequestOpenSlug(slug)}><ClipboardList size={17} aria-hidden="true" /> Mi solicitud · {requestItems.length} {requestItems.length === 1 ? 'producto' : 'productos'}</button>}
        <span className="public-hero-glow" aria-hidden="true" />
      </div>
    </header>

    <div className="public-distribution-wrap"><CatalogDistributionActions name={state.profile.name} slug={state.profile.catalog_slug!} whatsapp={state.profile.whatsapp} publicView /></div>

    <main className="public-main" id="main">
      <div className="public-section-heading"><div><span className="public-eyebrow public-eyebrow-dark">HECHO PARA DESCUBRIR</span><h2>Nuestros productos</h2></div><span className="public-product-count">{state.products.length} {state.products.length === 1 ? 'producto' : 'productos'}</span></div>
      {state.products.length === 0 ? <section className="public-empty-state"><div className="public-empty-icon"><Image size={24} aria-hidden="true" /></div><h3>Muy pronto encontrarás nuestros productos aquí.</h3><p>Estamos preparando nuevas opciones para compartir contigo.</p></section> : <>
        <div className="public-discovery">
          <label className="public-search"><Search size={19} aria-hidden="true" /><span className="sr-only">Buscar productos</span><input type="search" placeholder="Buscar productos…" value={search} onChange={event => setSearch(event.target.value)} /></label>
          <div className="public-categories" role="group" aria-label="Filtrar por categoría">
            <button type="button" className={!category ? 'is-selected' : ''} aria-pressed={!category} onClick={() => setCategory('')}>Todos</button>
            {categories.map(value => <button type="button" key={value} className={category === value ? 'is-selected' : ''} aria-pressed={category === value} onClick={() => setCategory(category === value ? '' : value)}>{value}</button>)}
          </div>
        </div>
        {visibleProducts.length ? <section className="public-product-grid" aria-label="Productos disponibles">{visibleProducts.map(product => <PublicProductCard key={product.id} product={product} currency={currencySymbol} quantity={selectedById.get(product.id)?.quantity ?? 0} onOpen={() => setSelected(product)} onAdd={() => updateRequestItems(current => addCatalogRequestItem(current, product))} onQuantity={quantity => updateRequestItems(current => setCatalogRequestQuantity(current, product.id, quantity))} />)}</section> : <section className="public-filter-empty"><h3>No encontramos productos con esos filtros.</h3><button type="button" className="public-clear-filters" onClick={() => { setSearch(''); setCategory('') }}>Limpiar filtros</button></section>}
      </>}
    </main>

    <footer className="public-footer"><p>¿Te gustó algo? Explora el catálogo y encuentra tu próximo favorito.</p><div className="public-footer-rule" /><span>Catálogo impulsado por <strong>EJNEXA Business</strong> · EJNEXA AI Studio</span><small>Sistema diseñado por Ing. Edwin Nicaragua</small></footer>

    <dialog ref={dialogRef} className="public-product-dialog" aria-labelledby="public-dialog-title" onClose={() => setSelected(null)} onClick={event => { if (event.target === dialogRef.current) dialogRef.current?.close() }}>
      {selected && <div className="public-dialog-content"><button type="button" className="public-dialog-close" aria-label="Cerrar detalle" onClick={() => dialogRef.current?.close()}><X size={19} /></button><CatalogImage path={selected.image_path} alt={selected.name} className="public-dialog-image" fallback={<span><Image size={32} aria-hidden="true" />Imagen no disponible</span>} /><div className="public-dialog-copy"><span className="public-eyebrow public-eyebrow-dark">{selected.category}</span><h2 id="public-dialog-title">{selected.name}</h2><p className="public-dialog-description">{selected.description}</p><PublicPrice product={selected} currency={currencySymbol} /><p className="public-unit">/ {selected.unit_label}</p>{selected.default_portions !== null && selected.default_portions > 0 && <p className="public-portions">{selected.default_portions} porciones</p>}<SelectionControl product={selected} quantity={selectedById.get(selected.id)?.quantity ?? 0} onAdd={() => updateRequestItems(current => addCatalogRequestItem(current, selected))} onQuantity={quantity => updateRequestItems(current => setCatalogRequestQuantity(current, selected.id, quantity))} /></div></div>}
    </dialog>
    {requestItems.length > 0 && <button type="button" className="catalog-request-floating" onClick={() => setRequestOpenSlug(slug)}><ClipboardList size={19} aria-hidden="true" /> Mi solicitud · {requestItems.length} {requestItems.length === 1 ? 'producto' : 'productos'} <span>· {totalUnits} {totalUnits === 1 ? 'unidad' : 'unidades'}</span></button>}
    <CatalogRequestPanel key={slug} open={requestOpen} onClose={() => setRequestOpenSlug('')} businessName={state.profile.name} whatsapp={state.profile.whatsapp} catalogUrl={new URL(`/catalogo/${state.profile.catalog_slug}`, window.location.origin).toString()} currency={state.profile.currency} items={requestItems} onQuantity={(productId, quantity) => updateRequestItems(current => setCatalogRequestQuantity(current, productId, quantity))} onRemove={productId => updateRequestItems(current => removeCatalogRequestItem(current, productId))} onClear={() => updateRequestItems(() => [])} />
  </div>
}

function PublicProductCard({ product, currency, quantity, onOpen, onAdd, onQuantity }: { product: PublicCatalogProduct; currency: string; quantity: number; onOpen: () => void; onAdd: () => void; onQuantity: (quantity: number) => void }) {
  return <article className="public-product-card">
    <button type="button" className="public-product-open" onClick={onOpen} aria-label={`Ver detalle de ${product.name}`}><CatalogImage path={product.image_path} alt={product.name} className="public-product-image" fallback={<span><Image size={28} aria-hidden="true" /></span>} /><span className="public-card-copy"><span className="public-eyebrow public-eyebrow-dark">{product.category}</span><strong className="public-product-name">{product.name}</strong>{product.description && <span className="public-card-description">{product.description}</span>}<span className="public-card-price"><PublicPrice product={product} currency={currency} /><small>/ {product.unit_label}</small></span>{product.default_portions !== null && product.default_portions > 0 && <span className="public-portions">{product.default_portions} porciones</span>}</span></button>
    <div className="public-product-actions"><SelectionControl product={product} quantity={quantity} onAdd={onAdd} onQuantity={onQuantity} /></div>
  </article>
}

function SelectionControl({ product, quantity, onAdd, onQuantity }: { product: PublicCatalogProduct; quantity: number; onAdd: () => void; onQuantity: (quantity: number) => void }) {
  return quantity === 0
    ? <button type="button" className="public-add-request" aria-label={`Agregar ${product.name} a solicitud`} onClick={onAdd}><Plus size={16} aria-hidden="true" /> Agregar a solicitud</button>
    : <div className="public-product-actions-selection"><span className="public-added-label">Agregado</span><div className="catalog-request-quantity"><button type="button" aria-label={`Disminuir cantidad de ${product.name}`} onClick={() => onQuantity(quantity - 1)}><Minus size={15} /></button><span aria-live="polite">{quantity}</span><button type="button" aria-label={`Aumentar cantidad de ${product.name}`} onClick={() => onQuantity(quantity + 1)}><Plus size={15} /></button></div></div>
}

function PublicPrice({ product, currency }: { product: PublicCatalogProduct; currency: string }) {
  if (product.public_price_mode !== 'contact' && product.default_unit_price === null) return <span>Precio no disponible</span>
  return <span>{publicCatalogPriceLabel(product.public_price_mode, product.default_unit_price ?? 0, currency)}</span>
}

function CatalogImage({ path, alt, className, fallback }: { path: string | null; alt: string; className: string; fallback: ReactNode }) {
  const [failedPath, setFailedPath] = useState<string | null>(null)
  const url = catalogImageUrl(path)
  return <span className={className}>{url && failedPath !== path ? <img src={url} alt={alt} loading="lazy" onError={() => setFailedPath(path)} /> : fallback}</span>
}

function PublicCatalogSkeleton() {
  return <main className="public-catalog public-skeleton" role="status" aria-label="Cargando catálogo"><div className="public-skeleton-hero"><span /><div><i /><i /><i /></div></div><div className="public-skeleton-content"><i /><i /><div className="public-skeleton-chips"><i /><i /><i /></div><div className="public-skeleton-grid">{[0, 1, 2, 3].map(item => <div key={item}><i /><span /><span /><span /></div>)}</div></div><span className="sr-only">Cargando catálogo…</span></main>
}

function PublicCatalogMessage({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return <main className="public-message-page"><section className="public-message-card"><span className="public-message-mark" aria-hidden="true">E</span><span className="public-eyebrow public-eyebrow-dark">EJNEXA BUSINESS</span><h1>{title}</h1><p>{message}</p>{onRetry ? <button type="button" className="public-primary-button" onClick={onRetry}>Intentar de nuevo</button> : <a className="public-primary-button" href="/">Volver</a>}<small>Catálogo impulsado por EJNEXA Business</small></section></main>
}
