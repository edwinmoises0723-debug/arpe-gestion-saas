import { describe, expect, it } from 'vitest'
import type { Order, OrderItem, Payment } from './database.types'
import { searchOrders, searchPaymentOrders } from './order-payment-search'
import { summarizePayments } from './payments'

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'order-1', business_id: 'business-1', quote_id: 'quote-1', order_number: 'ARPE-PED-2026-0001',
  source_quote_number: 'ARPE-COT-2026-0001', customer_name: 'María Ramírez', customer_phone: '+505 8888 1111',
  product: 'Pastel base', portions: 12, flavor: 'Chocolate', filling: 'Ganache', decoration: 'Floral', extras: '',
  delivery_date: '2026-10-02', delivery_time: null, notes: '', total_amount: 1800, deposit_type: 'percentage',
  deposit_value: 50, deposit_required: 900, delivery_internal_cost: null, delivery_customer_charge: null,
  internal_cost_total: null, estimated_profit: null, real_margin_percent: null, status: 'confirmed',
  created_at: '2026-09-01T12:00:00Z', updated_at: '2026-09-01T12:00:00Z', ...overrides,
})

const payment = (overrides: Partial<Payment> = {}): Payment => ({
  id: 'payment-1', business_id: 'business-1', order_id: 'order-1', payment_number: 'ARPE-PAG-2026-0001',
  request_id: 'request-1', amount: 500, method: 'cash', reference: 'TRX-98765', notes: '',
  paid_at: '2026-09-20T12:00:00Z', status: 'posted', created_at: '2026-09-20T12:00:00Z',
  updated_at: '2026-09-20T12:00:00Z', voided_at: null, void_reason: null, ...overrides,
})

describe('búsqueda local de pedidos y pagos', () => {
  const multiProduct = order({ items: [
    { id: 'item-1', product: 'Pastel base' },
    { id: 'item-2', product: 'Cupcakes de vainilla' },
  ] as OrderItem[] })

  it('ignora acentos y mayúsculas en cliente', () => expect(searchOrders([order()], 'RAMIREZ')).toHaveLength(1))
  it('encuentra por número de pedido', () => expect(searchOrders([order()], '0001')).toHaveLength(1))
  it('encuentra el producto principal', () => expect(searchOrders([order()], 'Pastel base')).toHaveLength(1))
  it('encuentra un producto secundario', () => expect(searchOrders([multiProduct], 'Cupcakes')).toHaveLength(1))
  it('devuelve cero coincidencias sin alterar pedidos', () => expect(searchOrders([order()], 'inexistente')).toHaveLength(0))
  it('busca por fecha de entrega visible sin preposición', () => expect(searchOrders([order()], '2 octubre')).toHaveLength(1))
  it('busca pagos por cliente', () => expect(searchPaymentOrders([order()], [payment()], 'María')).toHaveLength(1))
  it('busca por número de pago', () => expect(searchPaymentOrders([order()], [payment()], 'ARPE-PAG-2026-0001')).toHaveLength(1))
  it('busca por método de pago en español', () => expect(searchPaymentOrders([order()], [payment()], 'Efectivo')).toHaveLength(1))
  it('busca por referencia', () => expect(searchPaymentOrders([order()], [payment()], 'TRX-98765')).toHaveLength(1))
  it('permite buscar número de un pago anulado sin incluirlo en los cálculos', () => {
    const voided = payment({ status: 'voided', voided_at: '2026-09-21T12:00:00Z' })
    const before = summarizePayments(order(), [voided])
    expect(searchPaymentOrders([order()], [voided], 'ARPE-PAG-2026-0001')).toHaveLength(1)
    expect(summarizePayments(order(), [voided])).toEqual(before)
    expect(before.totalPaid).toBe(0)
  })
  it('no muestra coincidencias entre negocios distintos', () => {
    const otherBusinessPayment = payment({ business_id: 'business-2', payment_number: 'PRIVADO-123' })
    expect(searchPaymentOrders([order()], [otherBusinessPayment], 'PRIVADO')).toHaveLength(0)
  })
})
