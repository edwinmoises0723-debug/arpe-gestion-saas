export function PublicCatalogSkeleton() {
  return <main className="public-catalog public-skeleton" role="status" aria-label="Cargando catálogo">
    <div className="public-skeleton-header"><i /><span><i /><i /></span><i /></div>
    <div className="public-skeleton-hero"><i /><div><i /><i /><i /></div></div>
    <div className="public-skeleton-content"><i /><i /><div className="public-skeleton-chips">{[0, 1, 2, 3].map(item => <i key={item} />)}</div>
      <div className="public-skeleton-grid">{[0, 1, 2, 3].map(item => <div key={item}><i /><span /><span /><span /></div>)}</div>
    </div>
    <span className="sr-only">Cargando catálogo…</span>
  </main>
}
