import type { Business, CostItemCategory, CostSettings, Quote, QuoteCost, QuoteCostItem } from './database.types'
import { client } from './supabase'

export const costItemCategories: { value: CostItemCategory; label: string }[] = [
  { value: 'packaging', label: 'Empaque' },
  { value: 'topper', label: 'Topper' },
  { value: 'decoration', label: 'Decoración' },
  { value: 'supplies', label: 'Material adicional' },
  { value: 'other', label: 'Otro' },
]

export const defaultCostSettings = { waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 0, markup_percent: 60 }

export type CostDraft = {
  ingredients_cost: number
  waste_percent: number
  labor_hours: number
  labor_hourly_rate: number
  indirect_percent: number
  delivery_internal_cost: number
  delivery_customer_charge: number
  markup_percent: number
  final_price: number
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
}

const money = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100
const nonNegative = (value: number) => Math.max(0, Number.isFinite(value) ? value : 0)

export function calculateCosts(input: CostDraft, items: Pick<QuoteCostItem, 'cost'>[] = []): CostCalculation {
  const ingredients = nonNegative(input.ingredients_cost)
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
  const productionSubtotal = money(ingredients + waste + direct + labor)
  const indirect = money(productionSubtotal * indirectPercent / 100)
  const production = money(productionSubtotal + indirect)
  const internal = money(production + deliveryInternal)
  const suggestedProduct = money(production * (1 + markup / 100))
  const suggestedTotal = money(suggestedProduct + deliveryCustomer)
  const finalPrice = nonNegative(input.final_price)
  const profit = money(finalPrice - internal)
  return { ...input, ingredients_cost: ingredients, waste_percent: wastePercent, labor_hours: laborHours, labor_hourly_rate: hourlyRate, indirect_percent: indirectPercent, delivery_internal_cost: deliveryInternal, delivery_customer_charge: deliveryCustomer, markup_percent: markup, final_price: finalPrice, waste_amount: waste, direct_costs_total: direct, labor_cost: labor, production_subtotal: productionSubtotal, indirect_amount: indirect, production_cost: production, total_internal_cost: internal, suggested_product_price: suggestedProduct, suggested_customer_total: suggestedTotal, estimated_profit: profit, real_margin_percent: finalPrice > 0 ? money(profit / finalPrice * 100) : 0 }
}

export async function getCostSettings(businessId: string): Promise<CostSettings> {
  const api = client()
  const { data, error } = await api.from('arpe_cost_settings').select('*').eq('business_id', businessId).maybeSingle()
  if (error) throw error
  if (data) return data
  const { data: created, error: createError } = await api.from('arpe_cost_settings').upsert({ business_id: businessId, ...defaultCostSettings }, { onConflict: 'business_id' }).select().single()
  if (createError) throw createError
  return created
}

export async function saveCostSettings(businessId: string, values: Pick<CostDraft, 'waste_percent' | 'indirect_percent' | 'labor_hourly_rate' | 'markup_percent'>) {
  const payload = { business_id: businessId, waste_percent: nonNegative(values.waste_percent), indirect_percent: nonNegative(values.indirect_percent), labor_hourly_rate: nonNegative(values.labor_hourly_rate), markup_percent: nonNegative(values.markup_percent) }
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
