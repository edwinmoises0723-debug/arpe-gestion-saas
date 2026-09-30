import { useState, type RefObject } from 'react'
import { Download, FileImage, FileText, MessageCircle, Printer, Share2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ClientDocumentModel } from '../../lib/documents'
import { createWhatsAppMessage, createWhatsAppUrl } from '../../lib/documents'
import { createDocumentPng, downloadBlob, saveDocumentPdf, saveDocumentPng } from '../../lib/document-export'
import type { DocumentPrintFormat } from './ClientDocument'

const printFormats: { value: DocumentPrintFormat; label: string; description: string }[] = [
  { value: 'a4', label: 'A4', description: 'Documento completo' },
  { value: 'thermal-80', label: 'Térmica 80 mm', description: 'Recomendada' },
  { value: 'thermal-58', label: 'Térmica 58 mm', description: 'Compacta' },
]

export function DocumentActions({ model, documentRef, printFormat, onPrintFormatChange, backTo, formatAmount }: {
  model: ClientDocumentModel
  documentRef: RefObject<HTMLElement | null>
  printFormat: DocumentPrintFormat
  onPrintFormatChange: (format: DocumentPrintFormat) => void
  backTo: string
  formatAmount: (amount: number) => string
}) {
  const [busy, setBusy] = useState(false)
  const [printDialog, setPrintDialog] = useState(false)
  const [selectedPrintFormat, setSelectedPrintFormat] = useState(printFormat)
  const [printPreview, setPrintPreview] = useState(false)
  const [draftConfirmed, setDraftConfirmed] = useState(false)
  const [draftDialog, setDraftDialog] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [feedback, setFeedback] = useState('')
  const [whatsAppUrl, setWhatsAppUrl] = useState('')
  const isDraft = model.type === 'quote' && model.quote.status === 'draft'
  const number = model.type === 'quote' ? model.quote.quote_number : model.order.order_number
  const title = model.type === 'quote' ? `Cotización ${number}` : `Confirmación de pedido ${number}`
  const shareText = createWhatsAppMessage(model, formatAmount)

  function request(action: () => void) {
    setFeedback('')
    setWhatsAppUrl('')
    if (isDraft && !draftConfirmed) {
      setPendingAction(() => action)
      setDraftDialog(true)
      return
    }
    action()
  }

  async function generate(task: () => Promise<string | void>) {
    if (busy) return
    setBusy(true)
    setFeedback('Generando documento…')
    try {
      setFeedback(await task() ?? '')
    } catch {
      setFeedback('No pudimos generar el archivo. Inténtalo nuevamente.')
    } finally {
      setBusy(false)
    }
  }

  function getDocumentNode() {
    if (!documentRef.current) throw new Error('No se encontró la vista previa del documento.')
    return documentRef.current
  }

  function beginPrint() {
    setSelectedPrintFormat(printFormat)
    setPrintDialog(true)
  }

  function previewPrint() {
    onPrintFormatChange(selectedPrintFormat)
    try { sessionStorage.setItem('arpe-document-print-format', selectedPrintFormat) } catch { /* La preferencia solo vive durante esta sesión. */ }
    setPrintPreview(true)
    setPrintDialog(false)
  }

  async function fallbackFile(file: File, message: string) {
    downloadBlob(file, file.name)
    setWhatsAppUrl(createWhatsAppUrl(model, shareText))
    return message
  }

  async function shareFile(forWhatsApp: boolean) {
    await generate(async () => {
      const file = await createDocumentPng(getDocumentNode(), model)
      const shareData = { files: [file], title, text: shareText }
      const canShareFile = (() => {
        try { return Boolean(navigator.canShare?.({ files: [file] })) } catch { return false }
      })()
      if (navigator.share && canShareFile) {
        try {
          await navigator.share(shareData)
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
        }
      }
      const message = forWhatsApp
        ? 'Tu navegador no permite adjuntar el archivo automáticamente. El documento fue descargado; adjúntalo en WhatsApp.'
        : 'Tu navegador no permite compartir archivos directamente. Descargamos el documento para que puedas adjuntarlo.'
      return fallbackFile(file, message)
    })
  }

  function confirmDraftGeneration() {
    setDraftConfirmed(true)
    setDraftDialog(false)
    const action = pendingAction
    setPendingAction(null)
    action?.()
  }

  return <>
    {printPreview ? <div className="document-print-preview-actions" role="status"><div><strong>Vista previa de impresión · {printFormats.find(option => option.value === printFormat)?.label}</strong><span>Selecciona la impresora disponible en el diálogo del sistema.</span></div><button type="button" className="secondary-button" disabled={busy} onClick={() => { setSelectedPrintFormat(printFormat); setPrintDialog(true) }}>Cambiar formato</button><button type="button" className="primary" disabled={busy} onClick={() => { if (!busy) window.print() }}><Printer size={16} /> Imprimir ahora</button><button type="button" className="document-exit-print" onClick={() => setPrintPreview(false)}>Volver al documento</button></div> : <div className="document-actions" aria-label="Acciones del documento">
      <Link className="secondary-button" to={backTo}><X size={16} /> Volver</Link>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => request(() => void generate(() => saveDocumentPdf(getDocumentNode(), model)))}><FileText size={16} /> Descargar PDF</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => request(() => void generate(() => saveDocumentPng(getDocumentNode(), model)))}><FileImage size={16} /> Guardar imagen</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => request(beginPrint)}><Printer size={16} /> Imprimir</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => request(() => void shareFile(false))}><Share2 size={16} /> Compartir</button>
      <button type="button" className="primary" disabled={busy} onClick={() => request(() => void shareFile(true))}><MessageCircle size={16} /> WhatsApp</button>
    </div>}

    {busy && <p className="document-feedback" role="status">Generando documento…</p>}
    {feedback && !busy && <div className="document-feedback" role="status"><span>{feedback}</span>{whatsAppUrl && <a className="primary" href={whatsAppUrl} target="_blank" rel="noreferrer">Abrir WhatsApp</a>}</div>}

    {printDialog && <div className="document-modal-backdrop" role="presentation"><section className="document-modal" role="dialog" aria-modal="true" aria-labelledby="document-print-title">
      <button type="button" className="document-modal-close" aria-label="Cerrar opciones de impresión" onClick={() => setPrintDialog(false)}><X size={18} /></button>
      <span className="document-modal-icon"><Printer size={20} /></span><span className="eyebrow accent">IMPRESIÓN</span><h2 id="document-print-title">¿Cómo deseas imprimir?</h2>
      <fieldset className="document-print-formats"><legend>Elige un formato</legend>{printFormats.map(option => <label key={option.value} className={selectedPrintFormat === option.value ? 'is-selected' : ''}><input type="radio" name="document-print-format" value={option.value} checked={selectedPrintFormat === option.value} onChange={() => setSelectedPrintFormat(option.value)} /><span><strong>{option.label}</strong><small>{option.description}</small></span>{option.value === 'thermal-80' && <em>Recomendada</em>}</label>)}</fieldset>
      <p className="document-print-limitation">La impresora disponible depende del dispositivo, navegador y controlador instalado.</p>
      <div className="document-modal-actions"><button type="button" className="secondary-button" onClick={() => setPrintDialog(false)}>Cancelar</button><button type="button" className="primary" onClick={previewPrint}>Vista previa de impresión</button></div>
    </section></div>}

    {draftDialog && <div className="document-modal-backdrop" role="presentation"><section className="document-modal document-draft-modal" role="alertdialog" aria-modal="true" aria-labelledby="document-draft-title">
      <span className="document-modal-icon"><Download size={20} /></span><span className="eyebrow accent">COTIZACIÓN EN BORRADOR</span><h2 id="document-draft-title">¿Deseas generar el documento?</h2><p>Esta cotización todavía está en borrador. Puedes generar el archivo de todas formas; su estado no cambiará.</p><div className="document-modal-actions"><button type="button" className="secondary-button" onClick={() => { setDraftDialog(false); setPendingAction(null) }}>Volver</button><button type="button" className="primary" onClick={confirmDraftGeneration}>Generar de todas formas</button></div>
    </section></div>}
  </>
}
