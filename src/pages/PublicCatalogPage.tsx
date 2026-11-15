import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowRight, ClipboardList, Search } from 'lucide-react'
import { CatalogDistributionActions } from '../components/CatalogDistributionActions'
import { CatalogRequestPanel } from '../components/CatalogRequestPanel'
import { PublicCampaignHero } from '../components/public-catalog/PublicCampaignHero'
import { PublicCampaignSections } from '../components/public-catalog/PublicCampaignSections'
import { PublicCatalogHeader } from '../components/public-catalog/PublicCatalogHeader'
import { PublicCatalogSkeleton } from '../components/public-catalog/PublicCatalogSkeleton'
import { PublicCategoryRail } from '../components/public-catalog/PublicCategoryRail'
import { PublicProductCard } from '../components/public-catalog/PublicProductCard'
import { PublicProductDialog } from '../components/public-catalog/PublicProductDialog'
import { addCatalogRequestItem, removeCatalogRequestItem, setCatalogRequestQuantity, type CatalogRequestItem } from '../lib/catalog-request'
import { currencies } from '../lib/business'
import type { PublicCatalogProduct, PublicCatalogProfile } from '../lib/database.types'
import { filterPublicCatalogProducts, loadPublicCatalogProducts, loadPublicCatalogProfile } from '../lib/public-catalog'
import { filterPublicCatalogProductsByCampaign, groupPublicCatalogCampaigns } from '../lib/public-catalog-presentation'
import './styles-public-catalog.css'

type CatalogState = { status: 'loading' } | { status: 'error' } | { status: 'unavailable' } | { status: 'ready'; profile: PublicCatalogProfile; products: PublicCatalogProduct[] }

