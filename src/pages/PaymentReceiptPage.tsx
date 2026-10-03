import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, FileText } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Loading, Notice } from '../components/Feedback'
import { PaymentReceipt } from '../components/documents/PaymentReceipt'
import { PaymentReceiptActions } from '../components/documents/PaymentReceiptActions'
import type { DocumentPrintFormat } from '../components/documents/ClientDocument'
import { LOGO_BUCKET } from '../lib/business'
import type { Business } from '../lib/database.types'
import { listOrders } from '../lib/orders'
import { listPayments } from '../lib/payments'
import { createPaymentReceiptModel, type PaymentReceiptModel } from '../lib/payment-receipts'
import { formatCurrency } from '../lib/quotes'
import { client, errorMessage } from '../lib/supabase'

type LoadedReceipt = { key: string; model?: PaymentReceiptModel; backTo?: string; error?: string }

function initialPrintFormat(): DocumentPrintFormat {
  try {
    const saved = sessionStorage.getItem('arpe-document-print-format')
    if (saved === 'thermal-80' || saved === 'thermal-58') return saved
  } catch { /* Preferencia opcional. */ }
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
  } catch { return null }
}

export function PaymentReceiptPage({ business }: { business: Business }) {
  const { id = '' } = useParams()
  const [loaded, setLoaded] = useState<LoadedReceipt | null>(null)
  const [printFormat, setPrintFormat] = useState<DocumentPrintFormat>(initialPrintFormat)
  const documentRef = useRef<HTMLElement>(null)
  const key = `${business.id}:payment:${id}`

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [payments, orders] = await Promise.all([listPayments(business.id), listOrders(business.id)])
        const payment = payments.find(row => row.id === id && row.business_id === business.id)
        if (!payment) throw new Error('No encontramos este comprobante en tu negocio.')
        const order = orders.find(row => row.id === payment.order_id && row.business_id === business.id)
        if (!order) throw new Error('No encontramos el pedido asociado a este pago.')
        const logo = await loadLogoDataUrl(business.logo_path)
        const model = createPaymentReceiptModel(business, id, payments, orders, logo)
        if (active) setLoaded({ key, model, backTo: `/pagos?order=${encodeURIComponent(payment.order_id)}` })
      } catch (reason) {
        if (active) setLoaded({ key, error: errorMessage(reason) })
      }
    })()
    return () => { active = false }
  }, [business, id, key])

  const result = loaded?.key === key ? loaded : null
  if (!result) return <Loading text="Preparando el comprobante de pago…" />
  if (result.error || !result.model) return <div className="document-workspace"><Link className="back-button" to="/pagos"><ArrowLeft size={17} /> Volver a Pagos</Link><Notice error>{result.error || 'No pudimos abrir el comprobante.'}</Notice></div>

  const pageSize = printFormat === 'thermal-80'
    ? '@page { size: 80mm 297mm; margin: 0; }'
    : printFormat === 'thermal-58'
      ? '@page { size: 58mm 297mm; margin: 0; }'
      : '@page { size: A4 portrait; margin: 0; }'

  return <div className="document-workspace">
    <style>{`@media print { ${pageSize} }`}</style>
    <header className="document-screen-heading"><div><span className="eyebrow accent">DOCUMENTO PARA CLIENTE</span><h1>Comprobante de pago</h1><p>Revisa el comprobante antes de compartirlo o imprimirlo.</p></div><Link className="document-back-link" to="/pagos"><ArrowLeft size={16} /> Pagos</Link></header>
    <PaymentReceiptActions model={result.model} documentRef={documentRef} printFormat={printFormat} onPrintFormatChange={setPrintFormat} formatAmount={amount => formatCurrency(amount, business)} backTo={result.backTo ?? '/pagos'} />
    <main className="document-preview-stage">
      <div className="document-preview-caption"><FileText size={16} /><span>Comprobante original · {result.model.payment.payment_number}</span></div>
      <PaymentReceipt model={result.model} formatAmount={amount => formatCurrency(amount, business)} printFormat={printFormat} documentRef={documentRef} />
    </main>
    <p className="document-print-help">ARPE prepara el formato elegido y abre el diálogo estándar de impresión. La disponibilidad depende de tu dispositivo, impresora y controlador.</p>
  </div>
}
