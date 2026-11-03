import type { Business, CostItemCategory, CostSettings, Quote, QuoteCost, QuoteCostItem } from './database.types'
import { client } from './supabase'
import { calculateOverheadAllocation, calculateOverheadRate, defaultCostingConfig, utilityCost, type CostTraceEntry, type CostingConfig, type UtilityInput } from './costing-engine'

export const costItemCategories: { value: CostItemCategory; label: string }[] = [
  { value: 'packaging', label: 'Empaque' },
  { value: 'topper', label: 'Topper' },
  { value: 'decoration', label: 'Decoración' },
  { value: 'supplies', label: 'Material adicional' },
  { value: 'other', label: 'Otro' },
]

export const defaultCostSettings = { costing_model_version: 1 as const, waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 0, markup_percent: 60 }

export type CostSettingsValues = typeof defaultCostSettings & { costing_config?: CostingConfig }

export type CostDraft = {
  costing_model_version?: 1 | 'legacy'
  ingredients_cost: number
  waste_percent: number
  labor_hours: number
  labor_hourly_rate: number
  indirect_percent: number
  delivery_internal_cost: number
  delivery_customer_charge: number
  markup_percent: number
  final_price: number
  utilities?: UtilityInput[]
  costing_config?: CostingConfig
  costing_snapshot?: { version?: 1 | 'legacy'; costing_config?: CostingConfig; utilities?: UtilityInput[]; overhead_allocation_hours?: number }
  overhead_allocation_hours?: number
}

export type CostCalculation = CostDraft & {
  waste_amount: number
  direct_costs_total: number
  labor_cost: number
  production_subtotal: number
  indirect_amount: number
  production_cost: number
  total_internal_cost: number
  suggested_product_price: number
  suggested_customer_total: number
  estimated_profit: number
  real_margin_percent: number
  costing_model_version: 1 | 'legacy'
  utilities_total: number
  overhead_rate_per_hour: number
  overhead_allocation_hours: number
  overhead_amount: number
  trace: CostTraceEntry[]
}

const money = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
const nonNegative = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0)

