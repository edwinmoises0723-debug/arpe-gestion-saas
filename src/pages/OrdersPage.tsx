import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronRight, ClipboardList, Clock3, UserRound } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Business, Order, OrderStatus, Payment } from '../lib/database.types'
import { orderStatuses, listOrders, updateOrderStatus } from '../lib/orders'
import { listPayments, summarizePayments } from '../lib/payments'
import { formatCurrency } from '../lib/quotes'
import { errorMessage } from '../lib/supabase'
import { Loading, Notice } from '../components/Feedback'

const statusLabel = (status: OrderStatus) => orderStatuses.find(option => option.value === status)?.label ?? status
const deliveryDate = (value: string | null) => value ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value + 'T12:00:00')) : 'Por definir'

export function OrdersPage({ business }: { business: Business }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [selected, setSelected] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [params, setParams] = useSearchParams()
  const activeOrder = selected ?? orders.find(order => order.id === params.get('order')) ?? null

  useEffect(() => {
    let active = true
    void Promise.all([listOrders(business.id), listPayments(business.id)])
      .then(([rows, records]) => {
        if (!active) return
        setOrders(rows)
        setPayments(records)
      })
      .catch(e => { if (active) setError(errorMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [business.id])

  function openOrder(order: Order) { setSelected(order); setParams({ order: order.id }) }
  function closeOrder() { setSelected(null); setParams({}) }

  async function saveStatus(status: OrderStatus) {
    if (!activeOrder) return
    setBusy(true); setError('')
    try {
      const updated = await updateOrderStatus(activeOrder.id, status)
      setOrders(current => current.map(order => order.id === updated.id ? updated : order))
      setSelected(updated); setPendingStatus(null); setNotice('El pedido ' + updated.order_number + ' ahora está ' + statusLabel(status).toLowerCase() + '.')
    } catch (e) { setError(errorMessage(e)); setPendingStatus(null) } finally { setBusy(false) }
  }

  if (loading) return <Loading text="Cargando tus pedidos…" />
  if (activeOrder) {
    const order = activeOrder
    const summary = summarizePayments(order, payments)
    const hasReceivedMoney = summary.totalPaid > 0
    const hasPaymentHistory = payments.some(payment => payment.order_id === order.id)
    return <div className="orders-page">
      <button className="back-button" onClick={closeOrder}><ArrowLeft size={17} /> Pedidos</button>
      {error && <Notice error>{error}</Notice>}
      {notice && <div className="quote-notice"><Check size={17} /> {notice}</div>}
      <div className="page-heading order-detail-heading"><div><span className="eyebrow accent">PEDIDO · ORIGEN {order.source_quote_number}</span><h1>{order.order_number}</h1><p className="muted">Creado {new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(order.created_at))}</p></div><span className={'status-badge order-status status-' + order.status}>{statusLabel(order.status)}</span></div>
      <section className="order-detail-grid">
        <article className="panel order-detail-card"><div className="section-title"><span className="section-icon"><UserRound size={19} /></span><div><h2>Información del cliente</h2><p>Datos guardados desde la cotización original.</p></div></div><dl className="order-fields"><div><dt>Cliente</dt><dd>{order.customer_name}</dd></div><div><dt>Teléfono</dt><dd>{order.customer_phone || 'No indicado'}</dd></div></dl></article>
        <article className="panel order-detail-card"><div className="section-title"><span className="section-icon"><ClipboardList size={19} /></span><div><h2>Pedido</h2><p>{order.product}</p></div></div><dl className="order-fields"><div><dt>Porciones</dt><dd>{order.portions ?? 'No indicado'}</dd></div><div><dt>Sabor</dt><dd>{order.flavor || 'No indicado'}</dd></div><div><dt>Relleno</dt><dd>{order.filling || 'No indicado'}</dd></div><div><dt>Decoración</dt><dd>{order.decoration || 'No indicado'}</dd></div><div><dt>Extras</dt><dd>{order.extras || 'No indicado'}</dd></div><div><dt>Observaciones</dt><dd>{order.notes || 'Sin observaciones'}</dd></div></dl></article>
        <article className="panel order-detail-card"><div className="section-title"><span className="section-icon"><CalendarDays size={19} /></span><div><h2>Entrega</h2><p>Fecha y hora del pedido.</p></div></div><dl className="order-fields"><div><dt>Fecha</dt><dd>{deliveryDate(order.delivery_date)}</dd></div><div><dt>Hora</dt><dd>{order.delivery_time?.slice(0, 5) || 'Por definir'}</dd></div></dl></article>
        <article className="panel order-detail-card order-money-card"><div className="section-title"><span className="section-icon"><ClipboardList size={19} /></span><div><h2>Información comercial</h2><p>Solo los pagos registrados cuentan como dinero recibido.</p></div></div><dl className="order-fields"><div><dt>Precio total</dt><dd>{formatCurrency(Number(order.total_amount), business)}</dd></div><div><dt>Anticipo requerido</dt><dd>{formatCurrency(Number(order.deposit_required), business)}</dd></div><div><dt>Pagado realmente</dt><dd>{formatCurrency(summary.totalPaid, business)}</dd></div><div><dt>Saldo real por cobrar</dt><dd>{formatCurrency(summary.realBalance, business)}</dd></div><div><dt>Estado financiero</dt><dd>{summary.financialStatus}</dd></div></dl>{summary.depositShortfall > 0 && <p className="order-deposit-shortfall">Faltan {formatCurrency(summary.depositShortfall, business)} para cubrir el anticipo.</p>}{order.status !== 'cancelled' && summary.realBalance > 0 && <Link className="primary order-payment-link" to={'/pagos?order=' + encodeURIComponent(order.id)}>Registrar pago</Link>}{order.status === 'cancelled' && hasPaymentHistory && <p className="order-cancelled-money">Este pedido está cancelado y tiene pagos registrados. La gestión de devoluciones se incorporará posteriormente.</p>}</article>
      </section>
      <section className="panel order-status-panel"><div><h2>Estado del pedido</h2><p className="muted">Actualiza el avance para mantener tu seguimiento al día.</p></div><label>Estado<select value={order.status} disabled={busy} onChange={e => { const next = e.target.value as OrderStatus; if (next === 'delivered' || next === 'cancelled') setPendingStatus(next); else void saveStatus(next) }}>{orderStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label></section>
      {order.internal_cost_total !== null && <details className="panel private-order-costs"><summary>Información administrativa privada</summary><dl className="order-fields"><div><dt>Costo real total</dt><dd>{formatCurrency(Number(order.internal_cost_total), business)}</dd></div><div><dt>Ganancia estimada</dt><dd>{formatCurrency(Number(order.estimated_profit), business)}</dd></div><div><dt>Margen real sobre venta</dt><dd>{order.real_margin_percent === null ? 'No disponible' : Number(order.real_margin_percent).toFixed(2) + '%'}</dd></div></dl></details>}
      {pendingStatus && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="order-status-title"><span className="delete-icon"><Check size={22} /></span><h2 id="order-status-title">¿Cambiar a {statusLabel(pendingStatus).toLowerCase()}?</h2><p>Este cambio actualizará el estado de {order.order_number}.</p>{pendingStatus === 'cancelled' && hasReceivedMoney && <p className="order-cancelled-money">Este pedido tiene dinero recibido. Cancelarlo no anulará ni devolverá automáticamente esos pagos.</p>}<div><button className="secondary-button" onClick={() => setPendingStatus(null)}>Cancelar</button><button className="primary" onClick={() => void saveStatus(pendingStatus)}>Confirmar</button></div></section></div>}
    </div>
  }

  return <div className="orders-page"><div className="page-heading"><div><span className="eyebrow accent">TU ESPACIO DE TRABAJO</span><h1>Pedidos<span className="heading-dot">.</span></h1><p className="muted">Dale seguimiento a los trabajos confirmados de tu negocio.</p></div></div>{error && <Notice error>{error}</Notice>}{notice && <div className="quote-notice"><Check size={17} /> {notice}</div>}{orders.length === 0 ? <section className="panel quote-empty"><span className="empty-quote-icon"><ClipboardList size={35} /></span><span className="subtle-badge">PEDIDOS DE TU NEGOCIO</span><h2>Tus pedidos aparecerán aquí</h2><p>Cuando una cotización sea aceptada, podrás convertirla en pedido y darle seguimiento desde este espacio.</p><Link to="/cotizar" className="primary">Ir a Cotizaciones <ChevronRight size={17} /></Link></section> : <section className="orders-list" aria-label="Listado de pedidos">{orders.map(order => {
    const summary = summarizePayments(order, payments)
    return <button type="button" className="order-list-card" key={order.id} onClick={() => openOrder(order)}><div className="order-card-top"><span className="quote-number">{order.order_number}</span><span className={'status-badge order-status status-' + order.status}>{statusLabel(order.status)}</span></div><div className="order-card-main"><div><h2>{order.customer_name}</h2><p>{order.product}</p></div><strong>{formatCurrency(Number(order.total_amount), business)}</strong></div><div className="order-card-bottom"><span>Pagado {formatCurrency(summary.totalPaid, business)}</span><span>Saldo {formatCurrency(summary.realBalance, business)}</span><span>{summary.financialStatus}</span><span>Origen: {order.source_quote_number}</span><span><CalendarDays size={14} /> {deliveryDate(order.delivery_date)}</span>{order.delivery_time && <span><Clock3 size={14} /> {order.delivery_time.slice(0, 5)}</span>}</div></button>
  })}</section>}</div>
}
