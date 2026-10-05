import { useState, type Ref } from 'react'
import { summarizeOrderProducts } from '../../lib/products'
import { formatPaymentReceiptDate, formatPaymentReceiptTime, type PaymentReceiptModel } from '../../lib/payment-receipts'
import type { DocumentPrintFormat } from './ClientDocument'

export function PaymentReceipt({ model, formatAmount, printFormat = 'a4', documentRef }: {
  model: PaymentReceiptModel
  formatAmount: (amount: number) => string
  printFormat?: DocumentPrintFormat
  documentRef?: Ref<HTMLElement>
}) {
  const [logoFailed, setLogoFailed] = useState(false)
  const voided = model.payment.status === 'voided'
  const fullyPaid = model.balanceAfterIssue === 0
  const depositCovered = model.paidAtIssue >= model.order.deposit_required && !fullyPaid
  const concept = summarizeOrderProducts(model.orderItems ?? [], model.order.product)

  return <article ref={documentRef} className={`client-document payment-receipt${voided ? ' is-voided' : ''} document-format-${printFormat}`} aria-label={voided ? 'Comprobante de pago anulado' : 'Comprobante de pago'}>
    <header className="document-business-header" data-document-section="brand">
      <div className="document-brand-row">
        {model.business.logoDataUrl && !logoFailed && <img className="document-business-logo" src={model.business.logoDataUrl} alt={`Logo de ${model.business.name}`} onError={() => setLogoFailed(true)} />}
        <div className="document-business-name"><h1>{model.business.name}</h1>{model.business.show_slogan_on_documents && model.business.slogan.trim() && <p className="document-slogan">{model.business.slogan}</p>}{model.business.show_description_on_documents && model.business.description.trim() && <p className="document-business-description">{model.business.description}</p>}</div>
      </div>
    </header>

    <section className="document-title-row payment-receipt-title" data-document-section="title">
      <div><span className="document-kicker">COMPROBANTE DE PAGO</span><h2>Comprobante de pago</h2></div>
      <div className="document-number"><strong>{model.payment.payment_number}</strong><span>{formatPaymentReceiptDate(model.payment.paid_at)}</span></div>
    </section>

    <div className={`payment-receipt-status${voided ? ' is-voided' : ''}`} data-document-section="status">
      {voided ? 'COMPROBANTE ANULADO' : 'PAGO RECIBIDO'}
    </div>
    {fullyPaid && !voided && <div className="document-paid-callout payment-receipt-paid">PAGADO EN SU TOTALIDAD · Este pago completó el saldo del pedido.</div>}
    {depositCovered && !voided && <p className="payment-receipt-deposit">Anticipo cubierto</p>}

    <section className="document-section" data-document-section="customer">
      <div className="document-section-title"><span>01</span><h3>Cliente</h3></div>
      <dl className="document-detail-list payment-receipt-details">
        <div><dt>Nombre</dt><dd>{model.order.customer_name}</dd></div>
        {model.order.customer_phone.trim() && <div><dt>Teléfono</dt><dd>{model.order.customer_phone}</dd></div>}
      </dl>
    </section>

    <section className="document-section" data-document-section="order">
      <div className="document-section-title"><span>02</span><h3>Pedido relacionado</h3></div>
      <dl className="document-detail-list payment-receipt-details">
        <div><dt>Pedido</dt><dd className="payment-receipt-number">{model.order.order_number}</dd></div>
        <div><dt>Concepto</dt><dd>{concept}</dd></div>
        <div><dt>Total del pedido</dt><dd className="payment-receipt-money">{formatAmount(model.order.total_amount)}</dd></div>
      </dl>
    </section>

    <section className="payment-receipt-amount" data-document-section="amount">
      <span>{voided ? 'Monto original' : 'Monto recibido'}</span><strong>{formatAmount(model.payment.amount)}</strong>
    </section>

    <section className="document-section" data-document-section="payment">
      <div className="document-section-title"><span>03</span><h3>Detalle del pago</h3></div>
      <dl className="document-detail-list payment-receipt-details">
        <div><dt>Método de pago</dt><dd>{model.paymentMethodLabel}</dd></div>
        <div><dt>Fecha</dt><dd>{formatPaymentReceiptDate(model.payment.paid_at)}</dd></div>
        <div><dt>Hora</dt><dd className="payment-receipt-number">{formatPaymentReceiptTime(model.payment.paid_at)}</dd></div>
        {model.payment.reference.trim() && <div><dt>Referencia</dt><dd>{model.payment.reference}</dd></div>}
        {model.payment.notes.trim() && <div><dt>Observación</dt><dd>{model.payment.notes}</dd></div>}
      </dl>
    </section>

    <section className="document-financial-section payment-receipt-summary" data-document-section="summary">
      <div className="document-section-title"><span>04</span><h3>{voided ? 'Resumen del pedido al emitir' : 'Resumen del pedido'}</h3></div>
      <dl className="document-financial-list">
        <div><dt>Total del pedido</dt><dd>{formatAmount(model.order.total_amount)}</dd></div>
        <div><dt>Pagado acumulado al emitir</dt><dd>{formatAmount(model.paidAtIssue)}</dd></div>
        <div className="is-emphasis"><dt>Saldo después de este pago</dt><dd>{formatAmount(model.balanceAfterIssue)}</dd></div>
        {voided && <div className="is-emphasis payment-receipt-current"><dt>Saldo actual después de la anulación</dt><dd>{formatAmount(model.currentBalance)}</dd></div>}
      </dl>
    </section>

    {voided && <section className="payment-receipt-void-block" data-document-section="void">
      <h3>COMPROBANTE ANULADO</h3>
      <dl className="payment-receipt-details">
        {model.payment.voided_at && <div><dt>Fecha de anulación</dt><dd>{formatPaymentReceiptDate(model.payment.voided_at)} · {formatPaymentReceiptTime(model.payment.voided_at)}</dd></div>}
        {model.payment.void_reason?.trim() && <div><dt>Motivo</dt><dd>{model.payment.void_reason}</dd></div>}
      </dl>
      <p>Este pago ya no cuenta como dinero recibido.</p>
      <small>La anulación corrige el registro de pago; no representa por sí sola una devolución.</small>
    </section>}

    <footer className="document-footer payment-receipt-footer" data-document-section="footer">
      {model.business.document_footer_message.trim() && <p className="document-thanks">{model.business.document_footer_message}</p>}
      {(model.business.show_whatsapp_on_documents && model.business.whatsapp.trim() || model.business.show_email_on_documents && model.business.email.trim() || model.business.show_address_on_documents && model.business.address.trim()) && <address className="document-contact-list">
        {model.business.show_whatsapp_on_documents && model.business.whatsapp.trim() && <span>WhatsApp: {model.business.whatsapp}</span>}
        {model.business.show_email_on_documents && model.business.email.trim() && <span>{model.business.email}</span>}
        {model.business.show_address_on_documents && model.business.address.trim() && <span>{model.business.address}</span>}
      </address>}
      <p className="payment-receipt-legal">Este comprobante acredita únicamente el pago indicado. No constituye factura fiscal.</p>
      <div className="document-credit"><span>Powered by EJNEXA Business</span><span>EJNEXA AI Studio · Ing. Edwin Nicaragua</span></div>
    </footer>
  </article>
}
