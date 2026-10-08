import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderStatusDonut } from './OrderStatusDonut'

const labels = { confirmed: 'Confirmados', in_preparation: 'En preparación', ready: 'Listos', delivered: 'Entregados', cancelled: 'Cancelados' }

describe('OrderStatusDonut', () => {
  it('shows a donut with an accessible status summary and total order count', () => {
    render(<OrderStatusDonut counts={{ confirmed: 1, in_preparation: 1, ready: 0, delivered: 1, cancelled: 0 }} labels={labels} />)
    expect(screen.getByRole('img', { name: /Confirmados: 1.*En preparación: 1.*Entregados: 1.*Total: 3 pedidos/ })).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Pedidos')).toBeInTheDocument()
  })

  it('handles an empty distribution without dividing by zero', () => {
    render(<OrderStatusDonut counts={{ confirmed: 0, in_preparation: 0, ready: 0, delivered: 0, cancelled: 0 }} labels={labels} />)
    expect(screen.getByRole('img', { name: /Total: 0 pedidos/ })).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
