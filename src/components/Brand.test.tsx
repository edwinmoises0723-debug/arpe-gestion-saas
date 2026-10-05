import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Brand, Credit } from './Brand'

function mockImageResult(result: 'load' | 'error') {
  let resolveSettled!: () => void
  const settled = new Promise<void>(resolve => { resolveSettled = resolve })

  class ControlledImage {
    onload: ((event: Event) => void) | null = null
    onerror: ((event: Event) => void) | null = null

    set src(_value: string) {
      queueMicrotask(() => {
        if (result === 'load') this.onload?.(new Event('load'))
        else this.onerror?.(new Event('error'))
        resolveSettled()
      })
    }
  }

  vi.stubGlobal('Image', ControlledImage as unknown as typeof Image)
  return settled
}

afterEach(() => vi.unstubAllGlobals())

describe('platform branding', () => {
  it('shows the EJNEXA Business wordmark without substituting a generated icon', () => {
    render(<Brand />)
    expect(screen.getByText('EJNEXA')).toBeInTheDocument()
    expect(screen.getByText('BUSINESS')).toBeInTheDocument()
    expect(screen.queryByText('ARPE')).not.toBeInTheDocument()
  })

  it('shows the official flat isotipo after the image loads and keeps the product name', async () => {
    const settled = mockImageResult('load')
    const { container } = render(<Brand />)
    await settled
    await waitFor(() => expect(container.querySelector('.brand-symbol')).toHaveAttribute('src', '/brand/ejnexa/isotipo-flat.png'))
    expect(screen.getByText('EJNEXA')).toBeVisible()
    expect(screen.getByText('BUSINESS')).toBeVisible()
  })

  it('keeps the textual fallback when the official isotipo fails to load', async () => {
    const settled = mockImageResult('error')
    const { container } = render(<Brand />)
    await settled
    expect(container.querySelector('.brand-symbol')).not.toBeInTheDocument()
    expect(screen.getByText('EJNEXA')).toBeVisible()
    expect(screen.getByText('BUSINESS')).toBeVisible()
  })

  it('keeps the founder visible in the technology credit', () => {
    render(<Credit />)
    expect(screen.getByText('EJNEXA Business · EJNEXA AI Studio')).toBeInTheDocument()
    expect(screen.getByText('Ing. Edwin Nicaragua · Founder')).toBeInTheDocument()
  })
})