export function calculateCosts(input: CostDraft, items: (Pick<QuoteCostItem, 'cost'> & Partial<Pick<QuoteCostItem, 'name'>>)[] = []): CostCalculation {
  const ingredients = nonNegative(input.ingredients_cost)
  const version = input.costing_model_version ?? input.costing_snapshot?.version ?? 'legacy'
  const wastePercent = nonNegative(input.waste_percent)
  const laborHours = nonNegative(input.labor_hours)
  const hourlyRate = nonNegative(input.labor_hourly_rate)
  const indirectPercent = nonNegative(input.indirect_percent)
  const deliveryInternal = nonNegative(input.delivery_internal_cost)
  const deliveryCustomer = nonNegative(input.delivery_customer_charge)
  const markup = nonNegative(input.markup_percent)
  const direct = money(items.reduce((sum, item) => sum + nonNegative(Number(item.cost)), 0))
  const waste = money(ingredients * wastePercent / 100)
  const labor = money(laborHours * hourlyRate)
  const config = input.costing_config ?? input.costing_snapshot?.costing_config ?? defaultCostingConfig
  const utilities = (input.utilities ?? input.costing_snapshot?.utilities ?? []).map(item => utilityCost(item, config, input.costing_snapshot?.version === 1))
  const utilitiesTotal = money(utilities.reduce((sum, item) => sum + item.amount, 0))
  const productionSubtotal = money(ingredients + waste + direct + labor + utilitiesTotal)
  const overheadRate = version === 1 ? calculateOverheadRate(config.monthly_overhead_total, config.productive_hours_per_month) : 0
  const allocationHours = nonNegative(input.overhead_allocation_hours ?? input.costing_snapshot?.overhead_allocation_hours ?? laborHours)
  const overheadAmount = version === 1 ? calculateOverheadAllocation(overheadRate, allocationHours) : 0
  const indirect = version === 'legacy' ? money(productionSubtotal * indirectPercent / 100) : overheadAmount
  const production = money(productionSubtotal + indirect)
  const internal = money(production + deliveryInternal)
  const suggestedProduct = money(production * (1 + markup / 100))
  const suggestedTotal = money(suggestedProduct + deliveryCustomer)
  const finalPrice = nonNegative(input.final_price)
  const profit = money(finalPrice - internal)
  const trace: CostTraceEntry[] = [
    { key: 'ingredients', label: 'Ingredientes', amount: ingredients, sourceType: 'configured' },
    { key: 'waste', label: 'Merma', amount: waste, sourceType: 'calculated', formula: `${ingredients} × ${wastePercent}%`, inputs: [{ label: 'Ingredientes', value: ingredients }, { label: 'Porcentaje', value: wastePercent, unit: '%' }] },
    ...items.map((item, index) => ({ key: `direct-${item.name ?? index}`, label: item.name ?? 'Gasto directo', amount: nonNegative(Number(item.cost)), sourceType: 'configured' as const })),
    { key: 'labor', label: 'Mano de obra', amount: labor, sourceType: 'calculated', formula: `${laborHours} h × ${hourlyRate}/h`, inputs: [{ label: 'Horas', value: laborHours, unit: 'h' }, { label: 'Costo por hora', value: hourlyRate, unit: 'por h' }, { label: 'Origen del costo/hora', value: 'Configuración del negocio' }] },
    ...utilities,
    ...(version === 1 ? [{ key: 'overhead', label: 'Overhead asignado', amount: overheadAmount, sourceType: 'calculated' as const, formula: `${overheadRate}/h × ${allocationHours} h`, inputs: [{ label: 'Overhead mensual', value: config?.monthly_overhead_total ?? 0 }, { label: 'Horas productivas', value: config?.productive_hours_per_month ?? 0, unit: 'h' }, { label: 'Horas asignadas', value: allocationHours, unit: 'h' }] }] : [{ key: 'legacy-indirect', label: 'Gastos indirectos históricos', amount: indirect, sourceType: 'calculated' as const, formula: `subtotal × ${indirectPercent}%` }]),
  ]
  return { ...input, costing_model_version: version, ingredients_cost: ingredients, waste_percent: wastePercent, labor_hours: laborHours, labor_hourly_rate: hourlyRate, indirect_percent: indirectPercent, delivery_internal_cost: deliveryInternal, delivery_customer_charge: deliveryCustomer, markup_percent: markup, final_price: finalPrice, waste_amount: waste, direct_costs_total: direct, labor_cost: labor, production_subtotal: productionSubtotal, indirect_amount: indirect, production_cost: production, total_internal_cost: internal, suggested_product_price: suggestedProduct, suggested_customer_total: suggestedTotal, estimated_profit: profit, real_margin_percent: finalPrice > 0 ? money(profit / finalPrice * 100) : 0, utilities_total: utilitiesTotal, overhead_rate_per_hour: overheadRate, overhead_allocation_hours: allocationHours, overhead_amount: overheadAmount, trace }
}

export async function getCostSettings(businessId: string): Promise<CostSettings> {
  const api = client()
  const { data, error } = await api.from('arpe_cost_settings').select('*').eq('business_id', businessId).maybeSingle()
  if (error) throw error
  if (data) return data
  const { data: created, error: createError } = await api.from('arpe_cost_settings').upsert({ business_id: businessId, ...defaultCostSettings, costing_config: defaultCostingConfig }, { onConflict: 'business_id' }).select().single()
  if (createError) throw createError
  return created
}

