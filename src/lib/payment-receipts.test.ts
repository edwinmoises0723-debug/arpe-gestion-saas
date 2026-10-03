import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PaymentReceipt } from '../components/documents/PaymentReceipt'
import type { Business, Order, Payment } from './database.types'
import { calculatePaymentAtIssue, createPaymentReceiptModel, createPaymentReceiptWhatsAppMessage, getPaymentReceiptFilename } from './payment-receipts'

const business: Business = {
  id: 'business-1', owner_id: 'owner-1', name: 'Dulce Hogar', logo_path: null, slogan: 'Hecho con cariño',
  description: '', whatsapp: '+505 8888-1234', email: 'hola@example.com', address: 'Managua', currency: 'NIO',
  default_deposit_type: 'percentage', default_deposit_value: 50, default_document_format: 'a4',
  show_slogan_on_documents: true, show_description_on_documents: true, show_whatsapp_on_documents: true,
  show_email_on_documents: true, show_address_on_documents: true, document_footer_message: 'Gracias por confiar en nosotros.',
  created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:00:00Z',
}

const order: Order = {
  id: 'order-1', business_id: business.id, quote_id: 'quote-1', order_number: 'ARPE-PED-2026-0003', source_quote_number: 'ARPE-COT-2026-0003',
  customer_name: 'Carlos Ramírez', customer_phone: '+505 8888-1111', product: 'Pastel Premium', portions: 20,
  flavor: 'Chocolate', filling: 'Ganache', decoration: 'Floral', extras: '', delivery_date: null, delivery_time: null,
  notes: '', total_amount: 3840, deposit_type: 'percentage', deposit_value: 50, deposit_required: 1920,
  delivery_internal_cost: null, delivery_customer_charge: null, internal_cost_total: null, estimated_profit: null,
  real_margin_percent: null, status: 'confirmed', created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z',
}

const payment = (id: string, amount: number, createdAt: string, overrides: Partial<Payment> = {}): Payment => ({
  id, business_id: business.id, order_id: order.id, payment_number: `ARPE-PAG-2026-000${id.slice(-1)}`,
  request_id: `request-${id}`, amount, method: 'cash', reference: '', notes: '', paid_at: createdAt,
  status: 'posted', created_at: createdAt, updated_at: createdAt, voided_at: null, void_reason: null, ...overrides,
})

const formatAmount = (amount: number) => `C$ ${amount.toFixed(2)}`

