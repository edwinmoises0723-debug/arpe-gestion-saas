import type { Order, Payment } from './database.types'
import { orderStatuses } from './orders'
import { paymentMethods, summarizePayments } from './payments'

function normalize(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/\s+/g, ' ')
}

function deliveryDateTerms(value: string | null) {
  if (!value) return []
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return [value]
  const date = new Date(year, month - 1, day, 12)
  const visible = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  return [value, visible, visible.replace(/\bde\b/gi, ' ')]
}

function orderTerms(order: Order) {
  return [
    order.customer_name,
    order.customer_phone,
    order.order_number,
    order.source_quote_number,
    order.product,
    ...(order.items ?? []).map(item => item.product),
    orderStatuses.find(status => status.value === order.status)?.label ?? order.status,
    ...deliveryDateTerms(order.delivery_date),
  ]
}

function matches(terms: string[], query: string) {
  const haystack = normalize(terms.join(' '))
  return haystack.includes(normalize(query))
}

export function searchOrders(orders: Order[], query: string) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return orders
  return orders.filter(order => matches(orderTerms(order), normalizedQuery))
}

export function searchPaymentOrders(orders: Order[], payments: Payment[], query: string) {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery) return orders
  return orders.filter(order => {
    const summary = summarizePayments(order, payments)
    const relatedPaymentTerms = payments
      .filter(payment => payment.order_id === order.id && payment.business_id === order.business_id)
      .flatMap(payment => [
        payment.payment_number,
        paymentMethods.find(method => method.value === payment.method)?.label ?? payment.method,
        payment.reference,
        payment.notes,
      ])
    return matches([...orderTerms(order), summary.financialStatus, ...relatedPaymentTerms], normalizedQuery)
  })
}
