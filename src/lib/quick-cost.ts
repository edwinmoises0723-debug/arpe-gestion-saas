import type { CostItemCategory } from './database.types'
import { calculateCosts, type ActiveCostingModel, type CostCalculation, type CostDraft, type CostingCapabilities, type CostingSchemaCapability } from './costs'
import { money } from './products'
import type { CostingConfig, UtilityInput } from './costing-engine'
import { validateCostingInputs } from './costing-engine'

export type QuickCostSettings = Pick<CostDraft, 'waste_percent' | 'indirect_percent' | 'labor_hourly_rate' | 'markup_percent'> & { activeModel: ActiveCostingModel; schemaCapability: CostingSchemaCapability; capabilities: CostingCapabilities }
export type QuickCostItem = { category: CostItemCategory; name: string; cost: number }
export type QuickCostDraft = {
  productName: string
  quantity: number
  unit: string
  ingredientsCost: number
  laborHours: number
  settings: QuickCostSettings
  directCosts: QuickCostItem[]
  deliveryInternalCost: number
  deliveryCustomerCharge: number
  finalPrice: number | null
  costingConfig?: CostingConfig
  utilities?: UtilityInput[]
  overheadAllocationHours?: number
}
export type QuickCostValidationField = keyof QuickCostDraft | `settings.${keyof QuickCostSettings}` | 'directCostName' | 'directCostCost'
export type QuickCostValidationError = { field: QuickCostValidationField; message: string }
export type QuickCostCalculation = { costs: CostCalculation; costPerUnit: number | null; suggestedUnitPrice: number | null }

export const quickCostExpensePresets = [
  { id: 'box', label: 'Caja', category: 'packaging' as const, description: 'Caja para el producto', group: 'Empaque' },
  { id: 'base', label: 'Base', category: 'supplies' as const, description: 'Base o soporte', group: 'Bases y soportes' },
  { id: 'topper', label: 'Topper', category: 'topper' as const, description: 'Topper personalizado', group: 'Decoración' },
  { id: 'decoration', label: 'Decoración', category: 'decoration' as const, description: 'Decoración adicional', group: 'Decoración' },
  { id: 'printing', label: 'Impresión', category: 'decoration' as const, description: 'Impresión comestible o topper', group: 'Personalización' },
  { id: 'consumable', label: 'Consumible', category: 'supplies' as const, description: 'Consumible de producción', group: 'Materiales' },
  { id: 'commission', label: 'Comisión', category: 'other' as const, description: 'Comisión de pago o plataforma', group: 'Servicios y comisiones' },
  { id: 'other', label: 'Otro', category: 'other' as const, description: '', group: 'Otros' },
]

const numericFields: { field: QuickCostValidationField; label: string; value: (draft: QuickCostDraft) => number | null }[] = [
  { field: 'ingredientsCost', label: 'El costo de ingredientes', value: draft => draft.ingredientsCost },
  { field: 'laborHours', label: 'Las horas estimadas', value: draft => draft.laborHours },
  { field: 'settings.waste_percent', label: 'La merma', value: draft => draft.settings.waste_percent },
  { field: 'settings.indirect_percent', label: 'Los gastos indirectos', value: draft => draft.settings.indirect_percent },
  { field: 'settings.labor_hourly_rate', label: 'El costo por hora', value: draft => draft.settings.labor_hourly_rate },
  { field: 'settings.markup_percent', label: 'La ganancia sobre costo', value: draft => draft.settings.markup_percent },
  { field: 'deliveryInternalCost', label: 'El costo interno de entrega', value: draft => draft.deliveryInternalCost },
  { field: 'deliveryCustomerCharge', label: 'El cobro de entrega al cliente', value: draft => draft.deliveryCustomerCharge },
  { field: 'finalPrice', label: 'El precio que piensas cobrar', value: draft => draft.finalPrice },
]

export function validateQuickCost(draft: QuickCostDraft): QuickCostValidationError[] {
  const errors: QuickCostValidationError[] = []
  if (!Number.isFinite(draft.quantity) || draft.quantity <= 0) errors.push({ field: 'quantity', message: 'La cantidad debe ser mayor que cero.' })
  else if (Math.abs(draft.quantity * 1000 - Math.round(draft.quantity * 1000)) > 0.00001) errors.push({ field: 'quantity', message: 'La cantidad debe tener como máximo 3 decimales.' })
  if (!draft.unit.trim()) errors.push({ field: 'unit', message: 'Escribe la unidad del producto.' })

  for (const item of numericFields) {
    const value = item.value(draft)
    if (value !== null && (!Number.isFinite(value) || value < 0)) errors.push({ field: item.field, message: `${item.label} debe ser un número igual o mayor que cero.` })
  }
  if (Number.isFinite(draft.settings.waste_percent) && draft.settings.waste_percent > 100) {
    errors.push({ field: 'settings.waste_percent', message: 'La merma no puede superar el 100%.' })
  }
  for (const item of draft.directCosts) {
    if (!Number.isFinite(item.cost) || item.cost < 0) errors.push({ field: 'directCostCost', message: 'El costo de cada gasto adicional debe ser igual o mayor que cero.' })
    if (item.cost > 0 && !item.name.trim()) errors.push({ field: 'directCostName', message: 'Describe el gasto adicional que agregaste.' })
  }
  if (draft.settings.activeModel === 'v1') {
    for (const message of validateCostingInputs(draft.utilities, draft.costingConfig)) errors.push({ field: 'utilities', message })
  }
  return errors
}

