import { describe, expect, it } from 'vitest'
import { businessPreferencesPayload, currencies, MAX_LOGO_SIZE, validateBusinessPreferences, validateLogo } from './business'
import type { BusinessPreferencesInput } from './database.types'

const preferences: BusinessPreferencesInput = {
  default_deposit_type: 'percentage', default_deposit_value: 50, default_document_format: 'a4',
  show_slogan_on_documents: true, show_description_on_documents: true, show_whatsapp_on_documents: true,
  show_email_on_documents: true, show_address_on_documents: true,
  document_footer_message: 'Gracias por confiar en nosotros.',
}

describe('business assets and currencies', () => {
  it('supports the four initial currencies with explicit symbols', () => {
    expect(currencies.map(({ code, symbol }) => [code, symbol])).toEqual([['NIO', 'C$'], ['USD', '$'], ['EUR', '€'], ['CRC', '₡']])
  })
  it('accepts logos up to 10 MB in PNG, JPG, and WebP and rejects larger or unsupported files', () => {
    expect(() => validateLogo(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }))).toThrow('PNG, JPG o WebP')
    expect(() => validateLogo(new File([new Uint8Array(MAX_LOGO_SIZE - 1)], 'logo.png', { type: 'image/png' }))).not.toThrow()
    expect(() => validateLogo(new File([new Uint8Array(MAX_LOGO_SIZE)], 'logo.jpg', { type: 'image/jpeg' }))).not.toThrow()
    expect(() => validateLogo(new File([new Uint8Array(MAX_LOGO_SIZE)], 'logo.webp', { type: 'image/webp' }))).not.toThrow()
    expect(() => validateLogo(new File([new Uint8Array(MAX_LOGO_SIZE + 1)], 'logo.png', { type: 'image/png' }))).toThrow('10 MB')
    expect(() => validateLogo(new File(['image'], 'logo.webp', { type: 'image/webp' }))).not.toThrow()
  })

  it('accepts valid preferences and the maximum footer length', () => {
    expect(() => validateBusinessPreferences({ ...preferences, document_footer_message: 'x'.repeat(300) })).not.toThrow()
    expect(() => validateBusinessPreferences({ ...preferences, default_deposit_type: 'fixed', default_deposit_value: 0 })).not.toThrow()
  })

  it('rejects invalid deposit percentages and negative or non-finite values', () => {
    expect(() => validateBusinessPreferences({ ...preferences, default_deposit_value: 100.01 })).toThrow('no puede superar el 100%')
    expect(() => validateBusinessPreferences({ ...preferences, default_deposit_type: 'fixed', default_deposit_value: -1 })).toThrow('igual o mayor que cero')
    expect(() => validateBusinessPreferences({ ...preferences, default_deposit_value: Number.NaN })).toThrow('número')
  })

  it('rejects footer text over 300 characters', () => {
    expect(() => validateBusinessPreferences({ ...preferences, document_footer_message: 'x'.repeat(301) })).toThrow('300 caracteres')
  })

  it('updates only preference fields and leaves existing business data untouched', () => {
    const payload = businessPreferencesPayload(preferences)
    const existing = { name: 'Dulce Hogar', currency: 'NIO', address: 'Managua' }
    expect(payload).toEqual(preferences)
    expect({ ...existing, ...payload }).toMatchObject(existing)
    expect(Object.keys(payload).sort()).toEqual(Object.keys(preferences).sort())
  })
})
