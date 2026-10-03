import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ClientDocument } from '../components/documents/ClientDocument'
import type { Business, Order, Payment, Quote, QuoteItem, OrderItem } from './database.types'
import { createOrderDocumentModel, createQuoteDocumentModel, createWhatsAppMessage, createWhatsAppUrl, getDocumentFilename } from './documents'

const business: Business = {
  id: 'business-1', owner_id: 'owner-1', name: 'Dulce Hogar', logo_path: null, slogan: 'Hecho con cariño',
  description: '', whatsapp: '+505 8888-1234', email: 'hola@example.com', address: 'Managua', currency: 'NIO',
  default_deposit_type: 'percentage', default_deposit_value: 50, default_document_format: 'a4',
  show_slogan_on_documents: true, show_description_on_documents: true, show_whatsapp_on_documents: true,
  show_email_on_documents: true, show_address_on_documents: true, document_footer_message: 'Gracias por confiar en nosotros.',
  created_at: '2026-01-01T10:00:00Z', updated_at: '2026-01-01T10:00:00Z',
}

const quote: Quote = {
  id: 'quote-1', business_id: business.id, delivery_internal_cost: 0, delivery_customer_charge: 0, quote_number: 'ARPE-COT-2026-0001', customer_name: 'Ana Pérez', customer_phone: '88881234',
  product: 'Pastel de vainilla', portions: 12, flavor: 'Vainilla', filling: '', decoration: '', extras: '',
  delivery_date: '2026-10-05', delivery_time: '17:00', notes: 'Texto de entrega', total_amount: 1800, deposit_type: 'percentage',
  deposit_value: 30, deposit_required: 540, status: 'sent', created_at: '2026-09-30T12:00:00Z', updated_at: '2026-09-30T12:00:00Z',
}

const order: Order = {
  id: 'order-1', business_id: business.id, quote_id: quote.id, order_number: 'ARPE-PED-2026-0001', source_quote_number: quote.quote_number,
  customer_name: quote.customer_name, customer_phone: quote.customer_phone, product: quote.product, portions: quote.portions,
  flavor: quote.flavor, filling: '', decoration: '', extras: '', delivery_date: quote.delivery_date, delivery_time: quote.delivery_time,
  notes: quote.notes, total_amount: quote.total_amount, deposit_type: quote.deposit_type, deposit_value: quote.deposit_value,
  deposit_required: quote.deposit_required, delivery_internal_cost: null, delivery_customer_charge: null, internal_cost_total: 950, estimated_profit: 850, real_margin_percent: 47.22,
  status: 'confirmed', created_at: quote.created_at, updated_at: quote.updated_at,
}

const payment: Payment = {
  id: 'payment-1', business_id: business.id, order_id: order.id, payment_number: 'ARPE-PAG-2026-0001', request_id: 'request-1',
  amount: 500, method: 'cash', reference: '', notes: '', paid_at: '2026-09-30T12:00:00Z', status: 'posted',
  created_at: '2026-09-30T12:00:00Z', updated_at: '2026-09-30T12:00:00Z', voided_at: null, void_reason: null,
}

