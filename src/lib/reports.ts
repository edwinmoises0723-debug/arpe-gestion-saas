import type { Order, OrderStatus, Payment, PaymentMethod } from './database.types'
import { agendaDateKey, localCalendarDate } from './agenda'
import { paymentMethods, summarizePayments } from './payments'

export type ReportRange = { startDate: string; endDate: string }
export type ReportPeriod = 'today' | 'last7' | 'last30' | 'thisMonth' | 'previousMonth' | 'custom'

const cents = (value: number) => Math.round(Number(value || 0) * 100)
const money = (value: number) => value / 100
const validDateKey = (key: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false
  const date = localCalendarDate(key)
  return !Number.isNaN(date.getTime()) && agendaDateKey(date) === key
}

export function getReportRange(period: ReportPeriod, today: string, customRange: ReportRange): ReportRange | null {
  if (period === 'custom') return isValidReportRange(customRange) ? customRange : null
  if (!validDateKey(today)) return null
  if (period === 'today') return { startDate: today, endDate: today }
  if (period === 'last7' || period === 'last30') {
    const start = localCalendarDate(today)
    start.setDate(start.getDate() - (period === 'last7' ? 6 : 29))
    return { startDate: agendaDateKey(start), endDate: today }
  }
  const current = localCalendarDate(today)
  if (period === 'thisMonth') return { startDate: agendaDateKey(new Date(current.getFullYear(), current.getMonth(), 1, 12)), endDate: today }
  const start = new Date(current.getFullYear(), current.getMonth() - 1, 1, 12)
  const end = new Date(current.getFullYear(), current.getMonth(), 0, 12)
  return { startDate: agendaDateKey(start), endDate: agendaDateKey(end) }
}

export function isValidReportRange(range: ReportRange) {
  return validDateKey(range.startDate) && validDateKey(range.endDate) && range.startDate <= range.endDate
}

export function filterOrdersByRange(orders: Order[], range: ReportRange) {
  if (!isValidReportRange(range)) return []
  return orders.filter(order => {
    const createdAt = new Date(order.created_at)
    if (!Number.isFinite(createdAt.getTime())) return false
    const date = agendaDateKey(createdAt)
    return date >= range.startDate && date <= range.endDate
  })
}

export function filterPaymentsByRange(payments: Payment[], range: ReportRange) {
  if (!isValidReportRange(range)) return []
  return payments.filter(payment => {
    const paidAt = new Date(payment.paid_at)
    if (!Number.isFinite(paidAt.getTime())) return false
    const date = agendaDateKey(paidAt)
    return date >= range.startDate && date <= range.endDate
  })
}

export function buildOrderStatusSummary(orders: Order[]) {
  return {
    confirmed: orders.filter(order => order.status === 'confirmed').length,
    in_preparation: orders.filter(order => order.status === 'in_preparation').length,
    ready: orders.filter(order => order.status === 'ready').length,
    delivered: orders.filter(order => order.status === 'delivered').length,
    cancelled: orders.filter(order => order.status === 'cancelled').length,
  } satisfies Record<OrderStatus, number>
}

export function buildProductRanking(orders: Order[]) {
  const grouped = new Map<string, { name: string; quantityCents: number; revenueCents: number; units: Set<string> }>()
  for (const order of orders) {
    if (order.status === 'cancelled') continue
    for (const item of order.items ?? []) {
      const name = item.product.trim().replace(/\s+/g, ' ')
      if (!name) continue
      const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
      const entry = grouped.get(key) ?? { name, quantityCents: 0, revenueCents: 0, units: new Set<string>() }
      entry.quantityCents += Math.round(Number(item.quantity || 0) * 1000)
      entry.revenueCents += cents(Number(item.line_total))
      entry.units.add(item.unit_label.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es'))
      grouped.set(key, entry)
    }
  }
  return [...grouped.values()]
    .map(item => ({ name: item.name, quantity: item.quantityCents / 1000, revenue: money(item.revenueCents), unit: item.units.size === 1 ? [...item.units][0] : null }))
    .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue || a.name.localeCompare(b.name, 'es'))
    .slice(0, 5)
}

export function buildPaymentMethodSummary(payments: Payment[]) {
  const grouped = new Map<PaymentMethod, { amountCents: number; count: number }>()
  for (const payment of payments) {
    if (payment.status !== 'posted') continue
    const entry = grouped.get(payment.method) ?? { amountCents: 0, count: 0 }
    entry.amountCents += cents(Number(payment.amount))
    entry.count += 1
    grouped.set(payment.method, entry)
  }
  return paymentMethods.flatMap(method => {
    const entry = grouped.get(method.value)
    return entry ? [{ method: method.value, label: method.label, amount: money(entry.amountCents), count: entry.count }] : []
  })
}

export function buildDeliverySummary(orders: Order[], range: ReportRange, today: string) {
  const inDeliveryRange = orders.filter(order => order.delivery_date && order.delivery_date >= range.startDate && order.delivery_date <= range.endDate)
  return {
    scheduled: inDeliveryRange.filter(order => order.status !== 'delivered' && order.status !== 'cancelled' && order.delivery_date! >= today).length,
    delivered: inDeliveryRange.filter(order => order.status === 'delivered').length,
    overdue: orders.filter(order => order.status !== 'delivered' && order.status !== 'cancelled' && order.delivery_date && order.delivery_date < today).length,
  }
}

