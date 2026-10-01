import { summarizeOrderProducts } from '../lib/products'
import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, ArrowRight, Banknote, CalendarDays, Check, ClipboardList, Clock3, FilePenLine, PackageCheck, RefreshCw, Settings, ShoppingBag, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Business } from '../lib/database.types'
import { currencies } from '../lib/business'
import { listQuotes } from '../lib/quotes'
import { listOrders } from '../lib/orders'
import { listPayments } from '../lib/payments'
import { agendaDateKey, localCalendarDate } from '../lib/agenda'
import { formatDeliveryTime } from '../lib/delivery-time'
import { formatCurrency } from '../lib/quotes'
import { errorMessage } from '../lib/supabase'
import { getDashboardAlerts, getDashboardFinancialMetrics, getDashboardOrderMetrics, getDashboardQuoteMetrics, getRecentPayments, getUpcomingDeliveries, groupPostedPaymentsByLocalDate, paymentMethodLabel, type DashboardData } from '../lib/dashboard'
import { Loading, Notice } from '../components/Feedback'
import { BusinessLogo } from '../components/BusinessLogo'
import { sections } from '../lib/navigation'

const orderStatusLabels = {
  confirmed: 'Confirmados', in_preparation: 'En preparación', ready: 'Listos', delivered: 'Entregados', cancelled: 'Cancelados',
} as const

function greeting(hour: number) {
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function localDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(localCalendarDate(dateKey))
}