export function PublicCatalogPage() {
  const { slug = '' } = useParams()
  const [storedState, setStoredState] = useState<{ slug: string; value: CatalogState }>({ slug: '', value: { status: 'loading' } })
  const [retry, setRetry] = useState(0)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null)
  const [selected, setSelected] = useState<PublicCatalogProduct | null>(null)
  const [requestSelection, setRequestSelection] = useState<{ slug: string; items: CatalogRequestItem[] }>({ slug: '', items: [] })
  const [lockedRequestSlug, setLockedRequestSlug] = useState('')
  const lockedRequestSlugRef = useRef('')
  const [requestOpenSlug, setRequestOpenSlug] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([loadPublicCatalogProfile(slug), loadPublicCatalogProducts(slug)])
      .then(([profile, products]) => {
        if (!active) return
        setSearch('')
        setCategory('')
        setCampaignFilter(null)
        setStoredState({ slug, value: profile ? { status: 'ready', profile, products } : { status: 'unavailable' } })
      })
      .catch(error => {
        if (!active) return
        if (import.meta.env.DEV) console.error('No se pudo cargar el catálogo público.', error)
        setStoredState({ slug, value: { status: 'error' } })
      })
    return () => { active = false }
  }, [slug, retry])

  const state = useMemo(() => storedState.slug === slug ? storedState.value : { status: 'loading' as const }, [storedState, slug])
  const requestItems = requestSelection.slug === slug ? requestSelection.items : []
  const requestLocked = lockedRequestSlug === slug
  const requestOpen = requestOpenSlug === slug
  const selectedById = new Map(requestItems.map(item => [item.productId, item]))
  const totalUnits = requestItems.reduce((total, item) => total + item.quantity, 0)
  const campaignGroups = useMemo(() => state.status === 'ready' ? groupPublicCatalogCampaigns(state.products) : [], [state])
  const profile = state.status === 'ready' ? state.profile : null
  const categories = useMemo(() => state.status === 'ready'
    ? [...new Set(state.products.map(product => product.category))].sort((a, b) => a.localeCompare(b, 'es'))
    : [], [state])
  const visibleProducts = useMemo(() => {
    if (state.status !== 'ready') return []
    const searchAndCategory = filterPublicCatalogProducts(state.products, search, category)
    return filterPublicCatalogProductsByCampaign(searchAndCategory, campaignFilter)
  }, [state, search, category, campaignFilter])

  function updateRequestItems(update: (items: CatalogRequestItem[]) => CatalogRequestItem[], allowLocked = false) {
    if (!allowLocked && lockedRequestSlugRef.current === slug) return
    setRequestSelection(current => ({ slug, items: update(current.slug === slug ? current.items : []) }))
  }

  function setRequestLock(locked: boolean) {
    const next = locked ? slug : lockedRequestSlugRef.current === slug ? '' : lockedRequestSlugRef.current
    lockedRequestSlugRef.current = next
    setLockedRequestSlug(next)
  }

  async function refreshOfficialCatalog() {
    const [nextProfile, nextProducts] = await Promise.all([loadPublicCatalogProfile(slug), loadPublicCatalogProducts(slug)])
    if (!nextProfile) throw new Error('El catálogo ya no está disponible.')
    setStoredState({ slug, value: { status: 'ready', profile: nextProfile, products: nextProducts } })
    let unavailableCount = 0
    setRequestSelection(current => {
      if (current.slug !== slug) return current
      const latestById = new Map(nextProducts.map(product => [product.id, product]))
      const items = current.items.map(item => {
        const currentProduct = latestById.get(item.productId)
        if (!currentProduct) {
          unavailableCount += 1
          return { ...item, unavailable: true }
        }
        const updated = addCatalogRequestItem([], currentProduct)[0]
        return updated ? { ...updated, quantity: item.quantity, unavailable: false } : item
      })
      return { slug, items }
    })
    return unavailableCount
  }

  function viewCampaign(campaignId: string) {
    setCampaignFilter(campaignId)
    setSearch('')
    setCategory('')
    window.requestAnimationFrame(() => document.getElementById('public-products')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    }))
  }

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

  if (state.status === 'loading') return <PublicCatalogSkeleton />
  if (state.status === 'unavailable') return <PublicCatalogMessage title="Este catálogo no está disponible" message="El enlace puede haber cambiado o el catálogo todavía no está publicado." />
  if (state.status === 'error') return <PublicCatalogMessage title="No pudimos cargar el catálogo" message="Revisa tu conexión e inténtalo de nuevo." onRetry={() => setRetry(value => value + 1)} />

  const currencySymbol = currencies.find(currency => currency.code === state.profile.currency)?.symbol ?? ''
  const visibleCampaign = campaignGroups.find(campaign => campaign.id === campaignFilter)
  const showCampaignSections = !search.trim() && !category && !campaignFilter

  return <div className="public-catalog">
    <a className="public-skip-link" href="#public-products">Saltar al catálogo</a>
    <PublicCatalogHeader profile={state.profile} requestCount={requestItems.length} onRequestClick={() => setRequestOpenSlug(slug)} />
    <PublicCampaignHero campaigns={campaignGroups} profile={state.profile} currency={currencySymbol} onViewCampaign={viewCampaign} />

    <main className="public-main" id="main">
      {state.products.length === 0
        ? <section className="public-empty-state"><span className="public-empty-icon"><ClipboardList size={24} aria-hidden="true" /></span><h2>Muy pronto encontrarás opciones aquí.</h2><p>Estamos preparando el catálogo de este negocio.</p></section>
        : <>
          <section className="public-discovery" aria-label="Buscar y explorar productos">
            <div className="public-section-heading"><div><span className="public-eyebrow public-eyebrow-brand">SELECCIÓN DEL NEGOCIO</span><h2>Encuentra lo que buscas</h2></div><span className="public-product-count">{visibleProducts.length} {visibleProducts.length === 1 ? 'opción' : 'opciones'}</span></div>
            <label className="public-search"><Search size={19} aria-hidden="true" /><span className="sr-only">Buscar productos</span><input type="search" placeholder="Buscar producto, categoría…" value={search} onChange={event => { setSearch(event.target.value); setCampaignFilter(null) }} /></label>
            <PublicCategoryRail categories={categories} selected={category} onSelect={value => { setCategory(value); setCampaignFilter(null) }} />
          </section>

          {showCampaignSections && <PublicCampaignSections campaigns={campaignGroups} currency={currencySymbol} onViewCampaign={viewCampaign} />}

          <section className="public-catalog-products" id="public-products" aria-labelledby="public-products-title">
            <div className="public-section-heading public-products-heading">
              <div><span className="public-eyebrow public-eyebrow-brand">{visibleCampaign ? visibleCampaign.badge : 'CATÁLOGO DEL NEGOCIO'}</span><h2 id="public-products-title">{visibleCampaign ? visibleCampaign.name : 'Todos los productos'}</h2></div>
              <span className="public-product-count">{visibleProducts.length} {visibleProducts.length === 1 ? 'producto' : 'productos'}</span>
            </div>
            {campaignFilter && <div className="public-filter-active"><span>Mostrando productos de esta selección.</span><button type="button" onClick={() => setCampaignFilter(null)}>Ver todos <ArrowRight size={15} aria-hidden="true" /></button></div>}
            {visibleProducts.length
              ? <div className="public-product-grid">{visibleProducts.map(product => <PublicProductCard
                key={product.id}
                product={product}
                currency={currencySymbol}
                quantity={selectedById.get(product.id)?.quantity ?? 0}
                disabled={requestLocked}
                onOpen={() => setSelected(product)}
                onAdd={() => updateRequestItems(items => addCatalogRequestItem(items, product))}
                onQuantity={quantity => updateRequestItems(items => setCatalogRequestQuantity(items, product.id, quantity))}
              />)}</div>
              : <section className="public-filter-empty"><h3>No encontramos productos con esos filtros.</h3><button type="button" className="public-clear-filters" onClick={() => { setSearch(''); setCategory(''); setCampaignFilter(null) }}>Ver todo el catálogo</button></section>}
          </section>
        </>}
    </main>

    <div className="public-distribution-wrap"><CatalogDistributionActions name={state.profile.name} slug={state.profile.catalog_slug!} whatsapp={state.profile.whatsapp} publicView /></div>
    <footer className="public-footer"><p>Descubre la selección del negocio y prepara una solicitud cuando encuentres lo que necesitas.</p><div className="public-footer-rule" /><span>Catálogo impulsado por <strong>EJNEXA Business</strong> · EJNEXA AI Studio</span><small>Sistema diseñado por Ing. Edwin Nicaragua</small></footer>

    <PublicProductDialog
      product={selected}
      currency={currencySymbol}
      quantity={selected ? selectedById.get(selected.id)?.quantity ?? 0 : 0}
      disabled={requestLocked}
      onClose={() => setSelected(null)}
      onAdd={() => selected && updateRequestItems(items => addCatalogRequestItem(items, selected))}
      onQuantity={quantity => selected && updateRequestItems(items => setCatalogRequestQuantity(items, selected.id, quantity))}
    />
    {requestItems.length > 0 && <button type="button" className="catalog-request-floating" onClick={() => setRequestOpenSlug(slug)}>
      <ClipboardList size={19} aria-hidden="true" /><span>Mi solicitud</span><strong>{requestItems.length}</strong><small>{totalUnits} {totalUnits === 1 ? 'unidad' : 'unidades'}</small>
    </button>}
    <CatalogRequestPanel
      key={slug}
      open={requestOpen}
      onClose={() => setRequestOpenSlug('')}
      onRequestLockChange={setRequestLock}
      onRefreshCatalog={refreshOfficialCatalog}
      slug={slug}
      businessName={state.profile.name}
      whatsapp={state.profile.whatsapp}
      catalogUrl={new URL(`/catalogo/${state.profile.catalog_slug}`, window.location.origin).toString()}
      currency={state.profile.currency}
      items={requestItems}
      onQuantity={(productId, quantity) => updateRequestItems(items => setCatalogRequestQuantity(items, productId, quantity))}
      onRemove={productId => updateRequestItems(items => removeCatalogRequestItem(items, productId))}
      onClear={() => updateRequestItems(() => [], true)}
    />
  </div>
}

function PublicCatalogMessage({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return <main className="public-message-page"><section className="public-message-card"><span className="public-message-mark" aria-hidden="true">E</span><span className="public-eyebrow public-eyebrow-brand">EJNEXA BUSINESS</span><h1>{title}</h1><p>{message}</p>{onRetry ? <button type="button" className="public-primary-button" onClick={onRetry}>Intentar de nuevo</button> : <a className="public-primary-button" href="/">Volver</a>}<small>Catálogo impulsado por EJNEXA Business</small></section></main>
}
