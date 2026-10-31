import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QuoteItemPrice } from './QuoteItemPrice'

describe('request price presentation', () => {
  it('shows pending contact price as empty with an explanation, without hiding the form guard', () => {
    const onChange = vi.fn()
    render(<QuoteItemPrice id="price" value={0} pending onChange={onChange} />)
    const input = screen.getByRole('spinbutton')
    expect(input).toHaveValue(null)
    expect(input).toHaveAttribute('placeholder', 'Define el precio')
    expect(input).not.toBeRequired()
    expect(screen.getByText('Precio pendiente')).toBeVisible()
    fireEvent.change(input, { target: { value: '150' } })
    expect(onChange).toHaveBeenCalledWith(150)
  })
  it.each([0, 150])('keeps nonpending commercial value %s numeric', value => {
    render(<QuoteItemPrice id="price" value={value} pending={false} onChange={vi.fn()} />)
    expect(screen.getByRole('spinbutton')).toHaveValue(value)
    expect(screen.queryByText('Precio pendiente')).not.toBeInTheDocument()
  })
})
