import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Eye, Image as ImageIcon, Pencil, Plus, Sparkles, Star, ToggleLeft, ToggleRight } from 'lucide-react'
import type { Business, CatalogProduct } from '../lib/database.types'
import { catalogImageUrl } from '../lib/catalog'
import { campaignDraftFromRecord, campaignErrorMessage, campaignStatusLabel, campaignTypeFromRecord, getCampaignDisplayStatus, listCatalogCampaigns, setCatalogCampaignActive, type CampaignDraft, type CampaignWithProducts } from '../lib/catalog-campaigns'
import { Loading, Notice } from './Feedback'
import { CampaignPreview } from './CampaignPreview'
import { CampaignWizard } from './CampaignWizard'
import { formatCurrency } from '../lib/quotes'
import './catalog-promotions.css'

const offerLabels = { percentage: 'Descuento porcentual', fixed_discount: 'Descuento por monto', fixed_price: 'Precio especial', two_for_one: '2x1', combo: 'Combo', showcase: 'Campaña visual' }

export function CampaignsPanel({ business, products }: { business: Business; products: CatalogProduct[] }) {
  const [campaigns, setCampaigns] = useState<CampaignWithProducts[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editing, setEditing] = useState<CampaignWithProducts | null>(null)
  const [previewing, setPreviewing] = useState<CampaignWithProducts | null>(null)
  const [pendingActivation, setPendingActivation] = useState<CampaignWithProducts | null>(null)
  const [busyId, setBusyId] = useState('')
  const productsById = useMemo(() => new Map(products.map(product => [product.id, product])), [products])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setCampaigns(await listCatalogCampaigns(business.id)) }
    catch (reason) { setError(campaignErrorMessage(reason)) }
    finally { setLoading(false) }
  }, [business.id])

  useEffect(() => {
    let current = true
    void listCatalogCampaigns(business.id)
      .then(data => { if (current) setCampaigns(data) })
      .catch(reason => { if (current) setError(campaignErrorMessage(reason)) })
      .finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [business.id])

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

  function startNew() { setEditing(null); setWizardOpen(true); setError(''); setNotice('') }
  function startEdit(campaign: CampaignWithProducts) { setEditing(campaign); setWizardOpen(true); setError(''); setNotice('') }
  function completeWizard(message: string) { setWizardOpen(false); setEditing(null); setNotice(message); void refresh() }

  if (wizardOpen) return <CampaignWizard business={business} products={products} campaign={editing} onCancel={() => { setWizardOpen(false); setEditing(null) }} onSaved={completeWizard} />

  return <section className="campaigns-panel" aria-labelledby="campaigns-title">
    <div className="campaigns-heading"><div><span className="eyebrow accent">OFERTAS PARA TU CATÁLOGO</span><h2 id="campaigns-title">Promociones</h2><p className="muted">Crea ofertas que ayuden a mover tu catálogo.</p></div><button type="button" className="primary" onClick={startNew} disabled={!products.length}><Plus size={17} /> Nueva promoción</button></div>
    {notice && <Notice>{notice}</Notice>}{error && <Notice error>{error}</Notice>}
    {!products.length && <Notice>Agrega primero al menos un producto en la pestaña Productos para crear una promoción.</Notice>}
    {loading ? <Loading text="Cargando tus promociones…" /> : campaigns.length === 0
      ? <section className="campaign-empty-state"><span className="campaign-empty-icon"><Sparkles size={27} aria-hidden="true" /></span><span className="subtle-badge">CATÁLOGO EN MOVIMIENTO</span><h3>Aún no has creado promociones</h3><p>Crea descuentos, 2x1, precios especiales o campañas visuales para destacar productos.</p><button type="button" className="primary" onClick={startNew} disabled={!products.length}><Plus size={17} /> Crear mi primera promoción</button></section>
      : <div className="campaign-list">{campaigns.map(campaign => {
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
        return <article className="campaign-card" key={campaign.id}>
          {image ? <img className="campaign-card-image" src={image} alt="" loading="lazy" /> : <div className="campaign-card-image campaign-card-image-empty"><ImageIcon size={22} aria-hidden="true" /></div>}
          <div className="campaign-card-main">
            <div className="campaign-card-top"><div><span className="subtle-badge">{offerLabels[type]}</span>{campaign.featured && <span className="campaign-featured-label"><Star size={13} aria-hidden="true" /> Destacada</span>}</div><span className={`campaign-status status-${status}`}>{campaignStatusLabel(status)}</span></div>
            <h3>{campaign.name}</h3>{campaign.badge_text && <span className="campaign-card-badge">{campaign.badge_text}</span>}
            <p className="campaign-card-value">{valueLabel}</p>
            <p className="campaign-card-products"><strong>Productos:</strong> {associated.length ? associated.map(product => product.name).join(' · ') : 'Sin productos disponibles'}</p>
            <div className="campaign-card-meta"><span><CalendarDays size={14} aria-hidden="true" />{campaign.starts_on || campaign.ends_on ? `${campaign.starts_on || 'Sin inicio'} – ${campaign.ends_on || 'Sin fecha final'}` : 'Sin fecha definida'}</span><span>{campaign.product_ids.length} {campaign.product_ids.length === 1 ? 'producto' : 'productos'}</span></div>
            <div className="campaign-card-actions"><button type="button" className="secondary-button" onClick={() => startEdit(campaign)} aria-label={`Editar ${campaign.name}`}><Pencil size={15} /> Editar</button><button type="button" className="secondary-button" onClick={() => setPreviewing(campaign)} aria-label={`Vista previa de ${campaign.name}`}><Eye size={15} /> Vista previa</button>{campaign.active ? <button type="button" className="text-button" disabled={busyId === campaign.id} onClick={() => void toggle(campaign, false)} aria-label={`Desactivar ${campaign.name}`}><ToggleRight size={18} /> Desactivar</button> : <button type="button" className="primary campaign-publish-small" disabled={busyId === campaign.id} onClick={() => setPendingActivation(campaign)} aria-label={`Activar ${campaign.name}`}><ToggleLeft size={17} /> Activar</button>}</div>
          </div>
        </article>
      })}</div>}

    {previewing && <CampaignReadOnlyPreview business={business} campaign={previewing} products={products} onClose={() => setPreviewing(null)} />}
    {pendingActivation && <div className="modal-backdrop" role="presentation"><section className="confirm-modal campaign-publish-dialog" role="alertdialog" aria-modal="true" aria-labelledby="campaign-activate-title"><span className="campaign-confirm-icon"><ToggleRight size={22} /></span><h2 id="campaign-activate-title">¿Activar esta promoción?</h2><p>{pendingActivation.name} quedará disponible según su vigencia y productos asociados.</p><div><button type="button" className="secondary-button" onClick={() => setPendingActivation(null)} disabled={busyId === pendingActivation.id}>Volver</button><button type="button" className="primary" onClick={() => void toggle(pendingActivation, true)} disabled={busyId === pendingActivation.id}>{busyId === pendingActivation.id ? 'Activando…' : 'Activar promoción'}</button></div></section></div>}
  </section>
}

function CampaignReadOnlyPreview({ business, campaign, products, onClose }: { business: Business; campaign: CampaignWithProducts; products: CatalogProduct[]; onClose: () => void }) {
  const draft: CampaignDraft = campaignDraftFromRecord(campaign)
  return <div className="modal-backdrop" role="presentation"><section className="campaign-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="campaign-preview-title"><div className="campaign-preview-dialog-heading"><div><span className="eyebrow accent">VISTA PREVIA</span><h2 id="campaign-preview-title">{campaign.name}</h2></div><button type="button" className="icon-button" aria-label="Cerrar vista previa" onClick={onClose}>×</button></div><CampaignPreview business={business} draft={draft} products={products} /><div className="campaign-preview-dialog-actions"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button></div></section></div>
}
