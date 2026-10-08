import type { CSSProperties } from 'react'
import type { OrderStatus } from '../lib/database.types'

const statusOrder: OrderStatus[] = ['confirmed', 'in_preparation', 'ready', 'delivered', 'cancelled']

type StatusCounts = Record<OrderStatus, number>

export function OrderStatusDonut({ counts, labels, className = '' }: {
  counts: StatusCounts
  labels: Record<OrderStatus, string>
  className?: string
}) {
  const total = statusOrder.reduce((sum, status) => sum + counts[status], 0)
  const stops = statusOrder.reduce<{ position: number; values: string[] }>((accumulator, status) => {
    const end = accumulator.position + (total ? counts[status] / total * 100 : 0)
    return {
      position: end,
      values: [...accumulator.values, `var(--status-${status}) ${accumulator.position}% ${end}%`],
    }
  }, { position: 0, values: [] }).values
  const style = { '--order-status-gradient': `conic-gradient(${stops.join(', ')})` } as CSSProperties
  const summary = statusOrder.map(status => `${labels[status]}: ${counts[status]}`).join(', ')

  return <div
    className={`order-status-donut ${className}`.trim()}
    role="img"
    aria-label={`Distribución de pedidos por estado. ${summary}. Total: ${total} pedidos.`}
    style={style}
  >
    <span className="order-status-donut-center" aria-hidden="true"><strong>{total}</strong><small>Pedidos</small></span>
  </div>
}
