import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Business, Currency } from '../lib/database.types'
import { CampaignTypeSelector } from './CampaignTypeSelector'

const baseBusiness: Business = {
  id: 'business-1', owner_id: 'owner-1', name: 'Tienda', logo_path: null, slogan: '', description: '', whatsapp: '', email: '', address: '', currency: 'NIO',
  default_deposit_type: 'percentage', default_deposit_value: 50, default_document_format: 'a4', show_slogan_on_documents: true, show_description_on_documents: true,
  show_whatsapp_on_documents: true, show_email_on_documents: true, show_address_on_documents: true, document_footer_message: '',
  catalog_slug: null, public_catalog_enabled: false, public_catalog_show_whatsapp: false, public_catalog_logo_path: null, created_at: '', updated_at: '',
}

describe('promotion selector currency and availability', () => {
  it.each<[Currency, string]>([['NIO', 'C$'], ['USD', '$'], ['EUR', '€'], ['CRC', '₡']])('uses %s business currency in offer examples', (currency, symbol) => {
    render(<CampaignTypeSelector business={{ ...baseBusiness, currency }} selected="percentage" onSelect={() => undefined} />)
    const amountDiscount = within(screen.getByRole('button', { name: /Descuento por monto/ }))
    const specialPrice = within(screen.getByRole('button', { name: /Precio especial/ }))
    expect(amountDiscount.getByText(/de descuento$/)).toHaveTextContent(symbol)
    expect(specialPrice.getByText(/^Ahora/)).toHaveTextContent(symbol)
  })

  it('shows combo as upcoming and does not allow selecting it', () => {
    render(<CampaignTypeSelector business={baseBusiness} selected="percentage" onSelect={() => undefined} />)
    const combo = screen.getByRole('button', { name: /Combo/ })
    expect(combo).toBeDisabled()
    expect(combo.querySelector('.campaign-coming-soon')).toBeVisible()
    expect(screen.getByText(/configurador de combos llegará/)).toBeVisible()
  })
})
