import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Copy, Plus, Save, Trash2 } from 'lucide-react'
import type { Business, CatalogProduct, Quote, QuoteBundleHeader, QuoteBundleItem } from '../lib/database.types'
import { defaultCostSettings, getCostSettings } from '../lib/costs'
import { calculateBundle, duplicateProduct, fromCatalog, lineTotal, listCatalog, loadQuoteBundle, newItemCost, newProduct, removeProduct, saveQuoteBundle } from '../lib/products'
import { formatCurrency, getInitialQuoteDeposit, quoteStatuses } from '../lib/quotes'
import { errorMessage } from '../lib/supabase'
import { deliveryTimeFromParts, deliveryTimeToParts } from '../lib/delivery-time'
import { Loading, Notice } from '../components/Feedback'
import { ItemCostAssistant } from '../components/ItemCostAssistant'

export function QuoteForm({ business, quote, onSaved, onCancel }: { business: Business; quote: Quote | null; onSaved: (quote: Quote) => void; onCancel: () => void }) {
  const [header, setHeader] = useState<QuoteBundleHeader>(() => ({ customer_name: quote?.customer_name ?? '', customer_phone: quote?.customer_phone ?? '', delivery_date: quote?.delivery_date ?? null, delivery_time: quote?.delivery_time ?? null, notes: quote?.notes ?? '', ...getInitialQuoteDeposit(business, quote), status: quote?.status ?? 'draft', delivery_internal_cost: quote?.delivery_internal_cost ?? 0, delivery_customer_charge: quote?.delivery_customer_charge ?? 0 }))
  const [items, setItems] = useState(() => [{ key: crypto.randomUUID(), value: newProduct() }])
  const [catalog, setCatalog] = useState<CatalogProduct[]>([])
  const [settings, setSettings] = useState(defaultCostSettings)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void Promise.all([listCatalog(business.id), getCostSettings(business.id), quote ? loadQuoteBundle(quote.id, business.id) : Promise.resolve(null)])
      .then(([products, defaults, saved]) => { if (active) { setCatalog(products); setSettings(defaults); if (saved) setItems(saved.map(value => ({ key: crypto.randomUUID(), value }))); setLoaded(true) } })
      .catch(e => { if (active) setError(errorMessage(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [business.id, quote])
  const values = items.map(item => item.value)
  const summary = calculateBundle(header, values)
  const time = deliveryTimeToParts(header.delivery_time) ?? { hour: '12', minute: '00', period: 'PM' as const }
  const amount = (n: number) => formatCurrency(n, business)
  const changeItem = (index: number, value: QuoteBundleItem) => setItems(current => current.map((item, i) => i === index ? { ...item, value } : item))
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try { onSaved(await saveQuoteBundle(quote?.id ?? null, header, values)) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  if (loading) return <Loading text="Preparando los productos de tu cotización…" />
  return <div className="quote-editor"><div className="editor-heading"><button className="back-button" onClick={onCancel}><ArrowLeft size={17} /> Cotizaciones</button><span className="eyebrow accent">{quote ? quote.quote_number : 'NUEVA COTIZACIÓN'}</span><h1>{quote ? 'Editar cotización' : 'Crear una cotización'}</h1><p className="muted">Uno o varios productos, una propuesta y una entrega.</p></div>
    <form className="quote-form" onSubmit={submit}><fieldset className="bundle-fieldset" disabled={busy || !loaded}>
      <section className="panel quote-section"><h2>Cliente</h2><div className="form-grid"><label>Nombre del cliente<input required maxLength={120} value={header.customer_name} onChange={e => setHeader({ ...header, customer_name: e.target.value })} /></label><label>Teléfono<input type="tel" maxLength={30} value={header.customer_phone} onChange={e => setHeader({ ...header, customer_phone: e.target.value })} /></label></div></section>
      <section className="panel quote-section"><h2>Entrega</h2><label>Fecha<input type="date" value={header.delivery_date ?? ''} onChange={e => setHeader({ ...header, delivery_date: e.target.value || null })} /></label>
        <label>Hora de entrega<select value={header.delivery_time === null ? 'unknown' : 'known'} onChange={e => setHeader({ ...header, delivery_time: e.target.value === 'unknown' ? null : '12:00' })}><option value="unknown">Hora por definir</option><option value="known">Indicar hora</option></select></label>
        {header.delivery_time !== null && <div className="form-grid"><label>Hora<select value={time.hour} onChange={e => setHeader({ ...header, delivery_time: deliveryTimeFromParts({ ...time, hour: e.target.value }) })}>{Array.from({ length: 12 }, (_, n) => <option key={n + 1}>{n + 1}</option>)}</select></label><label>Minutos<select value={time.minute} onChange={e => setHeader({ ...header, delivery_time: deliveryTimeFromParts({ ...time, minute: e.target.value }) })}>{Array.from({ length: 60 }, (_, n) => <option key={n}>{String(n).padStart(2, '0')}</option>)}</select></label><label>AM / PM<select value={time.period} onChange={e => setHeader({ ...header, delivery_time: deliveryTimeFromParts({ ...time, period: e.target.value as 'AM' | 'PM' }) })}><option>AM</option><option>PM</option></select></label></div>}
      </section>
      <section className="bundle-products"><h2>Productos de esta cotización</h2><p className="muted">El catálogo precarga datos; cada producto queda guardado solo en esta propuesta.</p>
        {items.map(({ key, value: item }, index) => <article className="panel bundle-item" key={key} aria-label={`Producto ${index + 1}`}>
          <div className="bundle-item-heading"><h3>Producto {index + 1}</h3><div><button type="button" className="icon-button" aria-label={`Duplicar producto ${index + 1}`} onClick={() => setItems([...items, { key: crypto.randomUUID(), value: duplicateProduct(item) }])}><Copy size={17} /></button><button type="button" className="icon-button danger-icon" aria-label={`Eliminar producto ${index + 1}`} onClick={() => { try { setItems(removeProduct(items, index)); setError('') } catch (e) { setError(errorMessage(e)) } }}><Trash2 size={17} /></button></div></div>
          <label>Seleccionar del catálogo o personalizado<select value={item.catalog_product_id ?? ''} onChange={e => { const p = catalog.find(product => product.id === e.target.value); changeItem(index, p ? fromCatalog(p) : { ...item, catalog_product_id: null }) }}><option value="">Producto personalizado</option>{catalog.filter(p => p.is_active || p.id === item.catalog_product_id).map(p => <option key={p.id} value={p.id}>{p.name}{p.is_active ? '' : ' · Inactivo'}</option>)}</select></label>
          <label>Producto<input required maxLength={160} value={item.product} onChange={e => changeItem(index, { ...item, product: e.target.value })} /></label>
          <div className="form-grid"><label>Cantidad<input type="number" min="0.001" step="0.001" required value={item.quantity} onChange={e => changeItem(index, { ...item, quantity: Number(e.target.value) })} /></label><label>Unidad<input list="product-units" required maxLength={40} value={item.unit_label} onChange={e => changeItem(index, { ...item, unit_label: e.target.value })} /></label><label>Porciones <small>Opcional</small><input type="number" min="1" step="1" value={item.portions ?? ''} onChange={e => changeItem(index, { ...item, portions: e.target.value ? Number(e.target.value) : null })} /></label></div>
          <div className="form-grid">{(['flavor', 'filling', 'decoration', 'extras'] as const).map((field, n) => <label key={field}>{['Sabor', 'Relleno', 'Decoración', 'Extras'][n]}<input maxLength={n < 2 ? 120 : 500} value={item[field]} onChange={e => changeItem(index, { ...item, [field]: e.target.value })} /></label>)}</div>
          <label>Notas del producto<textarea maxLength={1000} value={item.notes} onChange={e => changeItem(index, { ...item, notes: e.target.value })} /></label>
          <label>Precio unitario<input type="number" min="0" step="0.01" required value={item.unit_price} onChange={e => changeItem(index, { ...item, unit_price: Number(e.target.value) })} /></label><div className="calculated-row"><span>{item.quantity} × {amount(item.unit_price)} · Subtotal</span><strong>{amount(lineTotal(item))}</strong></div>
          {item.cost ? <details className="item-cost-details"><summary>Mostrar asistente de costos</summary><ItemCostAssistant item={item} business={business} onChange={value => changeItem(index, value)} /></details> : <button type="button" className="secondary-button" onClick={() => changeItem(index, { ...item, cost: newItemCost(settings) })}>Iniciar asistente de costos</button>}
        </article>)}
        <datalist id="product-units">{['unidad', 'pastel', 'docena', 'caja', 'libra', 'kg', 'porción'].map(unit => <option key={unit} value={unit} />)}</datalist>
        <button type="button" className="secondary-button" onClick={() => setItems([...items, { key: crypto.randomUUID(), value: newProduct() }])}><Plus size={17} /> Agregar producto</button>
      </section>
      <section className="panel quote-section"><h2>Entrega y costos globales</h2><p className="field-hint">Estos importes se agregan una sola vez a toda la cotización.</p><div className="form-grid"><label>Costo interno de entrega<small className="field-hint">Privado: lo que realmente te cuesta realizar o pagar la entrega.</small><input required type="number" min="0" step="0.01" value={header.delivery_internal_cost} onChange={e => setHeader({ ...header, delivery_internal_cost: Number(e.target.value) })} /></label><label>Cobro de entrega al cliente<small className="field-hint">Lo que deseas cobrar al cliente por la entrega.</small><input required type="number" min="0" step="0.01" value={header.delivery_customer_charge} onChange={e => setHeader({ ...header, delivery_customer_charge: Number(e.target.value) })} /></label></div></section>
      <section className="panel quote-section"><h2>Resumen general y anticipo</h2><dl className="order-fields"><div><dt>Subtotal productos</dt><dd>{amount(summary.subtotal)}</dd></div><div><dt>Entrega cobrada al cliente</dt><dd>{amount(header.delivery_customer_charge)}</dd></div><div><dt>Total general</dt><dd>{amount(summary.total)}</dd></div></dl><div className="form-grid"><label>Tipo de anticipo<select value={header.deposit_type} onChange={e => setHeader({ ...header, deposit_type: e.target.value as typeof header.deposit_type })}><option value="percentage">Porcentaje</option><option value="fixed">Monto fijo</option></select></label><label>{header.deposit_type === 'percentage' ? 'Porcentaje de anticipo (%)' : 'Monto fijo de anticipo'}<input required type="number" min="0" max={header.deposit_type === 'percentage' ? 100 : summary.total} step="0.01" value={header.deposit_value} onChange={e => setHeader({ ...header, deposit_value: Number(e.target.value) })} /></label></div><dl className="order-fields"><div><dt>Anticipo requerido</dt><dd>{amount(summary.deposit)}</dd></div><div><dt>Saldo después del anticipo</dt><dd>{amount(summary.balance)}</dd></div></dl><p className="field-hint">El anticipo es una condición comercial, todavía no es dinero recibido.</p>
        <div className="cost-summary"><h3>Información administrativa privada</h3>{summary.internal === null ? <p>Completa el costeo de todos los productos para conocer el costo total y la ganancia.</p> : <><dl className="order-fields"><div><dt>Costo interno total</dt><dd>{amount(summary.internal)}</dd></div><div><dt>Ganancia estimada</dt><dd>{amount(summary.profit!)}</dd></div><div><dt>Margen real sobre venta</dt><dd>{summary.margin === null ? 'No disponible' : `${summary.margin.toFixed(2)}%`}</dd></div></dl>{summary.total < summary.internal && <p className="cost-warning" role="status">Este precio no cubre el costo estimado de producción.</p>}</>}</div>
      </section>
      <section className="panel quote-section"><h2>Observaciones y estado</h2><label>Observaciones generales<textarea maxLength={1000} value={header.notes} onChange={e => setHeader({ ...header, notes: e.target.value })} /></label><label>Estado<select value={header.status} onChange={e => setHeader({ ...header, status: e.target.value as typeof header.status })}>{quoteStatuses.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label></section>
      </fieldset>{error && <Notice error>{error}</Notice>}<div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancelar</button><button className="primary" disabled={busy || !loaded}><Save size={17} /> {busy ? 'Guardando…' : 'Guardar cotización'}</button></div>
    </form>
  </div>
}
