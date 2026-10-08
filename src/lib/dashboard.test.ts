import { describe, expect, it } from 'vitest'
import type { Order, Payment, Quote } from './database.types'
import { agendaDateKey } from './agenda'
import {
  getDashboardAlerts,
  getDashboardFinancialMetrics,
  getDashboardOrderMetrics,
  getDashboardQuoteMetrics,
  getRecentPayments,
  getUpcomingDeliveries,
  groupPostedPaymentsByLocalDate,
} from './dashboard'

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'order-1', business_id: 'business-1', quote_id: 'quote-1', order_number: 'ARPE-PED-2026-0001',
  source_quote_number: '0001', customer_name: 'Ana Pérez', customer_phone: '', product: 'Pastel', portions: null,
  flavor: '', filling: '', decoration: '', extras: '', delivery_date: '2026-10-08', delivery_time: '17:00', notes: '',
  total_amount: 1800, deposit_type: 'percentage', deposit_value: 50, deposit_required: 900,
  delivery_internal_cost: null, delivery_customer_charge: null, internal_cost_total: null, estimated_profit: null, real_margin_percent: null, status: 'confirmed',
  created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z', ...overrides,
})

const payment = (overrides: Partial<Payment> = {}): Payment => ({
  id: 'payment-1', business_id: 'business-1', order_id: 'order-1', payment_number: 'ARPE-PAG-2026-0001',
  request_id: 'request-1', amount: 500, method: 'cash', reference: '', notes: '', paid_at: '2026-10-07T12:00:00Z',
  status: 'posted', created_at: '2026-10-07T12:00:00Z', updated_at: '2026-10-07T12:00:00Z', voided_at: null,
  void_reason: null, ...overrides,
})

const quote = (overrides: Partial<Quote> = {}): Quote => ({
  id: 'quote-1', business_id: 'business-1', delivery_internal_cost: 0, delivery_customer_charge: 0, quote_number: '0001', customer_name: 'Ana Pérez', customer_phone: '',
  product: 'Pastel', portions: null, flavor: '', filling: '', decoration: '', extras: '', delivery_date: null,
  delivery_time: null, notes: '', total_amount: 1800, deposit_type: 'percentage', deposit_value: 50, deposit_required: 900,
  status: 'draft', created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-01T12:00:00Z', ...overrides,
})

describe('Dashboard financial metrics', () => {
  it('excludes cancelled orders from registered sales', () => {
    expect(getDashboardFinancialMetrics([order(), order({ id: 'cancelled', total_amount: 2000, status: 'cancelled' })], []).registeredSales).toBe(1800)
  })

  it('counts only posted payments as collected money', () => {
    const metrics = getDashboardFinancialMetrics([order()], [payment(), payment({ id: 'void', amount: 250, status: 'voided' })])
    expect(metrics.collectedMoney).toBe(500)
  })

  it('does not count a required deposit as money received', () => {
    const metrics = getDashboardFinancialMetrics([order({ deposit_required: 900 })], [])
    expect(metrics.collectedMoney).toBe(0)
    expect(metrics.receivableBalance).toBe(1800)
  })

  it('calculates remaining balance through summarizePayments for a delivered order', () => {
    const metrics = getDashboardFinancialMetrics([order({ status: 'delivered' })], [payment({ amount: 1500 })])
    expect(metrics.receivableBalance).toBe(300)
  })

  it('excludes cancelled orders from balance and calculates average ticket', () => {
    const metrics = getDashboardFinancialMetrics([
      order({ total_amount: 1800 }),
      order({ id: 'order-2', total_amount: 2000, status: 'confirmed' }),
      order({ id: 'cancelled', total_amount: 9000, status: 'cancelled' }),
    ], [])
    expect(metrics.receivableBalance).toBe(3800)
    expect(metrics.averageTicket).toBe(1900)
    expect(metrics.nonCancelledOrderCount).toBe(2)
  })

  it('reports zero average ticket when there are no billable orders', () => {
    expect(getDashboardFinancialMetrics([], []).averageTicket).toBe(0)
  })

  it('counts estimated profit only from orders with real cost data', () => {
    const metrics = getDashboardFinancialMetrics([
      order({ internal_cost_total: 300, estimated_profit: 700 }), order({ id: 'uncosted', estimated_profit: null }),
    ], [])
    expect(metrics.estimatedProfit).toBe(700)
    expect(metrics.costedOrderCount).toBe(1)
    expect(metrics).toMatchObject({ costedSales: 1800, estimatedCosts: 1100, costCoveragePercent: 50 })
    expect(metrics.consolidatedMargin).toBeCloseTo(38.89, 2)
  })

  it('identifies when none of the orders have cost data', () => {
    const metrics = getDashboardFinancialMetrics([order({ estimated_profit: null })], [])
    expect(metrics.estimatedProfit).toBeNull()
    expect(metrics.costedOrderCount).toBe(0)
    expect(metrics.estimatedCosts).toBeNull()
    expect(metrics.consolidatedMargin).toBeNull()
    expect(metrics.costCoveragePercent).toBe(0)
  })

  it('does not treat profit without a recorded total cost as cost coverage', () => {
    const metrics = getDashboardFinancialMetrics([order({ estimated_profit: 700 })], [])
    expect(metrics.estimatedProfit).toBeNull()
    expect(metrics.costedOrderCount).toBe(0)
  })
})