/** Reads saved business defaults without creating a row when none exists. */
export async function loadCostSettingsValues(businessId: string): Promise<CostSettingsValues> {
  const { data, error } = await client()
    .from('arpe_cost_settings')
    .select('waste_percent,indirect_percent,labor_hourly_rate,markup_percent,costing_model_version,costing_config')
    .eq('business_id', businessId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { ...defaultCostSettings, costing_config: defaultCostingConfig }

  const values = {
    costing_model_version: 1 as const,
    costing_config: data.costing_config ? { ...defaultCostingConfig, ...data.costing_config } : defaultCostingConfig,
    waste_percent: Number(data.waste_percent),
    indirect_percent: Number(data.indirect_percent),
    labor_hourly_rate: Number(data.labor_hourly_rate),
    markup_percent: Number(data.markup_percent),
  }
  return {
    costing_model_version: 1,
    costing_config: values.costing_config,
    waste_percent: Number.isFinite(values.waste_percent) && values.waste_percent >= 0 ? values.waste_percent : defaultCostSettings.waste_percent,
    indirect_percent: Number.isFinite(values.indirect_percent) && values.indirect_percent >= 0 ? values.indirect_percent : defaultCostSettings.indirect_percent,
    labor_hourly_rate: Number.isFinite(values.labor_hourly_rate) && values.labor_hourly_rate >= 0 ? values.labor_hourly_rate : defaultCostSettings.labor_hourly_rate,
    markup_percent: Number.isFinite(values.markup_percent) && values.markup_percent >= 0 ? values.markup_percent : defaultCostSettings.markup_percent,
  }
}

export async function saveCostSettings(businessId: string, values: Pick<CostDraft, 'waste_percent' | 'indirect_percent' | 'labor_hourly_rate' | 'markup_percent'> & { costing_config?: CostingConfig }) {
  const payload = { business_id: businessId, costing_model_version: 1, waste_percent: nonNegative(values.waste_percent), indirect_percent: nonNegative(values.indirect_percent), labor_hourly_rate: nonNegative(values.labor_hourly_rate), markup_percent: nonNegative(values.markup_percent), ...(values.costing_config ? { costing_config: values.costing_config } : {}) }
  const { data, error } = await client().from('arpe_cost_settings').upsert(payload, { onConflict: 'business_id' }).select().single()
  if (error) throw error
  return data
}

export async function getQuoteCost(quoteId: string, businessId: string) {
  const api = client()
  const [{ data: cost, error: costError }, { data: items, error: itemsError }] = await Promise.all([
    api.from('arpe_quote_costs').select('*').eq('quote_id', quoteId).eq('business_id', businessId).maybeSingle(),
    api.from('arpe_quote_cost_items').select('*').eq('quote_id', quoteId).eq('business_id', businessId).order('created_at', { ascending: true }),
  ])
  if (costError) throw costError
  if (itemsError) throw itemsError
  return { cost: cost as QuoteCost | null, items: (items ?? []) as QuoteCostItem[] }
}

export async function saveQuoteCost(quote: Quote, business: Business, draft: CostDraft, items: Omit<QuoteCostItem, 'id' | 'quote_id' | 'business_id' | 'created_at'>[]) {
  const existing = await getQuoteCost(quote.id, business.id)
  const settings = existing.cost ?? await getCostSettings(business.id)
  const calculation = calculateCosts({ ...draft, waste_percent: Number(existing.cost?.waste_percent ?? draft.waste_percent), indirect_percent: Number(existing.cost?.indirect_percent ?? draft.indirect_percent), labor_hourly_rate: Number(draft.labor_hourly_rate), markup_percent: Number(draft.markup_percent) }, items)
  const api = client()
  const { error: deleteError } = await api.from('arpe_quote_cost_items').delete().eq('quote_id', quote.id).eq('business_id', business.id)
  if (deleteError) throw deleteError
  if (items.length) {
    const { error: itemError } = await api.from('arpe_quote_cost_items').insert(items.map(item => ({ ...item, quote_id: quote.id, business_id: business.id })))
    if (itemError) throw itemError
  }
  const payload = { quote_id: quote.id, business_id: business.id, ingredients_cost: calculation.ingredients_cost, waste_percent: Number(existing.cost?.waste_percent ?? draft.waste_percent), waste_amount: calculation.waste_amount, labor_hours: calculation.labor_hours, labor_hourly_rate: calculation.labor_hourly_rate, labor_cost: calculation.labor_cost, indirect_percent: Number(existing.cost?.indirect_percent ?? draft.indirect_percent), indirect_amount: calculation.indirect_amount, delivery_internal_cost: calculation.delivery_internal_cost, delivery_customer_charge: calculation.delivery_customer_charge, markup_percent: Number(draft.markup_percent), production_subtotal: calculation.production_subtotal, production_cost: calculation.production_cost, total_internal_cost: calculation.total_internal_cost, suggested_product_price: calculation.suggested_product_price, suggested_customer_total: calculation.suggested_customer_total }
  const { data, error } = await api.from('arpe_quote_costs').upsert(payload, { onConflict: 'quote_id' }).select().single()
  if (error) throw error
  return { cost: data as QuoteCost, calculation, settings }
}
