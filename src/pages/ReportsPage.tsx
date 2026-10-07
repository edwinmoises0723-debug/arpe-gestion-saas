import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Activity, AlertTriangle, Banknote, CalendarDays, Download, PackageCheck, Search, ShoppingBag, Wallet } from 'lucide-react'
import type { Business, Order, Payment } from '../lib/database.types'
import { listOrders } from '../lib/orders'
import { listPayments, summarizePayments } from '../lib/payments'
import { formatCurrency } from '../lib/quotes'
import { summarizeOrderProducts } from '../lib/products'
import { searchOrders } from '../lib/order-payment-search'
import { agendaDateKey, localCalendarDate } from '../lib/agenda'
import { errorMessage } from '../lib/supabase'
import { Loading, Notice } from '../components/Feedback'
import { InlineBarChart } from '../components/InlineBarChart'
import {
  buildReportCsv, buildReportSummary, encodeUtf16Le, formatReportRange, getReportRange,
  type ReportPeriod,
} from '../lib/reports'

const orderStatusText = {
  confirmed: 'Confirmados', in_preparation: 'En preparación', ready: 'Listos', delivered: 'Entregados', cancelled: 'Cancelados',
} as const

const todayKey = () => agendaDateKey(new Date())
const dateLabel = (value: string) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(localCalendarDate(value))
const timestampLabel = (value: string) => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(date) : '—'
}

