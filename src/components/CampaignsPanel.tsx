import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Archive, CalendarDays, Copy, Eye, Image as ImageIcon, MoreHorizontal, Pencil, Plus, RotateCcw, Sparkles, Star, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react'
import type { Business, CatalogProduct } from '../lib/database.types'
import { catalogImageUrl } from '../lib/catalog'
import { archiveCatalogCampaign, campaignDraftFromRecord, campaignErrorMessage, campaignStatusLabel, campaignTypeFromRecord, deleteCatalogCampaign, duplicateCatalogCampaign, getCampaignDisplayStatus, listCatalogCampaigns, restoreCatalogCampaign, setCatalogCampaignActive, type CampaignDraft, type CampaignWithProducts } from '../lib/catalog-campaigns'
import { Loading, Notice } from './Feedback'
import { CampaignPreview } from './CampaignPreview'
import { CampaignWizard } from './CampaignWizard'
import { formatCurrency } from '../lib/quotes'
import './catalog-promotions.css'

const offerLabels = { percentage: 'Descuento porcentual', fixed_discount: 'Descuento por monto', fixed_price: 'Precio especial', two_for_one: '2x1', combo: 'Combo', showcase: 'Campaña visual' }
type CampaignListView = 'active' | 'archived'

function archivedDate(value: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('es', { dateStyle: 'medium' }).format(new Date(value))
}

