import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Calculator, Check, Copy, Plus, RotateCcw, Trash2, Truck, Zap, Droplets, Flame, Save } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Loading, Notice } from '../components/Feedback'
import type { Business, CostItemCategory } from '../lib/database.types'
import { calculateQuickCost, buildQuickCostSummary, validateQuickCost, type QuickCostDraft, type QuickCostSettings } from '../lib/quick-cost'
import { costItemCategories, defaultCostSettingsValues, loadCostSettingsValues, saveCostSettings } from '../lib/costs'
import { defaultCostingConfig, type UtilityInput } from '../lib/costing-engine'
import { quickCostExpensePresets } from '../lib/quick-cost'
import { formatCurrency } from '../lib/quotes'
import { errorMessage } from '../lib/supabase'

function newDraft(settings: QuickCostSettings): QuickCostDraft {
  return { productName: '', quantity: 1, unit: 'unidad', ingredientsCost: 0, laborHours: 0, settings: { ...settings }, directCosts: [], utilities: [], costingConfig: defaultCostingConfig, deliveryInternalCost: 0, deliveryCustomerCharge: 0, finalPrice: null }
}

function numberInput(value: number, showZero = false) {
  return Number.isFinite(value) && (showZero || value !== 0) ? value : ''
}

export function CostCalculatorPage({ business }: { business: Business }) {
  const [defaults, setDefaults] = useState<QuickCostSettings>(() => defaultCostSettingsValues())
  const [draft, setDraft] = useState<QuickCostDraft>(() => newDraft(defaultCostSettingsValues()))
  const [loading, setLoading] = useState(true)
  const [settingsWarning, setSettingsWarning] = useState('')
  const [savingDefaults, setSavingDefaults] = useState(false)
  const [defaultsMessage, setDefaultsMessage] = useState('')
  const [showValidation, setShowValidation] = useState(false)
  const [copyMessage, setCopyMessage] = useState('')
  const [directCostsOpen, setDirectCostsOpen] = useState(false)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    let active = true
    void loadCostSettingsValues(business.id)
      .then(values => {
        if (!active) return
        setDefaults(values)
        setDraft({ ...newDraft(values), costingConfig: values.costing_config ?? defaultCostingConfig })
        setSettingsWarning('')
      })
      .catch(error => {
        if (!active) return
        const fallback = defaultCostSettingsValues()
        setDefaults(fallback)
        setDraft({ ...newDraft(fallback), costingConfig: defaultCostingConfig })
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
  const supportsV1 = draft.settings.activeModel === 'v1'
  const preparedForV1 = draft.settings.schemaCapability === 'v1-schema' && draft.settings.activeModel === 'legacy'
  const hasCosts = draft.ingredientsCost > 0 || draft.laborHours > 0 || draft.directCosts.some(item => item.cost > 0) || (supportsV1 && (draft.utilities ?? []).length > 0) || draft.deliveryInternalCost > 0
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
    setDraft({ ...newDraft(defaults), costingConfig: draft.costingConfig })
    setShowValidation(false)
    setCopyMessage('')
    setDirectCostsOpen(false)
    setDeliveryOpen(false)
    setSettingsOpen(false)
  }

  async function saveDefaults() {
    setSavingDefaults(true); setDefaultsMessage('')
    try {
      const values = { ...draft.settings }
      await saveCostSettings(business.id, values)
      setDefaults(values); setDraft(current => ({ ...current, settings: { ...values } }))
      setDefaultsMessage('Valores predeterminados guardados')
    } catch { setDefaultsMessage('Error al guardar') } finally { setSavingDefaults(false) }
  }

  function addPreset(id: string) {
    const preset = quickCostExpensePresets.find(item => item.id === id)
    if (!preset) return
    setDraft(current => ({ ...current, directCosts: [...current.directCosts, { category: preset.category, name: preset.description || 'Otro gasto', cost: 0 }] }))
  }
  function addUtility(kind: UtilityInput['kind']) {
    const config = draft.costingConfig ?? defaultCostingConfig
    const equipmentId = kind === 'electricity' ? config.electricity_equipment?.find(e => e.active)?.id : kind === 'natural_gas' ? config.natural_gas_equipment?.find(e => e.active)?.id : kind === 'lpg' ? config.lpg_equipment?.find(e => e.active)?.id : undefined
    const value: UtilityInput = kind === 'water' ? { kind, liters: 0 } : { kind, equipment_id: equipmentId ?? '', minutes: 0 }
    setDraft(current => ({ ...current, utilities: [...(current.utilities ?? []), value] }))
  }
  function updateUtility(index: number, next: UtilityInput) { setDraft(current => ({ ...current, utilities: (current.utilities ?? []).map((value, i) => i === index ? next : value) })) }

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
    {preparedForV1 && <p className="field-hint" role="status">Modelo actual: Clásico. La configuración avanzada está disponible en Configuración, pero este cálculo continúa usando la fórmula clásica.</p>}

    <div className="cost-calculator-layout">
      <div className="cost-calculator-form">
        <section className="panel form-section cost-step cost-step-product" aria-labelledby="quick-cost-product-title">
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

        <section className="panel form-section cost-step cost-step-production" aria-labelledby="quick-cost-production-title">
          <div className="section-title"><span className="section-icon"><BookOpen size={20} /></span><div><h2 id="quick-cost-production-title">Costos de producción</h2><p>Escribe lo que sabes; EJNEXA hace los cálculos.</p></div></div>
          <label>Costo total de ingredientes<input aria-label="Costo total de ingredientes" type="number" min="0" step="0.01" inputMode="decimal" value={numberInput(draft.ingredientsCost)} onChange={event => setField('ingredientsCost', parseNumber(event.target.value))} onBlur={() => setShowValidation(true)} /><small className="field-hint">Para toda la cantidad indicada, no por unidad.</small></label>
          {errorFor('ingredientsCost') && <p className="cost-field-error">{errorFor('ingredientsCost')}</p>}
          {draft.ingredientsCost > 0 && <div className="cost-inline-result"><span>Merma estimada <small>Se calcula automáticamente con {draft.settings.waste_percent}%</small></span><strong>{currency(calculation.costs.waste_amount)}</strong></div>}
          <label className="cost-narrow-field">Horas estimadas de trabajo<input aria-label="Horas estimadas de trabajo" type="number" min="0" step="0.25" inputMode="decimal" value={numberInput(draft.laborHours)} onChange={event => setField('laborHours', parseNumber(event.target.value))} onBlur={() => setShowValidation(true)} /></label>
          {errorFor('laborHours') && <p className="cost-field-error">{errorFor('laborHours')}</p>}
          {draft.laborHours > 0 && <div className="cost-inline-result"><span>Mano de obra <small>{draft.laborHours} h × {currency(draft.settings.labor_hourly_rate)}/h</small></span><strong>{currency(calculation.costs.labor_cost)}</strong></div>}
        </section>

        <section className="panel form-section cost-step cost-step-direct" aria-labelledby="quick-cost-direct-title">
          <div className="section-title"><span className="section-icon"><Plus size={20} /></span><div><h2 id="quick-cost-direct-title">Gastos adicionales</h2><p>Empaques, decoraciones y otros gastos del pedido.</p></div></div>
          {!directCostsOpen && <div className="quick-cost-collapsed-summary">
            <div><strong>{draft.directCosts.length ? `${draft.directCosts.length} ${draft.directCosts.length === 1 ? 'gasto' : 'gastos'}` : 'Ninguno agregado'}</strong>{draft.directCosts.length > 0 && <span>{currency(calculation.costs.direct_costs_total)}</span>}</div>
            {draft.directCosts.length > 0
              ? <button type="button" className="secondary-button quick-cost-disclosure" aria-expanded="false" aria-controls="quick-cost-direct-fields" onClick={() => setDirectCostsOpen(true)}>Editar gastos</button>
              : <button type="button" className="secondary-button quick-cost-disclosure" aria-expanded="false" aria-controls="quick-cost-direct-fields" onClick={() => setDirectCostsOpen(true)}><Plus size={16} /> Agregar gasto</button>}
          </div>}
          {!directCostsOpen && <div id="quick-cost-direct-fields" hidden />}
          {directCostsOpen && <div id="quick-cost-direct-fields" className="quick-cost-expanded-content">
            <button type="button" className="text-button quick-cost-close" aria-expanded="true" aria-controls="quick-cost-direct-fields" onClick={() => setDirectCostsOpen(false)}>Ocultar gastos</button>
            <div className="quick-cost-presets" aria-label="Accesos rápidos para gastos">{quickCostExpensePresets.map(preset => <button key={preset.id} type="button" className="secondary-button" onClick={() => addPreset(preset.id)}>{preset.label}</button>)}</div>
            {draft.directCosts.map((item, index) => <div className="quick-cost-item" key={index}>
              <label>Categoría<select aria-label="Categoría del gasto" value={item.category} onChange={event => updateDirectCost(index, 'category', event.target.value)}>{costItemCategories.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label>Descripción<input aria-label="Descripción del gasto" maxLength={100} placeholder="Ej. Caja para pastel" value={item.name} onChange={event => updateDirectCost(index, 'name', event.target.value)} /></label>
              <label>Costo<input aria-label="Costo del gasto" type="number" min="0" step="0.01" inputMode="decimal" value={numberInput(item.cost)} onChange={event => updateDirectCost(index, 'cost', event.target.value)} onBlur={() => setShowValidation(true)} /></label>
              <button className="icon-button cost-remove-item" type="button" aria-label={`Quitar gasto ${index + 1}`} onClick={() => setDraft(current => ({ ...current, directCosts: current.directCosts.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={17} /></button>
            </div>)}
            {errorFor('directCostName') && <p className="cost-field-error">{errorFor('directCostName')}</p>}
            {errorFor('directCostCost') && <p className="cost-field-error">{errorFor('directCostCost')}</p>}
            {draft.directCosts.length > 0 && <div className="cost-inline-result"><span>Total de gastos adicionales</span><strong>{currency(calculation.costs.direct_costs_total)}</strong></div>}
            <button type="button" className="secondary-button cost-add-item" onClick={() => addPreset('other')}><Plus size={17} /> Agregar otro gasto</button>
          </div>}
        </section>

        {supportsV1 && <section className="panel form-section cost-step" aria-labelledby="quick-cost-utilities-title">
          <div className="section-title"><span className="section-icon"><Zap size={20} /></span><div><h2 id="quick-cost-utilities-title">Consumos de producción</h2><p>Agrega solo consumos de este lote; no se duplican en overhead.</p></div></div>
          {!(draft.utilities?.length) && <div className="quick-cost-collapsed-summary"><div><strong>Sin consumos agregados</strong></div></div>}
          {(draft.utilities ?? []).map((utility, index) => <div className="quick-cost-item" key={index}>
            {utility.kind === 'water' ? <><label>Litros utilizados<input type="number" min="0" step="0.1" value={numberInput(utility.liters, true)} onChange={event => updateUtility(index, { ...utility, liters: Number(event.target.value) || 0 })} /><small className="field-hint">{currency(draft.costingConfig?.water_rate_per_liter ?? 0)} por litro</small></label></> : <>
              <label>Equipo<select value={utility.equipment_id} onChange={event => updateUtility(index, { ...utility, equipment_id: event.target.value })}><option value="">Selecciona un equipo</option>{(utility.kind === 'electricity' ? draft.costingConfig?.electricity_equipment : utility.kind === 'natural_gas' ? draft.costingConfig?.natural_gas_equipment : draft.costingConfig?.lpg_equipment)?.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
              <label>Tiempo de uso (minutos)<input type="number" min="0" step="1" value={numberInput(utility.minutes ?? 0, true)} onChange={event => updateUtility(index, { ...utility, minutes: Number(event.target.value) || 0 })} /></label>
              {utility.kind === 'electricity' && draft.costingConfig?.electricity_equipment?.find(item => item.id === utility.equipment_id)?.calculation_mode === 'measured' && <label>Consumo medido (kWh)<input type="number" min="0" step="0.001" value={numberInput(utility.measured_kwh ?? 0, true)} onChange={event => updateUtility(index, { ...utility, measured_kwh: Number(event.target.value) || 0 })} /><small className="field-hint">El kWh medido por ciclo tiene prioridad sobre la potencia estimada.</small></label>}
            </>}
            <button className="icon-button cost-remove-item" type="button" aria-label={`Quitar consumo ${index + 1}`} onClick={() => setDraft(current => ({ ...current, utilities: current.utilities?.filter((_, i) => i !== index) }))}><Trash2 size={17} /></button>
          </div>)}
          <div className="quick-cost-presets"><button type="button" className="secondary-button" disabled={!draft.costingConfig?.electricity_equipment?.some(item => item.active)} onClick={() => addUtility('electricity')}><Zap size={15} /> Electricidad</button><button type="button" className="secondary-button" disabled={!draft.costingConfig?.natural_gas_equipment?.some(item => item.active)} onClick={() => addUtility('natural_gas')}><Flame size={15} /> Gas natural</button><button type="button" className="secondary-button" disabled={!draft.costingConfig?.lpg_equipment?.some(item => item.active)} onClick={() => addUtility('lpg')}><Flame size={15} /> GLP / Propano</button><button type="button" className="secondary-button" onClick={() => addUtility('water')}><Droplets size={15} /> Agua</button><Link className="text-link" to="/configuracion">Configurar consumos</Link></div>
          {visibleErrors.filter(item => item.field === 'utilities').map((item, index) => <p className="cost-field-error" role="alert" key={`${item.message}-${index}`}>{item.message}</p>)}
        </section>}

        <section className="panel form-section cost-step cost-step-delivery" aria-labelledby="quick-cost-delivery-title">
          <div className="section-title"><span className="section-icon"><Truck size={20} /></span><div><h2 id="quick-cost-delivery-title">Entrega <span className="optional">Opcional</span></h2><p>Separa lo que te cuesta de lo que cobras al cliente.</p></div></div>
          {!deliveryOpen && <div className="quick-cost-collapsed-summary">
            <div><strong>{draft.deliveryInternalCost > 0 || draft.deliveryCustomerCharge > 0 ? 'Entrega configurada' : 'Sin entrega'}</strong>{(draft.deliveryInternalCost > 0 || draft.deliveryCustomerCharge > 0) && <span>{currency(draft.deliveryInternalCost)} de costo · {currency(draft.deliveryCustomerCharge)} al cliente</span>}</div>
            <button type="button" className="secondary-button quick-cost-disclosure" aria-expanded="false" aria-controls="quick-cost-delivery-fields" onClick={() => setDeliveryOpen(true)}>{draft.deliveryInternalCost > 0 || draft.deliveryCustomerCharge > 0 ? 'Editar entrega' : 'Configurar'}</button>
          </div>}
          {!deliveryOpen && <div id="quick-cost-delivery-fields" hidden />}
          {deliveryOpen && <div id="quick-cost-delivery-fields" className="quick-cost-expanded-content">
            <button type="button" className="text-button quick-cost-close" aria-expanded="true" aria-controls="quick-cost-delivery-fields" onClick={() => setDeliveryOpen(false)}>Ocultar entrega</button>
            <div className="form-grid cost-fields-grid">
              <label>Costo interno de entrega<input aria-label="Costo interno de entrega" type="number" min="0" step="0.01" inputMode="decimal" value={numberInput(draft.deliveryInternalCost)} onChange={event => setField('deliveryInternalCost', parseNumber(event.target.value))} /><small className="field-hint">Lo que realmente le cuesta al negocio realizar o pagar la entrega.</small></label>
              <label>Cobro de entrega al cliente<input aria-label="Cobro de entrega al cliente" type="number" min="0" step="0.01" inputMode="decimal" value={numberInput(draft.deliveryCustomerCharge)} onChange={event => setField('deliveryCustomerCharge', parseNumber(event.target.value))} /><small className="field-hint">Lo que deseas cobrar al cliente por la entrega.</small></label>
            </div>
          </div>}
        </section>

        <section className={`panel quick-cost-settings${settingsOpen ? ' is-open' : ''}`} aria-labelledby="quick-cost-settings-title">
          <div className="quick-cost-settings-heading"><div><h2 id="quick-cost-settings-title">Parámetros aplicados</h2><p>Valores de tu negocio; los cambios solo aplican a este cálculo.</p></div><button type="button" className="secondary-button quick-cost-disclosure" aria-expanded={settingsOpen} aria-controls="quick-cost-setting-fields" onClick={() => setSettingsOpen(open => !open)}>{settingsOpen ? 'Ocultar' : 'Editar parámetros'}</button></div>
          {!settingsOpen && <div className="quick-cost-setting-chips" aria-label="Valores aplicados">
            <span>Merma <strong>{draft.settings.waste_percent}%</strong></span>{supportsV1 ? <span>Overhead/h <strong>{currency(calculation.costs.overhead_rate_per_hour)}</strong></span> : <span>Indirectos <strong>{draft.settings.indirect_percent}%</strong></span>}<span>Costo/hora <strong>{currency(draft.settings.labor_hourly_rate)}</strong></span><span>Ganancia <strong>{draft.settings.markup_percent}%</strong></span>
          </div>}
          {!settingsOpen && <div id="quick-cost-setting-fields" hidden />}
          {settingsOpen && <div id="quick-cost-setting-fields" className="quick-cost-expanded-content">
            <div className="form-grid cost-fields-grid quick-cost-setting-grid">
              <label>Merma (%)<input type="number" min="0" max="100" step="0.01" value={numberInput(draft.settings.waste_percent, true)} onChange={event => updateSetting('waste_percent', event.target.value)} onBlur={() => setShowValidation(true)} /><small className="field-hint">Cubre sobrantes, desperdicios y pequeñas pérdidas.</small></label>
              {supportsV1 ? <p className="field-hint">El overhead se asigna por horas productivas. Configura gastos generales y horas mensuales en Configuración.</p> : <label>Gastos indirectos (%)<input type="number" min="0" step="0.01" value={numberInput(draft.settings.indirect_percent, true)} onChange={event => updateSetting('indirect_percent', event.target.value)} onBlur={() => setShowValidation(true)} /><small className="field-hint">Porcentaje aplicado al subtotal de producción para cubrir gastos generales.</small></label>}
              <label>Costo por hora<input type="number" min="0" step="0.01" value={numberInput(draft.settings.labor_hourly_rate, true)} onChange={event => updateSetting('labor_hourly_rate', event.target.value)} onBlur={() => setShowValidation(true)} /><small className="field-hint">Lo que deseas reconocer por cada hora de trabajo.</small></label>
              <label>Ganancia sobre costo (%)<input type="number" min="0" step="0.01" value={numberInput(draft.settings.markup_percent, true)} onChange={event => updateSetting('markup_percent', event.target.value)} onBlur={() => setShowValidation(true)} /><small className="field-hint">Porcentaje usado para construir el precio sugerido.</small></label>
            </div>
            {supportsV1 && <details className="cost-allocation-advanced"><summary>Asignación avanzada de overhead</summary><label>Horas productivas asignadas<input type="number" min="0" step="0.25" value={numberInput(draft.overheadAllocationHours ?? draft.laborHours, true)} onChange={event => setField('overheadAllocationHours', parseNumber(event.target.value))} /><small className="field-hint">Por defecto usa las horas de mano de obra. Cambiar la tarifa por hora no modifica esta asignación.</small></label><button type="button" className="text-button" onClick={() => setField('overheadAllocationHours', undefined)}>Usar horas de mano de obra</button></details>}
            {draft.laborHours > 0 && draft.settings.labor_hourly_rate === 0 && <div className="cost-loss-warning" role="status"><strong>Mano de obra no incluida</strong><p>Indicaste horas de trabajo, pero tu costo por hora está configurado en {currency(0)}.</p><Link className="text-link" to="/configuracion">Editar parámetros</Link></div>}
            <div className="quick-cost-setting-footer"><span>Estos cambios solo aplican a este cálculo.</span><button type="button" className="secondary-button" disabled={savingDefaults} onClick={() => void saveDefaults()}>{savingDefaults ? 'Guardando…' : 'Guardar como predeterminados'} <Save size={15} /></button><Link className="text-link" to="/configuracion">Configuración completa</Link></div>
            {defaultsMessage && <p role="status">{defaultsMessage}</p>}
            {visibleErrors.filter(error => error.field.startsWith('settings.')).map(error => <p className="cost-field-error" key={error.field}>{error.message}</p>)}
          </div>}
        </section>
      </div>

      <aside className="panel cost-calculator-results cost-step-results" aria-labelledby="quick-cost-results-title">
        <div className="section-title"><span className="section-icon"><Calculator size={20} /></span><div><h2 id="quick-cost-results-title">Resultado del cálculo</h2><p>Se actualiza mientras ingresas tus datos.</p></div></div>
        {showValidation && !valid && <div className="cost-validation" role="alert">{errors.map(error => <p key={`${error.field}-${error.message}`}>{error.message}</p>)}</div>}
        {!hasCosts || !valid ? <div className="cost-result-empty"><span className="cost-calculator-icon"><Calculator size={23} /></span><p>{hasCosts ? 'Revisa los datos señalados para ver un resultado confiable.' : 'Agrega tus costos para ver el resultado.'}</p></div> : <>
          <div className="cost-suggested-price"><span>Precio sugerido del producto</span><strong>{currency(calculation.costs.suggested_product_price)}</strong><small>{currency(calculation.suggestedUnitPrice ?? 0)} / {draft.unit} · Ganancia sobre costo: {calculation.costs.markup_percent}%</small></div>
          <dl className="cost-result-list cost-primary-summary">
            <ResultRow label="Costo de producción" value={currency(calculation.costs.production_cost)} strong />
            <ResultRow label="Costo interno total" value={currency(calculation.costs.total_internal_cost)} strong />
            <ResultRow label="Costo por unidad" value={`${currency(calculation.costs.production_cost / draft.quantity)} / ${draft.unit}`} />
            <ResultRow label="Entrega cobrada al cliente" value={currency(calculation.costs.delivery_customer_charge)} />
          </dl>
          <div className="cost-suggested-total"><span>Precio sugerido total</span><strong>{currency(calculation.costs.suggested_customer_total)}</strong></div>
          <details className="quick-cost-breakdown">
            <summary><span className="breakdown-open-label">Ver desglose completo</span><span className="breakdown-close-label">Ocultar desglose completo</span></summary>
            <dl className="cost-result-list cost-detailed-summary">
              <ResultRow label="Ingredientes" value={currency(calculation.costs.ingredients_cost)} />
              <ResultRow label={`Merma estimada (${calculation.costs.waste_percent}%)`} value={currency(calculation.costs.waste_amount)} />
              <ResultRow label="Gastos adicionales" value={currency(calculation.costs.direct_costs_total)} />
              <ResultRow label="Mano de obra" value={currency(calculation.costs.labor_cost)} />
              <ResultRow label="Subtotal de producción" value={currency(calculation.costs.production_subtotal)} />
              {supportsV1 ? <><ResultRow label="Consumos de producción" value={currency(calculation.costs.utilities_total)} /><ResultRow label="Overhead asignado" value={currency(calculation.costs.overhead_amount)} /></> : <ResultRow label={`Gastos indirectos (${calculation.costs.indirect_percent}%)`} value={currency(calculation.costs.indirect_amount)} />}
              <ResultRow label="Entrega — costo interno" value={currency(calculation.costs.delivery_internal_cost)} />
            </dl>
            <ul className="cost-trace-list">{calculation.costs.trace.map((entry, index) => <li key={`${entry.key}-${index}`}><strong>{entry.label}</strong><span>{entry.formula ?? 'Valor registrado'} = {currency(entry.amount)} · {entry.sourceType === 'measured' ? 'Medido' : entry.sourceType === 'estimated' ? 'Estimado' : entry.sourceType === 'configured' ? 'Configurado' : 'Calculado'}</span>{entry.inputs?.map(input => <small key={input.label}>{input.label}: {input.value} {input.unit ?? ''}</small>)}</li>)}</ul>
          </details>
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
