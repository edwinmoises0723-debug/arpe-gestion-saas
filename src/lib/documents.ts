import type { Business, Order, Payment, Quote, ProductFields } from './database.types'
import { summarizePayments } from './payments'
import { formatDeliveryTime } from './delivery-time'
import { localCalendarDate } from './agenda'

export type ClientBusiness = Pick<Business,
  'name' | 'slogan' | 'description' | 'whatsapp' | 'email' | 'address' |
  'show_slogan_on_documents' | 'show_description_on_documents' | 'show_whatsapp_on_documents' |
  'show_email_on_documents' | 'show_address_on_documents' | 'document_footer_message'
> & { logoDataUrl: string | null }

export type ClientQuote = Pick<Quote,
  'quote_number' | 'created_at' | 'customer_name' | 'customer_phone' | 'product' | 'portions' | 'flavor' | 'filling' | 'decoration' | 'extras' | 'delivery_date' | 'delivery_time' | 'notes' | 'total_amount' | 'deposit_required' | 'status'
>

export type ClientOrder = Pick<Order,
  'order_number' | 'source_quote_number' | 'created_at' | 'customer_name' | 'customer_phone' | 'product' | 'portions' | 'flavor' | 'filling' | 'decoration' | 'extras' | 'delivery_date' | 'delivery_time' | 'notes' | 'total_amount' | 'deposit_required' | 'status'
>

export type ClientProduct = ProductFields & { line_total: number }

function clientProducts(record: Quote | Order): ClientProduct[] {
  return (record.items?.length ? record.items : [{ ...record, quantity: 1, unit_label: 'unidad', notes: '', unit_price: record.total_amount, line_total: record.total_amount }]).map(item => ({ product: item.product, quantity: Number(item.quantity), unit_label: item.unit_label, portions: item.portions, flavor: item.flavor, filling: item.filling, decoration: item.decoration, extras: item.extras, notes: item.notes, unit_price: Number(item.unit_price), line_total: Number(item.line_total) }))
}

export type QuoteDocumentModel = {
  products: ClientProduct[]
  deliveryCharge: number | null
  type: 'quote'
  business: ClientBusiness
  quote: ClientQuote
  remainingAfterDeposit: number
}

export type OrderDocumentModel = {
  products: ClientProduct[]
  deliveryCharge: number | null
  type: 'order'
  business: ClientBusiness
  order: ClientOrder
  finances: { totalPaid: number; realBalance: number }
}

export type ClientDocumentModel = QuoteDocumentModel | OrderDocumentModel

function clientBusiness(business: Business, logoDataUrl: string | null): ClientBusiness {
  return {
    name: business.name,
    slogan: business.slogan,
    description: business.description,
    whatsapp: business.whatsapp,
    email: business.email,
    address: business.address,
    show_slogan_on_documents: business.show_slogan_on_documents,
    show_description_on_documents: business.show_description_on_documents,
    show_whatsapp_on_documents: business.show_whatsapp_on_documents,
    show_email_on_documents: business.show_email_on_documents,
    show_address_on_documents: business.show_address_on_documents,
    document_footer_message: business.document_footer_message,
    logoDataUrl,
  }
}

export function createQuoteDocumentModel(business: Business, quote: Quote, logoDataUrl: string | null = null): QuoteDocumentModel {
  const total = Math.round(Number(quote.total_amount) * 100)
  const deposit = Math.round(Number(quote.deposit_required) * 100)
  return {
    type: 'quote',
    products: clientProducts(quote),
    deliveryCharge: quote.delivery_customer_charge ?? null,
    business: clientBusiness(business, logoDataUrl),
    quote: {
      quote_number: quote.quote_number,
      created_at: quote.created_at,
      customer_name: quote.customer_name,
      customer_phone: quote.customer_phone,
      product: quote.product,
      portions: quote.portions,
      flavor: quote.flavor,
      filling: quote.filling,
      decoration: quote.decoration,
      extras: quote.extras,
      delivery_date: quote.delivery_date,
      delivery_time: quote.delivery_time,
      notes: quote.notes,
      total_amount: Number(quote.total_amount),
      deposit_required: Number(quote.deposit_required),
      status: quote.status,
    },
    remainingAfterDeposit: Math.max(0, total - deposit) / 100,
  }
}

