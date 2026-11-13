import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Check, ImagePlus, X } from 'lucide-react'
import type { Business, CatalogCampaign, CatalogProduct } from '../lib/database.types'
import { catalogImageUrl, validateCatalogImage } from '../lib/catalog'
import { buildCampaignInput, campaignErrorMessage, campaignOfferTypes, campaignDraftFromRecord, defaultCampaignBadge, localDateString, saveCatalogCampaign, validateCampaignDraft, type CampaignDraft, type CampaignOfferType, type CampaignWithProducts } from '../lib/catalog-campaigns'
import { formatCurrency } from '../lib/quotes'
import { Notice } from './Feedback'
import { CampaignProductPicker } from './CampaignProductPicker'
import { CampaignPreview } from './CampaignPreview'
import { CampaignTypeSelector } from './CampaignTypeSelector'

const stepLabels = ['Oferta', 'Productos', 'Detalles', 'Vigencia', 'Vista previa']

function emptyDraft(): CampaignDraft {
  return { offerType: 'percentage', name: '', description: '', badgeText: '', value: '', productIds: [], startsOn: '', endsOn: '', featured: false, imagePath: null, imageFile: null, removeImage: false }
}

export function CampaignWizard({ business, products, campaign, onCancel, onSaved }: {
  business: Business
  products: CatalogProduct[]
  campaign: CampaignWithProducts | null
  onCancel: () => void
  onSaved: (message: string) => void
}) {
  const [draft, setDraft] = useState<CampaignDraft>(() => campaign ? campaignDraftFromRecord(campaign) : emptyDraft())
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [publishConfirmation, setPublishConfirmation] = useState(false)
  const objectUrl = useMemo(() => draft.imageFile ? URL.createObjectURL(draft.imageFile) : null, [draft.imageFile])
  const previewImage = objectUrl ?? (draft.removeImage ? null : draft.imagePath ? catalogImageUrl(draft.imagePath) : null)
  useEffect(() => () => { if (objectUrl) URL.revokeObjectURL(objectUrl) }, [objectUrl])

  function update<K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) {
    setDraft(current => ({ ...current, [key]: value }))
    setErrors([])
  }

  function chooseType(type: CampaignOfferType) {
    setDraft(current => ({ ...current, offerType: type, value: current.offerType === type ? current.value : '', badgeText: current.offerType === type ? current.badgeText : '' }))
    setErrors([])
  }

  function validateCurrentStep() {
    const nextErrors: string[] = []
    if (step === 0 && !draft.offerType) nextErrors.push('Elige el tipo de oferta que deseas crear.')
    if (step === 1) {
      if (!products.length) nextErrors.push('Primero agrega productos a tu catálogo.')
      if (!draft.productIds.length) nextErrors.push('Selecciona al menos un producto.')
      if (['percentage', 'fixed_discount', 'fixed_price'].includes(draft.offerType) && draft.productIds.some(id => products.find(product => product.id === id)?.public_price_mode === 'contact')) nextErrors.push('Quita los productos con Precio pendiente para aplicar una oferta monetaria.')
    }
    if (step === 2) {
      if (!draft.name.trim() || draft.name.trim().length > 120) nextErrors.push('Escribe un nombre de campaña de hasta 120 caracteres.')
      if (draft.description.trim().length > 1000) nextErrors.push('La descripción no puede superar 1,000 caracteres.')
      if (draft.badgeText.trim().length > 60) nextErrors.push('El badge no puede superar 60 caracteres.')
      const value = draft.value.trim() ? Number(draft.value) : Number.NaN
      if (draft.offerType === 'percentage' && (!Number.isInteger(value) || value < 1 || value > 100)) nextErrors.push('El descuento debe ser un número entero entre 1 y 100.')
      if (draft.offerType === 'fixed_discount') {
        if (!Number.isFinite(value) || value <= 0) nextErrors.push('Indica un monto de descuento mayor que cero.')
        const prices = draft.productIds.map(id => products.find(product => product.id === id)).filter((product): product is CatalogProduct => Boolean(product && product.public_price_mode !== 'contact'))
        if (Number.isFinite(value) && prices.some(product => value > Number(product.default_unit_price))) nextErrors.push('El descuento no puede ser mayor que el precio habitual de un producto seleccionado.')
      }
      if (draft.offerType === 'fixed_price' && (!Number.isFinite(value) || value < 0)) nextErrors.push('Indica un precio especial válido, igual o mayor que cero.')
    }
    if (step === 3 && draft.startsOn && draft.endsOn && draft.endsOn < draft.startsOn) nextErrors.push('La fecha final debe ser igual o posterior a la fecha de inicio.')
    setErrors(nextErrors)
    return nextErrors.length === 0
  }

  function continueStep() {
    if (!validateCurrentStep()) return
    setStep(current => Math.min(4, current + 1))
  }

  async function save(active: boolean) {
    const validation = validateCampaignDraft(draft, products)
    if (validation.length) {
      setErrors(validation)
      setPublishConfirmation(false)
      return
    }
    setBusy(true)
    setErrors([])
    try {
      const values = buildCampaignInput(draft, business.id, active)
      await saveCatalogCampaign({
        businessId: business.id,
        ownerId: business.owner_id,
        values,
        productIds: draft.productIds,
        existing: campaign as CatalogCampaign | null,
        imageFile: draft.imageFile,
        removeImage: draft.removeImage,
      })
      setPublishConfirmation(false)
      onSaved(active ? 'La promoción quedó publicada.' : campaign ? 'Los cambios de la promoción quedaron guardados.' : 'El borrador quedó guardado. Puedes publicarlo cuando esté listo.')
    } catch (error) {
      setErrors([campaignErrorMessage(error)])
      setPublishConfirmation(false)
    } finally {
      setBusy(false)
    }
  }

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      validateCatalogImage(file)
      setDraft(current => ({ ...current, imageFile: file, removeImage: false }))
      setErrors([])
    } catch (error) {
      setErrors([error instanceof Error ? error.message : campaignErrorMessage(error)])
    }
  }

  const selectedProducts = draft.productIds.map(id => products.find(product => product.id === id)).filter((product): product is CatalogProduct => Boolean(product))
  const minimumProductPrice = selectedProducts.filter(product => product.public_price_mode !== 'contact').reduce<number | null>((min, product) => min === null ? Number(product.default_unit_price) : Math.min(min, Number(product.default_unit_price)), null)
  const typeInfo = campaignOfferTypes.find(option => option.value === draft.offerType)
  const valueNumber = draft.value.trim() ? Number(draft.value) : 0
  const campaignValueSummary = draft.offerType === 'percentage' ? `${draft.value || '—'}% de descuento`
    : draft.offerType === 'fixed_discount' ? `${formatCurrency(valueNumber, business)} de descuento`
      : draft.offerType === 'fixed_price' ? `Precio especial ${formatCurrency(valueNumber, business)}`
        : draft.offerType === 'two_for_one' ? 'Compra 1 y recibe 2'
          : 'Campaña visual sin cambio de precio'

  return <section className="campaign-wizard" aria-labelledby="campaign-wizard-title">
    <button type="button" className="back-button" disabled={busy} onClick={onCancel}><ArrowLeft size={16} /> Promociones</button>
    <div className="campaign-wizard-heading"><span className="eyebrow accent">{campaign ? 'EDITAR CAMPAÑA' : 'NUEVA CAMPAÑA'}</span><h2 id="campaign-wizard-title">{step === 0 ? '¿Qué tipo de oferta quieres crear?' : step === 1 ? '¿Qué productos participan?' : step === 2 ? 'Cuéntanos los detalles de la oferta' : step === 3 ? '¿Cuándo estará disponible?' : 'Revisa cómo se verá'}</h2><p>{step === 0 ? 'Elige una opción. Podrás completar los detalles en los siguientes pasos.' : `Paso ${step + 1} de ${stepLabels.length} · Puedes revisar y ajustar la información antes de guardar.`}</p></div>
    <nav className="campaign-stepper" aria-label="Pasos de la promoción">
      {stepLabels.map((label, index) => <button key={label} type="button" className={`campaign-step${step === index ? ' is-current' : ''}${step > index ? ' is-complete' : ''}`} aria-current={step === index ? 'step' : undefined} disabled={index > step || busy} onClick={() => setStep(index)}><span>{step > index ? <Check size={13} /> : index + 1}</span><small>{label}</small></button>)}
    </nav>

    <div className="campaign-wizard-content">
      {step === 0 && <CampaignTypeSelector business={business} selected={draft.offerType} onSelect={chooseType} />}
      {step === 1 && <CampaignProductPicker business={business} products={products} offerType={draft.offerType} selected={draft.productIds} onChange={ids => update('productIds', ids)} />}
      {step === 2 && <fieldset className="campaign-details-fields" disabled={busy}>
        {draft.offerType === 'percentage' && <label>Porcentaje de descuento<input aria-label="Porcentaje de descuento" type="number" min="1" max="100" step="1" value={draft.value} onChange={event => update('value', event.target.value)} placeholder="25" /><small>Elige un número entero entre 1 y 100.</small></label>}
        {draft.offerType === 'fixed_discount' && <label>Monto de descuento<input aria-label="Monto de descuento" type="number" min="0.01" max={minimumProductPrice ?? undefined} step="0.01" value={draft.value} onChange={event => update('value', event.target.value)} placeholder={minimumProductPrice === null ? '0.00' : Math.min(100, minimumProductPrice).toFixed(2)} /><small>La moneda configurada para este negocio se mostrará en la vista previa.</small>{minimumProductPrice !== null && Number(draft.value) > minimumProductPrice && <small className="campaign-inline-error">El descuento no puede ser mayor que {formatCurrency(minimumProductPrice, business)}.</small>}</label>}
        {draft.offerType === 'fixed_price' && <label>Precio especial<input aria-label="Precio especial" type="number" min="0" step="0.01" value={draft.value} onChange={event => update('value', event.target.value)} placeholder="0.00" /><small>El precio habitual de cada producto se toma del catálogo.</small></label>}
        {draft.offerType === 'two_for_one' && <div className="campaign-guidance"><span className="campaign-type-icon"><Check size={20} /></span><p>Compra 1 y recibe 2 unidades del mismo producto. No hace falta calcular ningún porcentaje ni ingresar otro precio.</p></div>}
        {draft.offerType === 'showcase' && <div className="campaign-guidance"><span className="campaign-type-icon"><Check size={20} /></span><p>Destaca una novedad, una temporada o una colección sin cambiar el precio de los productos.</p></div>}
        <label>Nombre de la campaña<input aria-label="Nombre de la campaña" required maxLength={120} value={draft.name} onChange={event => update('name', event.target.value)} placeholder="Ej. Oferta de temporada" /><small>Este nombre puede aparecer junto a los productos en el catálogo público.</small></label>
        <label>Descripción comercial <span className="campaign-optional">Opcional</span><textarea aria-label="Descripción comercial" maxLength={1000} value={draft.description} onChange={event => update('description', event.target.value)} placeholder="Describe brevemente esta oferta." /></label>
        <label>Badge o etiqueta <span className="campaign-optional">Opcional</span><input aria-label="Badge de promoción" maxLength={60} value={draft.badgeText} onChange={event => update('badgeText', event.target.value)} placeholder={defaultCampaignBadge(draft.offerType, draft.value)} /><small>Ejemplo: {defaultCampaignBadge(draft.offerType, draft.value)}. Puedes cambiarlo.</small></label>
        <label className="campaign-toggle"><input type="checkbox" checked={draft.featured} onChange={event => update('featured', event.target.checked)} /><span><strong>Mostrar como destacado</strong><small>Puede tener mayor visibilidad cuando configures la zona destacada del catálogo.</small></span></label>
        <div className="campaign-image-field"><div><strong>Imagen de campaña</strong><small>Opcional · PNG, JPG o WebP · máximo 5 MB</small></div>{previewImage ? <img className="campaign-image-preview" src={previewImage} alt="Vista previa de la imagen de campaña" /> : <div className="campaign-image-placeholder"><ImagePlus size={22} /><span>Sin imagen</span></div>}<div className="campaign-image-actions"><label className="secondary-button catalog-file-button"><ImagePlus size={16} />{previewImage ? 'Cambiar imagen' : 'Subir imagen'}<input aria-label="Subir imagen de campaña" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} /></label>{previewImage && <button type="button" className="text-button" onClick={() => { setDraft(current => ({ ...current, imageFile: null, imagePath: null, removeImage: true })); setErrors([]) }}><X size={16} /> Quitar imagen</button>}</div></div>
      </fieldset>}
      {step === 3 && <div className="campaign-schedule-fields">
        <div className="campaign-date-actions"><button type="button" className="secondary-button" onClick={() => update('startsOn', localDateString())}><CalendarDays size={16} /> Empieza hoy</button><button type="button" className="secondary-button" onClick={() => update('endsOn', '')}>Sin fecha final</button></div>
        <div className="campaign-date-grid"><label>Fecha de inicio <span className="campaign-optional">Opcional</span><input aria-label="Fecha de inicio" type="date" value={draft.startsOn} onChange={event => update('startsOn', event.target.value)} /></label><label>Fecha de finalización <span className="campaign-optional">Opcional</span><input aria-label="Fecha de finalización" type="date" min={draft.startsOn || undefined} value={draft.endsOn} onChange={event => update('endsOn', event.target.value)} /></label></div>
        <p className="campaign-schedule-note">La fecha final incluye todo ese día. No se configuran horarios en esta fase.</p>
      </div>}
      {step === 4 && <div className="campaign-final-preview"><div className="campaign-review-summary"><span className="subtle-badge">{typeInfo?.title ?? 'Campaña'}</span><h3>{draft.name.trim()}</h3><dl><div><dt>Productos</dt><dd>{selectedProducts.length}</dd></div><div><dt>Oferta</dt><dd>{campaignValueSummary}</dd></div><div><dt>Badge</dt><dd>{draft.badgeText.trim() || defaultCampaignBadge(draft.offerType, draft.value)}</dd></div><div><dt>Vigencia</dt><dd>{draft.startsOn || draft.endsOn ? `${draft.startsOn || 'Sin inicio'} – ${draft.endsOn || 'Sin fecha final'}` : 'Sin fecha definida'}</dd></div></dl></div><CampaignPreview business={business} draft={draft} products={products} imageUrl={previewImage} /></div>}
    </div>

    {errors.length > 0 && <div className="campaign-wizard-errors" role="alert">{errors.map(error => <Notice key={error} error>{error}</Notice>)}</div>}
    <div className="campaign-wizard-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={() => step === 0 ? onCancel() : setStep(current => Math.max(0, current - 1))}>{step === 0 ? 'Cancelar' : 'Atrás'}</button>
      {step < 4 ? <button type="button" className="primary" disabled={busy || (step === 1 && !products.length)} onClick={continueStep}>Continuar <ArrowRight size={17} /></button> : <div className="campaign-final-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={() => void save(false)}>{busy ? 'Guardando…' : campaign?.active ? 'Guardar como borrador' : 'Guardar borrador'}</button>
        {campaign?.active
          ? <button type="button" className="primary" disabled={busy} onClick={() => void save(true)}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
          : <button type="button" className="primary" disabled={busy} onClick={() => { if (validateCampaignDraft(draft, products).length) setErrors(validateCampaignDraft(draft, products)); else setPublishConfirmation(true) }}>Publicar promoción</button>}
      </div>}
    </div>

    {publishConfirmation && <div className="modal-backdrop" role="presentation"><section className="confirm-modal campaign-publish-dialog" role="alertdialog" aria-modal="true" aria-labelledby="campaign-publish-title" aria-describedby="campaign-publish-description"><span className="campaign-confirm-icon"><Check size={22} /></span><h2 id="campaign-publish-title">¿Publicar esta promoción?</h2><p id="campaign-publish-description">Revisa los productos y las fechas antes de hacerla visible.</p><dl><div><dt>Tipo</dt><dd>{typeInfo?.title}</dd></div><div><dt>Productos</dt><dd>{selectedProducts.map(product => product.name).join(', ')}</dd></div><div><dt>Oferta</dt><dd>{campaignValueSummary}</dd></div><div><dt>Badge</dt><dd>{draft.badgeText.trim() || defaultCampaignBadge(draft.offerType, draft.value)}</dd></div><div><dt>Vigencia</dt><dd>{draft.startsOn || draft.endsOn ? `${draft.startsOn || 'Sin inicio'} – ${draft.endsOn || 'Sin fecha final'}` : 'Sin fechas'}</dd></div></dl><div><button type="button" className="secondary-button" disabled={busy} onClick={() => setPublishConfirmation(false)}>Volver a editar</button><button type="button" className="primary" disabled={busy} onClick={() => void save(true)}>{busy ? 'Publicando…' : 'Publicar promoción'}</button></div></section></div>}
  </section>
}
