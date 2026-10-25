import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, ArrowLeft, CalendarDays, Check, Clock3, Inbox, MessageCircle, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { Business, CatalogRequest, CatalogRequestItem, CatalogRequestStatus } from '../lib/database.types'
import { changeCatalogRequestStatus, catalogRequestStatuses, filterCatalogRequests, formatCatalogRequestDate, loadCatalogRequestInbox, prepareCatalogRequestQuote, type CatalogRequestAction, type CatalogRequestStatusFilter } from '../lib/catalog-requests'
import { formatCurrency } from '../lib/quotes'
import { Loading } from '../components/Feedback'
import './catalog-requests.css'

const statusByValue = Object.fromEntries(catalogRequestStatuses.map(status => [status.value, status.label])) as Record<CatalogRequestStatus, string>

function statusClass(status: CatalogRequestStatus) {
  return `request-status request-status-${status}`
}

function listSummary(items: { product_name_snapshot: string; quantity: number }[]) {
  if (!items.length) return 'Sin productos'
  return items.length === 1 ? `${items[0].product_name_snapshot} · ${items[0].quantity}` : `${items[0].product_name_snapshot} + ${items.length - 1} más`
}

function requestActionLabel(action: CatalogRequestAction) {
  return action === 'declined' ? 'Rechazar' : 'Archivar'
}

