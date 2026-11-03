import { describe, expect, it } from 'vitest'
import type { CatalogProduct, QuoteBundleHeader } from './database.types'
import { calculateBundle, calculateItemCost, duplicateProduct, filterCatalog, fromCatalog, lineTotal, newItemCost, newProduct, removeProduct, suggestedUnitPrice, summarizeProducts, validateBundle } from './products'
import { defaultCostSettingsValues } from './costs'
import { defaultCostingConfig } from './costing-engine'

const header: QuoteBundleHeader = { customer_name: 'Cliente de prueba', customer_phone: '', delivery_date: null, delivery_time: null, notes: '', status: 'draft', deposit_type: 'percentage', deposit_value: 50, delivery_internal_cost: 100, delivery_customer_charge: 150 }
const catalog: CatalogProduct = { id: 'catalog-1', business_id: 'business-1', name: 'Alfajor', category: 'Galletas', description: 'Relleno suave', unit_label: 'unidad', default_unit_price: 35, default_portions: null, default_flavor: 'Chocolate', default_filling: 'Ganache', default_decoration: '', default_extras: '', is_active: true, image_path: null, is_public: false, public_price_mode: 'exact', public_sort_order: 0, created_at: '', updated_at: '' }
describe('productos independientes y catálogo', () => {
  it('copies catalog snapshots in both directions and duplicates cost data independently', () => {
    const source = { ...catalog }
    const item = fromCatalog(source)
    expect(item).not.toHaveProperty('image_path')
    expect(item).not.toHaveProperty('is_public')
    expect(item).not.toHaveProperty('public_price_mode')
    expect(item).not.toHaveProperty('public_sort_order')
    source.name = 'Nuevo nombre'; source.default_unit_price = 40
    expect(item.product).toBe('Alfajor'); expect(item.unit_price).toBe(35)
    item.product = 'Personalizado'; expect(source.name).toBe('Nuevo nombre')
    item.cost = newItemCost(); item.direct_costs = [{ category: 'packaging', name: 'Caja', cost: 50 }]
    const copy = duplicateProduct(item); copy.cost!.markup_percent = 100; copy.direct_costs[0].cost = 99
    expect(item.cost.markup_percent).toBe(60); expect(item.direct_costs[0].cost).toBe(50)
  })
  it('filters name/category, accents and active state', () => {
    const inactive = { ...catalog, id: '2', name: 'Pastél', category: 'Pasteles', is_active: false }
    expect(filterCatalog([catalog, inactive], 'pastel', '', 'inactive')).toEqual([inactive])
    expect(filterCatalog([catalog, inactive], 'galletas', 'Galletas', 'active')).toEqual([catalog])
    expect(filterCatalog([catalog, inactive], '', '', 'all')).toHaveLength(2)
  })
  it('calculates three lines, one delivery, deposit and remaining balance', () => {
    const items = [2000, 850, 35].map((price, i) => ({ ...newProduct(), product: `Producto ${i}`, unit_price: price, quantity: i === 2 ? 24 : 1 }))
    expect(lineTotal(items[2])).toBe(840)
    expect(calculateBundle(header, items)).toMatchObject({ subtotal: 3690, total: 3840, deposit: 1920, balance: 1920, internal: null, profit: null })
    expect(calculateBundle({ ...header, deposit_type: 'fixed', deposit_value: 500 }, items).balance).toBe(3340)
    expect(calculateBundle({ ...header, deposit_value: 25 }, items).deposit).toBe(960)
    expect(summarizeProducts(items)).toBe('Producto 0 + 2 más')
    expect(removeProduct(items, 1)).toHaveLength(2)
    expect(() => removeProduct([items[0]], 0)).toThrow('La cotización necesita al menos un producto.')
  })
  it('costs the full quantity and adds delivery only to the global internal cost', () => {
    const item = { ...fromCatalog(catalog), quantity: 24, cost: { ...newItemCost({ waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 0, markup_percent: 60, activeModel: 'v1', schemaCapability: 'v1-schema' }), ingredients_cost: 700, labor_hours: 3, labor_hourly_rate: 100 }, direct_costs: [{ category: 'packaging' as const, name: 'Caja', cost: 150 }] }
    expect(calculateItemCost(item)).toMatchObject({ waste_amount: 84, direct_costs_total: 150, labor_cost: 300, production_subtotal: 1234, indirect_amount: 0, overhead_amount: 0, production_cost: 1234, total_internal_cost: 1234, suggested_product_price: 1974.4 })
    expect(suggestedUnitPrice(item)).toBe(82.27)
    const summary = calculateBundle(header, [{ ...item, unit_price: 100 }])
    expect(summary).toMatchObject({ internal: 1334, total: 2550, profit: 1216, margin: 47.69 })
    expect(calculateBundle(header, [item]).profit).toBeLessThan(0)
    expect(() => suggestedUnitPrice({ ...item, quantity: 0 })).toThrow()
  })
  it('rejects invalid inputs and preserves partial cost as unknown', () => {
    const item = fromCatalog(catalog)
    expect(() => validateBundle(header, [])).toThrow()
    for (const invalid of [{ ...item, product: '' }, { ...item, quantity: 0 }, { ...item, quantity: -1 }, { ...item, unit_price: NaN }, { ...item, cost: { ...newItemCost(), waste_percent: 101 } }]) expect(() => validateBundle(header, [invalid])).toThrow()
    expect(calculateBundle(header, [item, { ...item, cost: newItemCost() }]).internal).toBeNull()
    expect(newItemCost({ ...{ business_id: 'extra' }, waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 0, markup_percent: 60 })).not.toHaveProperty('business_id')
  })
  it('snapshots configured overhead on new quote items instead of following later setting changes', () => {
    const config = { ...defaultCostingConfig, monthly_overhead_total: 1000, productive_hours_per_month: 100 }
    const cost = newItemCost({ waste_percent: 0, indirect_percent: 12, labor_hourly_rate: 50, markup_percent: 60, costing_config: config, activeModel: 'v1', schemaCapability: 'v1-schema' })
    const item = { ...fromCatalog(catalog), cost: { ...cost, ingredients_cost: 100, labor_hours: 2 } }
    config.monthly_overhead_total = 10000
    expect(calculateItemCost(item).overhead_amount).toBe(20)
    expect(item.cost.costing_snapshot?.costing_config?.monthly_overhead_total).toBe(1000)
  })
  it('creates legacy item costs without v1 fields and applies the legacy indirect percentage', () => {
    const cost = newItemCost({ waste_percent: 12, indirect_percent: 12, labor_hourly_rate: 100, markup_percent: 60, activeModel: 'legacy', schemaCapability: 'legacy-schema' })
    expect(cost).not.toHaveProperty('costing_model_version')
    expect(cost).not.toHaveProperty('costing_snapshot')
    const item = { ...fromCatalog(catalog), cost: { ...cost, ingredients_cost: 100, labor_hours: 1 } }
    expect(calculateItemCost(item)).toMatchObject({ costing_model_version: 'legacy', production_subtotal: 212, indirect_amount: 25.44, utilities_total: 0, overhead_amount: 0, production_cost: 237.44 })
  })
  it('keeps v1-capable businesses on an explicit legacy snapshot until activation', () => {
    const settings = defaultCostSettingsValues({ schemaCapability: 'v1-schema', activeModel: 'legacy' })
    const cost = newItemCost(settings)
    expect(cost.costing_model_version).toBe(0)
    expect(cost).not.toHaveProperty('costing_snapshot')
    const item = { ...fromCatalog(catalog), cost: { ...cost, ingredients_cost: 100, labor_hours: 1, labor_hourly_rate: 100 } }
    expect(calculateItemCost(item)).toMatchObject({ costing_model_version: 'legacy', production_subtotal: 212, indirect_amount: 25.44, production_cost: 237.44 })
  })
  it('preserves a legacy quote snapshot after settings are activated for new calculations', () => {
    const legacyCost = { ...newItemCost(defaultCostSettingsValues({ schemaCapability: 'v1-schema', activeModel: 'legacy' })), ingredients_cost: 100, labor_hours: 1, labor_hourly_rate: 100 }
    const legacyItem = { ...fromCatalog(catalog), cost: legacyCost }
    const before = calculateItemCost(legacyItem)
    const activeSettings = defaultCostSettingsValues({ schemaCapability: 'v1-schema', activeModel: 'v1' })
    const newCost = newItemCost(activeSettings)
    expect(newCost.costing_model_version).toBe(1)
    expect(calculateItemCost(legacyItem)).toEqual(before)
  })
})
