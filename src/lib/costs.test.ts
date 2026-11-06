import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const supabaseMock = vi.hoisted(() => ({ responses: [] as Array<{ data?: unknown; error?: unknown }>, queries: [] as Array<{ table: string; columns: string; payload?: unknown; operation: string }> }))

vi.mock('./supabase', () => ({
  client: () => ({
    from: (table: string) => {
      const state: { columns: string; payload?: unknown; operation: string } = { columns: '*', operation: 'select' }
      const builder: Record<string, (...args: unknown[]) => unknown> = {
        select: (columns: unknown) => { state.columns = String(columns); return builder },
        eq: () => builder,
        maybeSingle: async () => {
          supabaseMock.queries.push({ table, columns: state.columns, operation: state.operation })
          return supabaseMock.responses.shift() ?? { data: null, error: null }
        },
        upsert: (payload: unknown) => { state.payload = payload; state.operation = 'upsert'; return builder },
        update: (payload: unknown) => { state.payload = payload; state.operation = 'update'; return builder },
        insert: (payload: unknown) => { state.payload = payload; state.operation = 'insert'; return builder },
        single: async () => {
          supabaseMock.queries.push({ table, columns: state.columns, payload: state.payload, operation: state.operation })
          return supabaseMock.responses.shift() ?? { data: null, error: null }
        },
      }
      return builder
    },
  }),
}))

import { activateCostingModelV1, calculateCosts, defaultCostSettingsValues, getCostSettings, isMissingCostingV1Schema, loadCostSettingsValues, saveCostSettings, validateCostingV1Activation } from './costs'
import { defaultCostingConfig } from './costing-engine'

const legacyRow = { business_id: 'business-1', waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60, created_at: '2026-01-01', updated_at: '2026-01-01' }
const missingConfig = { code: 'PGRST204', message: "Could not find the 'costing_config' column of 'arpe_cost_settings' in the schema cache" }

beforeEach(() => { supabaseMock.responses = []; supabaseMock.queries = [] })

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

  it('treats snapshot version zero as legacy and ignores v1 utilities', () => {
    const result = calculateCosts({
      ingredients_cost: 100, waste_percent: 12, labor_hours: 0, labor_hourly_rate: 0, indirect_percent: 12,
      delivery_internal_cost: 0, delivery_customer_charge: 0, markup_percent: 60, final_price: 0,
      costing_model_version: 0, costing_config: { ...defaultCostingConfig, water_rate_per_liter: 5 }, utilities: [{ kind: 'water', liters: 10 }],
    })
    expect(result.costing_model_version).toBe('legacy')
    expect(result.utilities_total).toBe(0)
    expect(result.production_cost).toBe(125.44)
  })

  it('evita costos negativos y muestra advertencia de venta bajo costo', () => {
    const result = calculateCosts({ ingredients_cost: -10, waste_percent: -2, labor_hours: -1, labor_hourly_rate: -4, indirect_percent: -2, delivery_internal_cost: -10, delivery_customer_charge: -5, markup_percent: -8, final_price: 0 }, [{ cost: -3 }])
    expect(result.total_internal_cost).toBe(0)
    expect(result.estimated_profit).toBe(0)
    expect(result.real_margin_percent).toBe(0)
  })
})

