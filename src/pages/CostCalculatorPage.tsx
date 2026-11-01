import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Calculator, Check, Copy, Plus, RotateCcw, Trash2, Truck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Loading, Notice } from '../components/Feedback'
import type { Business, CostItemCategory } from '../lib/database.types'
import { calculateQuickCost, buildQuickCostSummary, validateQuickCost, type QuickCostDraft, type QuickCostSettings } from '../lib/quick-cost'
import { costItemCategories, defaultCostSettings, loadCostSettingsValues } from '../lib/costs'
import { formatCurrency } from '../lib/quotes'
import { errorMessage } from '../lib/supabase'

function newDraft(settings: QuickCostSettings): QuickCostDraft {
  return { productName: '', quantity: 1, unit: 'unidad', ingredientsCost: 0, laborHours: 0, settings: { ...settings }, directCosts: [], deliveryInternalCost: 0, deliveryCustomerCharge: 0, finalPrice: null }
}

function numberInput(value: number, showZero = false) {
  return Number.isFinite(value) && (showZero || value !== 0) ? value : ''
}

export function CostCalculatorPage({ business }: { business: Business }) {
  const [defaults, setDefaults] = useState<QuickCostSettings>({ ...defaultCostSettings })
  const [draft, setDraft] = useState<QuickCostDraft>(() => newDraft(defaultCostSettings))
  const [loading, setLoading] = useState(true)
  const [settingsWarning, setSettingsWarning] = useState('')
  const [showValidation, setShowValidation] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    let active = true
    void loadCostSettingsValues(business.id)
      .then(values => {
        if (!active) return
        setDefaults(values)
        setDraft(newDraft(values))
        setSettingsWarning('')
      })
      .catch(error => {
        if (!active) return
        const fallback = { ...defaultCostSettings }
        setDefaults(fallback)
        setDraft(newDraft(fallback))
        setSettingsWarning(`No pudimos leer tus valores guardados. Este cálculo usará los valores predeterminados: ${errorMessage(error)}`)
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [business.id])

  useEffect(() => {
    if (!copyMessage) return
    const timer = window.setTimeout(() => setCopyMessage(''), 2400)
    return () => window.clearTimeout(timer)
  }, [copyMessage])

  const calculation = useMemo(() => calculateQuickCost(draft), [draft])
  const errors = validateQuickCost(draft)
  const hasCosts = draft.ingredientsCost > 0 || draft.laborHours > 0 || draft.directCosts.some(item => item.cost > 0) || draft.deliveryInternalCost > 0
  const valid = errors.length === 0
  const currency = (amount: number) => formatCurrency(amount, business)
  const setField = <K extends keyof QuickCostDraft>(key: K, value: QuickCostDraft[K]) => {
    setDraft(current => ({ ...current, [key]: value }))
    setCopyMessage('')
  }
  const parseNumber = (value: string) => value.trim() === '' ? Number.NaN : Number(value)
  const visibleErrors = showValidation ? errors : []
  const errorFor = (field: string) => visibleErrors.find(error => error.field === field)?.message

  function restore() {
    setDraft(newDraft(defaults))
    setShowValidation(false)
    setCopyMessage('')
  }

  function useSuggestedPrice() {
    setShowValidation(true)
    if (!valid || !hasCosts) return
    setField('finalPrice', calculation.costs.suggested_customer_total)
  }

  async function copySummary() {
    setShowValidation(true)
    if (!valid || !hasCosts) return
    if (!navigator.clipboard?.writeText) {
      setCopyMessage('No está disponible la función de copiar en este navegador.')
      return
    }
    try {
      await navigator.clipboard.writeText(buildQuickCostSummary(draft, calculation, currency))
      setCopyMessage('Resumen copiado')
    } catch {
      setCopyMessage('No pudimos copiar el resumen. Revisa los permisos del navegador.')
    }
  }

  function updateDirectCost(index: number, key: 'category' | 'name' | 'cost', value: string) {
    setDraft(current => ({
      ...current,
      directCosts: current.directCosts.map((item, itemIndex) => itemIndex !== index ? item : {
        ...item,
        [key]: key === 'category' ? value as CostItemCategory : key === 'cost' ? parseNumber(value) : value,
      }),
    }))
    setCopyMessage('')
  }

  function updateSetting(key: keyof QuickCostSettings, rawValue: string) {
    setDraft(current => ({ ...current, settings: { ...current.settings, [key]: parseNumber(rawValue) } }))
    setCopyMessage('')
  }

  if (loading) return <Loading text="Cargando los valores de costos de tu negocio…" />

  return <div className="cost-calculator-page">
    <header className="page-heading cost-calculator-heading">
      <div><span className="eyebrow accent">PRODUCTIVIDAD</span><h1>Calculadora de costo<span className="heading-dot">.</span></h1><p className="muted">Estima cuánto cuesta producir y qué precio podrías cobrar, sin crear una cotización.</p></div>
      <button type="button" className="secondary-button cost-reset" onClick={restore}><RotateCcw size={16} /> Restablecer</button>
    </header>

    {settingsWarning && <Notice error>{settingsWarning}</Notice>}

    <div className="cost-calculator-layout">
      <div className="cost-calculator-form">
        <section className="panel form-section cost-step" aria-labelledby="quick-cost-product-title">
          <div className="section-title"><span className="section-icon"><Calculator size={20} /></span><div><h2 id="quick-cost-product-title">¿Qué vas a preparar?</h2><p>Estos datos solo se usan en este cálculo.</p></div></div>
          <div className="form-grid cost-fields-grid">
            <label>Nombre del producto <span className="optional">Opcional</span><input autoComplete="off" maxLength={120} placeholder="Ej. Pastel tres leches" value={draft.productName} onChange={event => setField('productName', event.target.value)} /></label>
            <div className="cost-quantity-row">
              <label>Cantidad o rendimiento<input aria-invalid={Boolean(errorFor('quantity'))} type="number" min="0.001" step="0.001" value={numberInput(draft.quantity)} onChange={event => setField('quantity', event.target.value === '' ? Number.NaN : Number(event.target.value))} onBlur={() => setShowValidation(true)} /></label>
              <label>Unidad<input maxLength={30} placeholder="unidad" value={draft.unit} aria-invalid={Boolean(errorFor('unit'))} onChange={event => setField('unit', event.target.value)} onBlur={() => setShowValidation(true)} /></label>
            </div>
          </div>
          {(errorFor('quantity') || errorFor('unit')) && <p className="cost-field-error">{errorFor('quantity') || errorFor('unit')}</p>}
        </section>

        <section className="panel form-section cost-step" aria-labelledby="quick-cost-production-title">
          <div className="section-title"><span className="section-icon"><BookOpen size={20} /></span><div><h2 id="quick-cost-production-title">Costos de producción</h2><p>Escribe lo que sabes; ARPE calcula los totales.</p></div></div>
          <label>Costo total de ingredientes<input aria-label="Costo total de ingredientes" type="number" min="0" step="0.01" inputMode="decimal" value={numberInput(draft.ingredientsCost)} onChange={event => setField('ingredientsCost', parseNumber(event.target.value))} onBlur={() => setShowValidation(true)} /><small className="field-hint">Para toda la cantidad indicada, no por unidad.</small></label>
          {errorFor('ingredientsCost') && <p className="cost-field-error">{errorFor('ingredientsCost')}</p>}
          {draft.ingredientsCost > 0 && <div className="cost-inline-result"><span>Merma estimada <small>Se calcula automáticamente con {draft.settings.waste_percent}%</small></span><strong>{currency(calculation.costs.waste_amount)}</strong></div>}
          <label className="cost-narrow-field">Horas estimadas de trabajo<input aria-label="Horas estimadas de trabajo" type="number" min="0" step="0.25" inputMode="decimal" value={numberInput(draft.laborHours)} onChange={event => setField('laborHours', parseNumber(event.target.value))} onBlur={() => setShowValidation(true)} /></label>
          {errorFor('laborHours') && <p className="cost-field-error">{errorFor('laborHours')}</p>}
          {draft.laborHours > 0 && <div className="cost-inline-result"><span>Mano de obra <small>{draft.laborHours} h × {currency(draft.settings.labor_hourly_rate)}/h</small></span><strong>{currency(calculation.costs.labor_cost)}</strong></div>}
        </section>

        <section className="panel form-section cost-step" aria-labelledby="quick-cost-direct-title">
          <div className="section-title"><span className="section-icon"><Plus size={20} /></span><div><h2 id="quick-cost-direct-title">Gastos adicionales</h2><p>Agrega empaques, decoraciones u otros gastos directos.</p></div></div>
          {draft.directCosts.map((item, index) => <div className="quick-cost-item" key={index}>
            <label>Categoría<select aria-label="Categoría del gasto" value={item.category} onChange={event => updateDirectCost(index, 'category', event.target.value)}>{costItemCategories.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Descripción<input aria-label="Descripción del gasto" maxLength={100} placeholder="Ej. Caja para pastel" value={item.name} onChange={event => updateDirectCost(index, 'name', event.target.value)} /></label>
            <label>Costo<input aria-label="Costo del gasto" type="number" min="0" step="0.01" inputMode="decimal" value={numberInput(item.cost)} onChange={event => updateDirectCost(index, 'cost', event.target.value)} onBlur={() => setShowValidation(true)} /></label>
            <button className="icon-button cost-remove-item" type="button" aria-label={`Quitar gasto ${index + 1}`} onClick={() => setDraft(current => ({ ...current, directCosts: current.directCosts.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={17} /></button>
          </div>)}
          {errorFor('directCostName') && <p className="cost-field-error">{errorFor('directCostName')}</p>}
          {errorFor('directCostCost') && <p className="cost-field-error">{errorFor('directCostCost')}</p>}
          {draft.directCosts.length > 0 && <div className="cost-inline-result"><span>Total de gastos adicionales</span><strong>{currency(calculation.costs.direct_costs_total)}</strong></div>}
          <button type="button" className="secondary-button cost-add-item" onClick={() => setDraft(current => ({ ...current, directCosts: [...current.directCosts, { category: 'other', name: '', cost: 0 }] }))}><Plus size={17} /> Agregar gasto</button>
        </section>

        <section className="panel form-section cost-step" aria-labelledby="quick-cost-delivery-title">
          <div className="section-title"><span className="section-icon"><Truck size={20} /></span><div><h2 id="quick-cost-delivery-title">Entrega <span className="optional">Opcional</span></h2><p>Separa lo que te cuesta de lo que cobras al cliente.</p></div></div>
          <div className="form-grid cost-fields-grid">
            <label>Costo interno de entrega<input aria-label="Costo interno de entrega" type="number" min="0" step="0.01" inputMode="decimal" value={numberInput(draft.deliveryInternalCost)} onChange={event => setField('deliveryInternalCost', parseNumber(event.target.value))} /><small className="field-hint">Lo que realmente le cuesta al negocio realizar o pagar la entrega.</small></label>
            <label>Cobro de entrega al cliente<input aria-label="Cobro de entrega al cliente" type="number" min="0" step="0.01" inputMode="decimal" value={numberInput(draft.deliveryCustomerCharge)} onChange={event => setField('deliveryCustomerCharge', parseNumber(event.target.value))} /><small className="field-hint">Lo que deseas cobrar al cliente por la entrega.</small></label>
          </div>
        </section>

        <details className="panel quick-cost-settings" open>
          <summary><span><strong>Parámetros aplicados</strong><small>Valores de costos de tu negocio; los cambios quedan en este cálculo.</small></span></summary>
          <div className="form-grid cost-fields-grid quick-cost-setting-grid">
            <label>Merma (%)<input type="number" min="0" max="100" step="0.01" value={numberInput(draft.settings.waste_percent, true)} onChange={event => updateSetting('waste_percent', event.target.value)} onBlur={() => setShowValidation(true)} /><small className="field-hint">Cubre sobrantes, desperdicios y pequeñas pérdidas.</small></label>
            <label>Gastos indirectos (%)<input type="number" min="0" step="0.01" value={numberInput(draft.settings.indirect_percent, true)} onChange={event => updateSetting('indirect_percent', event.target.value)} onBlur={() => setShowValidation(true)} /><small className="field-hint">Agua, electricidad, gas, limpieza y desgaste de equipos.</small></label>
            <label>Costo por hora<input type="number" min="0" step="0.01" value={numberInput(draft.settings.labor_hourly_rate, true)} onChange={event => updateSetting('labor_hourly_rate', event.target.value)} onBlur={() => setShowValidation(true)} /><small className="field-hint">Lo que deseas reconocer por cada hora de trabajo.</small></label>
            <label>Ganancia sobre costo (%)<input type="number" min="0" step="0.01" value={numberInput(draft.settings.markup_percent, true)} onChange={event => updateSetting('markup_percent', event.target.value)} onBlur={() => setShowValidation(true)} /><small className="field-hint">Porcentaje usado para construir el precio sugerido.</small></label>
          </div>
          <div className="quick-cost-setting-footer"><span>Estos cambios solo aplican a este cálculo.</span><Link className="text-link" to="/configuracion">Editar valores predeterminados</Link></div>
          {visibleErrors.filter(error => error.field.startsWith('settings.')).map(error => <p className="cost-field-error" key={error.field}>{error.message}</p>)}
        </details>
      </div>

      <aside className="panel cost-calculator-results" aria-labelledby="quick-cost-results-title">
        <div className="section-title"><span className="section-icon"><Calculator size={20} /></span><div><h2 id="quick-cost-results-title">Resultado del cálculo</h2><p>Se actualiza mientras ingresas tus datos.</p></div></div>
        {showValidation && !valid && <div className="cost-validation" role="alert">{errors.map(error => <p key={`${error.field}-${error.message}`}>{error.message}</p>)}</div>}
        {!hasCosts || !valid ? <div className="cost-result-empty"><span className="cost-calculator-icon"><Calculator size={23} /></span><p>{hasCosts ? 'Revisa los datos señalados para ver un resultado confiable.' : 'Agrega tus costos para ver el resultado.'}</p></div> : <>
          <dl className="cost-result-list">
            <ResultRow label="Ingredientes" value={currency(calculation.costs.ingredients_cost)} />
            <ResultRow label={`Merma estimada (${calculation.costs.waste_percent}%)`} value={currency(calculation.costs.waste_amount)} />
            <ResultRow label="Gastos adicionales" value={currency(calculation.costs.direct_costs_total)} />
            <ResultRow label="Mano de obra" value={currency(calculation.costs.labor_cost)} />
            <ResultRow label="Subtotal de producción" value={currency(calculation.costs.production_subtotal)} />
            <ResultRow label={`Gastos indirectos (${calculation.costs.indirect_percent}%)`} value={currency(calculation.costs.indirect_amount)} />
            <ResultRow label="Costo de producción" value={currency(calculation.costs.production_cost)} strong />
            {calculation.costs.delivery_internal_cost > 0 && <ResultRow label="Entrega — costo interno" value={currency(calculation.costs.delivery_internal_cost)} />}
            <ResultRow label="Costo interno total" value={currency(calculation.costs.total_internal_cost)} strong />
            <ResultRow label="Costo por unidad" value={`${currency(calculation.costs.production_cost / draft.quantity)} / ${draft.unit}`} />
          </dl>
          <div className="cost-suggested-price"><span>Precio sugerido del producto</span><strong>{currency(calculation.costs.suggested_product_price)}</strong><small>{currency(calculation.suggestedUnitPrice ?? 0)} / {draft.unit} · Ganancia sobre costo: {calculation.costs.markup_percent}%</small></div>
          {calculation.costs.delivery_customer_charge > 0 && <div className="cost-suggested-total"><span>Entrega cobrada al cliente</span><strong>{currency(calculation.costs.delivery_customer_charge)}</strong><span>Total sugerido al cliente</span><strong>{currency(calculation.costs.suggested_customer_total)}</strong></div>}
          <button type="button" className="primary cost-use-suggested" onClick={useSuggestedPrice}>Usar precio sugerido</button>
          <label className="cost-final-price">Precio que piensas cobrar<input type="number" min="0" step="0.01" inputMode="decimal" value={draft.finalPrice === null ? '' : numberInput(draft.finalPrice, true)} onChange={event => setField('finalPrice', event.target.value.trim() === '' ? null : Number(event.target.value))} onBlur={() => setShowValidation(true)} /></label>
          {draft.finalPrice === null || draft.finalPrice === 0 ? <p className="cost-final-hint">Indica un precio final para conocer tu ganancia y margen real.</p> : <div className="cost-profit-summary"><dl><ResultRow label="Ganancia estimada" value={currency(calculation.costs.estimated_profit)} strong /><ResultRow label="Margen real sobre venta" value={`${calculation.costs.real_margin_percent}%`} strong /></dl><p>La ganancia sobre costo construye el precio sugerido. El margen real mide la ganancia respecto al precio final elegido.</p>{calculation.costs.estimated_profit < 0 && <div className="cost-loss-warning" role="status">Este precio no cubre el costo estimado.</div>}</div>}
          <button type="button" className="secondary-button cost-copy-summary" onClick={() => void copySummary()}><Copy size={17} /> Copiar resumen</button>
          {copyMessage && <Notice>{copyMessage === 'Resumen copiado' && <Check size={16} />}{copyMessage}</Notice>}
        </>}
      </aside>
    </div>

    <section className="cost-calculator-roadmap" aria-labelledby="cost-calculator-roadmap-title">
      <div className="cost-calculator-roadmap-heading"><div><span className="eyebrow">SIGUIENTE ETAPA</span><h2 id="cost-calculator-roadmap-title">Herramientas para crecer</h2></div><span className="subtle-badge">En preparación</span></div>
      <p>Seguimos ampliando las herramientas para ayudarte con el costeo de tu negocio.</p>
      <ul className="cost-calculator-tools"><li><span aria-hidden="true"><BookOpen size={18} /></span><strong>Costo por receta</strong><small>Próximamente</small></li></ul>
    </section>
  </div>
}

function ResultRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className={`cost-result-row${strong ? ' is-strong' : ''}`}><dt>{label}</dt><dd>{value}</dd></div>
}