function downloadCsv(csv: string, filename: string) {
  const encoded = encodeUtf16Le(csv)
  const blob = new Blob([encoded], { type: 'text/csv;charset=utf-16le;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ReportsPage({ business }: { business: Business }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [dataBusinessId, setDataBusinessId] = useState('')
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [period, setPeriod] = useState<ReportPeriod>('last30')
  const [today, setToday] = useState(todayKey)
  const [customFrom, setCustomFrom] = useState(todayKey)
  const [customTo, setCustomTo] = useState(todayKey)
  const [search, setSearch] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([listOrders(business.id), listPayments(business.id)])
      .then(([loadedOrders, loadedPayments]) => {
        if (!active) return
        setOrders(loadedOrders)
        setPayments(loadedPayments)
        setDataBusinessId(business.id)
        setError('')
      })
      .catch(reason => { if (active) setError(errorMessage(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [business.id, refreshKey])

  const selectedRange = getReportRange(period, today, { startDate: customFrom, endDate: customTo })
  const report = useMemo(() => {
    const range = getReportRange(period, today, { startDate: customFrom, endDate: customTo })
    return range ? buildReportSummary(orders, payments, range, today) : null
  }, [orders, payments, period, today, customFrom, customTo])
  const matchingOrders = useMemo(() => report ? searchOrders(report.periodOrders, search).sort((a, b) => b.created_at.localeCompare(a.created_at)) : [], [report, search])
  const maxProductRevenue = report?.products.reduce((max, product) => Math.max(max, product.revenue), 0) ?? 0
  const maxPaymentMethodAmount = report?.paymentMethods.reduce((max, method) => Math.max(max, method.amount), 0) ?? 0

  function retryLoad() {
    setLoading(true)
    setError('')
    setRefreshKey(value => value + 1)
  }

  if (loading) return <Loading text="Preparando los reportes de tu negocio…" />
  if (dataBusinessId !== business.id) return <div className="reports-page"><header className="reports-heading"><div><span className="eyebrow accent">CONOCE TU NEGOCIO</span><h1>Reportes<span className="heading-dot">.</span></h1></div></header><section className="panel dashboard-load-error"><AlertTriangle size={22} /><div><h2>No pudimos cargar tus reportes</h2><p>Revisa tu conexión e inténtalo de nuevo. No mostraremos cifras hasta tener los datos actualizados.</p></div><button type="button" className="secondary-button" onClick={retryLoad}>Reintentar</button>{error && <Notice error>{error}</Notice>}</section></div>

  function setPreset(value: string) {
    setPeriod(value as ReportPeriod)
    if (value === 'custom') {
      const current = todayKey()
      setToday(current)
      setCustomFrom(current)
      setCustomTo(current)
    }
  }

  function exportCsv() {
    if (!report || !selectedRange) return
    downloadCsv(buildReportCsv(report.periodOrders, payments), `Reporte-ARPE-${today}.csv`)
  }

  return <div className="reports-page">
    <header className="reports-heading">
      <div><span className="eyebrow accent">CONOCE TU NEGOCIO</span><h1>Reportes<span className="heading-dot">.</span></h1><p className="muted">Analiza ventas, cobros, pedidos y productos para tomar mejores decisiones.</p><span className="reports-heading-range">{selectedRange ? formatReportRange(selectedRange) : 'Revisa las fechas seleccionadas'}</span></div>
    </header>
    {error && <Notice error>{error} <button type="button" className="reports-retry" onClick={retryLoad}>Reintentar</button></Notice>}

    <section className="panel reports-filter" aria-label="Período del reporte">
      <label>Período<select value={period} onChange={event => setPreset(event.target.value)}>
        <option value="today">Hoy</option><option value="last7">Últimos 7 días</option><option value="last30">Últimos 30 días</option><option value="thisMonth">Este mes</option><option value="previousMonth">Mes anterior</option><option value="custom">Personalizado</option>
      </select></label>
      {period === 'custom' && <div className="reports-custom-dates"><label>Fecha desde<input type="date" value={customFrom} max={customTo} onChange={event => setCustomFrom(event.target.value)} /></label><label>Fecha hasta<input type="date" value={customTo} min={customFrom} onChange={event => setCustomTo(event.target.value)} /></label></div>}
      <div className="reports-filter-range"><CalendarDays size={16} /><strong>{selectedRange ? formatReportRange(selectedRange) : 'Rango inválido'}</strong></div>
    </section>
    {!selectedRange && <div className="reports-range-error" role="alert">La fecha inicial debe ser igual o anterior a la fecha final. Ajusta el rango para ver los resultados.</div>}
    {selectedRange && report && <>
      <p className="reports-date-note">Pedidos, ventas y productos usan la fecha de creación; los cobros usan la fecha del pago; las entregas usan su fecha programada.</p>
      <section className="reports-metrics" aria-label="Indicadores del período">
        <Metric icon={<Banknote size={19} />} label="Ventas registradas" value={formatCurrency(report.sales, business)} help="Valor de pedidos creados en este período, excluyendo cancelados." tone="green" />
        <Metric icon={<Wallet size={19} />} label="Dinero cobrado" value={formatCurrency(report.collected, business)} help="Pagos realmente recibidos durante este período." tone="cream" />
        <Metric icon={<Activity size={19} />} label="Saldo actual por cobrar" value={formatCurrency(report.currentReceivable, business)} help="Pendiente actualmente en pedidos no cancelados." tone="sand" />
        <Metric icon={<PackageCheck size={19} />} label="Pedidos del período" value={String(report.orderCount)} help="Pedidos creados en las fechas seleccionadas." tone="sage" />
      </section>
      <section className="reports-ticket-average"><span className="reports-ticket-icon"><ShoppingBag size={18} /></span><div><strong>Ticket promedio</strong><p>Ventas no canceladas divididas entre sus pedidos del período.</p></div><b>{formatCurrency(report.averageTicket, business)}</b></section>

      <div className="reports-grid">
        <section className="panel report-panel">
          <SectionTitle icon={<PackageCheck size={18} />} title="Estado de pedidos" />
          <div className="reports-status-bar" aria-hidden="true">{Object.entries(report.orderStatuses).map(([status, count]) => <span key={status} className={`status-segment status-${status}`} style={{ width: `${report.orderCount ? count / report.orderCount * 100 : 0}%` }} />)}</div>
          <ul className="reports-status-list">{Object.entries(report.orderStatuses).map(([status, count]) => <li key={status}><i className={`status-dot status-${status}`} /><span>{orderStatusText[status as keyof typeof orderStatusText]}</span><strong>{count}</strong></li>)}</ul>
        </section>

        <section className="panel report-panel">
          <SectionTitle icon={<ShoppingBag size={18} />} title="Productos más vendidos" />
          {report.products.length ? <ol className="reports-ranked-list reports-product-ranking">{report.products.map((product, index) => <li key={product.name}>
            <span className="reports-rank-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            <div className="reports-rank-content"><div className="reports-rank-heading"><strong>{product.name}</strong><b>{formatCurrency(product.revenue, business)}</b></div><span>{quantityLabel(product.quantity, product.unit)}</span><div className="reports-rank-track" aria-hidden="true"><span style={{ width: `${maxProductRevenue > 0 ? product.revenue / maxProductRevenue * 100 : 0}%` }} /></div></div>
          </li>)}</ol> : <EmptyReport text="Aún no hay productos vendidos en este período." />}
        </section>

        <section className="panel report-panel">
          <SectionTitle icon={<Wallet size={18} />} title="Métodos de pago" />
          {report.paymentMethods.length ? <ul className="reports-ranked-list reports-payment-ranking">{report.paymentMethods.map(method => <li key={method.method}>
            <div className="reports-rank-content"><div className="reports-rank-heading"><strong>{method.label}</strong><b>{formatCurrency(method.amount, business)}</b></div><span>{method.count} {method.count === 1 ? 'pago' : 'pagos'}</span><div className="reports-rank-track" aria-hidden="true"><span style={{ width: `${maxPaymentMethodAmount > 0 ? method.amount / maxPaymentMethodAmount * 100 : 0}%` }} /></div></div>
          </li>)}</ul> : <EmptyReport text="No se recibieron pagos en este período." />}
        </section>

        <section className="panel report-panel">
          <SectionTitle icon={<Activity size={18} />} title={report.collectionSeries.length > 31 ? 'Cobros por mes' : 'Cobros por día'} />
          {report.collectionSeries.some(point => point.amount > 0) ? <InlineBarChart
            trackClassName="reports-chart"
            ariaLabel={`Cobros por ${report.collectionSeries.length > 31 ? 'mes' : 'día'}: ${formatReportRange(selectedRange)}`}
            emptySelectionText="Selecciona o enfoca una barra para consultar la fecha y el monto cobrado."
            formatAmount={amount => formatCurrency(amount, business)}
            points={report.collectionSeries.map((point, index) => {
              const monthly = report.collectionSeries.length > 31
              const date = monthly ? localCalendarDate(`${point.date}-01`) : localCalendarDate(point.date)
              const label = new Intl.DateTimeFormat('es', monthly ? { month: 'long', year: 'numeric' } : { dateStyle: 'long' }).format(date)
              return { key: point.date, label, amount: point.amount, tick: chartTick(index, report.collectionSeries.length) ? chartDateLabel(point.date, monthly) : undefined }
            })}
          /> : <EmptyReport text="No se registraron cobros en este período." />}
          <p className="reports-panel-note">Solo pagos registrados; los pagos anulados no se incluyen.</p>
        </section>

        <section className="panel report-panel">
          <SectionTitle icon={<CalendarDays size={18} />} title="Entregas" />
          <ul className="reports-delivery-list"><li className="is-scheduled"><span>Programadas en el período</span><strong>{report.deliveries.scheduled}</strong></li><li className="is-delivered"><span>Entregadas en el período</span><strong>{report.deliveries.delivered}</strong></li><li className="is-overdue"><span>Atrasadas antes de hoy</span><strong>{report.deliveries.overdue}</strong></li></ul>
          <p className="reports-panel-note">Las entregas canceladas no cuentan como activas.</p>
        </section>

        <section className="panel report-panel reports-profitability">
          <SectionTitle icon={<Banknote size={18} />} title="Utilidad estimada" />
          {report.profitability.profit === null ? <><EmptyReport text="Sin datos de costos suficientes todavía." /><p className="reports-panel-note">Completa el Motor de Costos de tus cotizaciones para analizar rentabilidad.</p></> : <>
            <strong className="reports-profit-value">{formatCurrency(report.profitability.profit, business)}</strong>
            <p className="reports-panel-note">Utilidad conocida de pedidos no cancelados con costeo completo.</p>
            <div className="reports-cost-coverage"><progress max={report.profitability.billableOrderCount || 1} value={report.profitability.costedOrderCount} aria-label={`Costeo completo en ${report.profitability.costedOrderCount} de ${report.profitability.billableOrderCount} pedidos`} /><span>Cobertura de costos</span></div>
            <span className="reports-coverage">{report.profitability.costedOrderCount} de {report.profitability.billableOrderCount} pedidos con costeo completo</span>
            {report.profitability.uncostedOrderCount > 0 && <p className="reports-uncosted">{report.profitability.uncostedOrderCount} {report.profitability.uncostedOrderCount === 1 ? 'pedido sin información de costos' : 'pedidos sin información de costos'}</p>}
            {report.profitability.consolidatedMargin !== null && <div className="reports-profit-margin"><span>Margen sobre ventas costeadas</span><strong>{new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(report.profitability.consolidatedMargin)}%</strong></div>}
          </>}
        </section>
      </div>

      <section className="panel reports-order-detail">
        <div className="reports-detail-heading"><div><span className="eyebrow accent">ACTIVIDAD DEL PERÍODO</span><h2>Detalle de pedidos del período</h2><p className="muted">Incluye también los pedidos cancelados para que el historial esté completo.</p></div><button type="button" className="secondary-button reports-export" disabled={!report.periodOrders.length} onClick={exportCsv}><Download size={17} /> Exportar CSV</button></div>
        {report.periodOrders.length > 0 && <label className="quote-search-field reports-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Buscar en detalle de pedidos" placeholder="Buscar cliente, pedido o producto" value={search} onChange={event => setSearch(event.target.value)} />{search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => setSearch('')}>×</button>}</label>}
        {matchingOrders.length ? <div className="reports-order-list">{matchingOrders.map(order => <ReportOrderCard key={order.id} order={order} payments={payments} business={business} />)}</div> : report.periodOrders.length ? <div className="reports-no-matches"><Search size={19} /><strong>No encontramos pedidos</strong><span>Prueba con otro cliente, pedido o producto.</span></div> : <EmptyReport text="No hay pedidos creados en este período." />}
      </section>
    </>}
  </div>
}

function Metric({ icon, label, value, help, tone }: { icon: ReactNode; label: string; value: string; help: string; tone: string }) {
  return <article className={`reports-metric tone-${tone}`}><span className="reports-metric-icon">{icon}</span><span className="reports-metric-label">{label}</span><strong>{value}</strong><p>{help}</p></article>
}

function SectionTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return <div className="reports-section-title"><span>{icon}</span><h2>{title}</h2></div>
}

function EmptyReport({ text }: { text: string }) {
  return <div className="reports-empty"><AlertTriangle size={17} /><span>{text}</span></div>
}

function ReportOrderCard({ order, payments, business }: { order: Order; payments: Payment[]; business: Business }) {
  const summary = summarizePayments(order, payments)
  return <article className="reports-order-card">
    <div className="reports-order-card-heading"><strong>{order.order_number}</strong><span className={`status-badge status-${order.status}`}>{orderStatusText[order.status]}</span></div>
    <div className="reports-order-card-grid">
      <div><small>Cliente</small><strong>{order.customer_name}</strong></div>
      <div><small>Fecha creación</small><strong>{timestampLabel(order.created_at)}</strong></div>
      <div><small>Entrega</small><strong>{order.delivery_date ? dateLabel(order.delivery_date) : 'Por definir'}</strong></div>
      <div><small>Productos</small><strong>{summarizeOrderProducts(order.items ?? [], order.product)}</strong></div>
      <div><small>Total</small><strong>{formatCurrency(Number(order.total_amount), business)}</strong></div>
      <div><small>Pagado</small><strong>{formatCurrency(summary.totalPaid, business)}</strong></div>
      <div><small>Saldo</small><strong>{formatCurrency(summary.realBalance, business)}</strong></div>
    </div>
  </article>
}

function quantityLabel(quantity: number, unit: string | null) {
  const formatted = new Intl.NumberFormat('es', { maximumFractionDigits: 3 }).format(quantity)
  if (!unit) return `${formatted} vendidos`
  if (unit === 'unidad') return `${formatted} ${quantity === 1 ? 'unidad' : 'unidades'}`
  return `${formatted} ${unit}`
}

function chartDateLabel(key: string, monthly: boolean) {
  const date = monthly ? localCalendarDate(`${key}-01`) : localCalendarDate(key)
  return new Intl.DateTimeFormat('es', monthly ? { month: 'short' } : { day: 'numeric' }).format(date)
}

function chartTick(index: number, length: number) {
  if (length <= 7) return true
  if (length <= 31) return index === 0 || (index + 1) % 7 === 0 || index === length - 1
  return index === 0 || index === length - 1 || index % 2 === 0
}