export function CatalogRequestsPage({ business }: { business: Business }) {
  const navigate = useNavigate()
  const [requests, setRequests] = useState<CatalogRequest[]>([])
  const [itemsByRequest, setItemsByRequest] = useState<Record<string, CatalogRequestItem[]>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CatalogRequestStatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [busy, setBusy] = useState<CatalogRequestAction | 'reviewing' | null>(null)
  const [confirmAction, setConfirmAction] = useState<Extract<CatalogRequestAction, 'declined' | 'archived'> | null>(null)

  const applyInbox = useCallback((inbox: Awaited<ReturnType<typeof loadCatalogRequestInbox>>) => {
    setLoadError(false)
    setRequests(inbox.requests)
    setItemsByRequest(inbox.itemsByRequest)
    setSelectedId(current => current && inbox.requests.some(request => request.id === current) ? current : null)
  }, [])

  const refresh = useCallback(async () => {
    try { applyInbox(await loadCatalogRequestInbox(business.id)) }
    catch { setLoadError(true) }
    finally { setLoading(false) }
  }, [applyInbox, business.id])

  useEffect(() => {
    let active = true
    void loadCatalogRequestInbox(business.id).then(inbox => {
      if (active) applyInbox(inbox)
    }).catch(() => {
      if (active) setLoadError(true)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [applyInbox, business.id])

  const visibleRequests = useMemo(() => filterCatalogRequests(requests, search, statusFilter), [requests, search, statusFilter])
  const selected = requests.find(request => request.id === selectedId) ?? null
  const selectedItems = selected ? itemsByRequest[selected.id] ?? [] : []

  async function updateStatus(action: CatalogRequestAction | 'reviewing') {
    if (!selected) return
    setBusy(action)
    setActionError(false)
    setConfirmAction(null)
    try {
      const status = await changeCatalogRequestStatus(action, selected.id)
      setRequests(current => current.map(request => request.id === selected.id ? { ...request, status } : request))
    } catch {
      setActionError(true)
    } finally {
      setBusy(null)
    }
  }

  function prepareQuote() {
    if (!selected || !['new', 'reviewing'].includes(selected.status)) return
    navigate('/cotizar', { state: { catalogRequestPreparation: prepareCatalogRequestQuote(selected, selectedItems) } })
  }

  const showList = !selectedId
  return <div className="catalog-requests-page">
    <div className="page-heading requests-heading"><div><span className="eyebrow accent">SOLICITUDES DEL CATÁLOGO</span><h1>Solicitudes<span className="heading-dot">.</span></h1><p className="muted">Revisa cada solicitud y decide cómo continuar antes de preparar una cotización.</p></div></div>
    {loadError && <section className="panel requests-error" role="alert"><p>No pudimos cargar las solicitudes. Intenta nuevamente.</p><button type="button" className="secondary-button" onClick={() => { setLoading(true); void refresh() }}>Reintentar</button></section>}
    {loading ? <Loading text="Cargando solicitudes…" /> : !loadError && requests.length === 0 ? <section className="panel requests-empty"><span className="requests-empty-icon"><Inbox size={28} /></span><h2>Aún no hay solicitudes</h2><p>Cuando alguien envíe una solicitud desde tu catálogo público, podrás revisarla aquí.</p></section> : !loadError && <div className={`requests-layout ${selectedId ? 'has-selection' : ''}`}>
      <section className={`requests-list-panel ${showList ? 'is-visible' : ''}`} aria-label="Solicitudes recibidas">
        <div className="requests-search"><Search size={18} aria-hidden="true" /><label className="sr-only" htmlFor="request-search">Buscar por número o cliente</label><input id="request-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar solicitud o cliente" /><button type="button" aria-label="Limpiar búsqueda" disabled={!search} onClick={() => setSearch('')}><X size={16} /></button></div>
        <div className="request-filters" role="group" aria-label="Filtrar solicitudes por estado">{[{ value: 'all' as const, label: 'Todas' }, ...catalogRequestStatuses].map(option => <button type="button" key={option.value} aria-pressed={statusFilter === option.value} className={statusFilter === option.value ? 'is-active' : ''} onClick={() => setStatusFilter(option.value)}>{option.label}{option.value === 'all' ? ` ${requests.length}` : ` ${requests.filter(request => request.status === option.value).length}`}</button>)}</div>
        {visibleRequests.length === 0 ? <section className="requests-search-empty" role="status"><h2>No encontramos solicitudes</h2><p>Prueba con otro número o nombre de cliente.</p><button type="button" className="text-link" onClick={() => { setSearch(''); setStatusFilter('all') }}>Ver todas</button></section> : <div className="request-list">{visibleRequests.map(request => {
          const requestItems = itemsByRequest[request.id] ?? []
          return <button type="button" key={request.id} className={`request-list-card ${request.status === 'new' ? 'is-new' : ''} ${request.id === selectedId ? 'is-selected' : ''}`} onClick={() => setSelectedId(request.id)} aria-current={request.id === selectedId ? 'true' : undefined}>
            <span className="request-card-heading"><strong>{request.request_number}</strong><span className={statusClass(request.status)}>{statusByValue[request.status]}</span></span>
            <span className="request-card-customer">{request.customer_name}</span>
            <span className="request-card-summary">{listSummary(requestItems)}</span>
            <span className="request-card-meta"><span><Clock3 size={14} /> {formatCatalogRequestDate(request.submitted_at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>{request.desired_date && <span><CalendarDays size={14} /> Para {formatCatalogRequestDate(request.desired_date, { day: 'numeric', month: 'short' })}</span>}</span>
          </button>
        })}</div>}
      </section>

      <section className={`request-detail-panel ${selected ? 'has-request' : ''} ${selectedId ? 'is-visible' : ''}`} aria-label="Detalle de la solicitud">
        {!selected ? <div className="request-detail-placeholder"><Inbox size={26} /><p>Selecciona una solicitud para ver su información completa.</p></div> : <>
          <div className="request-detail-heading"><button className="request-back-button" type="button" onClick={() => setSelectedId(null)}><ArrowLeft size={17} /> Volver a solicitudes</button><span className={statusClass(selected.status)}>{statusByValue[selected.status]}</span><h2>{selected.request_number}</h2><p className="muted">Recibida {formatCatalogRequestDate(selected.submitted_at, { dateStyle: 'long', hour: 'numeric', minute: '2-digit' })}</p></div>
          {actionError && <p className="request-action-error" role="alert">No pudimos actualizar el estado. Intenta nuevamente.</p>}
          <section className="request-detail-section"><h3>Cliente</h3><dl className="request-fields"><div><dt>Nombre</dt><dd>{selected.customer_name}</dd></div>{selected.customer_phone && <div><dt>Teléfono</dt><dd><a href={`tel:${selected.customer_phone}`}><MessageCircle size={14} /> {selected.customer_phone}</a></dd></div>}{selected.desired_date && <div><dt>Fecha deseada</dt><dd>{formatCatalogRequestDate(selected.desired_date, { dateStyle: 'long' })}</dd></div>}{selected.details.trim() && <div className="request-notes"><dt>Observaciones</dt><dd>{selected.details}</dd></div>}</dl></section>
          <section className="request-detail-section"><h3>Productos solicitados <span>{selectedItems.length}</span></h3>{selectedItems.length === 0 ? <p className="muted">Esta solicitud no contiene productos.</p> : <div className="request-product-list">{selectedItems.map(item => <article className="request-product" key={item.id}><div className="request-product-title"><strong>{item.product_name_snapshot}</strong><span>{item.category_snapshot}</span></div><div className="request-product-meta"><span>{item.quantity} {item.unit_label_snapshot}</span>{item.default_portions_snapshot !== null && <span>{item.default_portions_snapshot} porciones</span>}<strong>{item.public_price_mode_snapshot === 'contact' || item.public_unit_price_snapshot === null ? 'Consultar' : `${item.public_price_mode_snapshot === 'from' ? 'Desde ' : ''}${formatCurrency(Number(item.public_unit_price_snapshot), business)}`}</strong></div></article>)}</div>}</section>
          {selected.status !== 'converted' && <p className="request-conversion-note">Preparar una cotización no cambia esta solicitud a “Convertida”. Esa vinculación se realizará cuando exista el flujo seguro para guardar y asociar la cotización.</p>}
          <div className="request-actions">
            {selected.status === 'new' && <button type="button" className="secondary-button" disabled={busy !== null} onClick={() => void updateStatus('reviewing')}><Check size={16} /> {busy === 'reviewing' ? 'Actualizando…' : 'Marcar en revisión'}</button>}
            {['new', 'reviewing'].includes(selected.status) && <button type="button" className="primary request-prepare-button" onClick={prepareQuote}>Preparar cotización</button>}
            {['new', 'reviewing'].includes(selected.status) && <button type="button" className="request-danger-button" disabled={busy !== null} onClick={() => setConfirmAction('declined')}>Rechazar</button>}
            {['new', 'reviewing', 'declined'].includes(selected.status) && <button type="button" className="request-archive-button" disabled={busy !== null} onClick={() => setConfirmAction('archived')}><Archive size={15} /> Archivar</button>}
          </div>
        </>}
      </section>
    </div>}
    {confirmAction && selected && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="request-confirm-title"><span className="delete-icon"><Archive size={22} /></span><h2 id="request-confirm-title">{confirmAction === 'declined' ? '¿Rechazar esta solicitud?' : '¿Archivar esta solicitud?'}</h2><p>{selected.request_number} · {selected.customer_name}. Podrás consultarla después usando el filtro de estado.</p><div><button type="button" className="secondary-button" disabled={busy !== null} onClick={() => setConfirmAction(null)}>Cancelar</button><button type="button" className={confirmAction === 'declined' ? 'danger-button' : 'primary'} disabled={busy !== null} onClick={() => void updateStatus(confirmAction)}>{busy ? 'Actualizando…' : requestActionLabel(confirmAction)}</button></div></section></div>}
  </div>
}
