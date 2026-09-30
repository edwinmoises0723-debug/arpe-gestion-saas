import { describe, expect, it } from 'vitest'
import type { Order, Payment } from './database.types'
import { addCalendarDays, agendaDateKey, countDeliveriesForDate, filterAgendaOrders, getAgendaMetrics, getAgendaPaymentStatus, groupAgendaOrders, localCalendarDate } from './agenda'

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1', business_id: 'business-1', quote_id: 'quote-1', order_number: 'ARPE-PED-2026-0001',
    source_quote_number: 'ARPE-COT-2026-0001', customer_name: 'Ana Pérez', customer_phone: '', product: 'Pastel',
    portions: 12, flavor: '', filling: '', decoration: '', extras: '', delivery_date: '2026-09-29', delivery_time: null,
    notes: '', total_amount: 1800, deposit_type: 'fixed', deposit_value: 500, deposit_required: 500,
    internal_cost_total: null, estimated_profit: null, real_margin_percent: null, status: 'confirmed', created_at: '', updated_at: '',
    ...overrides,
  }
}

function makePayment(amount: number): Payment {
  return {
    id: 'payment-1', business_id: 'business-1', order_id: 'order-1', payment_number: 'ARPE-PAG-2026-0001',
    request_id: 'request-1', amount, method: 'cash', reference: '', notes: '', paid_at: '', status: 'posted',
    created_at: '', updated_at: '', voided_at: null, void_reason: null,
  }
}

describe('agenda classification and calendar helpers', () => {
  it('classifies today, tomorrow, next dates, overdue and undated orders', () => {
    const orders = [
      makeOrder({ id: 'today', delivery_date: '2026-09-29' }),
      makeOrder({ id: 'tomorrow', delivery_date: '2026-09-30' }),
      makeOrder({ id: 'next', delivery_date: '2026-10-03' }),
      makeOrder({ id: 'later', delivery_date: '2026-10-10' }),
      makeOrder({ id: 'late', delivery_date: '2026-09-28' }),
      makeOrder({ id: 'no-date', delivery_date: null }),
    ]
    const groups = groupAgendaOrders(orders, '2026-09-29')

    expect(groups.today.map(order => order.id)).toEqual(['today'])
    expect(groups.tomorrow.map(order => order.id)).toEqual(['tomorrow'])
    expect(groups.nextSevenDays.map(order => order.id)).toEqual(['next'])
    expect(groups.later.map(order => order.id)).toEqual(['later'])
    expect(groups.overdue.map(order => order.id)).toEqual(['late'])
    expect(groups.undated.map(order => order.id)).toEqual(['no-date'])
  })

  it('does not count delivered or cancelled orders as overdue or upcoming', () => {
    const orders = [
      makeOrder({ id: 'delivered', delivery_date: '2026-09-28', status: 'delivered' }),
      makeOrder({ id: 'cancelled', delivery_date: '2026-10-01', status: 'cancelled' }),
    ]
    const groups = groupAgendaOrders(orders, '2026-09-29')

    expect(groups.overdue).toHaveLength(0)
    expect(groups.tomorrow).toHaveLength(0)
    expect(groups.delivered.map(order => order.id)).toEqual(['delivered'])
    expect(groups.cancelled.map(order => order.id)).toEqual(['cancelled'])
    expect(getAgendaMetrics(orders, '2026-09-29')).toEqual({ today: 0, upcoming: 0, overdue: 0 })
  })

  it('sorts by date, then time with no time last, then order number', () => {
    const orders = [
      makeOrder({ id: 'late-hour', order_number: 'ARPE-PED-2026-0002', delivery_time: '16:00' }),
      makeOrder({ id: 'no-hour', order_number: 'ARPE-PED-2026-0001', delivery_time: null }),
      makeOrder({ id: 'early-hour', order_number: 'ARPE-PED-2026-0003', delivery_time: '08:30' }),
    ]
    expect(filterAgendaOrders(orders, 'all').map(order => order.id)).toEqual(['early-hour', 'late-hour', 'no-hour'])
  })

  it('keeps YYYY-MM-DD as a local calendar date without UTC day shifts', () => {
    expect(agendaDateKey(localCalendarDate('2026-09-29'))).toBe('2026-09-29')
    expect(addCalendarDays('2026-09-29', 1)).toBe('2026-09-30')
  })

  it('supports status and local text filters', () => {
    const orders = [
      makeOrder({ id: 'confirmed', customer_name: 'Ana Pérez', status: 'confirmed' }),
      makeOrder({ id: 'ready', order_number: 'ARPE-PED-2026-0002', customer_name: 'María', product: 'Torta', status: 'ready' }),
      makeOrder({ id: 'delivered', order_number: 'ARPE-PED-2026-0003', status: 'delivered' }),
      makeOrder({ id: 'cancelled', order_number: 'ARPE-PED-2026-0004', status: 'cancelled' }),
    ]
    expect(filterAgendaOrders(orders, 'pending').map(order => order.id)).toEqual(['confirmed', 'ready'])
    expect(filterAgendaOrders(orders, 'ready').map(order => order.id)).toEqual(['ready'])
    expect(filterAgendaOrders(orders, 'delivered').map(order => order.id)).toEqual(['delivered'])
    expect(filterAgendaOrders(orders, 'all', 'torta').map(order => order.id)).toEqual(['ready'])
    expect(filterAgendaOrders(orders, 'pending', 'arpe-ped-2026-0001').map(order => order.id)).toEqual(['confirmed'])
  })

  it('counts dated deliveries for the calendar and excludes cancellations', () => {
    expect(countDeliveriesForDate([
      makeOrder(), makeOrder({ id: 'second' }), makeOrder({ id: 'cancelled', status: 'cancelled' }),
    ], '2026-09-29')).toBe(2)
  })

  it('uses the existing payment summary to show the real outstanding balance', () => {
    expect(getAgendaPaymentStatus(makeOrder(), [])).toEqual({ status: 'Sin pagos', balance: 1800 })
    expect(getAgendaPaymentStatus(makeOrder(), [makePayment(500)])).toEqual({ status: 'Saldo pendiente', balance: 1300 })
    expect(getAgendaPaymentStatus(makeOrder(), [makePayment(1800)])).toEqual({ status: 'Pagado', balance: 0 })
  })
})
