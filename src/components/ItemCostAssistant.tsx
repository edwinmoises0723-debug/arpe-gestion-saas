import type { Business, ItemCostInput, QuoteBundleItem } from '../lib/database.types'
import { costItemCategories } from '../lib/costs'
import { calculateItemCost, suggestedUnitPrice } from '../lib/products'
import { formatCurrency } from '../lib/quotes'

export function ItemCostAssistant({ item, business, onChange }: { item: QuoteBundleItem; business: Business; onChange: (item: QuoteBundleItem) => void }) {
  if (!item.cost) return null
  const cost = item.cost
  const calculated = calculateItemCost(item)
  const amount = (n: number) => formatCurrency(n, business)
  const field = (key: keyof ItemCostInput, label: string, help: string, step = '0.01', max?: number) => <label>{label}<small className="field-hint">{help}</small><input type="number" min="0" max={max} step={step} required value={cost[key]} onChange={e => onChange({ ...item, cost: { ...cost, [key]: Number(e.target.value) } })} /></label>
  return <section className="cost-assistant item-cost-assistant" aria-label={`Costos de ${item.product || 'producto'}`}>
    <h3>Asistente de costos</h3><p className="field-hint">Introduce los costos de toda esta línea: {item.quantity} {item.unit_label}. EJNEXA hace las matemáticas. La entrega se agrega una sola vez al final.</p>
    <div className="form-grid">{field('ingredients_cost', `Costo de ingredientes para ${item.quantity} ${item.unit_label}`, 'Incluye todos los ingredientes que utilizarás para esta cantidad.')}{field('waste_percent', 'Merma (%)', 'Cubre sobrantes y pequeñas pérdidas.', '0.01', 100)}</div>
    <div className="calculated-row"><span>Merma estimada</span><strong>{amount(calculated.waste_amount)}</strong></div>
    <h4>Gastos directos</h4><p className="field-hint">Por ejemplo: caja, base, topper o flores. EJNEXA suma cada gasto.</p>
    {item.direct_costs.map((direct, index) => <div className="cost-item" key={index}>
      <select aria-label="Categoría del gasto" value={direct.category} onChange={e => onChange({ ...item, direct_costs: item.direct_costs.map((d, n) => n === index ? { ...d, category: e.target.value as typeof direct.category } : d) })}>{costItemCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
      <input aria-label="Descripción del gasto" required maxLength={160} value={direct.name} onChange={e => onChange({ ...item, direct_costs: item.direct_costs.map((d, n) => n === index ? { ...d, name: e.target.value } : d) })} />
      <input aria-label="Costo del gasto" type="number" min="0" step="0.01" required value={direct.cost} onChange={e => onChange({ ...item, direct_costs: item.direct_costs.map((d, n) => n === index ? { ...d, cost: Number(e.target.value) } : d) })} />
      <button type="button" className="text-button" onClick={() => onChange({ ...item, direct_costs: item.direct_costs.filter((_, n) => n !== index) })}>Quitar</button>
    </div>)}
    <button type="button" className="secondary-button" onClick={() => onChange({ ...item, direct_costs: [...item.direct_costs, { category: 'packaging', name: '', cost: 0 }] })}>+ Agregar gasto</button>
    <div className="calculated-row"><span>Total gastos directos</span><strong>{amount(calculated.direct_costs_total)}</strong></div>
    <h4>Mano de obra e indirectos</h4>
    <div className="form-grid">{field('labor_hours', 'Horas estimadas de trabajo', 'Tiempo para preparar toda esta cantidad.')}{field('labor_hourly_rate', 'Tarifa por hora', 'Este ajuste solo aplica a este producto.')}{field('indirect_percent', 'Gastos indirectos (%)', 'Agua, electricidad, gas, limpieza y desgaste de equipos.')}{field('markup_percent', 'Ganancia sobre costo (%)', 'Porcentaje usado para construir el precio sugerido; no modifica la configuración del negocio.')}</div>
    <p className="field-hint">{cost.labor_hours} horas × {amount(cost.labor_hourly_rate)}/h = {amount(calculated.labor_cost)}</p>
    <dl className="order-fields">
      <div><dt>Subtotal de producción</dt><dd>{amount(calculated.production_subtotal)}</dd></div>
      <div><dt>Gastos indirectos</dt><dd>{amount(calculated.indirect_amount)}</dd></div>
      <div><dt>Costo interno de este ítem</dt><dd>{amount(calculated.production_cost)}</dd></div>
      <div><dt>Precio sugerido para la línea</dt><dd>{amount(calculated.suggested_product_price)}</dd></div>
      <div><dt>Precio sugerido unitario</dt><dd>{item.quantity > 0 ? `${amount(suggestedUnitPrice(item))}/${item.unit_label}` : 'Indica una cantidad'}</dd></div>
      <div><dt>Ganancia estimada de la línea</dt><dd>{amount(calculated.estimated_profit)}</dd></div>
      <div><dt>Margen real sobre venta</dt><dd>{calculated.real_margin_percent.toFixed(2)}%</dd></div>
    </dl>
    <p className="field-hint">El margen real compara la ganancia con el precio elegido. La ganancia sobre costo construye el precio sugerido.</p>
    <button type="button" className="primary" disabled={item.quantity <= 0} onClick={() => onChange({ ...item, unit_price: suggestedUnitPrice(item) })}>Usar precio sugerido</button>
    <p className="field-hint">Dividimos el precio sugerido entre la cantidad y redondeamos el precio unitario a dos decimales. El subtotal puede variar unos centavos.</p>
    {calculated.final_price < calculated.total_internal_cost && <p className="cost-warning" role="status">Este precio no cubre el costo estimado de producción.</p>}
    <p className="cost-private-note">Información interna. No aparece en documentos para el cliente.</p>
  </section>
}
