import type { Order, OrderStatus, Payment } from './database.types'
import { summarizePayments } from './payments'

export type AgendaFilter = 'all' | 'pending' | 'ready' | 'delivered'
export type AgendaGroupKey = 'overdue' | 'today' | 'tomorrow' | 'nextSevenDays' | 'later' | 'undated' | 'delivered' | 'cancelled'
export type AgendaGroups = Record<AgendaGroupKey, Order[]>

const pendingStatuses = new Set<OrderStatus>(['confirmed', 'in_preparation', 'ready'])

export function agendaDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function localCalendarDate(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

export function addCalendarDays(dateKey: string, amount: number): string {
  const date = localCalendarDate(dateKey)
  date.setDate(date.getDate() + amount)
  return agendaDateKey(date)
}

export function compareDeliveryOrders(a: Order, b: Order): number {
  const byDate = (a.delivery_date ?? '9999-12-31').localeCompare(b.delivery_date ?? '9999-12-31')
  if (byDate !== 0) return byDate
  const byTime = (a.delivery_time ?? '99:99').slice(0, 5).localeCompare((b.delivery_time ?? '99:99').slice(0, 5))
  return byTime || a.order_number.localeCompare(b.order_number, 'es', { numeric: true })
}

export function filterAgendaOrders(orders: Order[], filter: AgendaFilter, search = ''): Order[] {
  const query = search.trim().toLocaleLowerCase('es')
  return orders.filter(order => {
    const matchesStatus = filter === 'all'
      || (filter === 'pending' && pendingStatuses.has(order.status))
      || (filter === 'ready' && order.status === 'ready')
      || (filter === 'delivered' && order.status === 'delivered')
    const matchesSearch = !query || [order.customer_name, order.order_number, order.product]
      .some(value => value.toLocaleLowerCase('es').includes(query))
    return matchesStatus && matchesSearch
  }).sort(compareDeliveryOrders)
}

export function groupAgendaOrders(orders: Order[], today: string): AgendaGroups {
  const groups: AgendaGroups = {
    overdue: [], today: [], tomorrow: [], nextSevenDays: [], later: [], undated: [], delivered: [], cancelled: [],
  }
  const tomorrow = addCalendarDays(today, 1)
  const endOfNextSevenDays = addCalendarDays(today, 7)

  for (const order of orders) {
    if (order.status === 'cancelled') { groups.cancelled.push(order); continue }
    if (order.status === 'delivered') { groups.delivered.push(order); continue }
    if (!order.delivery_date) { groups.undated.push(order); continue }
    if (order.delivery_date < today) groups.overdue.push(order)
    else if (order.delivery_date === today) groups.today.push(order)
    else if (order.delivery_date === tomorrow) groups.tomorrow.push(order)
    else if (order.delivery_date <= endOfNextSevenDays) groups.nextSevenDays.push(order)
    else groups.later.push(order)
  }

  return groups
}

export function getAgendaMetrics(orders: Order[], today: string) {
  const activeDatedOrders = orders.filter(order => order.status !== 'delivered' && order.status !== 'cancelled' && order.delivery_date)
  return {
    today: activeDatedOrders.filter(order => order.delivery_date === today).length,
    upcoming: activeDatedOrders.filter(order => order.delivery_date! > today).length,
    overdue: activeDatedOrders.filter(order => order.delivery_date! < today).length,
  }
}

export function countDeliveriesForDate(orders: Order[], date: string): number {
  return orders.filter(order => order.delivery_date === date && order.status !== 'cancelled').length
}

export function getAgendaPaymentStatus(order: Order, payments: Payment[]) {
  const summary = summarizePayments(order, payments)
  return {
    status: summary.totalPaid <= 0 ? 'Sin pagos' as const : summary.realBalance <= 0 ? 'Pagado' as const : 'Saldo pendiente' as const,
    balance: summary.realBalance,
  }
}

export const agendaGroupLabels: Record<AgendaGroupKey, string> = {
  overdue: 'Atrasadas', today: 'Hoy', tomorrow: 'Mañana', nextSevenDays: 'Próximos 7 días', later: 'Más adelante',
  undated: 'Pedidos sin fecha de entrega', delivered: 'Entregados', cancelled: 'Cancelados',
}
