import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Business } from '../lib/database.types'

vi.mock('../lib/catalog-campaigns', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/catalog-campaigns')>(),
  listCatalogCampaigns: vi.fn(),
}))

import { listCatalogCampaigns } from '../lib/catalog-campaigns'
import { CampaignsPanel } from './CampaignsPanel'

const business = { id: 'business-1' } as Business
const listCampaignsMock = vi.mocked(listCatalogCampaigns)

describe('CampaignsPanel request states', () => {
  beforeEach(() => listCampaignsMock.mockReset())
  afterEach(() => cleanup())

  it('shows a load error without rendering the empty state', async () => {
    listCampaignsMock.mockRejectedValueOnce(new Error('Campaign service unavailable'))

    const { container } = render(<CampaignsPanel business={business} products={[]} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos completar esta acción.')
    expect(container.querySelector('.campaign-empty-state')).not.toBeInTheDocument()
    expect(screen.queryByText('Agrega primero al menos un producto')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  })

  it('shows the empty state after a successful request with no campaigns', async () => {
    listCampaignsMock.mockResolvedValueOnce([])

    const { container } = render(<CampaignsPanel business={business} products={[]} />)

    expect(await screen.findByRole('heading', { name: 'Aún no has creado promociones' })).toBeVisible()
    expect(container.querySelector('.campaign-error-state')).not.toBeInTheDocument()
  })
})
