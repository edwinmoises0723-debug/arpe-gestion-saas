import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Clipboard, Minus, Plus, Send, Trash2, X } from 'lucide-react'
import { catalogImageUrl } from '../lib/catalog'
import { buildQuoteRequestMessage, buildQuoteRequestWhatsAppUrl, calculateCatalogReference, formatRequestedDate, localDateString, validateCatalogRequest, type CatalogRequestForm, type CatalogRequestItem } from '../lib/catalog-request'
import type { Currency } from '../lib/database.types'
import './catalog-request.css'

type Props = {
  open: boolean
  onClose: () => void
  businessName: string
  whatsapp: string | null
  catalogUrl: string
  currency: Currency
  items: CatalogRequestItem[]
  onQuantity: (productId: string, quantity: number) => void
  onRemove: (productId: string) => void
  onClear: () => void
}

const symbols: Record<Currency, string> = { NIO: 'C$', USD: '$', EUR: '€', CRC: '₡' }
const emptyForm: CatalogRequestForm = { customerName: '', desiredDate: '', details: '' }

export function CatalogRequestPanel({ open, onClose, businessName, whatsapp, catalogUrl, currency, items, onQuantity, onRemove, onClear }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const dateInput = useRef<HTMLInputElement>(null)
  const detailsInput = useRef<HTMLTextAreaElement>(null)
  const [form, setForm] = useState<CatalogRequestForm>(emptyForm)
  const [errors, setErrors] = useState<ReturnType<typeof validateCatalogRequest>>({})
  const [notice, setNotice] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const units = items.reduce((total, item) => total + item.quantity, 0)
  const reference = useMemo(() => calculateCatalogReference(items), [items])
  const minDate = localDateString()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  function setField<K extends keyof CatalogRequestForm>(key: K, value: CatalogRequestForm[K]) {
    setForm(current => ({ ...current, [key]: value }))
    setErrors(current => ({ ...current, [key]: undefined }))
    setNotice('')
  }

  function getMessage() {
    const nextErrors = validateCatalogRequest(items, form, minDate)
    setErrors(nextErrors)
    setNotice('')
    if (Object.keys(nextErrors).length) {
      if (nextErrors.items) dialog.current?.querySelector<HTMLButtonElement>('.catalog-request-add')?.focus()
      else if (nextErrors.customerName) nameInput.current?.focus()
      else if (nextErrors.desiredDate) dateInput.current?.focus()
      else detailsInput.current?.focus()
      return null
    }
    return buildQuoteRequestMessage({ businessName, customerName: form.customerName, items, desiredDate: form.desiredDate, details: form.details, catalogUrl, currencySymbol: symbols[currency] })
  }

  function requestWhatsApp() {
    const message = getMessage()
    if (!message) return
    const url = buildQuoteRequestWhatsAppUrl(whatsapp, message)
    if (!url) {
      setNotice('Este negocio no tiene WhatsApp público habilitado. Puedes copiar o compartir tu solicitud.')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function copyRequest() {
    const message = getMessage()
    if (!message) return
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(message)
      else if (!copyFallback(message)) throw new Error('clipboard unavailable')
      setNotice('Solicitud copiada.')
    } catch {
      setNotice(copyFallback(message) ? 'Solicitud copiada.' : 'No pudimos copiarla. Puedes seleccionar el texto e intentarlo de nuevo.')
    }
  }

  async function shareRequest() {
    const message = getMessage()
    if (!message) return
    if (!navigator.share) {
      await copyRequest()
      return
    }
    try {
      await navigator.share({ title: `Solicitud de cotización para ${businessName}`, text: message })
      setNotice('Solicitud lista para compartir.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      await copyRequest()
    }
  }

  function clearRequest() {
    onClear()
    setForm(emptyForm)
    setErrors({})
    setNotice('Solicitud limpiada.')
    setConfirmClear(false)
  }

  return <dialog ref={dialog} className="catalog-request-dialog" aria-labelledby="catalog-request-title" aria-describedby="catalog-request-description" onClose={onClose} onCancel={onClose} onClick={event => { if (event.target === dialog.current) dialog.current?.close() }}>
    <section className="catalog-request-panel">
      <header className="catalog-request-header"><div><span className="public-eyebrow public-eyebrow-dark">PARA COTIZAR</span><h2 id="catalog-request-title">Mi solicitud</h2><p id="catalog-request-description">Revisa los productos y cuéntanos qué necesitas. Todavía no estás realizando una compra.</p></div><button type="button" className="catalog-request-close" aria-label="Cerrar mi solicitud" onClick={() => dialog.current?.close()}><X size={20} /></button></header>
      <div className="catalog-request-body">
        {errors.items && <p className="catalog-request-error" role="alert">{errors.items}</p>}
        <section className="catalog-request-products" aria-label="Productos seleccionados">
          {items.length ? items.map(item => {
            const imageUrl = catalogImageUrl(item.imagePath ?? null)
            return <article className="catalog-request-item" key={item.productId}>
              <div className="catalog-request-thumbnail">{imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : <span aria-hidden="true">{item.name.slice(0, 1)}</span>}</div>
              <div className="catalog-request-item-copy"><span>{item.category}</span><h3>{item.name}</h3><p>{item.publicPriceMode === 'exact' ? '' : item.publicPriceMode === 'from' ? 'Desde ' : ''}{item.publicPriceMode === 'contact' || item.publicUnitPrice === null ? 'Consultar precio' : `${symbols[currency]} ${money(item.publicUnitPrice)}`} <small>/ {item.unitLabel}</small></p></div>
              <div className="catalog-request-quantity" aria-label={`Cantidad de ${item.name}`}><button type="button" aria-label={`Disminuir cantidad de ${item.name}`} onClick={() => onQuantity(item.productId, item.quantity - 1)}><Minus size={16} /></button><span aria-live="polite">{item.quantity}</span><button type="button" aria-label={`Aumentar cantidad de ${item.name}`} onClick={() => onQuantity(item.productId, item.quantity + 1)}><Plus size={16} /></button></div>
              <button type="button" className="catalog-request-remove" aria-label={`Quitar ${item.name}`} onClick={() => onRemove(item.productId)}><Trash2 size={17} /></button>
            </article>
          }) : <div className="catalog-request-empty"><p>Aún no agregas productos.</p><button type="button" className="catalog-request-add" onClick={onClose}>Volver al catálogo</button></div>}
        </section>

        {items.length > 0 && <>
          <div className="catalog-request-count"><span>{items.length} {items.length === 1 ? 'producto distinto' : 'productos distintos'}</span><span>{units} {units === 1 ? 'unidad' : 'unidades'} en total</span></div>
          {reference !== null ? <p className="catalog-request-reference">Referencia de productos: <strong>{symbols[currency]} {money(reference)}</strong><small>El negocio confirmará el valor final.</small></p> : <p className="catalog-request-reference-note">Los precios mostrados son referencias. El negocio confirmará el valor final.</p>}

          <section className="catalog-request-form-section" aria-labelledby="catalog-request-form-title">
            <span className="public-eyebrow public-eyebrow-dark">UNOS DATOS PARA AYUDARTE</span><h3 id="catalog-request-form-title">Cuéntanos sobre tu solicitud</h3>
            <label htmlFor="catalog-request-name">Tu nombre <span aria-hidden="true">*</span></label><input ref={nameInput} id="catalog-request-name" autoComplete="name" value={form.customerName} maxLength={100} aria-invalid={Boolean(errors.customerName)} aria-describedby={errors.customerName ? 'catalog-request-name-error' : undefined} onChange={event => setField('customerName', event.target.value)} placeholder="¿Cómo te llamas?" />{errors.customerName && <small className="catalog-request-error" id="catalog-request-name-error">{errors.customerName}</small>}
            <label htmlFor="catalog-request-date"><CalendarDays size={16} aria-hidden="true" /> ¿Para qué fecha lo necesitas? <span className="catalog-request-optional">Opcional</span></label><input ref={dateInput} id="catalog-request-date" type="date" min={minDate} value={form.desiredDate} aria-invalid={Boolean(errors.desiredDate)} aria-describedby={errors.desiredDate ? 'catalog-request-date-error' : undefined} onChange={event => setField('desiredDate', event.target.value)} />{errors.desiredDate && <small className="catalog-request-error" id="catalog-request-date-error">{errors.desiredDate}</small>}
            <label htmlFor="catalog-request-details">Cuéntanos lo que necesitas <span className="catalog-request-optional">Opcional</span></label><textarea ref={detailsInput} id="catalog-request-details" value={form.details} maxLength={1000} rows={3} aria-invalid={Boolean(errors.details)} aria-describedby={errors.details ? 'catalog-request-details-error' : 'catalog-request-details-help'} onChange={event => setField('details', event.target.value)} placeholder="Colores, temática, sabores o algún detalle especial…" /><small id="catalog-request-details-help" className="catalog-request-help">{form.details.length}/1000 caracteres</small>{errors.details && <small className="catalog-request-error" id="catalog-request-details-error">{errors.details}</small>}
          </section>

          <section className="catalog-request-review" aria-label="Revisa tu solicitud"><h3>Revisa tu solicitud</h3><p>{items.map(item => `${item.quantity} × ${item.name}`).join(' · ')}</p><p><strong>Nombre:</strong> {form.customerName.trim() || 'Por completar'}{form.desiredDate && <> · <strong>Fecha:</strong> {formatRequestedDate(form.desiredDate)}</>}</p>{form.details.trim() && <p><strong>Observaciones:</strong> {form.details.trim()}</p>}</section>
          <p className="catalog-request-privacy">Tus datos no se guardan en EJNEXA en esta etapa. Se compartirán únicamente mediante la opción que elijas.</p>
          {whatsapp && <button type="button" className="catalog-request-whatsapp" onClick={requestWhatsApp}><Send size={17} aria-hidden="true" /> Solicitar cotización por WhatsApp</button>}
          {!whatsapp && <p className="catalog-request-no-whatsapp" role="status">Este negocio no tiene WhatsApp público habilitado.</p>}
          <div className="catalog-request-actions"><button type="button" className="catalog-request-secondary" onClick={() => void copyRequest()}><Clipboard size={16} aria-hidden="true" /> Copiar solicitud</button><button type="button" className="catalog-request-secondary" onClick={() => void shareRequest()}>Compartir solicitud</button></div>
          {notice && <p className="catalog-request-notice" role="status">{notice}</p>}
          <div className="catalog-request-clear">{confirmClear ? <div role="alert"><span>¿Limpiar productos y datos escritos?</span><button type="button" onClick={clearRequest}>Sí, limpiar</button><button type="button" onClick={() => setConfirmClear(false)}>Conservar</button></div> : <button type="button" onClick={() => { if (form.customerName || form.desiredDate || form.details || items.length) setConfirmClear(true); else clearRequest() }}>Limpiar solicitud</button>}</div>
        </>}
      </div>
    </section>
  </dialog>
}

function money(amount: number) { return new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount) }

function copyFallback(text: string) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  try { return document.execCommand('copy') } catch { return false } finally { textarea.remove() }
}
