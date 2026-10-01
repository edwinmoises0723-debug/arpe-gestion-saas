import { describe, expect, it } from 'vitest'
import type { CatalogProduct, QuoteBundleHeader } from './database.types'
import { calculateBundle, calculateItemCost, duplicateProduct, filterCatalog, fromCatalog, lineTotal, newItemCost, newProduct, removeProduct, suggestedUnitPrice, summarizeProducts, validateBundle } from './products'

const header: QuoteBundleHeader = { customer_name: 'Cliente de prueba', customer_phone: '', delivery_date: null, delivery_time: null, notes: '', status: 'draft', deposit_type: 'percentage', deposit_value: 50, delivery_internal_cost: 100, delivery_customer_charge: 150 }
const catalog: CatalogProduct = { id: 'catalog-1', business_id: 'business-1', name: 'Alfajor', category: 'Galletas', description: 'Relleno suave', unit_label: 'unidad', default_unit_price: 35, default_portions: null, default_flavor: 'Chocolate', default_filling: 'Ganache', default_decoration: '', default_extras: '', is_active: true, created_at: '', updated_at: '' }
describe('productos independientes y catálogo', () => {
  it('copies catalog snapshots in both directions and duplicates cost data independently', () => {
    const source = { ...catalog }
    const item = fromCatalog(source)
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
    const item = { ...fromCatalog(catalog), quantity: 24, cost: { ...newItemCost(), ingredients_cost: 700, labor_hours: 3, labor_hourly_rate: 100 }, direct_costs: [{ category: 'packaging' as const, name: 'Caja', cost: 150 }] }
    expect(calculateItemCost(item)).toMatchObject({ waste_amount: 84, direct_costs_total: 150, labor_cost: 300, production_subtotal: 1234, indirect_amount: 148.08, production_cost: 1382.08, total_internal_cost: 1382.08, suggested_product_price: 2211.33 })
    expect(suggestedUnitPrice(item)).toBe(92.14)
    const summary = calculateBundle(header, [{ ...item, unit_price: 100 }])
    expect(summary).toMatchObject({ internal: 1482.08, total: 2550, profit: 1067.92, margin: 41.88 })
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
})
