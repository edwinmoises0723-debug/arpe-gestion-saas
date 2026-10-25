import type { CatalogRequest, CatalogRequestItem, CatalogRequestStatus, QuoteBundleHeader, QuoteBundleItem } from './database.types'
import { client } from './supabase'

export type CatalogRequestStatusFilter = 'all' | CatalogRequestStatus
export type CatalogRequestAction = 'reviewing' | 'declined' | 'archived'
export const CATALOG_REQUESTS_CHANGED_EVENT = 'ejnexa:catalog-requests-changed'

export const catalogRequestStatuses: { value: CatalogRequestStatus; label: string }[] = [
  { value: 'new', label: 'Nueva' },
  { value: 'reviewing', label: 'En revisión' },
  { value: 'converted', label: 'Convertida' },
  { value: 'declined', label: 'Rechazada' },
  { value: 'archived', label: 'Archivada' },
]

export type CatalogRequestQuotePreparation = {
  requestId: string
  requestNumber: string
  businessId: string
  header: Pick<QuoteBundleHeader, 'customer_name' | 'customer_phone' | 'delivery_date' | 'notes'>
  items: QuoteBundleItem[]
  itemsWithoutPublishedPrice: string[]
}

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().replace(/\s+/g, ' ')
}

export function filterCatalogRequests(requests: CatalogRequest[], search: string, status: CatalogRequestStatusFilter) {
  const query = normalizeSearch(search)
  return requests.filter(request => (status === 'all' || request.status === status)
    && (!query || normalizeSearch(`${request.request_number} ${request.customer_name}`).includes(query)))
}

export function formatCatalogRequestDate(value: string | null, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) {
  if (!value) return null
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : new Intl.DateTimeFormat('es', options).format(parsed)
}

export async function listCatalogRequests(businessId: string) {
  const { data, error } = await client().from('arpe_catalog_requests')
    .select('*').eq('business_id', businessId).order('submitted_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function listCatalogRequestItems(businessId: string, requestIds: string[]) {
  if (requestIds.length === 0) return [] as CatalogRequestItem[]
  const { data, error } = await client().from('arpe_catalog_request_items')
    .select('*').eq('business_id', businessId).in('request_id', requestIds).order('position')
  if (error) throw error
  return data ?? []
}

export async function loadCatalogRequestInbox(businessId: string) {
  const requests = await listCatalogRequests(businessId)
  const items = await listCatalogRequestItems(businessId, requests.map(request => request.id))
  const itemsByRequest: Record<string, CatalogRequestItem[]> = {}
  for (const item of items) (itemsByRequest[item.request_id] ??= []).push(item)
  return { requests, itemsByRequest }
}

export async function countNewCatalogRequests(businessId: string) {
  const { count, error } = await client().from('arpe_catalog_requests')
    .select('id', { count: 'exact', head: true }).eq('business_id', businessId).eq('status', 'new')
  if (error) throw error
  return count ?? 0
}

export async function changeCatalogRequestStatus(action: CatalogRequestAction, requestId: string) {
  const rpc = {
    reviewing: 'ejnexa_mark_catalog_request_reviewing',
    declined: 'ejnexa_decline_catalog_request',
    archived: 'ejnexa_archive_catalog_request',
  } as const
  const { data, error } = await client().rpc(rpc[action], { p_request_id: requestId })
  if (error) throw error
  window.dispatchEvent(new Event(CATALOG_REQUESTS_CHANGED_EVENT))
  return data as CatalogRequestStatus
}

export function prepareCatalogRequestQuote(request: CatalogRequest, items: CatalogRequestItem[]): CatalogRequestQuotePreparation {
  const ordered = [...items].sort((a, b) => a.position - b.position)
  return {
    requestId: request.id,
    requestNumber: request.request_number,
    businessId: request.business_id,
    header: {
      customer_name: request.customer_name,
      customer_phone: request.customer_phone,
      delivery_date: request.desired_date,
      notes: request.details,
    },
    items: ordered.map(item => ({
      catalog_product_id: item.catalog_product_id,
      product: item.product_name_snapshot,
      quantity: Number(item.quantity),
      unit_label: item.unit_label_snapshot,
      portions: item.default_portions_snapshot,
      flavor: '',
      filling: '',
      decoration: '',
      extras: '',
      notes: '',
      unit_price: item.public_unit_price_snapshot === null ? 0 : Number(item.public_unit_price_snapshot),
      cost: null,
      direct_costs: [],
    })),
    itemsWithoutPublishedPrice: ordered.filter(item => item.public_price_mode_snapshot === 'contact' || item.public_unit_price_snapshot === null).map(item => item.product_name_snapshot),
  }
}

export function isCatalogRequestQuotePreparation(value: unknown, businessId: string): value is CatalogRequestQuotePreparation {
  if (!value || typeof value !== 'object') return false
  const preparation = value as Partial<CatalogRequestQuotePreparation>
  return preparation.businessId === businessId
    && typeof preparation.requestId === 'string'
    && typeof preparation.requestNumber === 'string'
    && Boolean(preparation.header && Array.isArray(preparation.items) && Array.isArray(preparation.itemsWithoutPublishedPrice))
}
