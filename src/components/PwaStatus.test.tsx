import { act, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false, vi.fn()], updateServiceWorker: vi.fn() }),
}))

import { PwaStatus } from './PwaStatus'

describe('PWA branding', () => {
  it('uses the EJNEXA Business installation prompt', () => {
    render(<PwaStatus />)
    const installEvent = new Event('beforeinstallprompt', { cancelable: true })
    Object.assign(installEvent, { prompt: vi.fn(), userChoice: Promise.resolve({ outcome: 'accepted' }) })
    act(() => { window.dispatchEvent(installEvent) })
    expect(screen.getByRole('button', { name: 'Instalar EJNEXA Business' })).toBeInTheDocument()
  })
})
