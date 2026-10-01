import type { Quote, QuoteStatus } from './database.types'
import { localCalendarDate } from './agenda'

export type QuoteStatusFilter = 'all' | QuoteStatus
export type QuoteSortOrder = 'recent' | 'oldest' | 'customer-asc' | 'customer-desc' | 'delivery-near' | 'delivery-far'

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim().replace(/\s+/g, ' ')
}

function searchTokens(value: string) {
  return normalizeSearch(value).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

function getLocalDeliveryDate(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = localCalendarDate(value)
  return Number.isNaN(date.getTime()) ? null : date.getTime()
}

function matchesSearch(quote: Quote, query: string) {
  if (!query) return true
  const deliveryDate = getLocalDeliveryDate(quote.delivery_date)
  const normalizedDate = normalizeSearch(quote.delivery_date ?? '')
  const localizedDate = deliveryDate === null
    ? ''
    : new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(deliveryDate))
  const normalizedLocalizedDate = normalizeSearch(localizedDate)
  const haystack = searchTokens([
    quote.customer_name,
    quote.quote_number,
    ...(quote.items?.map(item => item.product) ?? [quote.product]),
    quote.customer_phone,
    normalizedDate,
    normalizedLocalizedDate,
  ].join(' '))
  if (/\b(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|\b\d{4}-\d{2}-\d{2}\b/.test(query)) {
    return `${normalizedDate} ${normalizedLocalizedDate}`.includes(query)
  }
  return searchTokens(query).every(term => haystack.some(token => token.startsWith(term)))
}

function compareDelivery(a: Quote, b: Quote, direction: 1 | -1) {
  const aDate = getLocalDeliveryDate(a.delivery_date)
  const bDate = getLocalDeliveryDate(b.delivery_date)
  if (aDate === null) return bDate === null ? 0 : 1
  if (bDate === null) return -1
  return (aDate - bDate) * direction
}

function compareQuotes(a: Quote, b: Quote, order: QuoteSortOrder) {
  switch (order) {
    case 'oldest':
      return Date.parse(a.created_at) - Date.parse(b.created_at)
    case 'customer-asc':
      return a.customer_name.localeCompare(b.customer_name, 'es', { sensitivity: 'base', numeric: true })
    case 'customer-desc':
      return b.customer_name.localeCompare(a.customer_name, 'es', { sensitivity: 'base', numeric: true })
    case 'delivery-near':
      return compareDelivery(a, b, 1)
    case 'delivery-far':
      return compareDelivery(a, b, -1)
    case 'recent':
    default:
      return Date.parse(b.created_at) - Date.parse(a.created_at)
  }
}

export function filterAndSortQuotes(quotes: Quote[], search: string, status: QuoteStatusFilter, order: QuoteSortOrder): Quote[] {
  const query = normalizeSearch(search)
  return quotes
    .filter(quote => (status === 'all' || quote.status === status) && matchesSearch(quote, query))
    .slice()
    .sort((a, b) => compareQuotes(a, b, order))
}
