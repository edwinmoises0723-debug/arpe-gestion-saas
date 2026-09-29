import { useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, ChevronRight, ClipboardList, Clock3, UserRound } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Business, Order, OrderStatus } from '../lib/database.types'
import { orderStatuses, listOrders, updateOrderStatus } from '../lib/orders'
import { formatCurrency } from '../lib/quotes'
import { errorMessage } from '../lib/supabase'
import { Loading, Notice } from '../components/Feedback'

const statusLabel = (status: OrderStatus) => orderStatuses.find(option => option.value === status)?.label ?? status
const deliveryDate = (value: string | null) => value ? new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : 'Por definir'

export function OrdersPage({ business }: { business: Business }) {
  const [orders, setOrders] = useState<Order[]>([])
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
    void listOrders(business.id).then(rows => {
      if (!active) return
      setOrders(rows)
    }).catch(e => { if (active) setError(errorMessage(e)) }).finally(() => { if (active) setLoading(false) })
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
      setSelected(updated); setPendingStatus(null); setNotice(`El pedido ${updated.order_number} ahora está ${statusLabel(status).toLowerCase()}.`)
    } catch (e) { setError(errorMessage(e)); setPendingStatus(null) } finally { setBusy(false) }
  }
  if (loading) return <Loading text="Cargando tus pedidos…" />
  if (activeOrder) {
    const selected = activeOrder
    const projectedBalance = Math.max(0, Number(selected.total_amount) - Number(selected.deposit_required))
    return <div className="orders-page"><button className="back-button" onClick={closeOrder}><ArrowLeft size={17} /> Pedidos</button>{error && <Notice error>{error}</Notice>}{notice && <div className="quote-notice"><Check size={17} /> {notice}</div>}<div className="page-heading order-detail-heading"><div><span className="eyebrow accent">PEDIDO · ORIGEN {selected.source_quote_number}</span><h1>{selected.order_number}</h1><p className="muted">Creado {new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(selected.created_at))}</p></div><span className={`status-badge order-status status-${selected.status}`}>{statusLabel(selected.status)}</span></div><section className="order-detail-grid"><article className="panel order-detail-card"><div className="section-title"><span className="section-icon"><UserRound size={19} /></span><div><h2>Información del cliente</h2><p>Datos guardados desde la cotización original.</p></div></div><dl className="order-fields"><div><dt>Cliente</dt><dd>{selected.customer_name}</dd></div><div><dt>Teléfono</dt><dd>{selected.customer_phone || 'No indicado'}</dd></div></dl></article><article className="panel order-detail-card"><div className="section-title"><span className="section-icon"><ClipboardList size={19} /></span><div><h2>Pedido</h2><p>{selected.product}</p></div></div><dl className="order-fields"><div><dt>Porciones</dt><dd>{selected.portions ?? 'No indicado'}</dd></div><div><dt>Sabor</dt><dd>{selected.flavor || 'No indicado'}</dd></div><div><dt>Relleno</dt><dd>{selected.filling || 'No indicado'}</dd></div><div><dt>Decoración</dt><dd>{selected.decoration || 'No indicado'}</dd></div><div><dt>Extras</dt><dd>{selected.extras || 'No indicado'}</dd></div><div><dt>Observaciones</dt><dd>{selected.notes || 'Sin observaciones'}</dd></div></dl></article><article className="panel order-detail-card"><div className="section-title"><span className="section-icon"><CalendarDays size={19} /></span><div><h2>Entrega</h2><p>Fecha y hora del pedido.</p></div></div><dl className="order-fields"><div><dt>Fecha</dt><dd>{deliveryDate(selected.delivery_date)}</dd></div><div><dt>Hora</dt><dd>{selected.delivery_time?.slice(0, 5) || 'Por definir'}</dd></div></dl></article><article className="panel order-detail-card order-money-card"><div className="section-title"><span className="section-icon"><ClipboardList size={19} /></span><div><h2>Información comercial</h2><p>El anticipo es solicitado; este pedido no registra pagos recibidos.</p></div></div><dl className="order-fields"><div><dt>Precio total</dt><dd>{formatCurrency(Number(selected.total_amount), business)}</dd></div><div><dt>Anticipo requerido</dt><dd>{formatCurrency(Number(selected.deposit_required), business)}</dd></div><div><dt>Saldo proyectado después del anticipo</dt><dd>{formatCurrency(projectedBalance, business)}</dd></div></dl></article></section><section className="panel order-status-panel"><div><h2>Estado del pedido</h2><p className="muted">Actualiza el avance para mantener tu seguimiento al día.</p></div><label>Estado<select value={selected.status} disabled={busy} onChange={e => { const next = e.target.value as OrderStatus; if (next === 'delivered' || next === 'cancelled') setPendingStatus(next); else void saveStatus(next) }}>{orderStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label></section>{selected.internal_cost_total !== null && <details className="panel private-order-costs"><summary>Información administrativa privada</summary><dl className="order-fields"><div><dt>Costo real total</dt><dd>{formatCurrency(Number(selected.internal_cost_total), business)}</dd></div><div><dt>Ganancia estimada</dt><dd>{formatCurrency(Number(selected.estimated_profit), business)}</dd></div><div><dt>Margen real sobre venta</dt><dd>{selected.real_margin_percent === null ? 'No disponible' : `${Number(selected.real_margin_percent).toFixed(2)}%`}</dd></div></dl></details>}{pendingStatus && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="order-status-title"><span className="delete-icon"><Check size={22} /></span><h2 id="order-status-title">¿Cambiar a {statusLabel(pendingStatus).toLowerCase()}?</h2><p>Este cambio actualizará el estado de {selected.order_number}.</p><div><button className="secondary-button" onClick={() => setPendingStatus(null)}>Cancelar</button><button className="primary" onClick={() => void saveStatus(pendingStatus)}>Confirmar</button></div></section></div>}</div>
  }
  return <div className="orders-page"><div className="page-heading"><div><span className="eyebrow accent">TU ESPACIO DE TRABAJO</span><h1>Pedidos<span className="heading-dot">.</span></h1><p className="muted">Dale seguimiento a los trabajos confirmados de tu negocio.</p></div></div>{error && <Notice error>{error}</Notice>}{notice && <div className="quote-notice"><Check size={17} /> {notice}</div>}{orders.length === 0 ? <section className="panel quote-empty"><span className="empty-quote-icon"><ClipboardList size={35} /></span><span className="subtle-badge">PEDIDOS DE TU NEGOCIO</span><h2>Tus pedidos aparecerán aquí</h2><p>Cuando una cotización sea aceptada, podrás convertirla en pedido y darle seguimiento desde este espacio.</p><Link to="/cotizar" className="primary">Ir a Cotizaciones <ChevronRight size={17} /></Link></section> : <section className="orders-list" aria-label="Listado de pedidos">{orders.map(order => <button type="button" className="order-list-card" key={order.id} onClick={() => openOrder(order)}><div className="order-card-top"><span className="quote-number">{order.order_number}</span><span className={`status-badge order-status status-${order.status}`}>{statusLabel(order.status)}</span></div><div className="order-card-main"><div><h2>{order.customer_name}</h2><p>{order.product}</p></div><strong>{formatCurrency(Number(order.total_amount), business)}</strong></div><div className="order-card-bottom"><span>Origen: {order.source_quote_number}</span><span><CalendarDays size={14} /> {deliveryDate(order.delivery_date)}</span>{order.delivery_time && <span><Clock3 size={14} /> {order.delivery_time.slice(0, 5)}</span>}</div></button>)}</section>}</div>
}
