import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Brand, Credit } from './Brand'

describe('platform branding', () => {
  it('shows the EJNEXA Business wordmark without substituting a generated icon', () => {
    render(<Brand />)
    expect(screen.getByText('EJNEXA')).toBeInTheDocument()
    expect(screen.getByText('BUSINESS')).toBeInTheDocument()
    expect(screen.queryByText('ARPE')).not.toBeInTheDocument()
  })

  it('keeps the founder visible in the technology credit', () => {
    render(<Credit />)
    expect(screen.getByText('EJNEXA Business · EJNEXA AI Studio')).toBeInTheDocument()
    expect(screen.getByText('Ing. Edwin Nicaragua · Founder')).toBeInTheDocument()
  })
})
