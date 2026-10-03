import { describe, expect, it } from 'vitest'
import type { Order, OrderItem, Payment } from './database.types'
import {
  buildCollectionSeries, buildPaymentMethodSummary, buildProductRanking, buildProfitabilitySummary,
  buildReportCsv, buildReportSummary, buildOrderStatusSummary, createReportCsvBlob, filterOrdersByRange, filterPaymentsByRange,
  getReportRange, isValidReportRange,
} from './reports'

const item = (id: string, product: string, quantity: number, line_total: number, unit_label = 'unidad'): OrderItem => ({
  id, business_id: 'business-1', order_id: 'order-1', source_quote_item_id: null, position: 1,
  product, quantity, unit_label, portions: null, flavor: '', filling: '', decoration: '', extras: '', notes: '',
  unit_price: line_total / quantity, line_total, internal_cost_total: null, estimated_profit: null,
  real_margin_percent: null, created_at: '2026-10-10T12:00:00',
})

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'order-1', business_id: 'business-1', quote_id: 'quote-1', order_number: 'ARPE-PED-2026-0001',
  source_quote_number: 'ARPE-COT-2026-0001', customer_name: 'María Ramírez', customer_phone: '8888', product: 'Alfajor',
  portions: null, flavor: '', filling: '', decoration: '', extras: '', delivery_date: '2026-10-14', delivery_time: null,
  notes: '', total_amount: 1000, deposit_type: 'percentage', deposit_value: 50, deposit_required: 500,
  delivery_internal_cost: null, delivery_customer_charge: null, internal_cost_total: null, estimated_profit: null,
  real_margin_percent: null, status: 'confirmed', created_at: '2026-10-10T12:00:00', updated_at: '2026-10-10T12:00:00',
  items: [item('item-1', 'Alfajor', 10, 1000)], ...overrides,
})

const payment = (overrides: Partial<Payment> = {}): Payment => ({
  id: 'payment-1', business_id: 'business-1', order_id: 'order-1', payment_number: 'ARPE-PAG-2026-0001',
  request_id: 'request-1', amount: 250, method: 'cash', reference: '', notes: '', paid_at: '2026-10-10T13:00:00',
  status: 'posted', created_at: '2026-10-10T13:00:00', updated_at: '2026-10-10T13:00:00', voided_at: null,
  void_reason: null, ...overrides,
})

const range = { startDate: '2026-10-01', endDate: '2026-10-31' }

function parseCsvRows(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = text.replace(/^sep=;\r?\n/, '')
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    if (quoted && character === '"' && source[index + 1] === '"') { cell += '"'; index += 1 }
    else if (character === '"') quoted = !quoted
    else if (character === ';' && !quoted) { row.push(cell); cell = '' }
    else if (character === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += character
  }
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row) }
  return rows
}

