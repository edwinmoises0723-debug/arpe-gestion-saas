import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { BusinessForm } from './BusinessForm'
import { saveBusiness } from '../lib/business'
vi.mock('../lib/business', async importOriginal => ({ ...await importOriginal<typeof import('../lib/business')>(), saveBusiness: vi.fn() }))
beforeEach(() => vi.resetAllMocks())
it('keeps the entered data when saving fails and supports retry', async () => {
  const user = userEvent.setup()
  vi.mocked(saveBusiness).mockRejectedValueOnce(new Error('Sin conexión'))
  render(<BusinessForm ownerId="owner" business={null} onSaved={vi.fn()} />)
  await user.click(screen.getByRole('textbox', { name: /Nombre del negocio/ }))
  await user.paste('Dulce Encanto')
  await user.selectOptions(screen.getByRole('combobox', { name: /Moneda principal/ }), 'CRC')
  await user.click(screen.getByRole('button', { name: /Crear mi negocio/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sin conexión')
  expect(screen.getByRole('textbox', { name: /Nombre del negocio/ })).toHaveValue('Dulce Encanto')
  expect(screen.getByRole('combobox')).toHaveValue('CRC')
  expect(screen.getByRole('button', { name: /Crear mi negocio/ })).toBeEnabled()
})
it('does not save a whitespace-only business name', async () => {
  const user = userEvent.setup()
  render(<BusinessForm ownerId="owner" business={null} onSaved={vi.fn()} />)
  await user.click(screen.getByRole('textbox', { name: /Nombre del negocio/ }))
  await user.paste('   ')
  await user.click(screen.getByRole('button', { name: /Crear mi negocio/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Escribe el nombre')
  expect(saveBusiness).not.toHaveBeenCalled()
})
