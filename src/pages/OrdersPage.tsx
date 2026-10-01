import { summarizeOrderProducts } from '../lib/products'
import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronRight, CircleAlert, ClipboardList, Clock3, FileText, RotateCcw, UserRound } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Business, Order, OrderDeliveryHistory, OrderStatus, Payment } from '../lib/database.types'
import { orderStatuses, listOrderDeliveryHistory, listOrders, rescheduleOrderDelivery, updateOrderStatus } from '../lib/orders'
import { listPayments, summarizePayments } from '../lib/payments'
import { formatCurrency } from '../lib/quotes'
import { errorMessage } from '../lib/supabase'
import { Loading, Notice } from '../components/Feedback'
import { deliveryTimeFromParts, deliveryTimeToParts, formatDeliveryTime, type DeliveryTimeParts } from '../lib/delivery-time'

const statusLabel = (status: OrderStatus) => orderStatuses.find(option => option.value === status)?.label ?? status
const deliveryDate = (value: string | null) => value ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value + 'T12:00:00')) : 'Por definir'
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const deliveryMoment = (date: string | null, time: string | null) => `${deliveryDate(date)}${time ? ` a las ${formatDeliveryTime(time)}` : ' · Hora por definir'}`

export function OrdersPage({ business }: { business: Business }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [selected, setSelected] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pendingStatus, setPendingStatus] = useState<OrderStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [deliveryHistoryState, setDeliveryHistoryState] = useState<{ orderId: string; rows: OrderDeliveryHistory[] } | null>(null)
  const [params, setParams] = useSearchParams()
  const activeOrder = selected ?? orders.find(order => order.id === params.get('order')) ?? null
  const activeOrderId = activeOrder?.id
  const deliveryHistory = activeOrder && deliveryHistoryState?.orderId === activeOrder.id ? deliveryHistoryState.rows : []

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

  useEffect(() => {
    if (!activeOrderId) return
    let active = true
    void listOrderDeliveryHistory(activeOrderId, business.id)
      .then(rows => { if (active) setDeliveryHistoryState({ orderId: activeOrderId, rows }) })
      .catch(e => { if (active) setError(errorMessage(e)) })
    return () => { active = false }
  }, [activeOrderId, business.id, historyRefresh])

  function openOrder(order: Order) { setSelected(order); setParams({ order: order.id }) }
  function closeOrder() { setSelected(null); setParams({}) }

  async function saveStatus(status: OrderStatus) {
    if (!activeOrder) return
    setBusy(true); setError('')
    try {
      const updated = await updateOrderStatus(activeOrder.id, status)
      setOrders(current => current.map(order => order.id === updated.id ? { ...updated, items: order.items } : order))
      setSelected({ ...updated, items: activeOrder.items }); setPendingStatus(null); setNotice('El pedido ' + updated.order_number + ' ahora está ' + statusLabel(status).toLowerCase() + '.')
    } catch (e) { setError(errorMessage(e)); setPendingStatus(null) } finally { setBusy(false) }
  }

  async function saveDelivery(input: { date: string; time: string | null; reason: string }) {
    if (!activeOrder) return
    setBusy(true); setError('')
    try {
      const updated = await rescheduleOrderDelivery({ orderId: activeOrder.id, deliveryDate: input.date, deliveryTime: input.time, reason: input.reason })
      setOrders(current => current.map(order => order.id === updated.id ? { ...updated, items: order.items } : order))
      setSelected({ ...updated, items: activeOrder.items })
      setRescheduleOpen(false)
      setHistoryRefresh(value => value + 1)
      setNotice(`Entrega reprogramada. La nueva entrega quedó programada para el ${deliveryMoment(updated.delivery_date, updated.delivery_time)}. Agenda ya fue actualizada.`)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
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
      <div className="order-client-document-action"><Link className="secondary-button" to={`/documento/pedido/${encodeURIComponent(order.id)}`}><FileText size={16} /> Documento del pedido</Link></div><section className="order-detail-grid">
        <article className="panel order-detail-card"><div className="section-title"><span className="section-icon"><UserRound size={19} /></span><div><h2>Información del cliente</h2><p>Datos guardados desde la cotización original.</p></div></div><dl className="order-fields"><div><dt>Cliente</dt><dd>{order.customer_name}</dd></div><div><dt>Teléfono</dt><dd>{order.customer_phone || 'No indicado'}</dd></div></dl></article>
        <article className="panel order-detail-card"><h2>Productos del pedido</h2>{order.items?.map(item => <div className="order-product-item" key={item.id}><h3>{item.position}. {item.product}</h3><dl className="order-fields"><div><dt>Cantidad</dt><dd>{item.quantity} {item.unit_label}</dd></div>{item.portions !== null && <div><dt>Porciones</dt><dd>{item.portions}</dd></div>}{(['flavor','filling','decoration','extras','notes'] as const).map((field, index) => item[field] && <div key={field}><dt>{['Sabor','Relleno','Decoración','Extras','Notas'][index]}</dt><dd>{item[field]}</dd></div>)}<div><dt>Precio unitario</dt><dd>{formatCurrency(item.unit_price,business)}</dd></div><div><dt>Subtotal</dt><dd>{formatCurrency(item.line_total,business)}</dd></div></dl></div>)}{order.notes && <p>{order.notes}</p>}</article>
        <article className="panel order-detail-card order-delivery-card"><div className="section-title"><span className="section-icon"><CalendarDays size={19} /></span><div><h2>Entrega</h2><p>Fecha y hora del pedido.</p></div></div><dl className="order-fields"><div><dt>Fecha</dt><dd>{deliveryDate(order.delivery_date)}</dd></div><div><dt>Hora</dt><dd>{formatDeliveryTime(order.delivery_time)}</dd></div></dl>{order.status === 'confirmed' || order.status === 'in_preparation' || order.status === 'ready' ? <button type="button" className="text-button reschedule-delivery-button" onClick={() => { setError(''); setRescheduleOpen(true) }}><RotateCcw size={15} /> Reprogramar entrega</button> : <p className="delivery-reschedule-disabled">Este pedido ya está {statusLabel(order.status)} y no puede reprogramarse.</p>}{deliveryHistory.length > 0 && <details className="delivery-history"><summary>Ver historial de entrega</summary><ol>{deliveryHistory.map(entry => <li key={entry.id}><p>{deliveryMoment(entry.previous_delivery_date, entry.previous_delivery_time)} <span aria-hidden="true">→</span> {deliveryMoment(entry.new_delivery_date, entry.new_delivery_time)}</p>{entry.reason && <small>Motivo: {entry.reason}</small>}</li>)}</ol></details>}</article>
        <article className="panel order-detail-card order-money-card"><div className="section-title"><span className="section-icon"><ClipboardList size={19} /></span><div><h2>Información comercial</h2><p>Solo los pagos registrados cuentan como dinero recibido.</p></div></div><dl className="order-fields"><>{order.delivery_customer_charge != null && <div><dt>Entrega cobrada al cliente</dt><dd>{formatCurrency(order.delivery_customer_charge,business)}</dd></div>}</><div><dt>Precio total</dt><dd>{formatCurrency(Number(order.total_amount), business)}</dd></div><div><dt>Anticipo requerido</dt><dd>{formatCurrency(Number(order.deposit_required), business)}</dd></div><div><dt>Pagado realmente</dt><dd>{formatCurrency(summary.totalPaid, business)}</dd></div><div><dt>Saldo real por cobrar</dt><dd>{formatCurrency(summary.realBalance, business)}</dd></div><div><dt>Estado financiero</dt><dd>{summary.financialStatus}</dd></div></dl>{summary.depositShortfall > 0 && <p className="order-deposit-shortfall">Faltan {formatCurrency(summary.depositShortfall, business)} para cubrir el anticipo.</p>}{order.status !== 'cancelled' && summary.realBalance > 0 && <Link className="primary order-payment-link" to={'/pagos?order=' + encodeURIComponent(order.id)}>Registrar pago</Link>}{order.status === 'cancelled' && hasPaymentHistory && <p className="order-cancelled-money">Este pedido está cancelado y tiene pagos registrados. La gestión de devoluciones se incorporará posteriormente.</p>}</article>
      </section>
      <section className="panel order-status-panel"><div><h2>Estado del pedido</h2><p className="muted">Actualiza el avance para mantener tu seguimiento al día.</p></div><label>Estado<select value={order.status} disabled={busy} onChange={e => { const next = e.target.value as OrderStatus; if (next === 'delivered' || next === 'cancelled') setPendingStatus(next); else void saveStatus(next) }}>{orderStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label></section>
      {order.internal_cost_total !== null && <details className="panel private-order-costs"><summary>Información administrativa privada</summary><dl className="order-fields"><div><dt>Costo real total</dt><dd>{formatCurrency(Number(order.internal_cost_total), business)}</dd></div><div><dt>Ganancia estimada</dt><dd>{formatCurrency(Number(order.estimated_profit), business)}</dd></div><div><dt>Margen real sobre venta</dt><dd>{order.real_margin_percent === null ? 'No disponible' : Number(order.real_margin_percent).toFixed(2) + '%'}</dd></div></dl></details>}
      {pendingStatus && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="order-status-title"><span className="delete-icon"><Check size={22} /></span><h2 id="order-status-title">¿Cambiar a {statusLabel(pendingStatus).toLowerCase()}?</h2><p>Este cambio actualizará el estado de {order.order_number}.</p>{pendingStatus === 'cancelled' && hasReceivedMoney && <p className="order-cancelled-money">Este pedido tiene dinero recibido. Cancelarlo no anulará ni devolverá automáticamente esos pagos.</p>}<div><button className="secondary-button" onClick={() => setPendingStatus(null)}>Cancelar</button><button className="primary" onClick={() => void saveStatus(pendingStatus)}>Confirmar</button></div></section></div>}
      {rescheduleOpen && <RescheduleDeliveryDialog key={order.id} order={order} busy={busy} error={error} onClose={() => setRescheduleOpen(false)} onConfirm={saveDelivery} />}
    </div>
  }

  return <div className="orders-page"><div className="page-heading"><div><span className="eyebrow accent">TU ESPACIO DE TRABAJO</span><h1>Pedidos<span className="heading-dot">.</span></h1><p className="muted">Dale seguimiento a los trabajos confirmados de tu negocio.</p></div></div>{error && <Notice error>{error}</Notice>}{notice && <div className="quote-notice"><Check size={17} /> {notice}</div>}{orders.length === 0 ? <section className="panel quote-empty"><span className="empty-quote-icon"><ClipboardList size={35} /></span><span className="subtle-badge">PEDIDOS DE TU NEGOCIO</span><h2>Tus pedidos aparecerán aquí</h2><p>Cuando una cotización sea aceptada, podrás convertirla en pedido y darle seguimiento desde este espacio.</p><Link to="/cotizar" className="primary">Ir a Cotizaciones <ChevronRight size={17} /></Link></section> : <section className="orders-list" aria-label="Listado de pedidos">{orders.map(order => {
    const summary = summarizePayments(order, payments)
    return <button type="button" className="order-list-card" key={order.id} onClick={() => openOrder(order)}><div className="order-card-top"><span className="quote-number">{order.order_number}</span><span className={'status-badge order-status status-' + order.status}>{statusLabel(order.status)}</span></div><div className="order-card-main"><div><h2>{order.customer_name}</h2><p>{summarizeOrderProducts(order.items ?? [], order.product)}</p></div><strong>{formatCurrency(Number(order.total_amount), business)}</strong></div><div className="order-card-bottom"><span>Pagado {formatCurrency(summary.totalPaid, business)}</span><span>Saldo {formatCurrency(summary.realBalance, business)}</span><span>{summary.financialStatus}</span><span>Origen: {order.source_quote_number}</span><span><CalendarDays size={14} /> {deliveryDate(order.delivery_date)}</span><span><Clock3 size={14} /> {formatDeliveryTime(order.delivery_time)}</span></div></button>
  })}</section>}</div>
}

function RescheduleDeliveryDialog({ order, busy, error, onClose, onConfirm }: {
  order: Order
  busy: boolean
  error: string
  onClose: () => void
  onConfirm: (input: { date: string; time: string | null; reason: string }) => Promise<void>
}) {
  const [step, setStep] = useState<'edit' | 'confirm'>('edit')
  const [date, setDate] = useState(order.delivery_date ?? '')
  const [time, setTime] = useState<DeliveryTimeParts | null>(() => deliveryTimeToParts(order.delivery_time))
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const newTime = deliveryTimeFromParts(time)
  const isPast = Boolean(date && date < localDateKey(new Date()))

  function continueToConfirmation() {
    if (!date) { setMessage('Selecciona una fecha para la entrega.'); return }
    if (date === order.delivery_date && newTime === (order.delivery_time?.slice(0, 5) || null)) {
      setMessage('La fecha y hora no han cambiado.')
      return
    }
    setMessage('')
    setStep('confirm')
  }

  return <div className="modal-backdrop" role="presentation"><section className="confirm-modal delivery-reschedule-modal" role={step === 'confirm' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="delivery-reschedule-title">
    <span className="delivery-reschedule-icon"><CalendarDays size={21} /></span>
    {step === 'edit' ? <>
      <span className="eyebrow accent">REPROGRAMAR ENTREGA</span><h2 id="delivery-reschedule-title">Elige una nueva fecha</h2>
      <p className="delivery-current-value"><strong>Entrega actual:</strong> {deliveryMoment(order.delivery_date, order.delivery_time)}</p>
      <label>Nueva fecha de entrega *<input type="date" value={date} onChange={event => { setDate(event.target.value); setMessage('') }} required /></label>
      <label>Hora de entrega<select value={time ? 'defined' : 'undefined'} onChange={event => setTime(event.target.value === 'undefined' ? null : time ?? { hour: '12', minute: '00', period: 'PM' })}><option value="undefined">Hora por definir</option><option value="defined">Seleccionar hora</option></select></label>
      {time && <div className="delivery-time-picker" aria-label="Selecciona la hora de entrega">
        <label>Hora<select value={time.hour} onChange={event => setTime(current => current ? { ...current, hour: event.target.value } : current)}>{Array.from({ length: 12 }, (_, index) => String(index + 1)).map(hour => <option key={hour} value={hour}>{hour}</option>)}</select></label>
        <label>Minutos<select value={time.minute} onChange={event => setTime(current => current ? { ...current, minute: event.target.value } : current)}>{Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0')).map(minute => <option key={minute} value={minute}>{minute}</option>)}</select></label>
        <label>AM / PM<select value={time.period} onChange={event => setTime(current => current ? { ...current, period: event.target.value as DeliveryTimeParts['period'] } : current)}><option value="AM">AM</option><option value="PM">PM</option></select></label>
      </div>}
      <label>Motivo del cambio — opcional<textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={2} placeholder="Ej. El cliente solicitó otra fecha" /></label>
      {date && <p className="delivery-preview"><strong>Nueva entrega:</strong> {deliveryMoment(date, newTime)}</p>}
      {isPast && <p className="delivery-date-warning" role="status"><CircleAlert size={17} /> La nueva fecha de entrega está en el pasado. Confirma el cambio en el siguiente paso.</p>}
      {message && <p className="delivery-no-change" role="status">{message}</p>}
      {error && <Notice error>{error}</Notice>}
      <div><button type="button" className="secondary-button" disabled={busy} onClick={onClose}>Cancelar</button><button type="button" className="primary" disabled={busy} onClick={continueToConfirmation}>Guardar nueva fecha</button></div>
    </> : <>
      <span className="eyebrow accent">CONFIRMA EL CAMBIO</span><h2 id="delivery-reschedule-title">¿Reprogramar esta entrega?</h2>
      <p><strong>{order.order_number}</strong> cambiará del <strong>{deliveryMoment(order.delivery_date, order.delivery_time)}</strong> al <strong>{deliveryMoment(date, newTime)}</strong>.</p>
      <p className="delivery-agenda-confirmation">Agenda se actualizará automáticamente.</p>
      {isPast && <p className="delivery-date-warning" role="status"><CircleAlert size={17} /> La nueva fecha de entrega está en el pasado.</p>}
      {reason.trim() && <p className="delivery-reason-preview">Motivo: {reason.trim()}</p>}
      {error && <Notice error>{error}</Notice>}
      <div><button type="button" className="secondary-button" disabled={busy} onClick={() => setStep('edit')}>Volver</button><button type="button" className="primary" disabled={busy} onClick={() => void onConfirm({ date, time: newTime, reason: reason.trim() })}>{busy ? 'Guardando…' : 'Confirmar cambio'}</button></div>
    </>}
  </section></div>
}
