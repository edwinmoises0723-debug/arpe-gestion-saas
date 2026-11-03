import { describe, expect, it } from 'vitest'
import { calculateCosts, defaultCostSettings } from './costs'
import { calculateElectricityCost, calculateLpgCost, calculateNaturalGasCost, calculateOverheadAllocation, calculateOverheadRate, calculateWaterCost, defaultCostingConfig, hoursFromDuration, poundsToKilograms, validateCostingInputs } from './costing-engine'

describe('Modelo de Costeo EJNEXA v1', () => {
  it('calcula electricidad estimada con potencia y tiempo sin redondeo intermedio', () => {
    const r = calculateElectricityCost({ id: 'oven', name: 'Horno', active: true, power_kw: 3.5, calculation_mode: 'estimated' }, 45 / 60, 10)
    expect(r.consumption).toBe(2.625)
    expect(r.amount).toBe(26.25)
  })
  it('prioriza consumo eléctrico medido', () => {
    const r = calculateElectricityCost({ id: 'oven', name: 'Horno', active: true, power_kw: 3.5, calculation_mode: 'measured', measured_kwh_per_cycle: 2.4 }, 1, 10)
    expect(r.consumption).toBe(2.4)
    expect(r.amount).toBe(24)
    expect(r.sourceType).toBe('measured')
  })
  it('calcula gas natural y GLP', () => {
    expect(calculateNaturalGasCost(100000, 0.5, 2).amount).toBe(1)
    expect(calculateLpgCost(0.25, 0.75, 300, 15).amount).toBe(3.75)
    expect(() => calculateLpgCost(0.25, 1, 300, 0)).toThrow(/kg netos/)
  })
  it('calcula agua y conversiones de unidades', () => {
    expect(calculateWaterCost(12, 0.08).amount).toBe(0.96)
    expect(hoursFromDuration(45, 'minutes')).toBe(0.75)
    expect(poundsToKilograms(1)).toBe(0.45359237)
    expect(poundsToKilograms(25)).toBeCloseTo(11.33980925, 8)
  })
  it('mantiene precisión de overhead hasta el costo final y requiere horas productivas', () => {
    const rate = calculateOverheadRate(12500, 168)
    expect(rate).toBeCloseTo(12500 / 168)
    expect(calculateOverheadAllocation(rate, 2)).toBe(148.81)
    expect(() => calculateOverheadRate(12500, 0)).toThrow(/horas productivas/)
  })
  it('cambia solo labor y derivados al variar la tarifa por hora', () => {
    const config = { ...defaultCostingConfig, electricity_rate_per_kwh: 10, water_rate_per_liter: 0.08, monthly_overhead_total: 12500, productive_hours_per_month: 250, electricity_equipment: [{ id: 'oven', name: 'Horno', active: true, power_kw: 3.5, calculation_mode: 'estimated' as const }] }
    const base = { ...defaultCostSettings, costing_model_version: 1 as const, ingredients_cost: 420, labor_hours: 2, delivery_internal_cost: 100, delivery_customer_charge: 150, final_price: 0, costing_config: config, overhead_allocation_hours: 2, utilities: [{ kind: 'electricity' as const, equipment_id: 'oven', minutes: 45 }, { kind: 'water' as const, liters: 12 }] }
    const low = calculateCosts({ ...base, labor_hourly_rate: 50 }, [{ cost: 80 }])
    const high = calculateCosts({ ...base, labor_hourly_rate: 100 }, [{ cost: 80 }])
    expect(low.utilities_total).toBe(high.utilities_total)
    expect(low.overhead_rate_per_hour).toBe(high.overhead_rate_per_hour)
    expect(low.overhead_amount).toBe(high.overhead_amount)
    expect(high.labor_cost - low.labor_cost).toBe(100)
    expect(high.production_cost - low.production_cost).toBe(100)
  })
  it('reconstruye el ejemplo integral EJNEXA v1 con entrega separada y utilidades trazables', () => {
    const config = {
      ...defaultCostingConfig,
      electricity_rate_per_kwh: 10,
      natural_gas_rate_per_therm: 2,
      lpg_cylinder_price: 300,
      lpg_net_kg: 15,
      water_rate_per_liter: 0.08,
      monthly_overhead_total: 12500,
      productive_hours_per_month: 250,
      electricity_equipment: [{ id: 'oven', name: 'Horno eléctrico', active: true, power_kw: 3.5, calculation_mode: 'estimated' as const }],
      natural_gas_equipment: [{ id: 'gas', name: 'Horno de gas', active: true, btu_per_hour: 100000 }],
      lpg_equipment: [{ id: 'lpg', name: 'Quemador GLP', active: true, consumption_kg_per_hour: 0.25 }],
    }
    const result = calculateCosts({ ...defaultCostSettings, costing_model_version: 1, ingredients_cost: 420, waste_percent: 12, labor_hours: 2, labor_hourly_rate: 100, delivery_internal_cost: 100, delivery_customer_charge: 150, markup_percent: 60, final_price: 1600, costing_config: config, overhead_allocation_hours: 2, utilities: [
      { kind: 'electricity', equipment_id: 'oven', minutes: 45 },
      { kind: 'natural_gas', equipment_id: 'gas', minutes: 30 },
      { kind: 'lpg', equipment_id: 'lpg', minutes: 45 },
      { kind: 'water', liters: 12 },
    ] }, [{ name: 'Caja', cost: 80 }])
    expect(result.waste_amount).toBe(50.4)
    expect(result.labor_cost).toBe(200)
    expect(result.utilities_total).toBe(31.96)
    expect(result.production_subtotal).toBe(782.36)
    expect(result.overhead_amount).toBe(100)
    expect(result.production_cost).toBe(882.36)
    expect(result.total_internal_cost).toBe(982.36)
    expect(result.suggested_product_price).toBe(1411.78)
    expect(result.suggested_customer_total).toBe(1561.78)
    expect(result.estimated_profit).toBe(617.64)
    expect(result.real_margin_percent).toBe(38.6)
  })
  it('detecta consumos sin perfiles o tarifas y evita aceptar resultados incompletos', () => {
    expect(validateCostingInputs([{ kind: 'electricity', equipment_id: '', minutes: 30 }], defaultCostingConfig)).toContain('Configura o selecciona un equipo eléctrico activo.')
    expect(validateCostingInputs([{ kind: 'water', liters: 12 }], defaultCostingConfig)).toContain('Configura el costo efectivo por litro de agua.')
  })
  it('no suma un gasto de electricidad como otro utility automático', () => {
    const c = calculateCosts({ ...defaultCostSettings, costing_model_version: 1, ingredients_cost: 100, labor_hours: 0, delivery_internal_cost: 0, delivery_customer_charge: 0, final_price: 0, costing_config: defaultCostingConfig }, [{ cost: 26.25 }])
    expect(c.direct_costs_total).toBe(26.25)
    expect(c.utilities_total).toBe(0)
  })
})
