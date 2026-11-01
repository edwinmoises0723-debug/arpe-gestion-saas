import { describe, expect, it } from 'vitest'
import { calculateCosts, defaultCostSettings } from './costs'
import { money } from './products'
import { buildQuickCostSummary, calculateQuickCost, validateQuickCost, type QuickCostDraft } from './quick-cost'

const draft = (overrides: Partial<QuickCostDraft> = {}): QuickCostDraft => ({
  productName: '',
  quantity: 1,
  unit: 'unidad',
  ingredientsCost: 0,
  laborHours: 0,
  settings: { ...defaultCostSettings },
  directCosts: [],
  deliveryInternalCost: 0,
  deliveryCustomerCharge: 0,
  finalPrice: null,
  ...overrides,
})

describe('calculadora rápida de costos', () => {
  it('usa calculateCosts como fuente del cálculo', () => {
    const input = draft({
      ingredientsCost: 100,
      laborHours: 2,
      settings: { waste_percent: 10, indirect_percent: 10, labor_hourly_rate: 10, markup_percent: 50 },
      directCosts: [{ category: 'packaging', name: 'Caja', cost: 20 }],
    })
    const result = calculateQuickCost(input)
    const expected = calculateCosts({ ingredients_cost: 100, waste_percent: 10, labor_hours: 2, labor_hourly_rate: 10, indirect_percent: 10, delivery_internal_cost: 0, delivery_customer_charge: 0, markup_percent: 50, final_price: 0 }, input.directCosts)
    expect(result.costs).toEqual(expected)
    expect(result.costs.production_cost).toBe(165)
    expect(result.costs.suggested_product_price).toBe(247.5)
  })

  it('calcula el costo y el precio sugerido por unidad sin incluir la entrega', () => {
    const result = calculateQuickCost(draft({ quantity: 10, ingredientsCost: 100, deliveryCustomerCharge: 50 }))
    expect(result.costPerUnit).toBe(money(result.costs.production_cost / 10))
    expect(result.suggestedUnitPrice).toBe(money(result.costs.suggested_product_price / 10))
    expect(result.costs.suggested_customer_total - result.costs.suggested_product_price).toBe(50)
  })

  it('expone la ganancia y margen calculados por el motor al ingresar un precio final', () => {
    const result = calculateQuickCost(draft({ ingredientsCost: 100, finalPrice: 200 }))
    expect(result.costs.estimated_profit).toBe(74.56)
    expect(result.costs.real_margin_percent).toBe(37.28)
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
})