export function CampaignsPanel({ business, products }: { business: Business; products: CatalogProduct[] }) {
  const [campaigns, setCampaigns] = useState<CampaignWithProducts[]>([])
  const [view, setView] = useState<CampaignListView>('active')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editing, setEditing] = useState<CampaignWithProducts | null>(null)
  const [previewing, setPreviewing] = useState<CampaignWithProducts | null>(null)
  const [pendingActivation, setPendingActivation] = useState<CampaignWithProducts | null>(null)
  const [pendingDelete, setPendingDelete] = useState<CampaignWithProducts | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [busyId, setBusyId] = useState('')
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null)
  const archivedTabRef = useRef<HTMLButtonElement | null>(null)
  const productsById = useMemo(() => new Map(products.map(product => [product.id, product])), [products])

  const refresh = useCallback(async (listView: CampaignListView = view) => {
    setLoading(true)
    setLoadError('')
    try { setCampaigns(await listCatalogCampaigns(business.id, listView === 'archived')) }
    catch (reason) { setLoadError(campaignErrorMessage(reason)) }
    finally { setLoading(false) }
  }, [business.id, view])

  useEffect(() => {
    let current = true
    void listCatalogCampaigns(business.id, view === 'archived')
      .then(data => { if (current) { setLoadError(''); setCampaigns(data) } })
      .catch(reason => { if (current) setLoadError(campaignErrorMessage(reason)) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [business.id, view])

  async function toggle(campaign: CampaignWithProducts, active: boolean) {
    setBusyId(campaign.id)
    setError('')
    try {
      await setCatalogCampaignActive(business.id, campaign.id, active)
      setNotice(active ? 'La promoción quedó publicada.' : 'La promoción quedó desactivada.')
      await refresh()
      setPendingActivation(null)
    } catch (reason) {
      setError(campaignErrorMessage(reason))
    } finally { setBusyId('') }
  }

  async function runLifecycle(campaign: CampaignWithProducts, action: 'duplicate' | 'archive' | 'restore') {
    setBusyId(campaign.id)
    setError('')
    try {
      if (action === 'duplicate') {
        await duplicateCatalogCampaign(business.id, campaign.id)
        setNotice('Campaña duplicada como borrador. Revisa sus fechas y productos antes de publicarla.')
        if (view === 'active') await refresh('active')
        else { setLoading(true); setView('active') }
      } else if (action === 'archive') {
        await archiveCatalogCampaign(business.id, campaign.id)
        setNotice('La campaña quedó archivada.')
        await refresh('active')
      } else {
        await restoreCatalogCampaign(business.id, campaign.id)
        setNotice('Campaña restaurada como inactiva. Revísala antes de publicarla.')
        setLoading(true)
        setView('active')
      }
    } catch (reason) {
      setError(campaignErrorMessage(reason))
    } finally { setBusyId('') }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusyId(pendingDelete.id)
    setDeleteError('')
    try {
      await deleteCatalogCampaign(business.id, pendingDelete.id, pendingDelete.image_path, business.owner_id)
      setPendingDelete(null)
      setNotice('La campaña fue eliminada definitivamente.')
      await refresh('archived')
      archivedTabRef.current?.focus()
    } catch (reason) {
      setDeleteError(campaignErrorMessage(reason))
    } finally { setBusyId('') }
  }

  function closeDeleteDialog() {
    setPendingDelete(null)
    setDeleteError('')
    requestAnimationFrame(() => deleteTriggerRef.current?.focus())
  }

  function startNew() { setEditing(null); setWizardOpen(true); setError(''); setNotice('') }
  function startEdit(campaign: CampaignWithProducts) { setEditing(campaign); setWizardOpen(true); setError(''); setNotice('') }
  function completeWizard(message: string) { setWizardOpen(false); setEditing(null); setNotice(message); void refresh('active') }

  if (wizardOpen) return <CampaignWizard business={business} products={products} campaign={editing} onCancel={() => { setWizardOpen(false); setEditing(null) }} onSaved={completeWizard} />

  return <section className="campaigns-panel" aria-labelledby="campaigns-title">
    <div className="campaigns-heading"><div><span className="eyebrow accent">OFERTAS PARA TU CATÁLOGO</span><h2 id="campaigns-title">Promociones</h2><p className="muted">Crea ofertas que ayuden a mover tu catálogo.</p></div>{view === 'active' && <button type="button" className="primary" onClick={startNew} disabled={!products.length}><Plus size={17} /> Nueva promoción</button>}</div>
    <div className="campaign-lifecycle-tabs" role="tablist" aria-label="Listas de campañas">
      <button type="button" role="tab" aria-selected={view === 'active'} aria-controls="campaigns-list" id="campaigns-tab-active" className="campaign-lifecycle-tab" onClick={() => { if (view !== 'active') { setLoading(true); setView('active') } }}>Promociones</button>
      <button type="button" role="tab" aria-selected={view === 'archived'} aria-controls="campaigns-list" id="campaigns-tab-archived" className="campaign-lifecycle-tab" ref={archivedTabRef} onClick={() => { if (view !== 'archived') { setLoading(true); setView('archived') } }}>Archivadas</button>
    </div>
    {notice && <Notice>{notice}</Notice>}{error && <Notice error>{error}</Notice>}
    {loading ? <div className="campaign-loading-state"><Loading text={view === 'archived' ? 'Cargando campañas archivadas…' : 'Cargando tus promociones…'} /></div> : loadError
      ? <div className="campaign-error-state"><Notice error>{loadError}</Notice><button type="button" className="secondary-button" onClick={() => void refresh()}><span aria-hidden="true">↻</span> Reintentar</button></div>
      : campaigns.length === 0
      ? view === 'archived'
        ? <section className="campaign-empty-state" role="tabpanel" id="campaigns-list" aria-labelledby="campaigns-tab-archived"><span className="campaign-empty-icon"><Archive size={25} aria-hidden="true" /></span><h3>No tienes campañas archivadas.</h3><p>Las campañas que archives aparecerán aquí. Podrás restaurarlas o eliminarlas de forma segura.</p></section>
        : <section className="campaign-empty-state" role="tabpanel" id="campaigns-list" aria-labelledby="campaigns-tab-active"><span className="campaign-empty-icon"><Sparkles size={27} aria-hidden="true" /></span><span className="subtle-badge">CATÁLOGO EN MOVIMIENTO</span><h3>Aún no has creado promociones</h3><p>{products.length ? 'Crea descuentos, 2x1, precios especiales o campañas visuales para destacar productos.' : 'Para crear una promoción, primero agrega al menos un producto en la pestaña Productos.'}</p><button type="button" className="primary" onClick={startNew} disabled={!products.length}><Plus size={17} /> Crear mi primera promoción</button></section>
      : <div className="campaign-list" role="tabpanel" id="campaigns-list" aria-labelledby={view === 'active' ? 'campaigns-tab-active' : 'campaigns-tab-archived'}>{campaigns.map(campaign => {
        const isArchived = view === 'archived'
        const status = getCampaignDisplayStatus(campaign)
        const associated = campaign.product_ids.map(id => productsById.get(id)).filter((product): product is CatalogProduct => Boolean(product))
        const image = campaign.image_path ? catalogImageUrl(campaign.image_path) : null
        const type = campaignTypeFromRecord(campaign)
        const value = campaign.percentage_discount ?? campaign.fixed_discount ?? campaign.promo_price
        const valueLabel = type === 'percentage' && value !== null ? `${value}% OFF`
          : type === 'fixed_discount' && value !== null ? `${formatCurrency(Number(value), business)} de descuento`
            : type === 'fixed_price' && value !== null ? `Precio especial ${formatCurrency(Number(value), business)}`
              : type === 'two_for_one' ? 'Compra 1 y recibe 2'
                : 'Sin cambio de precio'
        return <article className={`campaign-card${isArchived ? ' is-archived' : ''}`} key={campaign.id}>
          {image ? <img className="campaign-card-image" src={image} alt="" loading="lazy" /> : <div className="campaign-card-image campaign-card-image-empty"><ImageIcon size={22} aria-hidden="true" /></div>}
          <div className="campaign-card-main">
            <div className="campaign-card-top"><div><span className="subtle-badge">{offerLabels[type]}</span>{campaign.featured && <span className="campaign-featured-label"><Star size={13} aria-hidden="true" /> Destacada</span>}</div><span className={`campaign-status status-${status}`}>{campaignStatusLabel(status)}</span></div>
            <h3>{campaign.name}</h3>{campaign.badge_text && <span className="campaign-card-badge">{campaign.badge_text}</span>}
            <p className="campaign-card-value">{valueLabel}</p>
            <p className="campaign-card-products"><strong>Productos:</strong> {associated.length ? associated.map(product => product.name).join(' · ') : 'Sin productos disponibles'}</p>
            <div className="campaign-card-meta"><span><CalendarDays size={14} aria-hidden="true" />{isArchived ? `Archivada el ${archivedDate(campaign.archived_at)}` : campaign.starts_on || campaign.ends_on ? `${campaign.starts_on || 'Sin inicio'} – ${campaign.ends_on || 'Sin fecha final'}` : 'Sin fecha definida'}</span><span>{campaign.product_ids.length} {campaign.product_ids.length === 1 ? 'producto' : 'productos'}</span></div>
            <div className="campaign-card-actions">
              {isArchived ? <>
                <button type="button" className="secondary-button" onClick={() => setPreviewing(campaign)} aria-label={`Vista previa de ${campaign.name}`}><Eye size={15} /> Vista previa</button>
                <button type="button" className="secondary-button" disabled={busyId === campaign.id} onClick={() => void runLifecycle(campaign, 'duplicate')} aria-label={`Duplicar ${campaign.name}`}><Copy size={15} /> Duplicar</button>
                <button type="button" className="secondary-button" disabled={busyId === campaign.id} onClick={() => void runLifecycle(campaign, 'restore')} aria-label={`Restaurar ${campaign.name}`}><RotateCcw size={15} /> Restaurar</button>
                <button type="button" className="danger-button" disabled={busyId === campaign.id} aria-label={`Eliminar campaña ${campaign.name}`} onClick={event => { deleteTriggerRef.current = event.currentTarget; setDeleteError(''); setPendingDelete(campaign) }}><Trash2 size={15} /> Eliminar campaña</button>
              </> : <>
                <button type="button" className="secondary-button" onClick={() => startEdit(campaign)} aria-label={`Editar ${campaign.name}`}><Pencil size={15} /> Editar</button>
                <button type="button" className="secondary-button" onClick={() => setPreviewing(campaign)} aria-label={`Vista previa de ${campaign.name}`}><Eye size={15} /> Vista previa</button>
                {campaign.active ? <button type="button" className="text-button" disabled={busyId === campaign.id} onClick={() => void toggle(campaign, false)} aria-label={`Desactivar ${campaign.name}`}><ToggleRight size={18} /> Desactivar</button> : <button type="button" className="primary campaign-publish-small" disabled={busyId === campaign.id} onClick={() => setPendingActivation(campaign)} aria-label={`Activar ${campaign.name}`}><ToggleLeft size={17} /> Activar</button>}
                <details className="campaign-more-options"><summary aria-label={`Más opciones para ${campaign.name}`} title="Más opciones"><MoreHorizontal size={19} aria-hidden="true" /></summary><div className="campaign-more-menu"><button type="button" disabled={busyId === campaign.id} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void runLifecycle(campaign, 'duplicate') }}><Copy size={15} /> Duplicar campaña</button><button type="button" disabled={busyId === campaign.id} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); void runLifecycle(campaign, 'archive') }}><Archive size={15} /> Archivar</button></div></details>
              </>}
            </div>
          </div>
        </article>
      })}</div>}

    {previewing && <CampaignReadOnlyPreview business={business} campaign={previewing} products={products} onClose={() => setPreviewing(null)} />}
    {pendingActivation && <div className="modal-backdrop" role="presentation"><section className="confirm-modal campaign-publish-dialog" role="alertdialog" aria-modal="true" aria-labelledby="campaign-activate-title"><span className="campaign-confirm-icon"><ToggleRight size={22} /></span><h2 id="campaign-activate-title">¿Activar esta promoción?</h2><p>{pendingActivation.name} quedará disponible según su vigencia y productos asociados.</p><div><button type="button" className="secondary-button" onClick={() => setPendingActivation(null)} disabled={busyId === pendingActivation.id}>Volver</button><button type="button" className="primary" onClick={() => void toggle(pendingActivation, true)} disabled={busyId === pendingActivation.id}>{busyId === pendingActivation.id ? 'Activando…' : 'Activar promoción'}</button></div></section></div>}
    {pendingDelete && <DeleteCampaignDialog campaign={pendingDelete} error={deleteError} busy={busyId === pendingDelete.id} onCancel={closeDeleteDialog} onConfirm={() => void confirmDelete()} />}
  </section>
}

