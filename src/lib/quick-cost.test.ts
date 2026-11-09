import { describe, expect, it } from 'vitest'
import { calculateCosts, defaultCostSettings } from './costs'
import { money } from './products'
import { buildQuickCostSummary, calculateQuickCost, quickCostExpensePresets, validateQuickCost, type QuickCostDraft } from './quick-cost'
import { defaultCostingConfig } from './costing-engine'

const draft = (overrides: Omit<Partial<QuickCostDraft>, 'settings'> & { settings?: Partial<QuickCostDraft['settings']> } = {}): QuickCostDraft => {
  const base: QuickCostDraft = {
    productName: '', quantity: 1, unit: 'unidad', ingredientsCost: 0, laborHours: 0,
    settings: { ...defaultCostSettings, activeModel: 'v1', schemaCapability: 'v1-schema', capabilities: { schemaCapability: 'v1-schema', supportsUtilities: true, supportsOverhead: true, supportsTraceSnapshots: true } }, directCosts: [], deliveryInternalCost: 0,
    deliveryCustomerCharge: 0, finalPrice: null,
  }
  return { ...base, ...overrides, settings: { ...base.settings, ...overrides.settings } }
}

describe('calculadora rápida de costos', () => {
  it('usa calculateCosts como fuente del cálculo', () => {
    const input = draft({
      ingredientsCost: 100,
      laborHours: 2,
      settings: { waste_percent: 10, indirect_percent: 10, labor_hourly_rate: 10, markup_percent: 50 },
      directCosts: [{ category: 'packaging', name: 'Caja', cost: 20 }],
    })
    const result = calculateQuickCost(input)
    const expected = calculateCosts({ ingredients_cost: 100, waste_percent: 10, labor_hours: 2, labor_hourly_rate: 10, indirect_percent: 10, delivery_internal_cost: 0, delivery_customer_charge: 0, markup_percent: 50, final_price: 0, costing_model_version: 1, utilities: input.utilities, costing_config: input.costingConfig }, input.directCosts)
    expect(result.costs).toEqual(expected)
    expect(result.costs.production_cost).toBe(150)
    expect(result.costs.suggested_product_price).toBe(225)
  })

  it('mantiene el cálculo clásico de indirectos cuando el esquema es legacy', () => {
    const input = draft({
      ingredientsCost: 100,
      settings: { waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 0, markup_percent: 60, activeModel: 'legacy', schemaCapability: 'v1-schema', capabilities: { schemaCapability: 'v1-schema', supportsUtilities: true, supportsOverhead: true, supportsTraceSnapshots: true } },
    })
    const result = calculateQuickCost(input)
    expect(result.costs.costing_model_version).toBe('legacy')
    expect(result.costs.waste_amount).toBe(12)
    expect(result.costs.production_subtotal).toBe(112)
    expect(result.costs.indirect_amount).toBe(13.44)
    expect(result.costs.production_cost).toBe(125.44)
    expect(result.costs.utilities_total).toBe(0)
    expect(result.costs.overhead_amount).toBe(0)
    expect(buildQuickCostSummary(input, result, amount => `C$ ${amount.toFixed(2)}`)).toContain('Gastos indirectos (12%): C$ 13.44')
  })

  it('calcula cada costo clásico, entrega y precio sugerido sin duplicar la caja', () => {
    const input = draft({
      productName: 'Cupcakes de vainilla', quantity: 24, unit: 'cupcakes', ingredientsCost: 420, laborHours: 2,
      settings: { waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60, activeModel: 'legacy' },
      directCosts: [{ category: 'packaging', name: 'Caja', cost: 80 }],
      deliveryInternalCost: 100, deliveryCustomerCharge: 150, finalPrice: 1494.72,
    })
    const result = calculateQuickCost(input)

    expect(result.costs.waste_amount).toBe(50.4)
    expect(result.costs.labor_cost).toBe(200)
    expect(result.costs.direct_costs_total).toBe(80)
    expect(result.costs.production_subtotal).toBe(750.4)
    expect(result.costs.indirect_amount).toBe(90.05)
    expect(result.costs.production_cost).toBe(840.45)
    expect(result.costs.delivery_internal_cost).toBe(100)
    expect(result.costs.total_internal_cost).toBe(940.45)
    expect(result.costs.suggested_product_price).toBe(1344.72)
    expect(result.costs.delivery_customer_charge).toBe(150)
    expect(result.costs.suggested_customer_total).toBe(1494.72)
    expect(result.costs.estimated_profit).toBe(554.27)
    expect(result.costs.real_margin_percent).toBe(37.08)
    expect(result.costPerUnit).toBe(35.02)

    const belowCost = calculateQuickCost({ ...input, finalPrice: 800 })
    expect(belowCost.costs.estimated_profit).toBe(-140.45)
    expect(belowCost.costs.real_margin_percent).toBe(-17.56)
  })

  it('switches formulas only when the active model is explicitly changed', () => {
    const legacy = draft({
      ingredientsCost: 100,
      laborHours: 1,
      settings: { waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 0, markup_percent: 60, activeModel: 'legacy' },
      costingConfig: { ...defaultCostingConfig, monthly_overhead_total: 100, productive_hours_per_month: 100 },
    })
    const beforeActivation = calculateQuickCost(legacy)
    expect(beforeActivation.costs.costing_model_version).toBe('legacy')
    expect(beforeActivation.costs.production_cost).toBe(125.44)

    const afterActivation = calculateQuickCost({ ...legacy, settings: { ...legacy.settings, activeModel: 'v1' } })
    expect(afterActivation.costs.costing_model_version).toBe(1)
    expect(afterActivation.costs.production_cost).toBe(113)
  })

  it('calcula el costo y el precio sugerido por unidad sin incluir la entrega', () => {
    const result = calculateQuickCost(draft({ quantity: 10, ingredientsCost: 100, deliveryCustomerCharge: 50 }))
    expect(result.costPerUnit).toBe(money(result.costs.production_cost / 10))
    expect(result.suggestedUnitPrice).toBe(money(result.costs.suggested_product_price / 10))
    expect(result.costs.suggested_customer_total - result.costs.suggested_product_price).toBe(50)
  })

  it('expone la ganancia y margen calculados por el motor al ingresar un precio final', () => {
    const result = calculateQuickCost(draft({ ingredientsCost: 100, finalPrice: 200 }))
    expect(result.costs.estimated_profit).toBe(88)
    expect(result.costs.real_margin_percent).toBe(44)
  })

  it('acepta costos y porcentajes en cero', () => {
    const input = draft({ settings: { waste_percent: 0, indirect_percent: 0, labor_hourly_rate: 0, markup_percent: 0 } })
    expect(validateQuickCost(input)).toEqual([])
    expect(calculateQuickCost(input).costs.total_internal_cost).toBe(0)
  })

  it('permite cantidades hasta tres decimales y rechaza más precisión', () => {
    expect(validateQuickCost(draft({ quantity: 24.125 }))).toEqual([])
    expect(validateQuickCost(draft({ quantity: 24.1251 })).map(error => error.field)).toContain('quantity')
  })

  it('valida cantidad, unidad, merma y valores negativos o no numéricos', () => {
    const errors = validateQuickCost(draft({ quantity: 0, unit: ' ', ingredientsCost: -1, laborHours: Number.NaN, settings: { waste_percent: 101, indirect_percent: -1, labor_hourly_rate: 0, markup_percent: 0 } }))
    expect(errors.map(error => error.field)).toEqual(expect.arrayContaining(['quantity', 'unit', 'ingredientsCost', 'laborHours', 'settings.waste_percent', 'settings.indirect_percent']))
  })

  it('construye un resumen en español con datos opcionales solo cuando están disponibles', () => {
    const base = draft({ productName: 'Pastel tres leches', quantity: 2, unit: 'pasteles', ingredientsCost: 100, deliveryCustomerCharge: 25 })
    const summary = buildQuickCostSummary(base, calculateQuickCost(base), amount => `C$ ${amount.toFixed(2)}`)
    expect(summary).toContain('Pastel tres leches')
    expect(summary).toContain('2 pasteles')
    expect(summary).toContain('Entrega cobrada al cliente: C$ 25.00')
    expect(summary).not.toContain('Ganancia estimada:')

    const evaluated = { ...base, productName: '', finalPrice: 250 }
    const evaluatedSummary = buildQuickCostSummary(evaluated, calculateQuickCost(evaluated), amount => `C$ ${amount.toFixed(2)}`)
    expect(evaluatedSummary).toContain('Precio evaluado: C$ 250.00')
    expect(evaluatedSummary).toContain('Ganancia estimada:')
    expect(evaluatedSummary).not.toContain('Pastel tres leches')
  })

  it('rechaza utilities incompletas y mantiene la calculadora en estado seguro', () => {
    const input = draft({ costingConfig: defaultCostingConfig, utilities: [{ kind: 'electricity', equipment_id: '', minutes: 45 }] })
    expect(validateQuickCost(input).some(error => error.field === 'utilities')).toBe(true)
    expect(() => calculateQuickCost(input)).not.toThrow()
    expect(calculateQuickCost(input).costs.utilities_total).toBe(0)
  })

  it('expone presets de gastos directos sin asignar precios ficticios', () => {
    expect(quickCostExpensePresets.map(item => item.label)).toEqual(['Caja','Base','Topper','Decoración','Impresión','Consumible','Comisión','Otro'])
    expect(quickCostExpensePresets.every(item => !('cost' in item))).toBe(true)
  })
})
