import type { CatalogProduct, CatalogProductInput, ItemCostInput, OrderItem, QuoteBundleHeader, QuoteBundleItem, QuoteItem } from './database.types'
import { calculateCosts, defaultCostSettings } from './costs'
import { calculateDeposit } from './quotes'
import { client } from './supabase'

export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export const lineTotal = (item: { quantity: number; unit_price: number }) => money(item.quantity * item.unit_price)
export const productsSubtotal = (items: { line_total: number }[]) => money(items.reduce((sum, item) => sum + Number(item.line_total), 0))
export const quoteProductsSubtotal = productsSubtotal
export const orderProductsSubtotal = productsSubtotal
export function summarizeProducts(items: { product: string }[], fallback = '') {
  return items.length ? `${items[0].product}${items.length > 1 ? ` + ${items.length - 1} más` : ''}` : fallback
}
export const summarizeQuoteProducts = summarizeProducts
export const summarizeOrderProducts = summarizeProducts
function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const grouped: Record<string, T[]> = {}
  for (const item of items) (grouped[key(item)] ??= []).push(item)
  return grouped
}
export const groupQuoteItemsByQuote = (items: QuoteItem[]) => groupBy(items, item => item.quote_id)
export const groupOrderItemsByOrder = (items: OrderItem[]) => groupBy(items, item => item.order_id)
export function newProduct(): QuoteBundleItem {
  return { catalog_product_id: null, product: '', quantity: 1, unit_label: 'unidad', portions: null, flavor: '', filling: '', decoration: '', extras: '', notes: '', unit_price: 0, cost: null, direct_costs: [] }
}
export function fromCatalog(product: CatalogProduct): QuoteBundleItem {
  return { ...newProduct(), catalog_product_id: product.id, product: product.name, unit_label: product.unit_label, unit_price: Number(product.default_unit_price), portions: product.default_portions, flavor: product.default_flavor, filling: product.default_filling, decoration: product.default_decoration, extras: product.default_extras, notes: product.description }
}
export const duplicateProduct = (item: QuoteBundleItem): QuoteBundleItem => structuredClone(item)
export function removeProduct<T>(items: T[], index: number): T[] {
  if (items.length <= 1) throw new Error('La cotización necesita al menos un producto.')
  return items.filter((_, i) => i !== index)
}
export function newItemCost(settings = defaultCostSettings): ItemCostInput {
  return { waste_percent: Number(settings.waste_percent), indirect_percent: Number(settings.indirect_percent), labor_hourly_rate: Number(settings.labor_hourly_rate), markup_percent: Number(settings.markup_percent), ingredients_cost: 0, labor_hours: 0 }
}
export function calculateItemCost(item: QuoteBundleItem) {
  return calculateCosts({ ...(item.cost ?? newItemCost()), delivery_internal_cost: 0, delivery_customer_charge: 0, final_price: lineTotal(item) }, item.direct_costs)
}
export function suggestedUnitPrice(item: QuoteBundleItem) {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) throw new Error('Indica una cantidad mayor que cero.')
  return money(calculateItemCost(item).suggested_product_price / item.quantity)
}
export function calculateBundle(header: QuoteBundleHeader, items: QuoteBundleItem[]) {
  const subtotal = money(items.reduce((sum, item) => sum + lineTotal(item), 0))
  const total = money(subtotal + header.delivery_customer_charge)
  const deposit = money(calculateDeposit(total, header.deposit_type, header.deposit_value))
  // An uncosted item is unknown, not free. Never claim a complete profit from partial costs.
  const internal = items.length && items.every(item => item.cost !== null)
    ? money(items.reduce((sum, item) => sum + calculateItemCost(item).total_internal_cost, 0) + header.delivery_internal_cost) : null
  const profit = internal === null ? null : money(total - internal)
  return { subtotal, total, deposit, balance: money(Math.max(0, total - deposit)), internal, profit, margin: profit !== null && total > 0 ? money(profit / total * 100) : null }
}
export function validateBundle(header: QuoteBundleHeader, items: QuoteBundleItem[]) {
  if (!header.customer_name.trim()) throw new Error('Escribe el nombre del cliente.')
  if (!items.length) throw new Error('La cotización necesita al menos un producto.')
  for (const item of items) {
    if (!item.product.trim()) throw new Error('Escribe el nombre de cada producto.')
    if (!item.unit_label.trim()) throw new Error('Indica la unidad de cada producto.')
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || Math.abs(item.quantity * 1000 - Math.round(item.quantity * 1000)) > 0.00001) throw new Error('La cantidad debe ser mayor que cero y tener hasta 3 decimales.')
    if (!Number.isFinite(item.unit_price) || item.unit_price < 0) throw new Error('El precio unitario no puede ser negativo.')
    if (item.cost && Object.values(item.cost).some(value => !Number.isFinite(value) || value < 0)) throw new Error('Los costos y porcentajes no pueden ser negativos.')
    if (item.cost && item.cost.waste_percent > 100) throw new Error('La merma no puede superar el 100%.')
    if (item.direct_costs.some(cost => !cost.name.trim() || !Number.isFinite(cost.cost) || cost.cost < 0)) throw new Error('Completa la descripción y el costo de cada gasto.')
  }
  if ([header.delivery_internal_cost, header.delivery_customer_charge, header.deposit_value].some(value => !Number.isFinite(value) || value < 0)) throw new Error('La entrega y el anticipo no pueden ser negativos.')
  if (header.deposit_type === 'percentage' && header.deposit_value > 100) throw new Error('El anticipo porcentual no puede superar el 100%.')
  if (header.deposit_type === 'fixed' && header.deposit_value > calculateBundle(header, items).total) throw new Error('El anticipo no puede superar el total.')
}
export async function listCatalog(businessId: string) {
  const { data, error } = await client().from('arpe_catalog_products').select('*').eq('business_id', businessId).order('name')
  if (error) throw error
  return data ?? []
}
export async function saveCatalog(id: string | null, input: CatalogProductInput) {
  const table = client().from('arpe_catalog_products')
  const { data, error } = await (id ? table.update(input).eq('id', id).eq('business_id', input.business_id) : table.insert(input)).select().single()
  if (error) throw error
  return data
}
export function filterCatalog(items: CatalogProduct[], search: string, category: string, status: string) {
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  return items.filter(item => normalize(`${item.name} ${item.category}`).includes(normalize(search.trim())) && (!category || item.category === category) && (status === 'all' || item.is_active === (status === 'active')))
}
export async function listQuoteItemsForBusiness(businessId: string) {
  const rows: QuoteItem[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client().from('arpe_quote_items').select('*').eq('business_id', businessId).order('quote_id').order('position').range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 500) return rows
  }
}
export async function listOrderItemsForBusiness(businessId: string) {
  const rows: OrderItem[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client().from('arpe_order_items').select('*').eq('business_id', businessId).order('order_id').order('position').range(offset, offset + 499)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < 500) return rows
  }
}
export async function loadQuoteBundle(quoteId: string, businessId: string): Promise<QuoteBundleItem[]> {
  const { data: items, error } = await client().from('arpe_quote_items').select('*').eq('quote_id', quoteId).eq('business_id', businessId).order('position')
  if (error) throw error
  if (!items?.length) throw new Error('Esta cotización no tiene productos migrados. Revisa la migración antes de editarla.')
  const ids = items.map(item => item.id)
  const [costs, direct] = await Promise.all([
    client().from('arpe_quote_item_costs').select('*').eq('business_id', businessId).in('quote_item_id', ids),
    client().from('arpe_quote_item_cost_items').select('*').eq('business_id', businessId).in('quote_item_id', ids).order('created_at'),
  ])
  if (costs.error) throw costs.error
  if (direct.error) throw direct.error
  return items.map(item => {
    const c = costs.data?.find(cost => cost.quote_item_id === item.id)
    return { ...item, cost: c ? { ingredients_cost: Number(c.ingredients_cost), waste_percent: Number(c.waste_percent), labor_hours: Number(c.labor_hours), labor_hourly_rate: Number(c.labor_hourly_rate), indirect_percent: Number(c.indirect_percent), markup_percent: Number(c.markup_percent) } : null,
      direct_costs: (direct.data ?? []).filter(d => d.quote_item_id === item.id).map(d => ({ category: d.category, name: d.name, cost: Number(d.cost) })) }
  })
}
export async function saveQuoteBundle(id: string | null, header: QuoteBundleHeader, items: QuoteBundleItem[]) {
  validateBundle(header, items)
  const { data, error } = await client().rpc('arpe_save_quote_bundle', { p_quote_id: id, p_header: header, p_items: items })
  if (error) throw error
  if (!data?.[0]) throw new Error('No se recibió la cotización guardada.')
  return data[0]
}
