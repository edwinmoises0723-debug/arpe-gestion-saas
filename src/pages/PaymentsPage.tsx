import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Banknote, Check, CircleAlert, Clock3, CreditCard, ReceiptText, Wallet } from 'lucide-react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Loading, Notice } from '../components/Feedback'
import type { Business, Order, Payment, PaymentMethod } from '../lib/database.types'
import { listOrders } from '../lib/orders'
import { listPayments, paymentMethods, registerPayment, summarizePayments, summarizePaymentsAfterSave, voidPayment } from '../lib/payments'
import { formatCurrency } from '../lib/quotes'
import { errorMessage } from '../lib/supabase'

const methodName = (method: PaymentMethod) => paymentMethods.find(option => option.value === method)?.label ?? method
const moneyDate = (value: string) => new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const localDateTime = () => {
  const now = new Date()
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
  return now.toISOString().slice(0, 16)
}

function paymentError(error: unknown, business: Business) {
  const message = error instanceof Error ? error.message : ''
  const balance = message.match(/Payment exceeds remaining balance:\s*([0-9.,]+)/i)?.[1]
  if (balance) return 'Este pago supera el saldo pendiente de ' + formatCurrency(Number(balance.replace(',', '.')), business) + '.'
  if (/amount must be greater than zero/i.test(message)) return 'El monto recibido debe ser mayor que cero.'
  if (/cancelled orders/i.test(message)) return 'No se pueden registrar pagos en un pedido cancelado.'
  if (/only posted payments can be voided/i.test(message)) return 'Este pago ya fue anulado.'
  if (/reason is required/i.test(message)) return 'Escribe el motivo de anulación.'
  return errorMessage(error)
}