const formatAmount = (amount: number) => `C$ ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

describe('customer documents', () => {
  it('renders every snapshot product in A4 and both thermal formats, excluding all private costs', () => {
    const items: QuoteItem[] = ['Pastel Premium', 'Tres Leches', 'Alfajores'].map((product, index) => ({ id: String(index), business_id: business.id, quote_id: quote.id, catalog_product_id: null, position: index + 1, product, quantity: index === 2 ? 24 : 1, unit_label: 'unidad', portions: null, flavor: 'Chocolate', filling: 'Ganache', decoration: 'Floral', extras: '', notes: '', unit_price: [2000, 850, 35][index], line_total: [2000, 850, 840][index], created_at: '', updated_at: '' }))
    const quoted = createQuoteDocumentModel(business, { ...quote, items, total_amount: 3840, delivery_customer_charge: 150 })
    const orderItems: OrderItem[] = items.map(item => ({ ...item, order_id: order.id, source_quote_item_id: item.id, internal_cost_total: 123.45, estimated_profit: 456.78, real_margin_percent: 78.91 }))
    const ordered = createOrderDocumentModel(business, { ...order, items: orderItems, total_amount: 3840, delivery_customer_charge: 150 }, [])
    for (const model of [quoted, ordered]) for (const format of ['a4', 'thermal-80', 'thermal-58'] as const) {
      const html = renderToStaticMarkup(<ClientDocument model={model} printFormat={format} formatAmount={formatAmount} />)
      for (const item of items) expect(html).toContain(item.product)
      expect(html).toContain('Chocolate'); expect(html).toContain('Ganache'); expect(html).toContain('Floral')
      expect(html).toContain('C$ 3,690.00'); expect(html).toContain('C$ 150.00'); expect(html).toContain('C$ 3,840.00')
      expect(html.match(/data-document-section="product-item"/g)).toHaveLength(3)
      expect(JSON.stringify(model)).not.toMatch(/internal_cost_total|estimated_profit|real_margin_percent|123\.45|456\.78|78\.91/)
    }
    items[0].product = 'Changed quote'; expect(ordered.products[0].product).toBe('Pastel Premium')
  })

  it('omits unknown legacy delivery without inventing a zero or losing the historical total', () => {
    const model = createOrderDocumentModel(business, order, [payment])
    const html = renderToStaticMarkup(<ClientDocument model={model} formatAmount={formatAmount} />)
    expect(model.deliveryCharge).toBeNull()
    expect(html).not.toContain('Entrega cobrada al cliente')
    expect(model.products[0].line_total).toBe(order.total_amount)
    expect(model.finances.realBalance).toBe(1300)
  })
  it('projects quotations without internal costing and renders only customer-facing details', () => {
    const model = createQuoteDocumentModel(business, quote)
    const html = renderToStaticMarkup(<ClientDocument model={model} formatAmount={formatAmount} />)

    expect(model.remainingAfterDeposit).toBe(1260)
    expect(html).toContain('Anticipo requerido para confirmar')
    expect(html).toContain('Saldo restante después de recibir el anticipo')
    expect(html).toContain('5:00 p. m.')
    expect(html).not.toMatch(/Costo real|Costo interno|Ganancia estimada|Merma|Margen real|Gastos indirectos|950|850/)
    expect(Object.keys(model.quote)).not.toContain('internal_cost_total')
  })

  it('projects order payment totals while excluding private profit and internal cost', () => {
    const model = createOrderDocumentModel(business, order, [payment])
    const html = renderToStaticMarkup(<ClientDocument model={model} formatAmount={formatAmount} />)

    expect(model.finances).toEqual({ totalPaid: 500, realBalance: 1300 })
    expect(html).toContain('Pagado hasta ahora')
    expect(html).toContain('C$ 500.00')
    expect(html).toContain('C$ 1,300.00')
    expect(html).toContain('5:00 p. m.')
    expect(html).not.toMatch(/Costo real|Costo interno|Ganancia estimada|Merma|Margen real|Gastos indirectos|950|850|47\.22/)
    expect(Object.keys(model.order)).not.toContain('estimated_profit')
  })

  it('applies customer document visibility preferences without blank rows', () => {
    const configuredBusiness = { ...business, description: 'Repostería artesanal', slogan: 'Hecho con cariño', whatsapp: '+505 8888-1234', email: 'hola@example.com', address: '', show_slogan_on_documents: true, show_description_on_documents: true, show_whatsapp_on_documents: true, show_email_on_documents: false, show_address_on_documents: true }
    const html = renderToStaticMarkup(<ClientDocument model={createQuoteDocumentModel(configuredBusiness, quote)} formatAmount={formatAmount} />)

    expect(html).toContain('Hecho con cariño')
    expect(html).toContain('Repostería artesanal')
    expect(html).toContain('+505 8888-1234')
    expect(html).not.toContain('hola@example.com')
    expect(html).not.toContain('Managua')

    const hiddenBusiness = { ...configuredBusiness, show_slogan_on_documents: false, show_description_on_documents: false, show_whatsapp_on_documents: false }
    const hiddenHtml = renderToStaticMarkup(<ClientDocument model={createQuoteDocumentModel(hiddenBusiness, quote)} formatAmount={formatAmount} />)
    expect(hiddenHtml).not.toContain('Hecho con cariño')
    expect(hiddenHtml).not.toContain('Repostería artesanal')
    expect(hiddenHtml).not.toContain('+505 8888-1234')
    expect(hiddenHtml).not.toContain('document-contact-list')
  })

  it('uses the configured footer and always keeps the system credit', () => {
    const customBusiness = { ...business, document_footer_message: 'Con cariño, Dulce Hogar' }
    const html = renderToStaticMarkup(<ClientDocument model={createQuoteDocumentModel(customBusiness, quote)} formatAmount={formatAmount} />)
    expect(html).toContain('Con cariño, Dulce Hogar')
    expect(html).toContain('Sistema diseñado por Ing. Edwin Nicaragua')
    expect(html).toContain('Generado con ARPE Gestión SaaS')
    const emptyFooter = renderToStaticMarkup(<ClientDocument model={createQuoteDocumentModel({ ...customBusiness, document_footer_message: '' }, quote)} formatAmount={formatAmount} />)
    expect(emptyFooter).not.toContain('document-thanks')
  })

  it('shows the complete-payment callout and the canceled state clearly', () => {
    const paid = createOrderDocumentModel(business, order, [{ ...payment, amount: order.total_amount }])
    const canceled = createOrderDocumentModel(business, { ...order, status: 'cancelled' }, [payment])

    expect(renderToStaticMarkup(<ClientDocument model={paid} formatAmount={formatAmount} />)).toContain('PAGADO EN SU TOTALIDAD')
    expect(renderToStaticMarkup(<ClientDocument model={canceled} formatAmount={formatAmount} />)).toContain('PEDIDO CANCELADO')
  })

  it('places Cliente, Entrega, product, optional notes and the commercial summary in the required order', () => {
    const html = renderToStaticMarkup(<ClientDocument model={createQuoteDocumentModel(business, quote)} formatAmount={formatAmount} />)
    const customer = html.indexOf('data-document-section="customer"')
    const delivery = html.indexOf('data-document-section="delivery"')
    const product = html.indexOf('data-document-section="product"')
    const notes = html.indexOf('data-document-section="notes"')
    const summary = html.indexOf('data-document-section="summary"')
    const thanks = html.indexOf('document-thanks')

    expect(customer).toBeLessThan(delivery)
    expect(delivery).toBeLessThan(product)
    expect(product).toBeLessThan(notes)
    expect(notes).toBeLessThan(summary)
    expect(summary).toBeLessThan(thanks)
  })

  it('renders client and product values as normal-weight detail rows', () => {
    for (const model of [createQuoteDocumentModel(business, quote), createOrderDocumentModel(business, order, [])]) {
      const html = renderToStaticMarkup(<ClientDocument model={model} formatAmount={formatAmount} />)
      const customerStart = html.indexOf('data-document-section="customer"')
      const deliveryStart = html.indexOf('data-document-section="delivery"')
      const productStart = html.indexOf('data-document-section="product"')
      const summaryStart = html.indexOf('data-document-section="summary"')
      const customerSection = html.slice(customerStart, deliveryStart)
      const section = html.slice(productStart, summaryStart)

      expect(customerSection).toContain('<div class="document-normal-value-row"><dt>Nombre</dt><dd>Ana Pérez</dd></div>')
      expect(customerSection).toContain('<div class="document-normal-value-row"><dt>Teléfono</dt><dd>88881234</dd></div>')
      expect(customerSection).not.toContain('<strong>Ana Pérez</strong>')
      expect(section).toContain('<div class="document-normal-value-row"><dt>Producto</dt><dd>Pastel de vainilla</dd></div>')
      expect(section.indexOf('document-normal-value-row')).toBeLessThan(section.indexOf('<dt>Porciones</dt>'))
      expect(section).not.toContain('document-product-title')
    }
  })

  it('does not render an empty phone row when the customer has no phone', () => {
    const html = renderToStaticMarkup(<ClientDocument model={createQuoteDocumentModel(business, { ...quote, customer_phone: '' })} formatAmount={formatAmount} />)
    const customerStart = html.indexOf('data-document-section="customer"')
    const deliveryStart = html.indexOf('data-document-section="delivery"')
    const customerSection = html.slice(customerStart, deliveryStart)

    expect(customerSection).toContain('<dt>Nombre</dt><dd>Ana Pérez</dd>')
    expect(customerSection).not.toContain('Teléfono')
  })

  it('keeps the summary as section 04 when there are no observations and always renders delivery', () => {
    const html = renderToStaticMarkup(<ClientDocument model={createQuoteDocumentModel(business, { ...quote, notes: '', delivery_date: null, delivery_time: null })} formatAmount={formatAmount} />)
    expect(html).toContain('Hora por definir')
    expect(html).toContain('<span>04</span><h3>Resumen comercial</h3>')
    expect(html).not.toContain('data-document-section="notes"')
  })

  it('keeps the document number and monetary values intact in PNG/thermal document markup', () => {
    for (const format of ['thermal-58', 'thermal-80'] as const) {
      const html = renderToStaticMarkup(<ClientDocument model={createQuoteDocumentModel(business, quote)} formatAmount={formatAmount} printFormat={format} />)
      expect(html).toContain(`document-format-${format}`)
      expect(html).toContain('ARPE-COT-2026-0001')
      expect(html).toContain('C$ 1,800.00')
      expect(html).toContain('C$ 540.00')
      expect(html).not.toContain('<wbr')
      expect(html).not.toContain('\u00ad')
    }
  })

  it('creates safe filenames and WhatsApp messages without changing the saved phone number', () => {
    const model = createQuoteDocumentModel(business, quote)
    const message = createWhatsAppMessage(model, formatAmount)

    expect(getDocumentFilename(model, 'pdf')).toBe('Cotizacion-ARPE-COT-2026-0001.pdf')
    expect(getDocumentFilename(model, 'png')).toBe('Cotizacion-ARPE-COT-2026-0001-Ana-Perez.png')
    expect(createWhatsAppUrl(model, message)).toContain('https://wa.me/88881234?text=')
    expect(message).toContain('Anticipo requerido para confirmar: C$ 540.00')
    expect(message).not.toMatch(/Costo real|Ganancia|Merma|Margen|Gastos indirectos/)
    expect(business.whatsapp).toBe('+505 8888-1234')
  })

  it('handles a customer with no phone number for manual WhatsApp sharing', () => {
    const model = createQuoteDocumentModel(business, { ...quote, customer_phone: '' })
    expect(createWhatsAppUrl(model, 'Hola')).toBe('https://wa.me/?text=Hola')
  })
})
