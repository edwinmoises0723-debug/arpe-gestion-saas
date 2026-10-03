import { useState, type RefObject } from 'react'
import { FileImage, FileText, MessageCircle, Printer, Share2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { createPngFile, downloadBlob, savePdfFile } from '../../lib/document-export'
import { createPaymentReceiptWhatsAppMessage, createPaymentReceiptWhatsAppUrl, getPaymentReceiptFilename, type PaymentReceiptModel } from '../../lib/payment-receipts'
import type { DocumentPrintFormat } from './ClientDocument'

const formats: { value: DocumentPrintFormat; label: string; description: string }[] = [
  { value: 'a4', label: 'A4', description: 'Documento completo' },
  { value: 'thermal-80', label: 'Térmica 80 mm', description: 'Recomendada' },
  { value: 'thermal-58', label: 'Térmica 58 mm', description: 'Compacta' },
]

export function PaymentReceiptActions({ model, documentRef, printFormat, onPrintFormatChange, formatAmount, backTo }: {
  model: PaymentReceiptModel
  documentRef: RefObject<HTMLElement | null>
  printFormat: DocumentPrintFormat
  onPrintFormatChange: (format: DocumentPrintFormat) => void
  formatAmount: (amount: number) => string
  backTo: string
}) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [whatsAppUrl, setWhatsAppUrl] = useState('')
  const [printDialog, setPrintDialog] = useState(false)
  const [selectedFormat, setSelectedFormat] = useState(printFormat)
  const [printPreview, setPrintPreview] = useState(false)
  const title = `Comprobante de pago ${model.payment.payment_number}`
  const shareText = createPaymentReceiptWhatsAppMessage(model, formatAmount)

  async function run(task: () => Promise<string | void>) {
    if (busy) return
    setBusy(true)
    setFeedback('Generando documento…')
    setWhatsAppUrl('')
    try { setFeedback(await task() ?? '') }
    catch { setFeedback('No pudimos generar el archivo. Inténtalo nuevamente.') }
    finally { setBusy(false) }
  }

  function getNode() {
    if (!documentRef.current) throw new Error('No se encontró la vista previa del comprobante.')
    return documentRef.current
  }

  async function share(forWhatsApp: boolean) {
    await run(async () => {
      const file = await createPngFile(getNode(), getPaymentReceiptFilename(model, 'png'))
      let canShareFile = false
      try { canShareFile = Boolean(navigator.canShare?.({ files: [file] })) } catch { /* Algunos navegadores rechazan canShare. */ }
      if (navigator.share && canShareFile) {
        try {
          await navigator.share({ files: [file], title, text: shareText })
          return
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return
        }
      }
      downloadBlob(file, file.name)
      if (forWhatsApp) {
        setWhatsAppUrl(createPaymentReceiptWhatsAppUrl(model, shareText))
        return 'El comprobante se descargó. Adjunta el archivo al abrir WhatsApp.'
      }
      return 'El comprobante se descargó para que puedas compartirlo.'
    })
  }

  function openPrintPreview() {
    onPrintFormatChange(selectedFormat)
    try { sessionStorage.setItem('arpe-document-print-format', selectedFormat) } catch { /* Preferencia opcional. */ }
    setPrintDialog(false)
    setPrintPreview(true)
  }

  return <>
    {printPreview ? <div className="document-print-preview-actions" role="status"><div><strong>Vista previa de impresión · {formats.find(option => option.value === printFormat)?.label}</strong><span>Selecciona la impresora disponible en el diálogo del sistema.</span></div><button type="button" className="secondary-button" disabled={busy} onClick={() => { setSelectedFormat(printFormat); setPrintDialog(true) }}>Cambiar formato</button><button type="button" className="primary" disabled={busy} onClick={() => window.print()}><Printer size={16} /> Imprimir ahora</button><button type="button" className="document-exit-print" onClick={() => setPrintPreview(false)}>Volver al comprobante</button></div> : <div className="document-actions" aria-label="Acciones del comprobante">
      <Link className="secondary-button" to={backTo}><X size={16} /> Volver a Pagos</Link>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(() => savePdfFile(getNode(), getPaymentReceiptFilename(model, 'pdf'), true))}><FileText size={16} /> Descargar PDF</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(async () => { const file = await createPngFile(getNode(), getPaymentReceiptFilename(model, 'png')); downloadBlob(file, file.name) })}><FileImage size={16} /> Guardar imagen</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => { setSelectedFormat(printFormat); setPrintDialog(true) }}><Printer size={16} /> Imprimir</button>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => void share(false)}><Share2 size={16} /> Compartir</button>
      <button type="button" className="primary" disabled={busy} onClick={() => void share(true)}><MessageCircle size={16} /> WhatsApp</button>
    </div>}

    {feedback && <div className="document-feedback" role="status"><span>{feedback}</span>{whatsAppUrl && <a className="primary" href={whatsAppUrl} target="_blank" rel="noreferrer">Abrir WhatsApp</a>}</div>}

    {printDialog && <div className="document-modal-backdrop" role="presentation"><section className="document-modal" role="dialog" aria-modal="true" aria-labelledby="receipt-print-title">
      <button type="button" className="document-modal-close" aria-label="Cerrar opciones de impresión" onClick={() => setPrintDialog(false)}><X size={18} /></button>
      <span className="document-modal-icon"><Printer size={20} /></span><span className="eyebrow accent">IMPRESIÓN</span><h2 id="receipt-print-title">¿Cómo deseas imprimir?</h2>
      <fieldset className="document-print-formats"><legend>Elige un formato</legend>{formats.map(option => <label key={option.value} className={selectedFormat === option.value ? 'is-selected' : ''}><input type="radio" name="receipt-print-format" value={option.value} checked={selectedFormat === option.value} onChange={() => setSelectedFormat(option.value)} /><span><strong>{option.label}</strong><small>{option.description}</small></span>{option.value === 'thermal-80' && <em>Recomendada</em>}</label>)}</fieldset>
      <p className="document-print-limitation">La impresora disponible depende del dispositivo, navegador y controlador instalado.</p>
      <div className="document-modal-actions"><button type="button" className="secondary-button" onClick={() => setPrintDialog(false)}>Cancelar</button><button type="button" className="primary" onClick={openPrintPreview}>Vista previa de impresión</button></div>
    </section></div>}
  </>
}
