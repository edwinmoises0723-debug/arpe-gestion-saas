import { describe, expect, it } from 'vitest'
import type { Order, Payment } from './database.types'
import { summarizePayments, summarizePaymentsAfterSave } from './payments'

const order: Order = {
  id: 'order-1', business_id: 'business-1', quote_id: 'quote-1', order_number: 'ARPE-PED-2026-0001',
  source_quote_number: 'ARPE-COT-2026-0001', customer_name: 'Ana Pérez', customer_phone: '',
  product: 'Pastel', portions: 12, flavor: '', filling: '', decoration: '', extras: '',
  delivery_date: null, delivery_time: null, notes: '', total_amount: 1800, deposit_type: 'fixed',
  deposit_value: 500, deposit_required: 500, delivery_internal_cost: null, delivery_customer_charge: null, internal_cost_total: null, estimated_profit: null,
  real_margin_percent: null, status: 'delivered', created_at: '', updated_at: '',
}

function payment(amount: number, status: Payment['status'] = 'posted'): Payment {
  return {
    id: crypto.randomUUID(), business_id: order.business_id, order_id: order.id,
    payment_number: 'ARPE-PAG-2026-0001', request_id: crypto.randomUUID(), amount,
    method: 'cash', reference: '', notes: '', paid_at: '', status, created_at: '', updated_at: '',
    voided_at: status === 'voided' ? '' : null, void_reason: status === 'voided' ? 'Error de captura' : null,
  }
}

describe('payment summaries use only posted money', () => {
  it('does not count a required deposit as money received', () => {
    expect(summarizePayments(order, [])).toEqual({
      totalPaid: 0, realBalance: 1800, depositShortfall: 500, financialStatus: 'Sin pagos',
    })
  })

  it('detects a partial deposit, a covered deposit and a paid order', () => {
    expect(summarizePayments(order, [payment(200)]).financialStatus).toBe('Anticipo parcial')
    expect(summarizePayments(order, [payment(500)]).financialStatus).toBe('Anticipo cubierto')
    expect(summarizePayments(order, [payment(500), payment(1000)]).realBalance).toBe(300)
    expect(summarizePayments(order, [payment(500), payment(1000), payment(300)]))
      .toMatchObject({ totalPaid: 1800, realBalance: 0, depositShortfall: 0, financialStatus: 'Pagado' })
  })

  it('shows the first saved payment once when the refreshed list already contains it', () => {
    const firstPayment = payment(500)

    expect(summarizePaymentsAfterSave(order, [firstPayment], firstPayment)).toEqual({
      totalPaid: 500, realBalance: 1300, depositShortfall: 0, financialStatus: 'Anticipo cubierto',
    })
  })

  it('ignores voided payments and isolates orders', () => {
    expect(summarizePayments(order, [payment(500, 'voided'), { ...payment(300), order_id: 'another-order' }]))
      .toMatchObject({ totalPaid: 0, realBalance: 1800, financialStatus: 'Sin pagos' })
  })

  it('labels a partial payment when no deposit is required', () => {
    expect(summarizePayments({ ...order, deposit_required: 0 }, [payment(200)]).financialStatus).toBe('Pago parcial')
  })
})
