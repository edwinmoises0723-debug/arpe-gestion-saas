import type { Business, QuoteBundleItem } from '../lib/database.types'
import type { CostingCapabilities } from '../lib/costs'
import { costItemCategories } from '../lib/costs'
import { calculateItemCost, suggestedUnitPrice } from '../lib/products'
import { formatCurrency } from '../lib/quotes'
import { quickCostExpensePresets } from '../lib/quick-cost'
import { defaultCostingConfig, validateCostingInputs } from '../lib/costing-engine'
import { Zap, Flame, Droplets } from 'lucide-react'

export function ItemCostAssistant({ item, business, capabilities, onChange, pricePending = false }: { pricePending?: boolean; item: QuoteBundleItem; business: Business; capabilities: CostingCapabilities; onChange: (item: QuoteBundleItem) => void }) {
  if (!item.cost) return null
  const cost = item.cost
  const supportsV1 = capabilities.supportsTraceSnapshots && cost.costing_model_version === 1
  const calculated = calculateItemCost(item)
  const costingConfig = cost.costing_snapshot?.costing_config ?? cost.costing_config ?? defaultCostingConfig
  const utilities = cost.utilities ?? cost.costing_snapshot?.utilities ?? []
  const utilityErrors = supportsV1 ? validateCostingInputs(utilities, costingConfig) : []
  const amount = (n: number) => formatCurrency(n, business)
  const field = (key: 'ingredients_cost' | 'waste_percent' | 'labor_hours' | 'labor_hourly_rate' | 'markup_percent', label: string, help: string, step = '0.01', max?: number) => <label>{label}<small className="field-hint">{help}</small><input type="number" min="0" max={max} step={step} required value={cost[key]} onChange={e => onChange({ ...item, cost: { ...cost, [key]: Number(e.target.value) } })} /></label>
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
    <div className="quick-cost-presets">{quickCostExpensePresets.map(preset => <button key={preset.id} type="button" className="secondary-button" onClick={() => onChange({ ...item, direct_costs: [...item.direct_costs, { category: preset.category, name: preset.description || 'Otro gasto', cost: 0 }] })}>{preset.label}</button>)}</div>
    <div className="calculated-row"><span>Total gastos directos</span><strong>{amount(calculated.direct_costs_total)}</strong></div>
    <h4>{supportsV1 ? 'Mano de obra y overhead' : 'Mano de obra y gastos indirectos'}</h4>
    <div className="form-grid">{field('labor_hours', 'Horas estimadas de trabajo', 'Tiempo para preparar toda esta cantidad.')}{field('labor_hourly_rate', 'Tarifa por hora', 'Este ajuste solo aplica a la mano de obra.')}{field('markup_percent', 'Ganancia sobre costo (%)', 'Porcentaje usado para construir el precio sugerido; no modifica la configuración del negocio.')}</div>
    <p className="field-hint">{cost.labor_hours} horas × {amount(cost.labor_hourly_rate)}/h = {amount(calculated.labor_cost)}</p>
    {supportsV1 && <details className="item-cost-utilities"><summary>Consumos de producción y overhead</summary><p className="field-hint">Los consumos se calculan por lote. No agregues aquí importes que también hayas puesto como gasto directo.</p>
      {utilities.map((utility, index) => <div className="quick-cost-item" key={index}>
        {utility.kind === 'water' ? <label>Litros<input type="number" min="0" step="0.1" value={utility.liters} onChange={e => onChange({ ...item, cost: { ...cost, utilities: utilities.map((u, i) => i === index ? { ...utility, liters: Number(e.target.value) || 0 } : u) } })} /></label> : <>
          <label>Equipo<select value={utility.equipment_id} onChange={e => onChange({ ...item, cost: { ...cost, utilities: utilities.map((u, i) => i === index ? { ...utility, equipment_id: e.target.value } : u) } })}><option value="">Selecciona un equipo</option>{(utility.kind === 'electricity' ? costingConfig.electricity_equipment : utility.kind === 'natural_gas' ? costingConfig.natural_gas_equipment : costingConfig.lpg_equipment)?.filter(e => e.active).map(e => <option value={e.id} key={e.id}>{e.name}</option>)}</select></label>
          <label>Tiempo (minutos)<input type="number" min="0" step="1" value={utility.minutes ?? 0} onChange={e => onChange({ ...item, cost: { ...cost, utilities: utilities.map((u, i) => i === index ? { ...utility, minutes: Number(e.target.value) || 0 } : u) } })} /></label>
          {utility.kind === 'electricity' && costingConfig.electricity_equipment?.find(equipment => equipment.id === utility.equipment_id)?.calculation_mode === 'measured' && <label>Consumo medido (kWh)<input type="number" min="0" step="0.001" value={utility.measured_kwh ?? 0} onChange={e => onChange({ ...item, cost: { ...cost, utilities: utilities.map((u, i) => i === index ? { ...utility, measured_kwh: Number(e.target.value) || 0 } : u) } })} /><small className="field-hint">El consumo medido tiene prioridad sobre la estimación.</small></label>}
        </>}
        <button type="button" className="icon-button" aria-label={`Quitar consumo ${index + 1}`} onClick={() => onChange({ ...item, cost: { ...cost, utilities: utilities.filter((_, i) => i !== index) } })}>×</button>
      </div>)}
      <div className="quick-cost-presets"><button type="button" className="secondary-button" disabled={!costingConfig.electricity_equipment?.some(e => e.active)} onClick={() => onChange({ ...item, cost: { ...cost, utilities: [...utilities, { kind: 'electricity', equipment_id: costingConfig.electricity_equipment?.find(e => e.active)?.id ?? '', minutes: 0 }] } })}><Zap size={15} /> Electricidad</button><button type="button" className="secondary-button" disabled={!costingConfig.natural_gas_equipment?.some(e => e.active)} onClick={() => onChange({ ...item, cost: { ...cost, utilities: [...utilities, { kind: 'natural_gas', equipment_id: costingConfig.natural_gas_equipment?.find(e => e.active)?.id ?? '', minutes: 0 }] } })}><Flame size={15} /> Gas natural</button><button type="button" className="secondary-button" disabled={!costingConfig.lpg_equipment?.some(e => e.active)} onClick={() => onChange({ ...item, cost: { ...cost, utilities: [...utilities, { kind: 'lpg', equipment_id: costingConfig.lpg_equipment?.find(e => e.active)?.id ?? '', minutes: 0 }] } })}><Flame size={15} /> GLP</button><button type="button" className="secondary-button" onClick={() => onChange({ ...item, cost: { ...cost, utilities: [...utilities, { kind: 'water', liters: 0 }] } })}><Droplets size={15} /> Agua</button></div>
      {utilityErrors.map((message, index) => <p className="cost-warning" role="alert" key={`${message}-${index}`}>{message}</p>)}
      <dl className="order-fields"><div><dt>Consumos directos</dt><dd>{amount(calculated.utilities_total)}</dd></div><div><dt>Overhead asignado</dt><dd>{amount(calculated.overhead_amount)}</dd></div></dl>
      <ul className="cost-trace-list">{calculated.trace.filter(entry => ['electricity','natural_gas','lpg','water','overhead'].includes(entry.key)).map((entry,index) => <li key={`${entry.key}-${index}`}><strong>{entry.label}</strong><span>{entry.formula} = {amount(entry.amount)}</span>{entry.inputs?.map(input => <small key={input.label}>{input.label}: {input.value} {input.unit ?? ''}</small>)}</li>)}</ul>
    </details>}
    <dl className="order-fields">
      <div><dt>Subtotal de producción</dt><dd>{amount(calculated.production_subtotal)}</dd></div>
      <div><dt>{supportsV1 ? 'Overhead asignado' : 'Gastos indirectos'}</dt><dd>{amount(supportsV1 ? calculated.overhead_amount : calculated.indirect_amount)}</dd></div>
      <div><dt>Costo interno de este ítem</dt><dd>{amount(calculated.production_cost)}</dd></div>
      <div><dt>Precio sugerido para la línea</dt><dd>{amount(calculated.suggested_product_price)}</dd></div>
      <div><dt>Precio sugerido unitario</dt><dd>{item.quantity > 0 ? `${amount(suggestedUnitPrice(item))}/${item.unit_label}` : 'Indica una cantidad'}</dd></div>
      <div><dt>Ganancia estimada de la línea</dt><dd>{pricePending ? 'Precio pendiente' : amount(calculated.estimated_profit)}</dd></div>
      <div><dt>Margen real sobre venta</dt><dd>{pricePending ? 'Precio pendiente' : `${calculated.real_margin_percent.toFixed(2)}%`}</dd></div>
    </dl>
    <p className="field-hint">El margen real compara la ganancia con el precio elegido. La ganancia sobre costo construye el precio sugerido.</p>
    <button type="button" className="primary" disabled={item.quantity <= 0} onClick={() => onChange({ ...item, unit_price: suggestedUnitPrice(item) })}>Usar precio sugerido</button>
    <p className="field-hint">Dividimos el precio sugerido entre la cantidad y redondeamos el precio unitario a dos decimales. El subtotal puede variar unos centavos.</p>
    {!pricePending && calculated.final_price < calculated.total_internal_cost && <p className="cost-warning" role="status">Este precio no cubre el costo estimado de producción.</p>}
    <p className="cost-private-note">Información interna. No aparece en documentos para el cliente.</p>
  </section>
}
