import { describe, expect, it } from 'vitest'
import { calculateDeposit, getInitialQuoteDeposit } from './quotes'
import type { Business, Quote } from './database.types'

const business = {
  id: 'business-1', owner_id: 'owner-1', name: 'Dulce Hogar', logo_path: null, slogan: '', description: '', whatsapp: '', email: '', address: '', currency: 'NIO',
  default_deposit_type: 'percentage', default_deposit_value: 50, default_document_format: 'a4',
  show_slogan_on_documents: true, show_description_on_documents: true, show_whatsapp_on_documents: true,
  show_email_on_documents: true, show_address_on_documents: true, document_footer_message: 'Gracias',
  created_at: '', updated_at: '',
} satisfies Business

describe('quote deposits', () => {
  it('uses business deposit defaults for new quotes', () => {
    expect(getInitialQuoteDeposit(business, null)).toEqual({ deposit_type: 'percentage', deposit_value: 50 })
    expect(getInitialQuoteDeposit({ ...business, default_deposit_type: 'fixed', default_deposit_value: 125 }, null)).toEqual({ deposit_type: 'fixed', deposit_value: 125 })
  })
  it('keeps the deposit saved on an existing quote when business defaults change', () => {
    const savedQuote = { deposit_type: 'fixed', deposit_value: 275 } as Pick<Quote, 'deposit_type' | 'deposit_value'>
    expect(getInitialQuoteDeposit({ ...business, default_deposit_type: 'percentage', default_deposit_value: 80 }, savedQuote)).toEqual({ deposit_type: 'fixed', deposit_value: 275 })
  })
  it('calculates percentage deposits and clamps the percentage', () => {
    expect(calculateDeposit(1000, 'percentage', 50)).toBe(500)
    expect(calculateDeposit(1000, 'percentage', 150)).toBe(1000)
  })
  it('calculates fixed deposits and never exceeds the total', () => {
    expect(calculateDeposit(1000, 'fixed', 350)).toBe(350)
    expect(calculateDeposit(1000, 'fixed', 1500)).toBe(1000)
    expect(calculateDeposit(1000, 'fixed', -10)).toBe(0)
  })
})