export function Dashboard({ business }: { business: Business }) {
  const [loadedData, setLoadedData] = useState<(DashboardData & { businessId: string }) | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(true)
  const [error, setError] = useState('')

  function refreshDashboard() {
    setRefreshing(true)
    setRefreshKey(key => key + 1)
  }

  useEffect(() => {
    let active = true
    void Promise.all([listQuotes(business.id), listOrders(business.id), listPayments(business.id)])
      .then(([quotes, orders, payments]) => {
        if (!active) return
        setLoadedData({ businessId: business.id, quotes, orders, payments })
        setError('')
      })
      .catch(reason => { if (active) setError(errorMessage(reason)) })
      .finally(() => { if (active) setRefreshing(false) })
    return () => { active = false }
  }, [business.id, refreshKey])

  const now = new Date()
  const today = agendaDateKey(now)
  const data = loadedData?.businessId === business.id ? loadedData : null
  const currency = currencies.find(option => option.code === business.currency)
  const completedProfileFields = [business.name, business.logo_path, business.slogan, business.description, business.whatsapp, business.email, business.address].filter(Boolean).length

  if (!data && (refreshing || Boolean(loadedData && loadedData.businessId !== business.id))) return <Loading text="Cargando el resumen de tu negocio…" />
  if (!data) return <div className="dashboard-page"><DashboardHeading businessName={business.name} today={today} hour={now.getHours()} onRefresh={refreshDashboard} refreshing={refreshing} />{error && <Notice error>{error}</Notice>}<section className="panel dashboard-load-error"><AlertTriangle size={22} /><div><h2>No pudimos cargar tus indicadores</h2><p>Revisa tu conexión e inténtalo de nuevo. No mostraremos cifras hasta tener los datos actualizados.</p></div><button type="button" className="secondary-button" onClick={refreshDashboard}>Reintentar</button></section></div>

  const financial = getDashboardFinancialMetrics(data.orders, data.payments)
  const orderMetrics = getDashboardOrderMetrics(data.orders, today)
  const quoteMetrics = getDashboardQuoteMetrics(data.quotes)
  const alerts = getDashboardAlerts(data.orders, data.payments, today)
  const upcoming = getUpcomingDeliveries(data.orders, data.payments, today, 5)
  const recentPayments = getRecentPayments(data.payments, data.orders, 5)
  const paymentSeries = groupPostedPaymentsByLocalDate(data.payments, today)
  const paymentPeriodTotal = paymentSeries.reduce((sum, point) => sum + point.amount, 0)
  const peakPaymentDay = paymentSeries.reduce<(typeof paymentSeries)[number] | null>((peak, point) => point.amount > (peak?.amount ?? 0) ? point : peak, null)
  const paymentSeriesHasValues = paymentPeriodTotal > 0
  const maxPayment = Math.max(...paymentSeries.map(point => point.amount), 0)
  const statusTotal = Object.values(orderMetrics.byStatus).reduce((sum, count) => sum + count, 0)
  const profileCurrency = currency ? `${currency.code} · ${currency.symbol}` : business.currency

  return <div className="dashboard-page">
    <DashboardHeading businessName={business.name} today={today} hour={now.getHours()} onRefresh={refreshDashboard} refreshing={refreshing} />
    {error && <Notice error>{error} Se conservan los últimos datos cargados. <button type="button" className="dashboard-inline-retry" onClick={refreshDashboard}>Reintentar</button></Notice>}

    <section className="dashboard-financial-grid" aria-label="Indicadores financieros principales">
      <MetricCard icon={<Banknote size={19} />} label="Ventas registradas" value={formatCurrency(financial.registeredSales, business)} help="Valor total de tus pedidos no cancelados." tone="green" />
      <MetricCard icon={<Wallet size={19} />} label="Dinero cobrado" value={formatCurrency(financial.collectedMoney, business)} help="Dinero que realmente has recibido." tone="cream" />
      <MetricCard icon={<Activity size={19} />} label="Saldo por cobrar" value={formatCurrency(financial.receivableBalance, business)} help="Dinero que todavía está pendiente de recibir." tone="sand" />
      <MetricCard icon={<PackageCheck size={19} />} label="Pedidos activos" value={String(orderMetrics.active)} help="Confirmados, en preparación o listos." tone="sage" />
    </section>

    <section className="dashboard-quick-metrics" aria-label="Resumen de entregas y ticket">
      <SmallMetric icon={<CalendarDays size={17} />} label="Entregas hoy" value={String(orderMetrics.deliveriesToday)} />
      <SmallMetric icon={<Clock3 size={17} />} label="Próximas entregas" value={String(orderMetrics.upcomingDeliveries)} />
      <SmallMetric icon={<AlertTriangle size={17} />} label="Entregas atrasadas" value={String(orderMetrics.overdueDeliveries)} tone={orderMetrics.overdueDeliveries ? 'warning' : undefined} />
      <SmallMetric icon={<ShoppingBag size={17} />} label="Ticket promedio" value={formatCurrency(financial.averageTicket, business)} />
    </section>

    <div className="dashboard-main-grid">
      <section className="panel dashboard-attention">
        <SectionHeading icon={<AlertTriangle size={18} />} eyebrow="SEGUIMIENTO" title="Necesita tu atención" />
        {alerts.length === 0 ? <div className="dashboard-all-clear"><span><Check size={19} /></span><div><h3>Todo bajo control</h3><p>No hay situaciones urgentes que requieran tu atención.</p></div></div> : <ul className="dashboard-alert-list">{alerts.map((alert, index) => <li key={`${alert.type}-${alert.order.id}-${index}`}>
          <span className="dashboard-alert-marker"><AlertTriangle size={16} /></span>
          <div className="dashboard-alert-copy">{alert.type === 'overdue' && <><strong>{alert.order.order_number}</strong> tiene una entrega atrasada.</>}{alert.type === 'delivered-balance' && <><strong>{alert.order.customer_name}</strong>: pedido entregado con {formatCurrency(alert.balance, business)} pendientes.</>}{alert.type === 'deposit-shortfall' && <><strong>{alert.order.customer_name}</strong>: faltan {formatCurrency(alert.shortfall, business)} para cubrir el anticipo.</>}{alert.type === 'no-delivery-date' && <><strong>{alert.order.order_number}</strong> todavía no tiene fecha de entrega.</>}{alert.type === 'cancelled-with-payment' && <><strong>{alert.order.order_number}</strong> está cancelado y conserva {formatCurrency(alert.received, business)} recibidos. La gestión de devolución está pendiente.</>}</div>
          <div className="dashboard-alert-actions">{alert.type === 'delivered-balance' ? <><Link to={`/pedidos?order=${encodeURIComponent(alert.order.id)}`}>Ver pedido</Link><Link to={`/pagos?order=${encodeURIComponent(alert.order.id)}`}>Ver pagos</Link></> : alert.type === 'deposit-shortfall' || alert.type === 'cancelled-with-payment' ? <Link to={`/pagos?order=${encodeURIComponent(alert.order.id)}`}>Ver pagos <ArrowRight size={14} /></Link> : <Link to={`/pedidos?order=${encodeURIComponent(alert.order.id)}`}>Ver pedido <ArrowRight size={14} /></Link>}</div>
        </li>)}</ul>}
      </section>

      <section className="panel dashboard-business-card">
        <div className="dashboard-business-heading"><div><span className="eyebrow accent">TU NEGOCIO</span><h2>{business.name}</h2></div><Link to="/configuracion" className="dashboard-icon-link" aria-label="Editar configuración del negocio"><Settings size={18} /></Link></div>
        <div className="dashboard-business-identity"><BusinessLogo path={business.logo_path} name={business.name} /><div><strong>{business.name}</strong><span>{profileCurrency}</span></div><span className="dashboard-active"><i /> Activo</span></div>
        <div className="dashboard-profile-progress"><div><span>Perfil completado</span><strong>{Math.round(completedProfileFields / 7 * 100)}% · {completedProfileFields} de 7</strong></div><progress max={7} value={completedProfileFields} aria-label={`${completedProfileFields} de 7 datos del perfil completados`} /></div>
        <Link className="dashboard-text-link" to="/configuracion">Configuración del negocio <ArrowRight size={15} /></Link>
      </section>
    </div>

    <div className="dashboard-data-grid">
      <section className="panel dashboard-deliveries">
        <SectionHeading icon={<CalendarDays size={18} />} eyebrow="ORGANIZA TU DÍA" title="Próximas entregas" action={<Link to="/agenda" className="dashboard-section-link">Ver Agenda <ArrowRight size={15} /></Link>} />
        {upcoming.length === 0 ? <DashboardEmpty title="No hay entregas próximas" text="Cuando un pedido activo tenga fecha de entrega, aparecerá aquí." /> : <ul className="dashboard-delivery-list">{upcoming.map(({ order, balance }) => <li key={order.id}>
          <div className="dashboard-delivery-date"><strong>{new Intl.DateTimeFormat('es', { day: 'numeric' }).format(localCalendarDate(order.delivery_date!))}</strong><span>{new Intl.DateTimeFormat('es', { month: 'short' }).format(localCalendarDate(order.delivery_date!))}</span></div>
          <div className="dashboard-delivery-info"><Link to={`/pedidos?order=${encodeURIComponent(order.id)}`} className="dashboard-delivery-customer">{order.customer_name}</Link><span>{summarizeOrderProducts(order.items ?? [], order.product)} · {order.order_number}</span><span>{localDateLabel(order.delivery_date!)}{order.delivery_time ? ` · ${formatDeliveryTime(order.delivery_time)}` : ' · Hora por definir'}</span></div>
          <div className="dashboard-delivery-side"><span className={`dashboard-status-pill status-${order.status}`}>{orderStatusLabels[order.status]}</span><span className="dashboard-delivery-balance">Saldo {formatCurrency(balance, business)}</span><Link to={`/pedidos?order=${encodeURIComponent(order.id)}`}>Ver pedido</Link></div>
        </li>)}</ul>}
      </section>

      <section className="panel dashboard-collected-chart">
        <SectionHeading icon={<Banknote size={18} />} eyebrow="ACTIVIDAD DE PAGOS" title="Dinero cobrado · últimos 30 días" />
        {paymentSeriesHasValues ? <>
          <div className="dashboard-chart-summary"><strong>{formatCurrency(paymentPeriodTotal, business)}</strong><span>recibidos en este período</span></div>
          <div className="dashboard-bar-chart" role="img" aria-label={`Cobros de los últimos 30 días. Total ${formatCurrency(paymentPeriodTotal, business)}. Día con más cobros: ${peakPaymentDay ? `${localDateLabel(peakPaymentDay.date)}, ${formatCurrency(peakPaymentDay.amount, business)}` : 'sin datos'}`}>
            {paymentSeries.map(point => <span key={point.date} title={`${localDateLabel(point.date)}: ${formatCurrency(point.amount, business)}`} style={{ height: `${maxPayment > 0 ? Math.max(point.amount > 0 ? 8 : 2, (point.amount / maxPayment) * 100) : 2}%` }} />)}
          </div>
          <div className="dashboard-chart-axis"><span>{new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' }).format(localCalendarDate(paymentSeries[0].date))}</span><span>Hoy</span></div>
          {peakPaymentDay && <p className="dashboard-chart-note">Día con más cobros: {localDateLabel(peakPaymentDay.date)} · {formatCurrency(peakPaymentDay.amount, business)}.</p>}
        </> : <DashboardEmpty title="Aún no hay cobros en este período" text="Aquí verás el dinero recibido durante los últimos 30 días." />}
      </section>

      <section className="panel dashboard-order-status">
        <SectionHeading icon={<ClipboardList size={18} />} eyebrow="VISTA GENERAL" title="Estado de tus pedidos" action={<Link to="/pedidos" className="dashboard-section-link">Ver pedidos <ArrowRight size={15} /></Link>} />
        {statusTotal > 0 && <div className="dashboard-status-bar" role="img" aria-label="Distribución de pedidos por estado">{(Object.keys(orderStatusLabels) as (keyof typeof orderStatusLabels)[]).map(status => <span key={status} className={`status-segment status-${status}`} title={`${orderStatusLabels[status]}: ${orderMetrics.byStatus[status]}`} style={{ width: `${(orderMetrics.byStatus[status] / statusTotal) * 100}%` }} />)}</div>}
        <ul className="dashboard-status-counts">{(Object.keys(orderStatusLabels) as (keyof typeof orderStatusLabels)[]).map(status => <li key={status}><span className={`status-dot status-${status}`} />{orderStatusLabels[status]}<strong>{orderMetrics.byStatus[status]}</strong></li>)}</ul>
        {statusTotal === 0 && <p className="dashboard-empty-inline">Todavía no hay pedidos registrados.</p>}
      </section>

      <section className="panel dashboard-quotes">
        <SectionHeading icon={<FilePenLine size={18} />} eyebrow="PROPUESTAS" title="Cotizaciones" action={<Link to="/cotizar" className="dashboard-section-link">Ver cotizaciones <ArrowRight size={15} /></Link>} />
        <div className="dashboard-quote-counts"><QuoteCount label="Borradores" count={quoteMetrics.draft} /><QuoteCount label="Enviadas" count={quoteMetrics.sent} /><QuoteCount label="Aceptadas" count={quoteMetrics.accepted} /><QuoteCount label="Rechazadas" count={quoteMetrics.rejected} /></div>
        <div className="dashboard-generated-orders"><PackageCheck size={17} /><span>Pedidos generados</span><strong>{data.orders.length}</strong></div>
      </section>

      <section className="panel dashboard-profit">
        <SectionHeading icon={<Activity size={18} />} eyebrow="INFORMACIÓN INTERNA" title="Utilidad estimada" />
        {financial.estimatedProfit === null ? <DashboardEmpty title="Sin datos de costos todavía" text="Los pedidos con Motor de Costos permitirán calcular este indicador." /> : <><strong className="dashboard-profit-value">{formatCurrency(financial.estimatedProfit, business)}</strong><p>Calculada solo con pedidos no cancelados que tienen costeo.</p><span className="dashboard-cost-coverage">Costeo disponible en {financial.costedOrderCount} de {financial.nonCancelledOrderCount} pedidos.</span></>}
      </section>

      <section className="panel dashboard-recent-payments">
        <SectionHeading icon={<Wallet size={18} />} eyebrow="PAGOS REGISTRADOS" title="Últimos movimientos" action={<Link to="/pagos" className="dashboard-section-link">Ver todos los pagos <ArrowRight size={15} /></Link>} />
        {recentPayments.length === 0 ? <DashboardEmpty title="Aún no hay movimientos" text="Los pagos que registres aparecerán en este historial." /> : <ul className="dashboard-payment-list">{recentPayments.map(({ payment, order }) => <li key={payment.id}>
          <div className={`dashboard-payment-icon${payment.status === 'voided' ? ' is-voided' : ''}`}><Wallet size={17} /></div>
          <div className="dashboard-payment-main"><strong>{payment.payment_number}</strong><span>{order ? `${order.customer_name} · ${order.order_number}` : 'Pedido relacionado no disponible'}</span><small>{new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(payment.paid_at))} · {paymentMethodLabel(payment.method)}</small></div>
          <div className="dashboard-payment-amount"><strong>{formatCurrency(Number(payment.amount), business)}</strong><span className={`dashboard-payment-status${payment.status === 'voided' ? ' is-voided' : ''}`}>{payment.status === 'posted' ? 'Registrado' : 'Anulado'}</span></div>
        </li>)}</ul>}
      </section>
    </div>

    <section className="dashboard-bottom-grid">
      <section className="panel dashboard-quick-actions"><SectionHeading icon={<ArrowRight size={18} />} eyebrow="ACCESO DIRECTO" title="Acciones rápidas" /><div className="dashboard-action-links"><Link to="/cotizar"><FilePenLine size={17} /> Cotizar</Link><Link to="/pedidos"><ClipboardList size={17} /> Pedidos</Link><Link to="/pagos"><Wallet size={17} /> Pagos</Link><Link to="/agenda"><CalendarDays size={17} /> Agenda</Link></div></section>
    </section>
  </div>
}