describe('payment receipt history', () => {
  it('uses the payment number and reconstructs a single and partial payment in cents', () => {
    const first = payment('payment-1', 1000.01, '2026-09-02T10:00:00Z')
    const model = createPaymentReceiptModel(business, first.id, [first], [order])
    expect(model.payment.payment_number).toBe(first.payment_number)
    expect(model.paidAtIssue).toBe(1000.01)
    expect(model.balanceAfterIssue).toBe(2839.99)
  })

  it('includes only payments registered by that time and does not let a later payment change an older receipt', () => {
    const first = payment('payment-1', 1000, '2026-09-02T10:00:00Z')
    const second = payment('payment-2', 920, '2026-09-03T10:00:00Z')
    expect(calculatePaymentAtIssue(first, [first, second])).toBe(1000)
    expect(createPaymentReceiptModel(business, first.id, [first, second], [order]).balanceAfterIssue).toBe(2840)
    expect(createPaymentReceiptModel(business, second.id, [first, second], [order]).paidAtIssue).toBe(1920)
  })

  it('marks a fully paid order from the reconstructed payment total', () => {
    const final = payment('payment-2', 2840, '2026-09-03T10:00:00Z')
    const first = payment('payment-1', 1000, '2026-09-02T10:00:00Z')
    const model = createPaymentReceiptModel(business, final.id, [first, final], [order])
    expect(model.paidAtIssue).toBe(3840)
    expect(model.balanceAfterIssue).toBe(0)
  })

  it('preserves the historical balance of a payment later annulled', () => {
    const target = payment('payment-2', 920, '2026-09-03T10:00:00Z')
    const earlierLaterVoided = payment('payment-1', 1000, '2026-09-02T10:00:00Z', {
      status: 'voided', voided_at: '2026-09-04T10:00:00Z', void_reason: 'Registro duplicado',
    })
    const model = createPaymentReceiptModel(business, target.id, [earlierLaterVoided, target], [order])
    expect(model.paidAtIssue).toBe(1920)
    expect(model.balanceAfterIssue).toBe(1920)
    expect(model.currentBalance).toBe(2920)
  })

  it('includes the target payment in its issue snapshot after it has been voided', () => {
    const target = payment('payment-1', 500, '2026-09-02T10:00:00Z', {
      status: 'voided', voided_at: '2026-09-03T10:00:00Z', void_reason: 'Monto incorrecto',
    })
    const model = createPaymentReceiptModel(business, target.id, [target], [order])
    expect(model.paidAtIssue).toBe(500)
    expect(model.balanceAfterIssue).toBe(3340)
    expect(model.currentBalance).toBe(3840)
  })

  it('excludes a payment already annulled before the target payment was registered', () => {
    const earlier = payment('payment-1', 1000, '2026-09-02T10:00:00Z', {
      status: 'voided', voided_at: '2026-09-02T11:00:00Z',
    })
    const target = payment('payment-2', 920, '2026-09-03T10:00:00Z')
    expect(calculatePaymentAtIssue(target, [earlier, target])).toBe(920)
  })

  it('does not count payments from another order or business', () => {
    const target = payment('payment-1', 500, '2026-09-02T10:00:00Z')
    const otherOrder = payment('payment-2', 700, '2026-09-02T10:01:00Z', { order_id: 'order-other' })
    const otherBusiness = payment('payment-3', 800, '2026-09-02T10:02:00Z', { business_id: 'business-other' })
    expect(calculatePaymentAtIssue(target, [target, otherOrder, otherBusiness])).toBe(500)
  })

  it('rejects a payment from another business and a missing associated order', () => {
    const foreign = payment('payment-1', 500, '2026-09-02T10:00:00Z', { business_id: 'business-other' })
    expect(() => createPaymentReceiptModel(business, foreign.id, [foreign], [order])).toThrow('No encontramos este comprobante en tu negocio.')
    const withoutOrder = payment('payment-2', 500, '2026-09-02T10:00:00Z', { order_id: 'order-other' })
    expect(() => createPaymentReceiptModel(business, withoutOrder.id, [withoutOrder], [order])).toThrow('No encontramos el pedido asociado a este pago.')
  })

  it('keeps WhatsApp void notices clear and excludes internal notes and references', () => {
    const target = payment('payment-1', 500, '2026-09-02T10:00:00Z', {
      status: 'voided', voided_at: '2026-09-03T10:00:00Z', void_reason: 'Registro duplicado',
      reference: 'BANCO-INTERNA-123', notes: 'Nota privada',
    })
    const model = createPaymentReceiptModel(business, target.id, [target], [order])
    const message = createPaymentReceiptWhatsAppMessage(model, formatAmount)
    expect(message).toContain('figura como ANULADO')
    expect(message).not.toContain('reembolso')
    expect(message).not.toContain('BANCO-INTERNA-123')
    expect(message).not.toContain('Nota privada')
  })

  it('renders customer-safe receipts in A4, 80 mm and 58 mm, with annulment clearly marked', () => {
    const posted = payment('payment-1', 500, '2026-09-02T10:00:00Z')
    const voided = payment('payment-2', 500, '2026-09-02T10:00:00Z', {
      status: 'voided', voided_at: '2026-09-03T10:00:00Z', void_reason: 'Registro duplicado', reference: 'REFERENCIA-PRIVADA', notes: 'NOTA-INTERNA',
    })
    for (const printFormat of ['a4', 'thermal-80', 'thermal-58'] as const) {
      const postedModel = createPaymentReceiptModel(business, posted.id, [posted], [order])
      const postedHtml = renderToStaticMarkup(createElement(PaymentReceipt, { model: postedModel, printFormat, formatAmount }))
      expect(postedHtml).toContain('aria-label="Comprobante de pago"')
      expect(postedHtml).toContain('PAGO RECIBIDO')
      expect(postedHtml).toContain('Monto recibido')
      expect(postedHtml).toContain('C$ 500.00')
      expect(postedHtml).toContain('Pastel Premium')
      expect(postedHtml).not.toContain('payment-1')
      expect(postedHtml).not.toContain('request-payment')

      const voidedModel = createPaymentReceiptModel(business, voided.id, [voided], [order])
      const voidedHtml = renderToStaticMarkup(createElement(PaymentReceipt, { model: voidedModel, printFormat, formatAmount }))
      expect(voidedHtml).toContain('aria-label="Comprobante de pago anulado"')
      expect(voidedHtml).toContain('COMPROBANTE ANULADO')
      expect(voidedHtml).toContain('Monto original')
      expect(voidedHtml).toContain('Este pago ya no cuenta como dinero recibido.')
      expect(voidedHtml).toContain('C$ 3840.00')
      expect(voidedHtml).toContain('a. m.')
      expect(voidedHtml).toContain('REFERENCIA-PRIVADA')
      expect(voidedHtml).toContain('NOTA-INTERNA')
    }
  })

  it('creates a registered payment WhatsApp message without internal notes or references', () => {
    const target = payment('payment-1', 500, '2026-09-02T10:00:00Z', { notes: 'Nota privada', reference: 'Referencia privada' })
    const model = createPaymentReceiptModel(business, target.id, [target], [order])
    const message = createPaymentReceiptWhatsAppMessage(model, formatAmount)
    expect(message).toContain('Hemos registrado tu pago')
    expect(message).toContain('Saldo pendiente después de este pago: C$ 3340.00')
    expect(message).not.toContain('Nota privada')
    expect(message).not.toContain('Referencia privada')
    expect(getPaymentReceiptFilename(model, 'pdf')).toBe('Comprobante-ARPE-PAG-2026-0001-Carlos-Ramirez.pdf')
    expect(getPaymentReceiptFilename(model, 'png')).toBe('Comprobante-ARPE-PAG-2026-0001-Carlos-Ramirez.png')
  })

  it('omits the telephone row when the order has no customer phone', () => {
    const target = payment('payment-1', 500, '2026-09-02T10:00:00Z')
    const model = createPaymentReceiptModel(business, target.id, [target], [{ ...order, customer_phone: '' }])
    const html = renderToStaticMarkup(createElement(PaymentReceipt, { model, formatAmount }))
    expect(html).not.toContain('<dt>Teléfono</dt>')
  })

  it('applies business document preferences and never hides the legal notice or system credit', () => {
    const target = payment('payment-1', 500, '2026-09-02T10:00:00Z')
    const preferences = {
      ...business, slogan: 'Hecho con cariño', description: 'Repostería artesanal', document_footer_message: 'Gracias por tu compra.',
      show_slogan_on_documents: false, show_description_on_documents: true, show_whatsapp_on_documents: false,
      show_email_on_documents: true, show_address_on_documents: false,
    }
    const model = createPaymentReceiptModel(preferences, target.id, [target], [order])
    const html = renderToStaticMarkup(createElement(PaymentReceipt, { model, formatAmount }))
    expect(html).not.toContain('Hecho con cariño')
    expect(html).toContain('Repostería artesanal')
    expect(html).not.toContain('+505 8888-1234')
    expect(html).toContain('hola@example.com')
    expect(html).not.toContain('Managua')
    expect(html).toContain('Gracias por tu compra.')
    expect(html).toContain('Sistema diseñado por Ing. Edwin Nicaragua')
    expect(html).toContain('Este comprobante acredita únicamente el pago indicado. No constituye factura fiscal.')
  })
})
