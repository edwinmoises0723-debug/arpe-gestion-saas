/** Pure, versioned mathematics for EJNEXA Costing Model v1. */
export type CostSource = 'configured' | 'estimated' | 'measured' | 'calculated'
export type CostTraceEntry = { key: string; label: string; amount: number; sourceType: CostSource; formula?: string; inputs?: { label: string; value: number | string; unit?: string }[] }
export type ElectricityEquipment = { id: string; name: string; active: boolean; power_kw: number; calculation_mode: 'estimated' | 'measured'; measured_kwh_per_cycle?: number }
export type NaturalGasEquipment = { id: string; name: string; active: boolean; btu_per_hour: number }
export type LpgEquipment = { id: string; name: string; active: boolean; consumption_kg_per_hour: number }
export type CostingConfig = {
  electricity_rate_per_kwh: number
  natural_gas_rate_per_therm: number
  lpg_cylinder_price: number
  lpg_net_kg: number
  water_rate_per_liter: number
  monthly_overhead_total: number
  productive_hours_per_month: number
  overhead_items?: { name: string; category: string; monthly_cost: number; active: boolean }[]
  electricity_equipment?: ElectricityEquipment[]
  natural_gas_equipment?: NaturalGasEquipment[]
  lpg_equipment?: LpgEquipment[]
}
export const defaultCostingConfig: CostingConfig = {
  electricity_rate_per_kwh: 0, natural_gas_rate_per_therm: 0, lpg_cylinder_price: 0,
  lpg_net_kg: 0, water_rate_per_liter: 0, monthly_overhead_total: 0, productive_hours_per_month: 0,
  overhead_items: [], electricity_equipment: [], natural_gas_equipment: [], lpg_equipment: [],
}
export type UtilityInput =
  | { kind: 'electricity'; equipment_id: string; minutes?: number; hours?: number; measured_kwh?: number }
  | { kind: 'natural_gas'; equipment_id: string; minutes?: number; hours?: number }
  | { kind: 'lpg'; equipment_id: string; minutes?: number; hours?: number }
  | { kind: 'water'; liters: number }