export function PaymentsPage({ business }: { business: Business }) {
  const navigate = useNavigate()
  const [orders, setOrders] = useState<Order[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [params, setParams] = useSearchParams()
  const [registerOpen, setRegisterOpen] = useState(false)
  const [voiding, setVoiding] = useState<Payment | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidBusy, setVoidBusy] = useState(false)
  const [voidError, setVoidError] = useState('')
  const requestRef = useRef<string | null>(null)

  const selectedOrder = orders.find(order => order.id === params.get('order')) ?? null
  const selectedPayments = useMemo(() => selectedOrder
    ? payments.filter(payment => payment.order_id === selectedOrder.id).slice().sort((a, b) => b.paid_at.localeCompare(a.paid_at))
    : [], [payments, selectedOrder])
  const received = payments.reduce((sum, payment) => sum + (payment.status === 'posted' ? Math.round(Number(payment.amount) * 100) : 0), 0) / 100
  const receivable = orders.reduce((sum, order) => sum + (order.status === 'cancelled' ? 0 : summarizePayments(order, payments).realBalance), 0)
  const selectedSummary = selectedOrder ? summarizePayments(selectedOrder, payments) : null

  async function refresh() {
    const [freshOrders, freshPayments] = await Promise.all([listOrders(business.id), listPayments(business.id)])
    setOrders(freshOrders)
    setPayments(freshPayments)
  }

  useEffect(() => {
    let active = true
    void Promise.all([listOrders(business.id), listPayments(business.id)])
      .then(([rows, records]) => { if (active) { setOrders(rows); setPayments(records) } })
      .catch(e => { if (active) setError(errorMessage(e)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [business.id])

  function openOrder(order: Order) { setParams({ order: order.id }) }
  function closeOrder() { setParams({}) }
  function startRegister() {
    setError('')
    requestRef.current = crypto.randomUUID()
    setRegisterOpen(true)
  }
  function closeRegister() {
    setRegisterOpen(false)
    requestRef.current = null
  }

  async function submitPayment(input: { amount: number; method: PaymentMethod; reference: string; notes: string; paidAt: string }) {
    if (!selectedOrder || !requestRef.current) throw new Error('No se pudo preparar la solicitud. Cierra el formulario e inténtalo de nuevo.')
    const created = await registerPayment({
      orderId: selectedOrder.id,
      requestId: requestRef.current,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
      notes: input.notes,
      paidAt: new Date(input.paidAt).toISOString(),
    })
    requestRef.current = null
    setNotice('Pago ' + created.payment_number + ' registrado correctamente.')
    void refresh().catch(e => setError(errorMessage(e)))
    return created
  }

  async function confirmVoid() {
    if (!voiding || !voidReason.trim()) return
    setVoidBusy(true); setVoidError('')
    try {
      const updated = await voidPayment(voiding.id, voidReason.trim())
      setPayments(current => current.map(payment => payment.id === updated.id ? updated : payment))
      setNotice('El pago ' + updated.payment_number + ' fue anulado. El saldo se calculó nuevamente.')
      setVoiding(null); setVoidReason('')
      void refresh().catch(e => setError(errorMessage(e)))
    } catch (e) { setVoidError(paymentError(e, business)) } finally { setVoidBusy(false) }
  }

  if (loading) return <Loading text="Cargando pagos y pedidos…" />

  if (selectedOrder && selectedSummary) {
    const cancelledWithMoney = selectedOrder.status === 'cancelled' && selectedPayments.length > 0
    return <div className="payments-page">
      <button className="back-button" onClick={closeOrder}><ArrowLeft size={17} /> Pagos</button>
      {error && <Notice error>{error}</Notice>}
      {notice && <div className="quote-notice"><Check size={17} /> {notice}</div>}
      <div className="page-heading payment-detail-heading"><div><span className="eyebrow accent">PAGOS DEL PEDIDO</span><h1>{selectedOrder.order_number}</h1><p className="muted">{selectedOrder.customer_name} · {selectedOrder.product}</p></div><span className={'status-badge payment-finance-' + selectedSummary.financialStatus.replaceAll(' ', '-').toLowerCase()}>{selectedSummary.financialStatus}</span></div>
      {cancelledWithMoney && <div className="payment-warning"><CircleAlert size={19} /><p>Este pedido está cancelado y tiene pagos registrados. La gestión de devoluciones se incorporará posteriormente.</p></div>}
      <section className="payment-summary-grid" aria-label="Resumen del pedido">
        <article className="panel payment-summary-card"><span>Total del pedido</span><strong>{formatCurrency(Number(selectedOrder.total_amount), business)}</strong></article>
        <article className="panel payment-summary-card"><span>Anticipo requerido</span><strong>{formatCurrency(Number(selectedOrder.deposit_required), business)}</strong><small>Es una condición comercial, no dinero recibido.</small></article>
        <article className="panel payment-summary-card"><span>Pagado realmente</span><strong>{formatCurrency(selectedSummary.totalPaid, business)}</strong></article>
        <article className="panel payment-summary-card"><span>Saldo real pendiente</span><strong>{formatCurrency(selectedSummary.realBalance, business)}</strong></article>
      </section>
      {selectedSummary.depositShortfall > 0 && <p className="deposit-shortfall">Faltan <strong>{formatCurrency(selectedSummary.depositShortfall, business)}</strong> para completar el anticipo requerido.</p>}
      {selectedOrder.status !== 'cancelled' && selectedSummary.realBalance > 0
        ? <button className="primary payment-register-button" onClick={startRegister}><Banknote size={18} /> Registrar pago</button>
        : selectedOrder.status !== 'cancelled' && <div className="payment-paid-note"><Check size={17} /> Este pedido ya está pagado por completo.</div>}
      <section className="panel payment-history">
        <div className="payment-section-heading"><div><span className="section-icon"><ReceiptText size={19} /></span><div><h2>Historial de pagos</h2><p>Los registros se conservan para mantener un historial claro.</p></div></div></div>
        {selectedPayments.length === 0 ? <div className="payment-empty-history"><span><Wallet size={22} /></span><strong>Aún no hay pagos registrados</strong><p>El anticipo requerido no se considera pagado hasta registrar el dinero recibido.</p></div> : <div className="payment-record-list">{selectedPayments.map(payment => <article className={'payment-record' + (payment.status === 'voided' ? ' is-voided' : '')} key={payment.id}>
          <div className="payment-record-main"><div><span className="quote-number">{payment.payment_number}</span><p><Clock3 size={14} /> {moneyDate(payment.paid_at)}</p></div><strong>{formatCurrency(Number(payment.amount), business)}</strong></div>
          <div className="payment-record-meta"><span>{methodName(payment.method)}</span>{payment.reference && <span>Referencia: {payment.reference}</span>}{payment.notes && <span>Observación: {payment.notes}</span>}</div>
          <div className="payment-record-footer"><span className={'status-badge payment-record-status payment-status-' + payment.status}>{payment.status === 'posted' ? 'Registrado' : 'Anulado'}</span>{payment.status === 'voided' && <p>Motivo: {payment.void_reason}</p>}<div className="payment-record-actions"><Link className="text-button" aria-label={`Ver comprobante ${payment.payment_number}`} to={`/documento/pago/${payment.id}`}>Ver comprobante</Link>{payment.status === 'posted' && <button className="text-button payment-void-button" onClick={() => { setVoiding(payment); setVoidReason(''); setVoidError('') }}>Anular pago</button>}</div></div>
        </article>)}</div>}
      </section>
      {registerOpen && <RegisterPaymentDialog order={selectedOrder} business={business} currentPayments={payments} onClose={closeRegister} onViewReceipt={payment => navigate(`/documento/pago/${payment.id}`)} onConfirm={submitPayment} />}
      {voiding && <div className="modal-backdrop" role="presentation"><section className="confirm-modal payment-void-modal" role="alertdialog" aria-modal="true" aria-labelledby="void-payment-title">
        <span className="delete-icon"><CircleAlert size={21} /></span><h2 id="void-payment-title">Anular pago</h2>
        <p>Este pago dejará de contar como dinero recibido y el saldo del pedido será recalculado.</p>
        <p className="muted">Anular corrige un registro hecho por error. No representa una devolución de dinero al cliente.</p>
        <label>Motivo de anulación<textarea value={voidReason} onChange={event => setVoidReason(event.target.value)} rows={3} maxLength={500} required /></label>
        {voidError && <Notice error>{voidError}</Notice>}
        <div><button className="secondary-button" disabled={voidBusy} onClick={() => setVoiding(null)}>Cancelar</button><button className="primary" disabled={voidBusy || !voidReason.trim()} onClick={() => void confirmVoid()}>{voidBusy ? 'Anulando…' : 'Confirmar anulación'}</button></div>
      </section></div>}
    </div>
  }

  return <div className="payments-page">
    <div className="page-heading"><div><span className="eyebrow accent">CONTROL DE DINERO RECIBIDO</span><h1>Pagos<span className="heading-dot">.</span></h1><p className="muted">Registra únicamente el dinero que ya recibiste de tus clientes.</p></div></div>
    {error && <Notice error>{error}</Notice>}{notice && <div className="quote-notice"><Check size={17} /> {notice}</div>}
    <section className="payment-overview" aria-label="Resumen de pagos"><article className="panel payment-overview-card"><span className="payment-overview-icon"><Banknote size={20} /></span><div><span>Dinero recibido</span><strong>{formatCurrency(received, business)}</strong><small>Solo pagos registrados y no anulados</small></div></article><article className="panel payment-overview-card"><span className="payment-overview-icon"><Wallet size={20} /></span><div><span>Saldo por cobrar</span><strong>{formatCurrency(receivable, business)}</strong><small>No incluye pedidos cancelados</small></div></article></section>
    <div className="payment-list-title"><div><h2>Situación de tus pedidos</h2><p className="muted">Selecciona un pedido para consultar o registrar sus pagos.</p></div><span className="subtle-badge">{orders.length} {orders.length === 1 ? 'PEDIDO' : 'PEDIDOS'}</span></div>
    {orders.length === 0 ? <section className="panel payment-empty-state"><span><Wallet size={30} /></span><h2>Aún no tienes pedidos</h2><p>Cuando conviertas una cotización aceptada en pedido, podrás registrar aquí el dinero recibido.</p></section> : <section className="payment-order-list">{orders.map(order => {
      const summary = summarizePayments(order, payments)
      return <button className="payment-order-card" type="button" key={order.id} onClick={() => openOrder(order)}>
        <div className="payment-order-top"><span className="quote-number">{order.order_number}</span><span className={'status-badge payment-finance-' + summary.financialStatus.replaceAll(' ', '-').toLowerCase()}>{summary.financialStatus}</span></div>
        <div className="payment-order-customer"><strong>{order.customer_name}</strong><span>{order.product}</span></div>
        <div className="payment-order-amounts"><span>Total<strong>{formatCurrency(Number(order.total_amount), business)}</strong></span><span>Pagado<strong>{formatCurrency(summary.totalPaid, business)}</strong></span><span>Saldo<strong>{formatCurrency(summary.realBalance, business)}</strong></span></div>
      </button>
    })}</section>}
  </div>
}

function RegisterPaymentDialog({ order, business, currentPayments, onClose, onViewReceipt, onConfirm }: {
  order: Order
  business: Business
  currentPayments: Payment[]
  onClose: () => void
  onViewReceipt: (payment: Payment) => void
  onConfirm: (input: { amount: number; method: PaymentMethod; reference: string; notes: string; paidAt: string }) => Promise<Payment>
}) {
  const currentSummary = summarizePayments(order, currentPayments)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [paidAt, setPaidAt] = useState(localDateTime)
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<Payment | null>(null)
  const inputAmount = Number(amount)
  const amountInCents = Math.round(inputAmount * 100)
  const balanceInCents = Math.round(currentSummary.realBalance * 100)
  const projectedBalance = Math.max(0, balanceInCents - amountInCents) / 100
  const overBalance = Number.isFinite(inputAmount) && amount !== '' && amountInCents > balanceInCents

  async function save() {
    setBusy(true); setError('')
    try { setSaved(await onConfirm({ amount: inputAmount, method, reference, notes, paidAt })) }
    catch (e) { setError(paymentError(e, business)) }
    finally { setBusy(false) }
  }

  const summaryAfter = saved ? summarizePaymentsAfterSave(order, currentPayments, saved) : null
  return <div className="modal-backdrop" role="presentation"><section className="confirm-modal payment-entry-modal" role={saved ? 'dialog' : confirming ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="payment-entry-title">
    {saved ? <>
      <span className="payment-success-icon"><Check size={23} /></span><span className="eyebrow accent">PAGO REGISTRADO CORRECTAMENTE</span><h2 id="payment-entry-title">{saved.payment_number}</h2>
      <dl className="payment-success-summary"><div><dt>Pago recibido</dt><dd>{formatCurrency(Number(saved.amount), business)}</dd></div><div><dt>Total pagado</dt><dd>{formatCurrency(summaryAfter?.totalPaid ?? 0, business)}</dd></div><div><dt>Nuevo saldo</dt><dd>{formatCurrency(summaryAfter?.realBalance ?? 0, business)}</dd></div></dl>
      <div className="payment-success-actions"><button className="secondary-button" onClick={() => onViewReceipt(saved)}>Ver comprobante</button><button className="primary" onClick={onClose}>Listo</button></div>
    </> : confirming ? <>
      <span className="payment-confirm-icon"><CircleAlert size={22} /></span><h2 id="payment-entry-title">Confirmar pago</h2>
      <p>Registrarás <strong>{formatCurrency(inputAmount, business)}</strong> recibidos de <strong>{order.customer_name}</strong> para <strong>{order.order_number}</strong> mediante <strong>{methodName(method)}</strong>.</p>
      <dl className="payment-preview"><div><dt>Monto</dt><dd>{formatCurrency(inputAmount, business)}</dd></div><div><dt>Método</dt><dd>{methodName(method)}</dd></div><div><dt>Pedido</dt><dd>{order.order_number}</dd></div><div><dt>Cliente</dt><dd>{order.customer_name}</dd></div></dl>
      {error && <Notice error>{error}</Notice>}
      <div><button className="secondary-button" disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button><button className="primary" disabled={busy} onClick={() => void save()}>{busy ? 'Registrando…' : 'Confirmar pago'}</button></div>
    </> : <>
      <span className="payment-confirm-icon"><CreditCard size={21} /></span><h2 id="payment-entry-title">Registrar pago</h2><p className="muted">Anota el dinero que ya recibiste. El anticipo requerido no se registra automáticamente.</p>
      <label>Monto recibido *<input type="number" inputMode="decimal" min="0.01" step="0.01" max={currentSummary.realBalance} value={amount} onChange={event => setAmount(event.target.value)} autoFocus /></label>
      <div className="payment-quick-actions">{currentSummary.depositShortfall > 0 && <button type="button" onClick={() => setAmount(currentSummary.depositShortfall.toFixed(2))}>Completar anticipo</button>}<button type="button" onClick={() => setAmount(currentSummary.realBalance.toFixed(2))}>Pagar saldo completo</button></div>
      <label>Método de pago *<select value={method} onChange={event => setMethod(event.target.value as PaymentMethod)}>{paymentMethods.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
      <label>Fecha del pago *<input type="datetime-local" value={paidAt} onChange={event => setPaidAt(event.target.value)} required /></label>
      <label>Referencia — opcional<input value={reference} maxLength={180} onChange={event => setReference(event.target.value)} placeholder="Ej. número de transferencia" /></label>
      <small className="payment-sensitive-help">Usa solo una referencia breve. No escribas números completos de tarjeta ni claves bancarias.</small>
      <label>Observación — opcional<textarea value={notes} maxLength={500} rows={2} onChange={event => setNotes(event.target.value)} /></label>
      <dl className="payment-preview"><div><dt>Saldo actual</dt><dd>{formatCurrency(currentSummary.realBalance, business)}</dd></div><div><dt>Pago que registrarás</dt><dd>{formatCurrency(Number.isFinite(inputAmount) ? inputAmount : 0, business)}</dd></div><div><dt>Saldo después de este pago</dt><dd>{formatCurrency(projectedBalance, business)}</dd></div></dl>
      {overBalance && <p className="payment-inline-error">Este pago supera el saldo pendiente de {formatCurrency(currentSummary.realBalance, business)}.</p>}
      <div><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary" disabled={!amount || !Number.isFinite(inputAmount) || amountInCents <= 0 || overBalance || !paidAt} onClick={() => setConfirming(true)}>Continuar</button></div>
    </>}
  </section></div>
}