describe('Dashboard delivery and status metrics', () => {
  it('counts only confirmed, preparation and ready orders as active', () => {
    const metrics = getDashboardOrderMetrics([
      order({ status: 'confirmed' }), order({ id: 'prep', status: 'in_preparation' }),
      order({ id: 'ready', status: 'ready' }), order({ id: 'done', status: 'delivered' }),
      order({ id: 'cancelled', status: 'cancelled' }),
    ], '2026-10-07')
    expect(metrics.active).toBe(3)
    expect(metrics.byStatus.delivered).toBe(1)
    expect(metrics.byStatus.cancelled).toBe(1)
  })

  it('alerts on active overdue deliveries', () => {
    expect(getDashboardAlerts([order({ delivery_date: '2026-10-06' })], [], '2026-10-07').map(item => item.type)).toContain('overdue')
  })

  it('alerts when a delivered order has a remaining balance', () => {
    const alerts = getDashboardAlerts([order({ status: 'delivered' })], [payment({ amount: 1500 })], '2026-10-07')
    expect(alerts).toContainEqual({ type: 'delivered-balance', order: order({ status: 'delivered' }), balance: 300 })
  })

  it('alerts when an active order deposit is not covered', () => {
    expect(getDashboardAlerts([order({ deposit_required: 1000 })], [], '2026-10-07').map(item => item.type)).toContain('deposit-shortfall')
  })

  it('alerts when an active order has no delivery date', () => {
    expect(getDashboardAlerts([order({ delivery_date: null })], [], '2026-10-07').map(item => item.type)).toContain('no-delivery-date')
  })

  it('flags cancelled orders with posted payments without treating them as receivables', () => {
    const cancelled = order({ status: 'cancelled' })
    expect(getDashboardAlerts([cancelled], [payment()], '2026-10-07')).toContainEqual({ type: 'cancelled-with-payment', order: cancelled, received: 500 })
    expect(getDashboardFinancialMetrics([cancelled], [payment()]).receivableBalance).toBe(0)
    expect(getDashboardFinancialMetrics([cancelled], [payment()]).collectedMoney).toBe(500)
  })

  it('counts agenda metrics using local calendar date keys', () => {
    const metrics = getDashboardOrderMetrics([
      order({ delivery_date: '2026-10-07' }), order({ id: 'future', delivery_date: '2026-10-08' }),
      order({ id: 'late', delivery_date: '2026-10-06' }),
    ], '2026-10-07')
    expect(metrics.deliveriesToday).toBe(1)
    expect(metrics.upcomingDeliveries).toBe(1)
    expect(metrics.overdueDeliveries).toBe(1)
  })

  it('orders upcoming deliveries by date, time and order number and excludes inactive orders', () => {
    const list = getUpcomingDeliveries([
      order({ id: 'later', order_number: 'P-3', delivery_date: '2026-10-09' }),
      order({ id: 'second', order_number: 'P-2', delivery_date: '2026-10-08', delivery_time: '18:00' }),
      order({ id: 'first', order_number: 'P-1', delivery_date: '2026-10-08', delivery_time: '09:00' }),
      order({ id: 'done', delivery_date: '2026-10-08', status: 'delivered' }),
      order({ id: 'past', delivery_date: '2026-10-06' }),
    ], [], '2026-10-07')
    expect(list.map(item => item.order.id)).toEqual(['first', 'second', 'later'])
  })
})

describe('Dashboard payment history and charts', () => {
  it('groups posted payments by their browser-local paid date and excludes voided payments', () => {
    const paidAt = '2026-10-08T00:15:00+02:00'
    const localDate = agendaDateKey(new Date(paidAt))
    const series = groupPostedPaymentsByLocalDate([
      payment({ paid_at: paidAt, amount: 500 }),
      payment({ id: 'same-day', paid_at: paidAt, amount: 100 }),
      payment({ id: 'void', paid_at: paidAt, amount: 900, status: 'voided' }),
    ], localDate)
    expect(series.find(point => point.date === localDate)?.amount).toBe(600)
  })

  it('returns the newest payments with their related order', () => {
    const relatedOrder = order()
    const rows = getRecentPayments([
      payment({ id: 'old', paid_at: '2026-10-01T12:00:00Z' }),
      payment({ id: 'new', paid_at: '2026-10-06T12:00:00Z' }),
    ], [relatedOrder], 1)
    expect(rows).toHaveLength(1)
    expect(rows[0].payment.id).toBe('new')
    expect(rows[0].order).toEqual(relatedOrder)
  })
})

describe('Dashboard quote metrics', () => {
  it('counts each quote status accurately', () => {
    expect(getDashboardQuoteMetrics([
      quote({ status: 'draft' }), quote({ id: 'sent', status: 'sent' }), quote({ id: 'accepted', status: 'accepted' }),
      quote({ id: 'rejected', status: 'rejected' }), quote({ id: 'sent-2', status: 'sent' }),
    ])).toEqual({ draft: 1, sent: 2, accepted: 1, rejected: 1 })
  })
})
