import type { Business, QuoteInput, QuoteStatus } from './database.types'
import { client } from './supabase'

export const quoteStatuses: { value: QuoteStatus; label: string }[] = [
  { value: 'draft', label: 'Borrador' },
  { value: 'sent', label: 'Enviada' },
  { value: 'accepted', label: 'Aceptada' },
  { value: 'rejected', label: 'Rechazada' },
]

export function calculateDeposit(total: number, type: QuoteInput['deposit_type'], value: number) {
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0
  return Math.min(safeTotal, type === 'percentage' ? safeTotal * Math.min(100, safeValue) / 100 : safeValue)
}

export function formatCurrency(amount: number, business: Business) {
  const symbols = { NIO: 'C$', USD: '$', EUR: '€', CRC: '₡' } as const
  return `${symbols[business.currency]} ${new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
}

export async function listQuotes(businessId: string) {
  const { data, error } = await client().from('arpe_quotes').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createQuote(input: QuoteInput) {
  const { data, error } = await client().from('arpe_quotes').insert(input).select().single()
  if (error) throw error
  return data
}

export async function updateQuote(id: string, businessId: string, input: Partial<QuoteInput>) {
  const { data, error } = await client().from('arpe_quotes').update(input).eq('id', id).eq('business_id', businessId).select().single()
  if (error) throw error
  return data
}

export async function removeQuote(id: string, businessId: string) {
  const { error } = await client().from('arpe_quotes').delete().eq('id', id).eq('business_id', businessId)
  if (error) throw error
}
