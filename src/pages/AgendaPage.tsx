import { summarizeOrderProducts } from '../lib/products'
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, CalendarDays, Check, Clock3, Search, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Loading, Notice } from '../components/Feedback'
import type { Business, Order, OrderStatus, Payment } from '../lib/database.types'
import { agendaDateKey, agendaGroupLabels, countDeliveriesForDate, filterAgendaOrders, getAgendaMetrics, getAgendaPaymentStatus, groupAgendaOrders, localCalendarDate, type AgendaFilter, type AgendaGroupKey } from '../lib/agenda'
import { listOrders } from '../lib/orders'
import { listPayments } from '../lib/payments'
import { formatCurrency } from '../lib/quotes'
import { errorMessage } from '../lib/supabase'
import { formatDeliveryTime } from '../lib/delivery-time'

const statusLabels: Record<OrderStatus, string> = {
  confirmed: 'Confirmado', in_preparation: 'En preparación', ready: 'Listo', delivered: 'Entregado', cancelled: 'Cancelado',
}
const filterOptions: { value: AgendaFilter; label: string }[] = [
  { value: 'all', label: 'Todos' }, { value: 'pending', label: 'Pendientes' },
  { value: 'ready', label: 'Listos' }, { value: 'delivered', label: 'Entregados' },
]
const listGroupOrder: AgendaGroupKey[] = ['overdue', 'today', 'tomorrow', 'nextSevenDays', 'later', 'undated', 'delivered', 'cancelled']
const weekdays = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(localCalendarDate(value))
}

function getCalendarDates(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1, 12)
  const mondayOffset = (firstDay.getDay() + 6) % 7
  const firstCell = new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset, 12)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell)
    date.setDate(firstCell.getDate() + index)
    return date
  })
}

function OrderDeliveryCard({ order, payments, business }: { order: Order; payments: Payment[]; business: Business }) {
  const finance = getAgendaPaymentStatus(order, payments)
  const financeText = finance.status === 'Saldo pendiente' ? `${finance.status} ${formatCurrency(finance.balance, business)}` : finance.status

  return <article className={`agenda-order-card${order.status === 'cancelled' ? ' is-cancelled' : ''}`}>
    <div className="agenda-order-time"><Clock3 size={16} /><span>{formatDeliveryTime(order.delivery_time)}</span></div>
    <div className="agenda-order-content">
      <div className="agenda-order-top"><span className="quote-number">{order.order_number}</span><span className={`status-badge order-status status-${order.status}`}>{statusLabels[order.status]}</span></div>
      <h3>{order.customer_name}</h3>
      <p className="agenda-order-product">{summarizeOrderProducts(order.items ?? [], order.product)}</p>
      <div className="agenda-order-meta"><span><UserRound size={14} /> {formatCurrency(Number(order.total_amount), business)}</span><span className={finance.balance > 0 ? 'agenda-balance-pending' : 'agenda-balance-paid'}>{financeText}</span></div>
      {order.status !== 'delivered' && order.status !== 'cancelled' && order.delivery_date && order.delivery_date < agendaDateKey(new Date()) && <p className="agenda-overdue-note"><span>Entrega atrasada</span> Revisa el seguimiento desde el pedido.</p>}
      <div className="agenda-order-actions"><Link to={`/pedidos?order=${encodeURIComponent(order.id)}`} className="text-link">Ver pedido <ArrowRight size={15} /></Link><Link to={`/pagos?order=${encodeURIComponent(order.id)}`} className="agenda-payments-link">Ver pagos</Link></div>
    </div>
  </article>
}

