import { describe, expect, it } from 'vitest'
import type { Quote } from './database.types'
import { filterAndSortQuotes } from './quote-list'

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'quote-1', business_id: 'business-1', quote_number: 'ARPE-COT-2026-0001', customer_name: 'María Gómez', customer_phone: '+505 8888 1111',
    product: 'Pastel de chocolate', portions: 12, flavor: '', filling: '', decoration: '', extras: '', delivery_date: '2026-10-05', delivery_time: null,
    notes: '', total_amount: 1000, deposit_type: 'percentage', deposit_value: 50, deposit_required: 500, status: 'accepted',
    created_at: '2026-09-20T12:00:00.000Z', updated_at: '2026-09-20T12:00:00.000Z', ...overrides,
  }
}

describe('quote list search, filtering and sorting', () => {
  const quotes = [
    makeQuote({ id: 'later', quote_number: 'ARPE-COT-2026-0003', customer_name: 'Zoé Ruiz', delivery_date: '2026-10-20', created_at: '2026-09-25T12:00:00.000Z' }),
    makeQuote({ id: 'no-date', quote_number: 'ARPE-COT-2026-0004', customer_name: 'Carlos Díaz', delivery_date: null, status: 'draft', created_at: '2026-09-30T12:00:00.000Z' }),
    makeQuote({ id: 'earlier', quote_number: 'ARPE-COT-2026-0002', customer_name: 'Ana Pérez', delivery_date: '2026-10-01', status: 'sent', created_at: '2026-09-15T12:00:00.000Z' }),
    makeQuote({ id: 'maría', quote_number: 'ARPE-COT-2026-0001', customer_name: 'María Gómez', product: 'Torta de vainilla', delivery_date: '2026-10-10', created_at: '2026-09-22T12:00:00.000Z' }),
  ]

  it('searches by customer, quote number, product, phone and local delivery date without case or accent sensitivity', () => {
    expect(filterAndSortQuotes(quotes, '  MARIA   ', 'all', 'recent').map(quote => quote.id)).toEqual(['maría'])
    expect(filterAndSortQuotes(quotes, '0002', 'all', 'recent').map(quote => quote.id)).toEqual(['earlier'])
    expect(filterAndSortQuotes(quotes, 'TORTA DE VAINILLA', 'all', 'recent').map(quote => quote.id)).toEqual(['maría'])
    expect(filterAndSortQuotes(quotes, '8888 1111', 'all', 'recent').map(quote => quote.id)).toEqual(['no-date', 'later', 'maría', 'earlier'])
    expect(filterAndSortQuotes(quotes, '1 de octubre de 2026', 'all', 'recent').map(quote => quote.id)).toEqual(['earlier'])
  })

  it('combines a status filter with the local search', () => {
    expect(filterAndSortQuotes(quotes, 'maría', 'accepted', 'recent').map(quote => quote.id)).toEqual(['maría'])
    expect(filterAndSortQuotes(quotes, 'maría', 'draft', 'recent')).toEqual([])
  })

  it('orders customers A–Z and Z–A', () => {
    expect(filterAndSortQuotes(quotes, '', 'all', 'customer-asc').map(quote => quote.customer_name)).toEqual(['Ana Pérez', 'Carlos Díaz', 'María Gómez', 'Zoé Ruiz'])
    expect(filterAndSortQuotes(quotes, '', 'all', 'customer-desc').map(quote => quote.customer_name)).toEqual(['Zoé Ruiz', 'María Gómez', 'Carlos Díaz', 'Ana Pérez'])
  })

  it('orders by nearest or farthest local delivery and always leaves missing dates last', () => {
    expect(filterAndSortQuotes(quotes, '', 'all', 'delivery-near').map(quote => quote.id)).toEqual(['earlier', 'maría', 'later', 'no-date'])
    expect(filterAndSortQuotes(quotes, '', 'all', 'delivery-far').map(quote => quote.id)).toEqual(['later', 'maría', 'earlier', 'no-date'])
  })
})