describe('reports helpers', () => {
  it('incluye ventas de pedidos no cancelados y excluye cancelados', () => {
    const report = buildReportSummary([order(), order({ id: 'cancelled', status: 'cancelled', total_amount: 500 })], [], range, '2026-10-15')
    expect(report.sales).toBe(1000)
    expect(report.orderCount).toBe(2)
  })
  it('mantiene pedidos cancelados en el resumen por estado', () => {
    expect(buildOrderStatusSummary([order(), order({ id: 'cancelled', status: 'cancelled' })])).toMatchObject({ confirmed: 1, cancelled: 1 })
  })
  it('suma pagos posted del período, incluso de pedido cancelado, y excluye voided', () => {
    const report = buildReportSummary([order({ status: 'cancelled' })], [payment(), payment({ id: 'voided', status: 'voided', amount: 900 })], range, '2026-10-15')
    expect(report.collected).toBe(250)
  })
  it('calcula el ticket promedio sobre ventas no canceladas', () => {
    expect(buildReportSummary([order(), order({ id: 'order-2', total_amount: 500 })], [], range, '2026-10-15').averageTicket).toBe(750)
  })
  it('agrupa productos multiproducto sin distinguir capitalización', () => {
    const rows = buildProductRanking([order({ items: [item('a', 'Alfajor', 3, 300), item('b', 'ALFAJOR', 5, 500), item('c', 'Brownie', 2, 200)] })])
    expect(rows).toEqual([{ name: 'Alfajor', quantity: 8, revenue: 800, unit: 'unidad' }, { name: 'Brownie', quantity: 2, revenue: 200, unit: 'unidad' }])
  })
  it('usa summarizePayments para saldo actual', () => {
    const report = buildReportSummary([order()], [payment()], range, '2026-10-15')
    expect(report.currentReceivable).toBe(750)
  })
  it('ignora pedidos sin costo completo y calcula cobertura', () => {
    expect(buildProfitabilitySummary([order({ internal_cost_total: 300, estimated_profit: 700 }), order({ id: 'uncosted' })])).toMatchObject({ profit: 700, costedOrderCount: 1, billableOrderCount: 2, uncostedOrderCount: 1 })
  })
  it('calcula margen solo contra ventas de pedidos costeados', () => {
    expect(buildProfitabilitySummary([order({ internal_cost_total: 300, estimated_profit: 700 }), order({ id: 'uncosted', total_amount: 900 })])).toMatchObject({ costedSales: 1000, consolidatedMargin: 70 })
  })
  it('agrupa pagos posted por método con monto y conteo', () => {
    expect(buildPaymentMethodSummary([payment(), payment({ id: 'payment-2', amount: 100 }), payment({ id: 'void', status: 'voided', amount: 500 })])).toEqual([{ method: 'cash', label: 'Efectivo', amount: 350, count: 2 }])
  })
  it('filtra por fecha local de creación y paid_at', () => {
    const narrow = { startDate: '2026-10-10', endDate: '2026-10-10' }
    expect(filterOrdersByRange([order(), order({ id: 'outside', created_at: '2026-11-01T12:00:00' })], narrow)).toHaveLength(1)
    expect(filterPaymentsByRange([payment(), payment({ id: 'outside', paid_at: '2026-11-01T12:00:00' })], narrow)).toHaveLength(1)
  })
  it('rechaza un rango personalizado invertido y no lo aplica', () => {
    const invalid = { startDate: '2026-10-20', endDate: '2026-10-01' }
    expect(isValidReportRange(invalid)).toBe(false)
    expect(getReportRange('custom', '2026-10-15', invalid)).toBeNull()
  })
  it('construye los presets por calendario local', () => {
    expect(getReportRange('last7', '2026-10-15', range)).toEqual({ startDate: '2026-10-09', endDate: '2026-10-15' })
    expect(getReportRange('previousMonth', '2026-10-15', range)).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' })
  })
  it('agrupa los cobros diarios y excluye pagos anulados', () => {
    const series = buildCollectionSeries([payment(), payment({ id: 'void', status: 'voided', amount: 999 })], { startDate: '2026-10-10', endDate: '2026-10-11' })
    expect(series).toEqual([{ date: '2026-10-10', amount: 250 }, { date: '2026-10-11', amount: 0 }])
  })
  it('genera CSV UTF-8 compatible con Excel en español, escapado y con importes intactos', () => {
    const csv = buildReportCsv([order({ customer_name: 'Cliente "Especial"; Norte', status: 'in_preparation' })], [payment()])
    expect(csv.startsWith('sep=;\r\n')).toBe(true)
    expect(csv).not.toContain('\uFEFF')
    const rows = parseCsvRows(csv)
    expect(rows[0]).toEqual(['Pedido', 'Cliente', 'Fecha creación', 'Fecha entrega', 'Productos', 'Estado', 'Total', 'Pagado', 'Saldo'])
    expect(rows).toHaveLength(2)
    expect(rows[1]).toHaveLength(9)
    expect(csv).toContain('"Cliente ""Especial""; Norte"')
    expect(csv).toContain('En preparación')
    expect(rows[1].slice(6)).toEqual(['1000.00', '250.00', '750.00'])
    expect(csv).not.toContain('business-1')
  })

  it('conserva acentos y protege saltos de línea en campos CSV', () => {
    const csv = buildReportCsv([order({ customer_name: 'MARÍA GÓMEZ\nNorte' })], [payment()])
    const row = parseCsvRows(csv)[1]
    expect(row[1]).toBe('MARÍA GÓMEZ\nNorte')
    expect(csv).toContain('MARÍA GÓMEZ')
    expect(csv).toContain('"MARÍA GÓMEZ\nNorte"')
    expect(row).toHaveLength(9)
  })

  it('antepone el BOM UTF-8 como los bytes EF BB BF en el Blob descargable', async () => {
    const blob = createReportCsvBlob('sep=;\r\nPedido;Cliente')
    const bytes = new Uint8Array(await blob.slice(0, 3).arrayBuffer())
    expect([...bytes]).toEqual([0xEF, 0xBB, 0xBF])
    expect(blob.type).toBe('text/csv;charset=utf-8;')
  })
})