const n = (v: number) => Number.isFinite(v) && v > 0 ? v : 0
export function validateCostingInputs(utilities: UtilityInput[] = [], config: CostingConfig = defaultCostingConfig): string[] {
  const errors: string[] = []
  if (config.monthly_overhead_total > 0 && config.productive_hours_per_month <= 0) errors.push('Configura horas productivas mensuales mayores que cero para asignar overhead.')
  for (const utility of utilities) {
    if (utility.kind === 'water') {
      if (!Number.isFinite(utility.liters) || utility.liters < 0) errors.push('Los litros utilizados deben ser iguales o mayores que cero.')
      if (utility.liters > 0 && config.water_rate_per_liter <= 0) errors.push('Configura el costo efectivo por litro de agua.')
      continue
    }
    const minutes = utility.minutes ?? (utility.hours ?? 0) * 60
    if (!Number.isFinite(minutes) || minutes < 0) { errors.push('El tiempo de uso debe ser igual o mayor que cero.'); continue }
    if (utility.kind === 'electricity') {
      const equipment = config.electricity_equipment?.find(item => item.id === utility.equipment_id && item.active)
      if (!equipment) { errors.push('Configura o selecciona un equipo eléctrico activo.'); continue }
      if (minutes > 0 && utility.measured_kwh !== undefined && (!Number.isFinite(utility.measured_kwh) || utility.measured_kwh < 0)) errors.push('El consumo medido no puede ser negativo.')
      if (minutes > 0 && equipment.calculation_mode === 'estimated' && equipment.power_kw <= 0) errors.push(`Configura la potencia del equipo ${equipment.name}.`)
      if (minutes > 0 && config.electricity_rate_per_kwh <= 0) errors.push('Configura la tarifa eléctrica por kWh.')
    } else if (utility.kind === 'natural_gas') {
      const equipment = config.natural_gas_equipment?.find(item => item.id === utility.equipment_id && item.active)
      if (!equipment) { errors.push('Configura o selecciona un equipo de gas natural activo.'); continue }
      if (minutes > 0 && equipment.btu_per_hour <= 0) errors.push(`Configura los BTU/h del equipo ${equipment.name}.`)
      if (minutes > 0 && config.natural_gas_rate_per_therm <= 0) errors.push('Configura la tarifa de gas natural por therm.')
    } else {
      const equipment = config.lpg_equipment?.find(item => item.id === utility.equipment_id && item.active)
      if (!equipment) { errors.push('Configura o selecciona un equipo GLP activo.'); continue }
      if (minutes > 0 && equipment.consumption_kg_per_hour <= 0) errors.push(`Configura el consumo kg/h del equipo ${equipment.name}.`)
      if (minutes > 0 && (config.lpg_net_kg <= 0 || config.lpg_cylinder_price <= 0)) errors.push('Configura el precio y peso neto del cilindro GLP.')
    }
  }
  return errors
}
export const roundMoney = (v: number) => Math.round((n(v) + Number.EPSILON) * 100) / 100
export const hoursFromDuration = (duration: number, unit: 'minutes' | 'hours') => n(duration) / (unit === 'minutes' ? 60 : 1)
export const poundsToKilograms = (lb: number) => n(lb) * 0.45359237
export function calculateElectricityCost(equipment: ElectricityEquipment, durationHours: number, ratePerKwh: number, measuredKwh?: number) {
  const measured = equipment.calculation_mode === 'measured'
  const kwh = measured ? n(measuredKwh ?? equipment.measured_kwh_per_cycle ?? 0) : n(equipment.power_kw) * n(durationHours)
  return { consumption: Math.round(kwh * 1_000_000) / 1_000_000, amount: roundMoney(kwh * n(ratePerKwh)), unit: 'kWh', sourceType: measured ? 'measured' as const : 'estimated' as const, formula: measured ? 'kWh medidos × tarifa por kWh' : 'potencia (kW) × horas × tarifa por kWh' }
}
export function calculateNaturalGasCost(btuPerHour: number, durationHours: number, ratePerTherm: number) {
  const btus = n(btuPerHour) * n(durationHours), therms = btus / 100000
  return { consumption: Math.round(therms * 1_000_000) / 1_000_000, amount: roundMoney(therms * n(ratePerTherm)), unit: 'therm', sourceType: 'estimated' as const, formula: 'BTU/h × horas ÷ 100,000 × tarifa por therm' }
}
export function calculateLpgCost(consumptionKgPerHour: number, durationHours: number, cylinderPrice: number, netKg: number) {
  const kg = n(consumptionKgPerHour) * n(durationHours)
  if (kg > 0 && n(netKg) <= 0) throw new Error('Configura los kg netos del cilindro para calcular el costo de GLP.')
  const rate = n(netKg) > 0 ? n(cylinderPrice) / n(netKg) : 0
  return { consumption: Math.round(kg * 1_000_000) / 1_000_000, ratePerKg: roundMoney(rate), amount: roundMoney(kg * rate), unit: 'kg', sourceType: 'estimated' as const, formula: 'kg/h × horas × (precio del cilindro ÷ kg netos)' }
}
export function calculateWaterCost(liters: number, ratePerLiter: number) {
  return { consumption: n(liters), amount: roundMoney(n(liters) * n(ratePerLiter)), unit: 'L', sourceType: 'configured' as const, formula: 'litros utilizados × costo efectivo por litro' }
}
export function calculateOverheadRate(monthlyTotal: number, productiveHours: number) {
  if (n(monthlyTotal) > 0 && n(productiveHours) <= 0) throw new Error('Configura horas productivas mensuales mayores que cero para asignar overhead.')
  return n(productiveHours) > 0 ? n(monthlyTotal) / n(productiveHours) : 0
}
export function calculateOverheadAllocation(ratePerHour: number, allocationHours: number) { return roundMoney(n(ratePerHour) * n(allocationHours)) }
export function utilityCost(input: UtilityInput, config: CostingConfig, allowInactiveSnapshot = false): CostTraceEntry {
  const durationHours = input.kind === 'water' ? 0 : 'minutes' in input && input.minutes !== undefined ? hoursFromDuration(input.minutes, 'minutes') : hoursFromDuration(input.hours ?? 0, 'hours')
  if (input.kind === 'electricity') {
    const equipment = config.electricity_equipment?.find(e => e.id === input.equipment_id)
    if (!equipment || (!equipment.active && !allowInactiveSnapshot)) throw new Error('Selecciona un equipo eléctrico activo y configurado.')
    const result = calculateElectricityCost(equipment, durationHours, config.electricity_rate_per_kwh, input.measured_kwh)
    return { key: 'electricity', label: `Electricidad — ${equipment.name}`, amount: result.amount, sourceType: result.sourceType, formula: result.formula, inputs: [ ...(result.sourceType === 'estimated' ? [{ label: 'Potencia', value: equipment.power_kw, unit: 'kW' }, { label: 'Tiempo', value: durationHours, unit: 'h' }] : []), { label: result.sourceType === 'measured' ? 'Consumo medido' : 'Consumo estimado', value: result.consumption, unit: result.unit }, { label: 'Tarifa', value: n(config.electricity_rate_per_kwh), unit: 'por kWh' }] }
  }
  if (input.kind === 'natural_gas') {
    const equipment = config.natural_gas_equipment?.find(e => e.id === input.equipment_id)
    if (!equipment || (!equipment.active && !allowInactiveSnapshot)) throw new Error('Selecciona un equipo de gas natural activo y configurado.')
    const result = calculateNaturalGasCost(equipment.btu_per_hour, durationHours, config.natural_gas_rate_per_therm)
    return { key: 'natural_gas', label: `Gas natural — ${equipment.name}`, amount: result.amount, sourceType: result.sourceType, formula: result.formula, inputs: [{ label: 'Potencia térmica', value: equipment.btu_per_hour, unit: 'BTU/h' }, { label: 'Tiempo', value: durationHours, unit: 'h' }, { label: 'Consumo', value: result.consumption, unit: 'therm' }, { label: 'Tarifa', value: n(config.natural_gas_rate_per_therm), unit: 'por therm' }] }
  }
  if (input.kind === 'lpg') {
    const equipment = config.lpg_equipment?.find(e => e.id === input.equipment_id)
    if (!equipment || (!equipment.active && !allowInactiveSnapshot)) throw new Error('Selecciona un equipo GLP activo y configurado.')
    const result = calculateLpgCost(equipment.consumption_kg_per_hour, durationHours, config.lpg_cylinder_price, config.lpg_net_kg)
    return { key: 'lpg', label: `GLP — ${equipment.name}`, amount: result.amount, sourceType: result.sourceType, formula: result.formula, inputs: [{ label: 'Consumo del equipo', value: equipment.consumption_kg_per_hour, unit: 'kg/h' }, { label: 'Tiempo', value: durationHours, unit: 'h' }, { label: 'Consumo', value: result.consumption, unit: 'kg' }, { label: 'Costo por kg', value: result.ratePerKg, unit: 'por kg' }] }
  }
  const result = calculateWaterCost(input.liters, config.water_rate_per_liter)
  return { key: 'water', label: 'Agua', amount: result.amount, sourceType: result.sourceType, formula: result.formula, inputs: [{ label: 'Litros utilizados', value: n(input.liters), unit: 'L' }, { label: 'Costo por litro', value: n(config.water_rate_per_liter), unit: 'por L' }] }
}
