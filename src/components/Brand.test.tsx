import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Brand, Credit } from './Brand'

describe('platform branding', () => {
  it('renders the official inline SVG beside the EJNEXA Business wordmark', () => {
    const { container } = render(<Brand />)
    const symbol = container.querySelector('svg.brand-symbol')

    expect(symbol).toBeInTheDocument()
    expect(symbol).toHaveAttribute('viewBox', '0 0 256 256')
    expect(symbol).toHaveAttribute('aria-hidden', 'true')
    expect(symbol?.querySelectorAll('path').length).toBeGreaterThan(0)
    expect(container.querySelector('img')).not.toBeInTheDocument()
    const wordmark = container.querySelector('.brand-wordmark')
    expect(wordmark).toHaveTextContent('EJNEXA')
    expect(container.querySelector('.brand-x')).toHaveTextContent('X')
    expect(screen.getByText('BUSINESS')).toBeInTheDocument()
    expect(screen.queryByText('ARPE')).not.toBeInTheDocument()
    expect(screen.queryByText('Sprout')).not.toBeInTheDocument()
  })

  it('keeps the founder visible in the technology credit', () => {
    render(<Credit />)
    expect(screen.getByText('EJNEXA Business · EJNEXA AI Studio')).toBeInTheDocument()
    expect(screen.getByText('Ing. Edwin Nicaragua · Founder')).toBeInTheDocument()
  })
})
