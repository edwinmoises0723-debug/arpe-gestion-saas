import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, FileText } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Loading, Notice } from '../components/Feedback'
import { ClientDocument, type DocumentPrintFormat } from '../components/documents/ClientDocument'
import { DocumentActions } from '../components/documents/DocumentActions'
import { LOGO_BUCKET } from '../lib/business'
import type { Business } from '../lib/database.types'
import { listOrders } from '../lib/orders'
import { listPayments } from '../lib/payments'
import { listQuotes, formatCurrency } from '../lib/quotes'
import { client, errorMessage } from '../lib/supabase'
import { createOrderDocumentModel, createQuoteDocumentModel, type ClientDocumentModel } from '../lib/documents'

type DocumentType = 'quote' | 'order'
type LoadedDocument = { key: string; model?: ClientDocumentModel; error?: string }

function initialPrintFormat(): DocumentPrintFormat {
  try {
    const saved = sessionStorage.getItem('arpe-document-print-format')
    if (saved === 'thermal-80' || saved === 'thermal-58') return saved
  } catch { /* La preferencia es opcional. */ }
  return 'a4'
}

async function loadLogoDataUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  try {
    const { data, error } = await client().storage.from(LOGO_BUCKET).createSignedUrl(path, 300)
    if (error || !data) return null
    const response = await fetch(data.signedUrl, { mode: 'cors' })
    if (!response.ok) return null
    const blob = await response.blob()
    if (!blob.type.startsWith('image/') || blob.size === 0 || blob.size > 2 * 1024 * 1024) return null
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export function ClientDocumentPage({ business, type }: { business: Business; type: DocumentType }) {
  const { id = '' } = useParams()
  const [retry, setRetry] = useState(0)
  const [loaded, setLoaded] = useState<LoadedDocument | null>(null)
  const [printFormat, setPrintFormat] = useState<DocumentPrintFormat>(initialPrintFormat)
  const documentRef = useRef<HTMLElement>(null)
  const key = `${business.id}:${type}:${id}`

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        if (type === 'quote') {
          const quotes = await listQuotes(business.id)
          const quote = quotes.find(item => item.id === id && item.business_id === business.id)
          if (!quote) throw new Error('No encontramos esta cotización en tu negocio.')
          const logo = await loadLogoDataUrl(business.logo_path)
          if (active) setLoaded({ key, model: createQuoteDocumentModel(business, quote, logo) })
          return
        }

        const [orders, payments] = await Promise.all([listOrders(business.id), listPayments(business.id)])
        const order = orders.find(item => item.id === id && item.business_id === business.id)
        if (!order) throw new Error('No encontramos este pedido en tu negocio.')
        const logo = await loadLogoDataUrl(business.logo_path)
        if (active) setLoaded({ key, model: createOrderDocumentModel(business, order, payments, logo) })
      } catch (reason) {
        if (active) setLoaded({ key, error: errorMessage(reason) })
      }
    }
    void load()
    return () => { active = false }
  }, [business, id, key, retry, type])

  const result = loaded?.key === key ? loaded : null
  if (!result) return <Loading text="Preparando el documento para tu cliente…" />
  if (result.error || !result.model) return <div className="document-workspace"><Link className="back-button" to={type === 'quote' ? '/cotizar' : '/pedidos'}><ArrowLeft size={17} /> Volver</Link><Notice error>{result.error || 'No pudimos abrir el documento.'}</Notice><button type="button" className="primary document-retry" onClick={() => setRetry(value => value + 1)}>Reintentar</button></div>

  const model = result.model
  const printPageSize = printFormat === 'thermal-80'
    ? '@page { size: 80mm 297mm; margin: 0; }'
    : printFormat === 'thermal-58'
      ? '@page { size: 58mm 297mm; margin: 0; }'
      : '@page { size: A4 portrait; margin: 0; }'

  return <div className="document-workspace">
    <style>{`@media print { ${printPageSize} }`}</style>
    <header className="document-screen-heading"><div><span className="eyebrow accent">DOCUMENTO PARA CLIENTE</span><h1>{type === 'quote' ? 'Vista previa de cotización' : 'Confirmación de pedido'}</h1><p>Revisa el documento antes de compartirlo o imprimirlo.</p></div><Link className="document-back-link" to={type === 'quote' ? '/cotizar' : '/pedidos'}><ArrowLeft size={16} /> Volver</Link></header>
    <DocumentActions model={model} documentRef={documentRef} printFormat={printFormat} onPrintFormatChange={setPrintFormat} backTo={type === 'quote' ? '/cotizar' : '/pedidos'} formatAmount={amount => formatCurrency(amount, business)} />
    <main className="document-preview-stage">
      <div className="document-preview-caption"><FileText size={16} /><span>{type === 'quote' ? 'Cotización original' : 'Datos actuales del pedido'}</span></div>
      <ClientDocument model={model} formatAmount={amount => formatCurrency(amount, business)} printFormat={printFormat} documentRef={documentRef} />
    </main>
    <p className="document-print-help">ARPE prepara el formato elegido y abre el diálogo estándar de impresión. La disponibilidad depende de tu dispositivo, impresora y controlador.</p>
  </div>
}