export function createOrderDocumentModel(business: Business, order: Order, payments: Payment[], logoDataUrl: string | null = null): OrderDocumentModel {
  const summary = summarizePayments(order, payments)
  return {
    type: 'order',
    products: clientProducts(order),
    deliveryCharge: order.delivery_customer_charge ?? null,
    business: clientBusiness(business, logoDataUrl),
    order: {
      order_number: order.order_number,
      source_quote_number: order.source_quote_number,
      created_at: order.created_at,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      product: order.product,
      portions: order.portions,
      flavor: order.flavor,
      filling: order.filling,
      decoration: order.decoration,
      extras: order.extras,
      delivery_date: order.delivery_date,
      delivery_time: order.delivery_time,
      notes: order.notes,
      total_amount: Number(order.total_amount),
      deposit_required: Number(order.deposit_required),
      status: order.status,
    },
    finances: { totalPaid: summary.totalPaid, realBalance: summary.realBalance },
  }
}

export function formatClientDate(date: string | null): string {
  if (!date) return 'Por definir'
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(localCalendarDate(date))
}

export function formatCreatedDate(timestamp: string): string {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(timestamp))
}

export function getDocumentNumber(model: ClientDocumentModel): string {
  return model.type === 'quote' ? model.quote.quote_number : model.order.order_number
}

export function getDocumentCustomer(model: ClientDocumentModel): string {
  return model.type === 'quote' ? model.quote.customer_name : model.order.customer_name
}

export function getDocumentPhone(model: ClientDocumentModel): string {
  return model.type === 'quote' ? model.quote.customer_phone : model.order.customer_phone
}

export function getDocumentFilename(model: ClientDocumentModel, fileType: 'pdf' | 'png'): string {
  const prefix = model.type === 'quote' ? 'Cotizacion' : 'Confirmacion'
  const number = safeFilenamePart(getDocumentNumber(model))
  const customer = fileType === 'png' ? `-${safeFilenamePart(getDocumentCustomer(model))}` : ''
  return `${prefix}-${number}${customer}.${fileType}`
}

export function safeFilenamePart(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'Documento'
}

export function createWhatsAppMessage(model: ClientDocumentModel, formatAmount: (amount: number) => string): string {
  if (model.type === 'quote') {
    const quote = model.quote
    const delivery = quote.delivery_date || quote.delivery_time
      ? `\n\nEntrega: ${quote.delivery_date ? formatClientDate(quote.delivery_date) : 'Fecha por definir'} · ${formatDeliveryTime(quote.delivery_time)}`
      : ''
    return `Hola, ${quote.customer_name} 👋\n\nTe compartimos la cotización ${quote.quote_number} de ${model.business.name}.\n\nProducto: ${model.products.map(item => `${item.quantity} ${item.unit_label} · ${item.product}`).join('; ')}\nTotal: ${formatAmount(quote.total_amount)}\nAnticipo requerido para confirmar: ${formatAmount(quote.deposit_required)}${delivery}\n\nSi tienes alguna consulta o deseas confirmar tu pedido, estamos a tu disposición.\n\n${model.business.name}`
  }

  const order = model.order
  const statusMessage = {
    confirmed: 'ha sido confirmado',
    in_preparation: 'ya está en preparación',
    ready: 'ya está listo',
    delivered: 'ha sido entregado',
    cancelled: 'fue cancelado',
  }[order.status]
  const delivery = order.status === 'cancelled' ? '' : `\n\nEntrega:\n${formatClientDate(order.delivery_date)}${order.delivery_time ? `\n${formatDeliveryTime(order.delivery_time)}` : '\nHora por definir'}`
  return `Hola, ${order.customer_name} 👋\n\nTu pedido ${order.order_number} ${statusMessage}.${delivery}\n\nTotal: ${formatAmount(order.total_amount)}\nPagado: ${formatAmount(model.finances.totalPaid)}\nSaldo pendiente: ${formatAmount(model.finances.realBalance)}\n\nGracias por confiar en ${model.business.name}.`
}

export function createWhatsAppUrl(model: ClientDocumentModel, message: string): string {
  const phone = getDocumentPhone(model).replace(/\D/g, '')
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}