export function buildProfitabilitySummary(orders: Order[]) {
  const billable = orders.filter(order => order.status !== 'cancelled')
  const costed = billable.filter(order => order.internal_cost_total !== null && order.estimated_profit !== null)
  const salesCents = costed.reduce((sum, order) => sum + cents(Number(order.total_amount)), 0)
  const profitCents = costed.reduce((sum, order) => sum + cents(Number(order.estimated_profit)), 0)
  return {
    profit: costed.length ? money(profitCents) : null,
    costedOrderCount: costed.length,
    billableOrderCount: billable.length,
    uncostedOrderCount: billable.length - costed.length,
    costedSales: money(salesCents),
    consolidatedMargin: salesCents > 0 ? profitCents / salesCents * 100 : null,
  }
}

export function buildCollectionSeries(payments: Payment[], range: ReportRange) {
  if (!isValidReportRange(range)) return []
  const start = localCalendarDate(range.startDate)
  const end = localCalendarDate(range.endDate)
  const days = Math.round((Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000) + 1
  const monthly = days > 31
  const points = new Map<string, number>()
  if (monthly) {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12)
    const last = new Date(end.getFullYear(), end.getMonth(), 1, 12)
    while (cursor <= last) {
      points.set(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`, 0)
      cursor.setMonth(cursor.getMonth() + 1)
    }
  } else {
    for (let offset = 0; offset < days; offset += 1) {
      const date = localCalendarDate(range.startDate)
      date.setDate(date.getDate() + offset)
      points.set(agendaDateKey(date), 0)
    }
  }
  for (const payment of payments) {
    if (payment.status !== 'posted') continue
    const paidAt = new Date(payment.paid_at)
    if (!Number.isFinite(paidAt.getTime())) continue
    const dateKey = agendaDateKey(paidAt)
    if (dateKey < range.startDate || dateKey > range.endDate) continue
    const key = monthly ? dateKey.slice(0, 7) : dateKey
    if (points.has(key)) points.set(key, (points.get(key) ?? 0) + cents(Number(payment.amount)))
  }
  return [...points].map(([date, amountCents]) => ({ date, amount: money(amountCents) }))
}

export function buildReportSummary(orders: Order[], payments: Payment[], range: ReportRange, today: string) {
  const periodOrders = filterOrdersByRange(orders, range)
  const periodPayments = filterPaymentsByRange(payments, range)
  const billable = periodOrders.filter(order => order.status !== 'cancelled')
  const salesCents = billable.reduce((sum, order) => sum + cents(Number(order.total_amount)), 0)
  const postedPeriodPayments = periodPayments.filter(payment => payment.status === 'posted')
  const collectedCents = postedPeriodPayments.reduce((sum, payment) => sum + cents(Number(payment.amount)), 0)
  const currentBalanceCents = orders
    .filter(order => order.status !== 'cancelled')
    .reduce((sum, order) => sum + cents(summarizePayments(order, payments).realBalance), 0)
  return {
    periodOrders,
    billableOrders: billable,
    sales: money(salesCents),
    collected: money(collectedCents),
    currentReceivable: money(currentBalanceCents),
    orderCount: periodOrders.length,
    averageTicket: billable.length ? money(Math.round(salesCents / billable.length)) : 0,
    orderStatuses: buildOrderStatusSummary(periodOrders),
    products: buildProductRanking(billable),
    paymentMethods: buildPaymentMethodSummary(postedPeriodPayments),
    collectionSeries: buildCollectionSeries(periodPayments, range),
    deliveries: buildDeliverySummary(orders, range, today),
    profitability: buildProfitabilitySummary(billable),
  }
}

export function formatReportRange(range: ReportRange) {
  if (range.startDate === range.endDate) {
    return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(localCalendarDate(range.startDate))
  }
  const start = localCalendarDate(range.startDate)
  const end = localCalendarDate(range.endDate)
  if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(end)}`
  }
  return `${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(start)} – ${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(end)}`
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function buildReportCsv(orders: Order[], payments: Payment[]) {
  const header = ['Pedido', 'Cliente', 'Fecha creación', 'Fecha entrega', 'Productos', 'Estado', 'Total', 'Pagado', 'Saldo']
  const rows = orders.map(order => {
    const summary = summarizePayments(order, payments)
    const created = new Date(order.created_at)
    const createdLabel = Number.isFinite(created.getTime()) ? new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(created) : ''
    const deliveryLabel = order.delivery_date ? new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(localCalendarDate(order.delivery_date)) : ''
    const status = order.status === 'in_preparation' ? 'En preparación' : order.status === 'ready' ? 'Listo' : order.status === 'cancelled' ? 'Cancelado' : order.status === 'delivered' ? 'Entregado' : 'Confirmado'
    const products = order.items?.length ? order.items.map(item => item.product).join(' + ') : order.product
    return [order.order_number, order.customer_name, createdLabel, deliveryLabel, products, status, Number(order.total_amount).toFixed(2), summary.totalPaid.toFixed(2), summary.realBalance.toFixed(2)]
  })
  return `\uFEFF${[header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}`
}
