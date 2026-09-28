import { describe, expect, it } from 'vitest'
import { calculateCosts } from './costs'

describe('motor de costos', () => {
  it('calcula merma, gastos directos, mano de obra, indirectos y precio sugerido', () => {
    const result = calculateCosts({ ingredients_cost: 1000, waste_percent: 12, labor_hours: 3, labor_hourly_rate: 100, indirect_percent: 12, delivery_internal_cost: 100, delivery_customer_charge: 150, markup_percent: 60, final_price: 2400 }, [{ cost: 80 }, { cost: 50 }, { cost: 150 }])
    expect(result.waste_amount).toBe(120)
    expect(result.direct_costs_total).toBe(280)
    expect(result.labor_cost).toBe(300)
    expect(result.production_subtotal).toBe(1700)
    expect(result.indirect_amount).toBe(204)
    expect(result.production_cost).toBe(1904)
    expect(result.total_internal_cost).toBe(2004)
    expect(result.suggested_product_price).toBe(3046.4)
    expect(result.suggested_customer_total).toBe(3196.4)
    expect(result.estimated_profit).toBe(396)
    expect(calculateCosts({ ...result, markup_percent: 40 }, [{ cost: 80 }, { cost: 50 }, { cost: 150 }]).suggested_product_price).toBe(2665.6)
  })

  it('evita costos negativos y muestra advertencia de venta bajo costo', () => {
    const result = calculateCosts({ ingredients_cost: -10, waste_percent: -2, labor_hours: -1, labor_hourly_rate: -4, indirect_percent: -2, delivery_internal_cost: -10, delivery_customer_charge: -5, markup_percent: -8, final_price: 0 }, [{ cost: -3 }])
    expect(result.total_internal_cost).toBe(0)
    expect(result.estimated_profit).toBe(0)
    expect(result.real_margin_percent).toBe(0)
  })
})
