import type { Business, Order, OrderItem, Payment } from './database.types'
import { formatDeliveryTime } from './delivery-time'
import { paymentMethods, summarizePayments } from './payments'
import { safeFilenamePart } from './documents'

export type PaymentReceiptModel = {
  business: {
    name: string
    slogan: string
    description: string
    whatsapp: string
    email: string
    address: string
    show_slogan_on_documents: boolean
    show_description_on_documents: boolean
    show_whatsapp_on_documents: boolean
    show_email_on_documents: boolean
    show_address_on_documents: boolean
    document_footer_message: string
    logoDataUrl: string | null
  }
  payment: Pick<Payment, 'payment_number' | 'amount' | 'method' | 'reference' | 'notes' | 'paid_at' | 'status' | 'voided_at' | 'void_reason'>
  order: Pick<Order, 'order_number' | 'customer_name' | 'customer_phone' | 'product' | 'total_amount' | 'deposit_required'>
  orderItems: Pick<OrderItem, 'product'>[]
  paidAtIssue: number
  balanceAfterIssue: number
  currentBalance: number
  paymentMethodLabel: string
}

const cents = (amount: number) => Math.round(Number(amount || 0) * 100)

export function calculatePaymentAtIssue(target: Payment, payments: Payment[]) {
  const targetCreatedAt = Date.parse(target.created_at)
  const totalCents = payments.reduce((sum, payment) => {
    if (payment.business_id !== target.business_id || payment.order_id !== target.order_id) return sum
    const createdAt = Date.parse(payment.created_at)
    const isTarget = payment.id === target.id
    if (!isTarget && (!Number.isFinite(targetCreatedAt) || !Number.isFinite(createdAt) || createdAt > targetCreatedAt)) return sum
    const wasActiveAtIssue = isTarget || payment.voided_at === null || Date.parse(payment.voided_at) > targetCreatedAt
    return wasActiveAtIssue ? sum + cents(Number(payment.amount)) : sum
  }, 0)

  return totalCents / 100
}

export function createPaymentReceiptModel(
  business: Business,
  paymentId: string,
  payments: Payment[],
  orders: Order[],
  logoDataUrl: string | null = null,
): PaymentReceiptModel {
  const payment = payments.find(item => item.id === paymentId && item.business_id === business.id)
  if (!payment) throw new Error('No encontramos este comprobante en tu negocio.')
  const order = orders.find(item => item.id === payment.order_id && item.business_id === business.id)
  if (!order) throw new Error('No encontramos el pedido asociado a este pago.')

  const paidAtIssue = calculatePaymentAtIssue(payment, payments)
  const balanceAfterIssue = Math.max(0, cents(Number(order.total_amount)) - cents(paidAtIssue)) / 100
  const currentBalance = summarizePayments(order, payments).realBalance

  return {
    business: {
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
    },
    payment: {
      payment_number: payment.payment_number,
      amount: Number(payment.amount),
      method: payment.method,
      reference: payment.reference,
      notes: payment.notes,
      paid_at: payment.paid_at,
      status: payment.status,
      voided_at: payment.voided_at,
      void_reason: payment.void_reason,
    },
    order: {
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      product: order.product,
      total_amount: Number(order.total_amount),
      deposit_required: Number(order.deposit_required),
    },
    orderItems: (order.items ?? []).map(item => ({ product: item.product })),
    paidAtIssue,
    balanceAfterIssue,
    currentBalance,
    paymentMethodLabel: paymentMethods.find(method => method.value === payment.method)?.label ?? 'Otro',
  }
}

export function formatPaymentReceiptDate(value: string) {
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
}

export function formatPaymentReceiptTime(value: string) {
  const date = new Date(value)
  return formatDeliveryTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`)
}

export function getPaymentReceiptFilename(model: PaymentReceiptModel, type: 'pdf' | 'png') {
  return `Comprobante-${safeFilenamePart(model.payment.payment_number)}-${safeFilenamePart(model.order.customer_name)}.${type}`
}

export function createPaymentReceiptWhatsAppMessage(model: PaymentReceiptModel, formatAmount: (amount: number) => string) {
  if (model.payment.status === 'voided') {
    return `Hola, ${model.order.customer_name}.\n\nEl comprobante ${model.payment.payment_number} correspondiente al pedido ${model.order.order_number} figura como ANULADO en nuestro registro.\n\nPara cualquier aclaración, comunícate con ${model.business.name}.`
  }

  return `Hola, ${model.order.customer_name} 👋\n\nHemos registrado tu pago ${model.payment.payment_number} correspondiente al pedido ${model.order.order_number}.\n\nMonto recibido: ${formatAmount(model.payment.amount)}\nMétodo: ${model.paymentMethodLabel}\nSaldo pendiente después de este pago: ${formatAmount(model.balanceAfterIssue)}\n\nGracias por confiar en ${model.business.name}.`
}

export function createPaymentReceiptWhatsAppUrl(model: PaymentReceiptModel, message: string) {
  const phone = model.order.customer_phone.replace(/\D/g, '')
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
}