describe('compatibilidad del esquema de costos', () => {
  it('usa legacy cuando falta exactamente una columna v1 y conserva los valores', async () => {
    supabaseMock.responses.push({ data: null, error: { ...missingConfig, message: "Could not find the 'costing_model_version' column of 'arpe_cost_settings' in the schema cache" } }, { data: legacyRow, error: null })
    const result = await loadCostSettingsValues('business-1')
    expect(result).toMatchObject({ schemaCapability: 'legacy-schema', activeModel: 'legacy', waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60, capabilities: { supportsUtilities: false, supportsOverhead: false, supportsTraceSnapshots: false } })
    expect(result).not.toHaveProperty('costing_model_version')
    expect(result).not.toHaveProperty('costing_config')
    expect(supabaseMock.queries).toHaveLength(2)
    expect(supabaseMock.queries[1].columns).not.toMatch(/costing_model_version|costing_config/)
  })

  it('propaga errores de permiso y red sin fallback', async () => {
    const permissionError = { code: '42501', message: 'permission denied for table arpe_cost_settings' }
    supabaseMock.responses.push({ data: null, error: permissionError })
    await expect(loadCostSettingsValues('business-1')).rejects.toBe(permissionError)
    expect(supabaseMock.queries).toHaveLength(1)
  })

  it('reconoce únicamente errores de columnas v1 faltantes en la tabla esperada', () => {
    expect(isMissingCostingV1Schema({ code: '42703', message: 'column arpe_cost_settings.costing_model_version does not exist' })).toBe(true)
    expect(isMissingCostingV1Schema(missingConfig)).toBe(true)
    expect(isMissingCostingV1Schema({ code: 'PGRST204', message: "Could not find the 'unrelated_column' column of 'arpe_cost_settings' in the schema cache" })).toBe(false)
    expect(isMissingCostingV1Schema({ code: '42501', message: 'permission denied for table arpe_cost_settings' })).toBe(false)
    expect(isMissingCostingV1Schema({ code: 'PGRST204', message: "Could not find the 'costing_config' column of 'another_table' in the schema cache" })).toBe(false)
  })

  it('detecta v1-schema pero mantiene activeModel legacy cuando la fila tiene versión cero', async () => {
    const config = { ...defaultCostingConfig, electricity_rate_per_kwh: 2 }
    supabaseMock.responses.push({ data: { ...legacyRow, costing_model_version: 0, costing_config: config }, error: null })
    const result = await loadCostSettingsValues('business-1')
    expect(result).toMatchObject({ schemaCapability: 'v1-schema', activeModel: 'legacy', costing_model_version: 0, costing_config: config, waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60, capabilities: { supportsUtilities: true, supportsOverhead: true, supportsTraceSnapshots: true } })
  })

  it('detecta modelo v1 solo cuando la fila está explícitamente activada', async () => {
    const config = { electricity_rate_per_kwh: 1 }
    supabaseMock.responses.push({ data: { ...legacyRow, costing_model_version: 1, costing_config: config }, error: null })
    const result = await loadCostSettingsValues('business-1')
    expect(result.schemaCapability).toBe('v1-schema')
    expect(result.activeModel).toBe('v1')
    expect(result.costing_model_version).toBe(1)
    expect(result.costing_config).toMatchObject(config)
    expect(supabaseMock.queries).toHaveLength(1)
  })

  it('guarda solo campos legacy cuando el esquema no tiene columnas v1', async () => {
    supabaseMock.responses.push({ data: null, error: { ...missingConfig, message: "Could not find the 'costing_config' column of 'arpe_cost_settings' in the schema cache" } }, { data: legacyRow, error: null }, { data: { ...legacyRow, waste_percent: 15 }, error: null })
    await saveCostSettings('business-1', { waste_percent: 15, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60 })
    const write = supabaseMock.queries.at(-1)?.payload as Record<string, unknown>
    expect(supabaseMock.queries.at(-1)?.operation).toBe('update')
    expect(write).toMatchObject({ waste_percent: 15, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60 })
    expect(write).not.toHaveProperty('business_id')
    expect(write).not.toHaveProperty('costing_model_version')
    expect(write).not.toHaveProperty('costing_config')
  })

  it('guarda configuración avanzada en v1-schema sin activar un negocio legacy', async () => {
    const config = { ...defaultCostingConfig, electricity_rate_per_kwh: 2 }
    supabaseMock.responses.push({ data: { ...legacyRow, costing_model_version: 0, costing_config: defaultCostingConfig }, error: null }, { data: { ...legacyRow, costing_model_version: 0, costing_config: config }, error: null })
    await saveCostSettings('business-1', { waste_percent: 15, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60, costing_config: config })
    const write = supabaseMock.queries.at(-1)?.payload as Record<string, unknown>
    expect(write).toMatchObject({ costing_model_version: 0, costing_config: config })
  })

  it('does not activate new settings rows when a v1 schema is available', async () => {
    supabaseMock.responses.push({ data: null, error: null }, { data: { ...legacyRow, costing_model_version: 0, costing_config: defaultCostingConfig }, error: null })
    const settings = await getCostSettings('business-1')
    expect(settings).toMatchObject({ schemaCapability: 'v1-schema', activeModel: 'legacy', costing_model_version: 0 })
    expect(supabaseMock.queries.at(-1)?.payload).toMatchObject({ costing_model_version: 0 })
    expect(supabaseMock.queries.at(-1)?.operation).toBe('insert')
  })

  it('activation updates only the model version and preserves the saved configuration', async () => {
    const config = { ...defaultCostingConfig, electricity_rate_per_kwh: 2 }
    supabaseMock.responses.push(
      { data: { ...legacyRow, costing_model_version: 0, costing_config: config }, error: null },
      { data: { ...legacyRow, costing_model_version: 1, costing_config: config }, error: null },
    )
    const activated = await activateCostingModelV1('business-1')
    const update = supabaseMock.queries.find(query => query.operation === 'update')
    expect(update?.payload).toEqual({ costing_model_version: 1 })
    expect(activated).toMatchObject({ activeModel: 'v1', costing_model_version: 1, costing_config: config })
  })

  it('blocks incoherent activation but allows unused utility categories to remain unconfigured', () => {
    const values = defaultCostSettingsValues({ schemaCapability: 'v1-schema', activeModel: 'legacy' })
    expect(validateCostingV1Activation(values, defaultCostingConfig)).toEqual([])
    expect(validateCostingV1Activation(values, { ...defaultCostingConfig, monthly_overhead_total: 250 })).toContain('Configura horas productivas mensuales mayores que cero para asignar overhead.')
    expect(validateCostingV1Activation(values, { ...defaultCostingConfig, electricity_equipment: [{ id: 'oven', name: 'Horno', active: true, power_kw: 0, calculation_mode: 'estimated' }] })).toContain('Completa el nombre y los datos de consumo de cada equipo eléctrico activo que usarás.')
    expect(validateCostingV1Activation(values, { ...defaultCostingConfig, electricity_equipment: [{ id: 'oven', name: 'Horno medido', active: true, power_kw: 0, calculation_mode: 'measured' }] })).toContain('Configura la tarifa eléctrica por kWh para los equipos activos.')
    expect(validateCostingV1Activation(values, { ...defaultCostingConfig, electricity_rate_per_kwh: 2, electricity_equipment: [{ id: 'oven', name: 'Horno medido', active: true, power_kw: 0, calculation_mode: 'measured' }] })).toEqual([])
    expect(validateCostingV1Activation(values, { ...defaultCostingConfig, natural_gas_equipment: [{ id: 'gas', name: 'Horno gas', active: true, btu_per_hour: 0 }] })).toContain('Completa el nombre y los BTU/h de cada equipo de gas natural activo que usarás.')
    expect(validateCostingV1Activation(values, { ...defaultCostingConfig, lpg_cylinder_price: 10, lpg_net_kg: 1, lpg_equipment: [{ id: 'lpg', name: 'Quemador', active: true, consumption_kg_per_hour: 0 }] })).toContain('Completa el nombre y el consumo kg/h de cada equipo GLP activo que usarás.')
  })

  it('does not update settings when activation validation fails', async () => {
    supabaseMock.responses.push({ data: { ...legacyRow, costing_model_version: 0, costing_config: { ...defaultCostingConfig, monthly_overhead_total: 250 } }, error: null })
    await expect(activateCostingModelV1('business-1')).rejects.toThrow('Configura horas productivas mensuales mayores que cero para asignar overhead.')
    expect(supabaseMock.queries.some(query => query.operation === 'update')).toBe(false)
  })

  it('documents safe migration defaults without rewriting legacy cost fields', () => {
    const migration = readFileSync('supabase/migrations/20261103022507_ejnexa_costing_engine_v1.sql', 'utf8')
    expect(migration).toMatch(/add column costing_model_version smallint not null default 0 check \(costing_model_version in \(0,1\)\)/i)
    expect(migration).toMatch(/add column costing_model_version smallint not null default 0 check \(costing_model_version in \(0,1\)\),[\s\S]*?add column costing_config/i)
    expect(migration).not.toMatch(/update public\.arpe_cost_settings/i)
    expect(migration).toMatch(/add column costing_model_version smallint not null default 0 check \(costing_model_version in \(0,1\)\),[\s\S]*?add column costing_snapshot jsonb/i)
  })
})