function DashboardHeading({ businessName, today, hour, onRefresh, refreshing }: { businessName: string; today: string; hour: number; onRefresh: () => void; refreshing: boolean }) {
  return <header className="dashboard-heading"><div><span className="eyebrow accent">TU NEGOCIO, EN UN VISTAZO</span><h1>{greeting(hour)}.</h1><p className="muted">Así va <strong>{businessName}</strong> hoy.</p><span className="dashboard-local-date">{localDateLabel(today)}</span></div><button type="button" className="dashboard-refresh" onClick={onRefresh} disabled={refreshing} aria-label={refreshing ? 'Actualizando indicadores' : 'Actualizar indicadores'}><RefreshCw size={16} className={refreshing ? 'is-refreshing' : ''} />{refreshing ? 'Actualizando…' : 'Actualizar'}</button></header>
}

function MetricCard({ icon, label, value, help, tone }: { icon: React.ReactNode; label: string; value: string; help: string; tone: 'green' | 'cream' | 'sand' | 'sage' }) {
  return <article className={`dashboard-metric-card tone-${tone}`}><span className="dashboard-metric-icon">{icon}</span><span className="dashboard-metric-label">{label}</span><strong>{value}</strong><p>{help}</p></article>
}

function SmallMetric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'warning' }) {
  return <article className={`dashboard-small-metric${tone ? ` is-${tone}` : ''}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>
}

function SectionHeading({ icon, eyebrow, title, action }: { icon: React.ReactNode; eyebrow: string; title: string; action?: React.ReactNode }) {
  return <div className="dashboard-section-heading"><span className="dashboard-section-icon">{icon}</span><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>{action}</div>
}

function DashboardEmpty({ title, text }: { title: string; text: string }) {
  return <div className="dashboard-empty"><h3>{title}</h3><p>{text}</p></div>
}

function QuoteCount({ label, count }: { label: string; count: number }) {
  return <div><strong>{count}</strong><span>{label}</span></div>
}

export function Upcoming({ name }: { name: string }) {
  const section = sections.find(item => item.label === name)!
  const Icon = section.icon
  return <><div className="page-heading"><div><span className="eyebrow accent">TU ESPACIO DE TRABAJO</span><h1>{name}</h1></div></div><section className="panel upcoming"><span className="upcoming-icon"><Icon size={36} /></span><span className="subtle-badge">PRÓXIMA FASE</span><h2>Estamos preparando este espacio</h2><p>El módulo de {name.toLowerCase()} llegará en una próxima etapa. Por ahora, puedes crear y personalizar tu negocio.</p><Link to="/" className="primary">Volver a Inicio <ArrowRight size={17} /></Link></section></>
}
