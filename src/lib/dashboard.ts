import type { Order, Payment, Quote } from './database.types'
import { agendaDateKey, getAgendaMetrics, localCalendarDate, compareDeliveryOrders } from './agenda'
import { paymentMethods, summarizePayments } from './payments'

const activeStatuses = new Set<Order['status']>(['confirmed', 'in_preparation', 'ready'])
const cents = (value: number) => Math.round(Number(value || 0) * 100)
const amount = (value: number) => value / 100

export type DashboardData = {
  quotes: Quote[]
  orders: Order[]
  payments: Payment[]
}

export function getDashboardFinancialMetrics(orders: Order[], payments: Payment[]) {
  const billableOrders = orders.filter(order => order.status !== 'cancelled')
  const salesCents = billableOrders.reduce((sum, order) => sum + cents(Number(order.total_amount)), 0)
  const collectedCents = payments.filter(payment => payment.status === 'posted').reduce((sum, payment) => sum + cents(Number(payment.amount)), 0)
  const outstandingCents = billableOrders.reduce((sum, order) => sum + cents(summarizePayments(order, payments).realBalance), 0)
  const costedOrders = billableOrders.filter(order => order.internal_cost_total !== null && order.estimated_profit !== null)
  const costedSalesCents = costedOrders.reduce((sum, order) => sum + cents(Number(order.total_amount)), 0)
  const estimatedProfitCents = costedOrders.reduce((sum, order) => sum + cents(Number(order.estimated_profit)), 0)

  return {
    registeredSales: amount(salesCents),
    collectedMoney: amount(collectedCents),
    receivableBalance: amount(outstandingCents),
    averageTicket: billableOrders.length ? amount(Math.round(salesCents / billableOrders.length)) : 0,
    nonCancelledOrderCount: billableOrders.length,
    estimatedProfit: costedOrders.length ? amount(estimatedProfitCents) : null,
    costedSales: amount(costedSalesCents),
    estimatedCosts: costedOrders.length ? amount(costedSalesCents - estimatedProfitCents) : null,
    consolidatedMargin: costedSalesCents > 0 ? estimatedProfitCents / costedSalesCents * 100 : null,
    costedOrderCount: costedOrders.length,
    costCoveragePercent: billableOrders.length ? costedOrders.length / billableOrders.length * 100 : 0,
  }
}

export function getDashboardOrderMetrics(orders: Order[], today: string) {
  const deliveries = getAgendaMetrics(orders, today)
  return {
    active: orders.filter(order => activeStatuses.has(order.status)).length,
    deliveriesToday: deliveries.today,
    upcomingDeliveries: deliveries.upcoming,
    overdueDeliveries: deliveries.overdue,
    byStatus: {
      confirmed: orders.filter(order => order.status === 'confirmed').length,
      in_preparation: orders.filter(order => order.status === 'in_preparation').length,
      ready: orders.filter(order => order.status === 'ready').length,
      delivered: orders.filter(order => order.status === 'delivered').length,
      cancelled: orders.filter(order => order.status === 'cancelled').length,
    },
  }
}

export function getDashboardQuoteMetrics(quotes: Quote[]) {
  return {
    draft: quotes.filter(quote => quote.status === 'draft').length,
    sent: quotes.filter(quote => quote.status === 'sent').length,
    accepted: quotes.filter(quote => quote.status === 'accepted').length,
    rejected: quotes.filter(quote => quote.status === 'rejected').length,
  }
}

export type DashboardAlert =
  | { type: 'overdue'; order: Order }
  | { type: 'delivered-balance'; order: Order; balance: number }
  | { type: 'deposit-shortfall'; order: Order; shortfall: number }
  | { type: 'no-delivery-date'; order: Order }
  | { type: 'cancelled-with-payment'; order: Order; received: number }

export function getDashboardAlerts(orders: Order[], payments: Payment[], today: string): DashboardAlert[] {
  const alerts: DashboardAlert[] = []
  for (const order of orders) {
    const summary = summarizePayments(order, payments)
    if (activeStatuses.has(order.status) && order.delivery_date && order.delivery_date < today) alerts.push({ type: 'overdue', order })
    if (order.status === 'delivered' && summary.realBalance > 0) alerts.push({ type: 'delivered-balance', order, balance: summary.realBalance })
    if (activeStatuses.has(order.status) && summary.depositShortfall > 0) alerts.push({ type: 'deposit-shortfall', order, shortfall: summary.depositShortfall })
    if (activeStatuses.has(order.status) && !order.delivery_date) alerts.push({ type: 'no-delivery-date', order })
    const received = payments
      .filter(payment => payment.order_id === order.id && payment.business_id === order.business_id && payment.status === 'posted')
      .reduce((sum, payment) => sum + cents(Number(payment.amount)), 0)
    if (order.status === 'cancelled' && received > 0) alerts.push({ type: 'cancelled-with-payment', order, received: amount(received) })
  }
  return alerts
}

export function getUpcomingDeliveries(orders: Order[], payments: Payment[], today: string, limit = 5) {
  return orders
    .filter(order => activeStatuses.has(order.status) && order.delivery_date !== null && order.delivery_date >= today)
    .sort(compareDeliveryOrders)
    .slice(0, limit)
    .map(order => ({ order, balance: summarizePayments(order, payments).realBalance }))
}

export function getRecentPayments(payments: Payment[], orders: Order[], limit = 5) {
  const ordersById = new Map(orders.map(order => [order.id, order]))
  return [...payments]
    .sort((a, b) => new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime() || new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
    .map(payment => ({ payment, order: ordersById.get(payment.order_id) ?? null }))
}

export function groupPostedPaymentsByLocalDate(payments: Payment[], today: string, days = 30) {
  const firstDate = localCalendarDate(today)
  firstDate.setDate(firstDate.getDate() - (days - 1))
  const startKey = agendaDateKey(firstDate)
  const values = new Map<string, number>()
  for (let offset = 0; offset < days; offset += 1) {
    const date = localCalendarDate(startKey)
    date.setDate(date.getDate() + offset)
    values.set(agendaDateKey(date), 0)
  }

  for (const payment of payments) {
    if (payment.status !== 'posted') continue
    const paidAt = new Date(payment.paid_at)
    if (!Number.isFinite(paidAt.getTime())) continue
    const key = agendaDateKey(paidAt)
    if (values.has(key)) values.set(key, (values.get(key) ?? 0) + cents(Number(payment.amount)))
  }

  return [...values].map(([date, paidCents]) => ({ date, amount: amount(paidCents) }))
}

export function paymentMethodLabel(method: Payment['method']) {
  return paymentMethods.find(option => option.value === method)?.label ?? 'Otro'
}