export function AgendaPage({ business }: { business: Business }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [filter, setFilter] = useState<AgendaFilter>('pending')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1, 12)
  })
  const [selectedDate, setSelectedDate] = useState(() => agendaDateKey(new Date()))
  const today = agendaDateKey(new Date())

  useEffect(() => {
    let active = true
    void Promise.all([listOrders(business.id), listPayments(business.id)])
      .then(([orderRows, paymentRows]) => {
        if (!active) return
        setOrders(orderRows)
        setPayments(paymentRows)
        setError('')
      })
      .catch(reason => { if (active) setError(errorMessage(reason)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [business.id, retry])

  const metrics = useMemo(() => getAgendaMetrics(orders, today), [orders, today])
  const visibleOrders = useMemo(() => filterAgendaOrders(orders, filter, search), [orders, filter, search])
  const groups = useMemo(() => groupAgendaOrders(visibleOrders, today), [visibleOrders, today])
  const calendarDates = useMemo(() => getCalendarDates(calendarMonth), [calendarMonth])
  const selectedDateOrders = useMemo(() => visibleOrders.filter(order => order.delivery_date === selectedDate), [visibleOrders, selectedDate])
  const anyUndated = visibleOrders.some(order => order.delivery_date === null)

  if (loading) return <Loading text="Organizando tus entregas…" />
  if (error && orders.length === 0) return <div className="agenda-page"><div className="page-heading"><div><span className="eyebrow accent">ENTREGAS DE TUS PEDIDOS</span><h1>Agenda<span className="heading-dot">.</span></h1></div></div><section className="panel agenda-load-error"><Notice error>{error}</Notice><button type="button" className="primary" onClick={() => { setLoading(true); setError(''); setRetry(value => value + 1) }}>Reintentar</button></section></div>

  return <div className="agenda-page">
    <div className="page-heading"><div><span className="eyebrow accent">ENTREGAS DE TUS PEDIDOS</span><h1>Agenda<span className="heading-dot">.</span></h1><p className="muted">Las fechas se actualizan automáticamente desde cada pedido.</p></div></div>
    {error && <Notice error>{error}</Notice>}
    <section className="agenda-metrics" aria-label="Resumen de entregas">
      <article className="panel agenda-metric-card"><span className="agenda-metric-icon"><CalendarDays size={19} /></span><div><span>Hoy</span><strong>{metrics.today}</strong><small>{metrics.today === 1 ? 'entrega activa' : 'entregas activas'}</small></div></article>
      <article className="panel agenda-metric-card"><span className="agenda-metric-icon"><ArrowRight size={19} /></span><div><span>Próximas</span><strong>{metrics.upcoming}</strong><small>con fecha futura</small></div></article>
      <article className="panel agenda-metric-card is-overdue"><span className="agenda-metric-icon"><Clock3 size={19} /></span><div><span>Atrasadas</span><strong>{metrics.overdue}</strong><small>requieren seguimiento</small></div></article>
    </section>

    {orders.length === 0 ? <section className="panel quote-empty agenda-empty"><span className="empty-quote-icon"><CalendarDays size={35} /></span><span className="subtle-badge">AGENDA DE ENTREGAS</span><h2>Tu agenda está al día</h2><p>Las fechas de entrega de tus pedidos aparecerán automáticamente aquí.</p></section> : <>
      <section className="agenda-tools" aria-label="Opciones de agenda">
        <div className="agenda-view-switch" role="group" aria-label="Tipo de vista"><button type="button" className={view === 'list' ? 'is-active' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}>Lista</button><button type="button" className={view === 'calendar' ? 'is-active' : ''} aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>Calendario</button></div>
        <label className="agenda-search"><Search size={17} /><span className="sr-only">Buscar cliente, pedido o producto</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar cliente, pedido o producto" /></label>
      </section>
      <div className="agenda-filters" role="group" aria-label="Filtrar entregas">{filterOptions.map(option => <button type="button" key={option.value} className={filter === option.value ? 'is-active' : ''} aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</button>)}</div>

      {view === 'list' ? <div className="agenda-list-view">
        {visibleOrders.length === 0 ? <section className="panel agenda-no-results"><Search size={22} /><h2>No encontramos entregas</h2><p>Prueba con otro nombre, producto o número de pedido.</p></section> : listGroupOrder.map(groupKey => {
          if (groupKey === 'undated' && !anyUndated) return null
          const groupedOrders = groups[groupKey]
          if (groupedOrders.length === 0) return null
          return <section className={`agenda-group agenda-group-${groupKey}`} key={groupKey}>
            <div className="agenda-group-heading"><h2>{agendaGroupLabels[groupKey]}</h2><span>{groupedOrders.length}</span></div>
            <div className="agenda-order-list">{groupedOrders.map(order => <OrderDeliveryCard key={order.id} order={order} payments={payments} business={business} />)}</div>
          </section>
        })}
      </div> : <section className="panel agenda-calendar-panel" aria-label="Calendario mensual de entregas">
        <div className="agenda-calendar-heading"><button type="button" className="icon-button" aria-label="Mes anterior" onClick={() => setCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))}><ArrowLeft size={18} /></button><h2>{new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(calendarMonth)}</h2><button type="button" className="icon-button" aria-label="Mes siguiente" onClick={() => setCalendarMonth(month => new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))}><ArrowRight size={18} /></button><button type="button" className="agenda-today-button" onClick={() => { const now = new Date(); const key = agendaDateKey(now); setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1, 12)); setSelectedDate(key) }}>Hoy</button></div>
        <div className="agenda-calendar-grid" role="grid" aria-label="Días del mes">{weekdays.map(day => <span className="agenda-weekday" key={day}>{day}</span>)}{calendarDates.map(date => {
          const key = agendaDateKey(date)
          const count = countDeliveriesForDate(visibleOrders, key)
          const selected = key === selectedDate
          const isToday = key === today
          return <button type="button" role="gridcell" key={key} aria-pressed={selected} aria-label={`${formatLongDate(key)}${count ? `, ${count} ${count === 1 ? 'entrega' : 'entregas'}` : ', sin entregas'}`} className={`agenda-day${date.getMonth() !== calendarMonth.getMonth() ? ' is-outside' : ''}${selected ? ' is-selected' : ''}${isToday ? ' is-today' : ''}`} onClick={() => setSelectedDate(key)}><strong>{date.getDate()}</strong>{count > 0 && <small>{count} {count === 1 ? 'entrega' : 'entregas'}</small>}</button>
        })}</div>
        <section className="agenda-selected-day"><div className="agenda-selected-day-heading"><div><span className="eyebrow accent">ENTREGAS DEL DÍA</span><h3>{formatLongDate(selectedDate)}</h3></div><span className="subtle-badge">{selectedDateOrders.length} {selectedDateOrders.length === 1 ? 'PEDIDO' : 'PEDIDOS'}</span></div>
          {selectedDateOrders.length === 0 ? <p className="agenda-day-empty">No hay entregas programadas para este día.</p> : <div className="agenda-order-list">{selectedDateOrders.map(order => <OrderDeliveryCard key={order.id} order={order} payments={payments} business={business} />)}</div>}
        </section>
      </section>}
      {view === 'list' && groups.undated.length > 0 && <p className="agenda-undated-help"><Check size={15} /> Estos pedidos todavía no tienen fecha de entrega. Puedes revisarlos desde el detalle del pedido.</p>}
    </>}
  </div>
}