export function calculateQuickCost(draft: QuickCostDraft): QuickCostCalculation {
  const supportsV1 = draft.settings.activeModel === 'v1'
  const invalidProductionInputs = supportsV1 && validateQuickCost(draft).some(error => error.field === 'utilities')
  const invalidOverhead = supportsV1 && Boolean(draft.costingConfig?.monthly_overhead_total && draft.costingConfig.productive_hours_per_month <= 0)
  const costs = calculateCosts({
    ingredients_cost: draft.ingredientsCost,
    waste_percent: draft.settings.waste_percent,
    labor_hours: draft.laborHours,
    labor_hourly_rate: draft.settings.labor_hourly_rate,
    indirect_percent: draft.settings.indirect_percent,
    delivery_internal_cost: draft.deliveryInternalCost,
    delivery_customer_charge: draft.deliveryCustomerCharge,
    markup_percent: draft.settings.markup_percent,
    final_price: draft.finalPrice ?? 0,
    costing_model_version: supportsV1 ? 1 : 'legacy',
    utilities: supportsV1 ? invalidProductionInputs ? [] : draft.utilities : undefined,
    costing_config: supportsV1 ? invalidOverhead ? { ...(draft.costingConfig as CostingConfig), monthly_overhead_total: 0 } : draft.costingConfig : undefined,
    overhead_allocation_hours: supportsV1 ? draft.overheadAllocationHours ?? draft.laborHours : undefined,
  }, draft.directCosts)
  const hasQuantity = Number.isFinite(draft.quantity) && draft.quantity > 0
  return {
    costs,
    costPerUnit: hasQuantity ? money(costs.production_cost / draft.quantity) : null,
    suggestedUnitPrice: hasQuantity ? money(costs.suggested_product_price / draft.quantity) : null,
  }
}

export function buildQuickCostSummary(draft: QuickCostDraft, result: QuickCostCalculation, formatAmount: (amount: number) => string): string {
  const { costs } = result
  const lines = [draft.productName.trim(), `${draft.quantity} ${draft.unit.trim()}`].filter(Boolean)
  lines.push('', `Costo interno total: ${formatAmount(costs.total_internal_cost)}`)
  lines.push(`Ingredientes: ${formatAmount(costs.ingredients_cost)}`, `Merma estimada: ${formatAmount(costs.waste_amount)}`)
  lines.push(`Gastos directos: ${formatAmount(costs.direct_costs_total)}`, `Mano de obra: ${formatAmount(costs.labor_cost)}`)
  if (draft.settings.activeModel === 'v1') {
    lines.push(`Consumos de producción: ${formatAmount(costs.utilities_total)}`, `Overhead asignado: ${formatAmount(costs.overhead_amount)}`)
    lines.push(`Subtotal antes de overhead: ${formatAmount(costs.production_subtotal)}`)
  } else {
    lines.push(`Gastos indirectos (${costs.indirect_percent}%): ${formatAmount(costs.indirect_amount)}`)
    lines.push(`Subtotal de producción: ${formatAmount(costs.production_subtotal)}`)
  }
  lines.push(`Costo de producción: ${formatAmount(costs.production_cost)}`)
  if (costs.delivery_internal_cost > 0) lines.push(`Entrega — costo interno: ${formatAmount(costs.delivery_internal_cost)}`)
  if (result.costPerUnit !== null) lines.push(`Costo por ${draft.unit.trim() || 'unidad'}: ${formatAmount(result.costPerUnit)}`)
  lines.push(`Precio sugerido del producto: ${formatAmount(costs.suggested_product_price)}`)
  if (result.suggestedUnitPrice !== null) lines.push(`Precio sugerido por ${draft.unit.trim() || 'unidad'}: ${formatAmount(result.suggestedUnitPrice)}`)
  if (costs.delivery_customer_charge > 0) lines.push(`Entrega cobrada al cliente: ${formatAmount(costs.delivery_customer_charge)}`)
  lines.push(`Total sugerido al cliente: ${formatAmount(costs.suggested_customer_total)}`)
  lines.push(`Ganancia sobre costo aplicada: ${costs.markup_percent}%`)
  if (draft.finalPrice !== null && draft.finalPrice > 0) {
    lines.push(`Precio evaluado: ${formatAmount(draft.finalPrice)}`, `Ganancia estimada: ${formatAmount(costs.estimated_profit)}`, `Margen real sobre venta: ${costs.real_margin_percent}%`)
  }
  return lines.join('\n')
}
