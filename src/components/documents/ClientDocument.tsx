import { useState, type Ref } from 'react'
import { formatDeliveryTime } from '../../lib/delivery-time'
import { formatClientDate, formatCreatedDate, type ClientDocumentModel } from '../../lib/documents'

export type DocumentPrintFormat = 'a4' | 'thermal-80' | 'thermal-58'

const quoteStatusLabels = { draft: 'Borrador', sent: 'Enviada', accepted: 'Aceptada', rejected: 'Rechazada' } as const
const orderStatusLabels = { confirmed: 'Confirmado', in_preparation: 'En preparación', ready: 'Listo', delivered: 'Entregado', cancelled: 'Cancelado' } as const

export function ClientDocument({ model, formatAmount, printFormat = 'a4', documentRef }: { model: ClientDocumentModel; formatAmount: (amount: number) => string; printFormat?: DocumentPrintFormat; documentRef?: Ref<HTMLElement> }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const isQuote = model.type === 'quote'
  const record = isQuote ? model.quote : model.order
  const status = isQuote ? quoteStatusLabels[model.quote.status] : orderStatusLabels[model.order.status]
  const orderIsPaid = model.type === 'order' && model.finances.realBalance === 0
  const cancelled = model.type === 'order' && model.order.status === 'cancelled'

  return <article ref={documentRef} className={`client-document document-format-${printFormat}`} aria-label={isQuote ? 'Vista previa de la cotización' : 'Vista previa de la confirmación de pedido'}>
    <header className="document-business-header" data-document-section="brand">
      <div className="document-brand-row">
        {model.business.logoDataUrl && !logoFailed && <img className="document-business-logo" src={model.business.logoDataUrl} alt={`Logo de ${model.business.name}`} onError={() => setLogoFailed(true)} />}
        <div className="document-business-name"><h1>{model.business.name}</h1>{model.business.slogan.trim() && <p className="document-slogan">{model.business.slogan}</p>}{model.business.description.trim() && <p className="document-business-description">{model.business.description}</p>}</div>
      </div>
      <div className="document-title-row">
        <div><span className="document-kicker">{isQuote ? 'PROPUESTA COMERCIAL' : 'DETALLE DE TU ENCARGO'}</span><h2>{isQuote ? 'Cotización' : 'Confirmación de pedido'}</h2></div>
        <div className="document-number"><strong>{isQuote ? model.quote.quote_number : model.order.order_number}</strong><span>{formatCreatedDate(record.created_at)}</span></div>
      </div>
      <div className={`document-status ${cancelled ? 'is-cancelled' : orderIsPaid ? 'is-paid' : ''}`}>{cancelled ? 'PEDIDO CANCELADO' : orderIsPaid ? 'PAGADO EN SU TOTALIDAD' : status}</div>
      {!isQuote && model.order.source_quote_number && <p className="document-source-quote">Cotización de origen: <strong>{model.order.source_quote_number}</strong></p>}
    </header>

    <section className="document-section" data-document-section="customer">
      <SectionTitle number="01" title="Cliente" />
      <div className="document-customer"><strong>{record.customer_name}</strong>{record.customer_phone.trim() && <span>{record.customer_phone}</span>}</div>
    </section>

    <section className="document-section" data-document-section="product">
      <SectionTitle number="02" title="Detalle del producto" />
      <div className="document-product-title">{record.product}</div>
      <dl className="document-detail-list">
        {record.portions !== null && <Detail label="Porciones" value={String(record.portions)} />}
        {record.flavor.trim() && <Detail label="Sabor" value={record.flavor} />}
        {record.filling.trim() && <Detail label="Relleno" value={record.filling} />}
        {record.decoration.trim() && <Detail label="Decoración" value={record.decoration} />}
        {record.extras.trim() && <Detail label="Extras" value={record.extras} />}
      </dl>
    </section>

    {(isQuote ? Boolean(model.quote.delivery_date || model.quote.delivery_time) : true) && <section className="document-section" data-document-section="delivery">
      <SectionTitle number="03" title="Entrega" />
      <dl className="document-detail-list">
        <Detail label="Fecha" value={formatClientDate(record.delivery_date)} />
        <Detail label="Hora" value={formatDeliveryTime(record.delivery_time)} />
      </dl>
    </section>}

    {record.notes.trim() && <section className="document-section" data-document-section="notes">
      <SectionTitle number="04" title="Observaciones" />
      <p className="document-notes">{record.notes}</p>
    </section>}

    <section className="document-section document-financial-section" data-document-section="summary">
      <SectionTitle number={record.notes.trim() ? '05' : '04'} title="Resumen comercial" />
      <dl className="document-financial-list">
        <Detail label="Precio total" value={formatAmount(record.total_amount)} emphasis />
        {isQuote ? <>
          <Detail label="Anticipo requerido para confirmar" value={formatAmount(model.quote.deposit_required)} />
          <Detail label="Saldo restante después de recibir el anticipo" value={formatAmount(model.remainingAfterDeposit)} emphasis />
        </> : <>
          <Detail label="Anticipo requerido" value={formatAmount(model.order.deposit_required)} />
          <Detail label="Pagado hasta ahora" value={formatAmount(model.finances.totalPaid)} />
          <Detail label="Saldo pendiente" value={formatAmount(model.finances.realBalance)} emphasis />
        </>}
      </dl>
      {orderIsPaid && <p className="document-paid-callout">¡Pedido pagado en su totalidad! Gracias.</p>}
    </section>

    <footer className="document-footer" data-document-section="contact">
      <p className="document-thanks">{isQuote ? 'Gracias por permitirnos preparar esta propuesta.' : 'Gracias por confiar en nosotros para este momento especial.'}</p>
      {(model.business.whatsapp.trim() || model.business.email.trim() || model.business.address.trim()) && <address className="document-contact-list">
        {model.business.whatsapp.trim() && <span>WhatsApp: {model.business.whatsapp}</span>}
        {model.business.email.trim() && <span>{model.business.email}</span>}
        {model.business.address.trim() && <span>{model.business.address}</span>}
      </address>}
      <div className="document-credit"><span>Generado con ARPE Gestión SaaS</span><span>Sistema diseñado por Ing. Edwin Nicaragua</span></div>
    </footer>
  </article>
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return <div className="document-section-title"><span>{number}</span><h3>{title}</h3></div>
}

function Detail({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={emphasis ? 'is-emphasis' : ''}><dt>{label}</dt><dd>{value}</dd></div>
}
