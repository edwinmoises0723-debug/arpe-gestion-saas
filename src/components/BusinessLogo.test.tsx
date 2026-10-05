import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const createSignedUrl = vi.hoisted(() => vi.fn())
vi.mock('../lib/supabase', () => ({
  client: () => ({ storage: { from: () => ({ createSignedUrl }) } }),
}))

import { BusinessLogo } from './BusinessLogo'

describe('business identity logo', () => {
  it('continues to label the active customer business logo with its business name', async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.test/arpe-logo.png' } })
    render(<BusinessLogo path="owner/arpe-logo.png" name="ARPE Dulce Encanto" />)
    expect(await screen.findByRole('img', { name: 'Logo de ARPE Dulce Encanto' })).toHaveAttribute('src', 'https://storage.test/arpe-logo.png')
  })
})
