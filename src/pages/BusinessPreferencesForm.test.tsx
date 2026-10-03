import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Business } from '../lib/database.types'
import { BusinessPreferencesForm } from './BusinessPreferencesForm'
import { saveBusinessPreferences } from '../lib/business'

vi.mock('../lib/business', async importOriginal => ({ ...await importOriginal<typeof import('../lib/business')>(), saveBusinessPreferences: vi.fn() }))

const business: Business = {
  id: 'business-1', owner_id: 'owner-1', name: 'Dulce Hogar', logo_path: null, slogan: 'Con cariño', description: '',
  whatsapp: '+505 8888-1234', email: 'hola@example.com', address: 'Managua', currency: 'NIO',
  default_deposit_type: 'percentage', default_deposit_value: 50, default_document_format: 'a4',
  show_slogan_on_documents: true, show_description_on_documents: true, show_whatsapp_on_documents: true,
  show_email_on_documents: true, show_address_on_documents: true,
  document_footer_message: 'Gracias por confiar en nosotros.', created_at: '', updated_at: '',
}

beforeEach(() => vi.resetAllMocks())

it('saves preferences and immediately returns the updated business', async () => {
  const user = userEvent.setup()
  const onSaved = vi.fn()
  const updatedBusiness = { ...business, default_deposit_type: 'fixed' as const, default_deposit_value: 125, show_email_on_documents: false }
  vi.mocked(saveBusinessPreferences).mockResolvedValue(updatedBusiness)
  render(<BusinessPreferencesForm business={business} ownerId="owner-1" onSaved={onSaved} />)

  await user.selectOptions(screen.getByRole('combobox', { name: /Tipo de anticipo predeterminado/ }), 'fixed')
  await user.clear(screen.getByRole('spinbutton', { name: /Valor predeterminado del anticipo/ }))
  await user.type(screen.getByRole('spinbutton', { name: /Valor predeterminado del anticipo/ }), '125')
  await user.click(screen.getByRole('switch', { name: /Mostrar correo/ }))
  await user.click(screen.getByRole('button', { name: /Guardar preferencias/ }))

  expect(await screen.findByText('Las preferencias se guardaron correctamente.')).toBeInTheDocument()
  expect(saveBusinessPreferences).toHaveBeenCalledWith('owner-1', business.id, expect.objectContaining({
    default_deposit_type: 'fixed', default_deposit_value: 125, show_email_on_documents: false,
  }))
  expect(onSaved).toHaveBeenCalledWith(updatedBusiness)
})