function DeleteCampaignDialog({ campaign, error, busy, onCancel, onConfirm }: { campaign: CampaignWithProducts; error: string; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const deleteRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    cancelRef.current?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onCancel() }
      if (event.key === 'Tab') {
        const first = cancelRef.current
        const last = deleteRef.current
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [busy, onCancel])

  return <div className="modal-backdrop campaign-delete-backdrop" role="presentation"><section className="confirm-modal campaign-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="campaign-delete-title" aria-describedby="campaign-delete-description">
    <span className="campaign-delete-icon"><Trash2 size={22} aria-hidden="true" /></span>
    <h2 id="campaign-delete-title">Eliminar campaña definitivamente</h2>
    <p id="campaign-delete-description">Vas a eliminar “{campaign.name}”. Esta acción no se puede deshacer. Si la campaña aparece en solicitudes anteriores, se conservará archivada para proteger el historial.</p>
    {error && <Notice error>{error}</Notice>}
    <div className="campaign-delete-actions"><button type="button" className="secondary-button" ref={cancelRef} onClick={onCancel} disabled={busy}>Cancelar</button><button type="button" className="danger-button" ref={deleteRef} onClick={onConfirm} disabled={busy}>{busy ? 'Eliminando…' : 'Eliminar definitivamente'}</button></div>
  </section></div>
}

function CampaignReadOnlyPreview({ business, campaign, products, onClose }: { business: Business; campaign: CampaignWithProducts; products: CatalogProduct[]; onClose: () => void }) {
  const draft: CampaignDraft = campaignDraftFromRecord(campaign)
  return <div className="modal-backdrop" role="presentation"><section className="campaign-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-preview-title"><div className="campaign-preview-dialog-heading"><div><span className="eyebrow accent">VISTA PREVIA</span><h2 id="campaign-preview-title">{campaign.name}</h2></div><button type="button" className="icon-button" aria-label="Cerrar vista previa" onClick={onClose}>×</button></div><CampaignPreview business={business} draft={draft} products={products} /><div className="campaign-preview-dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button></div></section></div>
}
