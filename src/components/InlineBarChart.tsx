import { useState } from 'react'

export interface InlineBarChartPoint {
  key: string
  label: string
  amount: number
  tick?: string
}

interface InlineBarChartProps {
  points: InlineBarChartPoint[]
  ariaLabel: string
  formatAmount: (amount: number) => string
  trackClassName: string
  emptySelectionText: string
}

/** Compact, keyboard and touch accessible chart for small dashboard/report series. */
export function InlineBarChart({ points, ariaLabel, formatAmount, trackClassName, emptySelectionText }: InlineBarChartProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selectedPoint = points.find(point => point.key === selectedKey) ?? null
  const maxAmount = Math.max(...points.map(point => point.amount), 0)

  return <div className="inline-chart">
    <div className={`inline-chart-track ${trackClassName}`} role="group" aria-label={ariaLabel}>
      {points.map(point => {
        const height = maxAmount > 0 ? Math.max(point.amount > 0 ? 8 : 2, point.amount / maxAmount * 100) : 2
        const label = `${point.label}: ${formatAmount(point.amount)}`
        return <button
          type="button"
          className={`inline-chart-point${selectedKey === point.key ? ' is-selected' : ''}`}
          key={point.key}
          aria-label={label}
          aria-pressed={selectedKey === point.key}
          title={label}
          onFocus={() => setSelectedKey(point.key)}
          onClick={() => setSelectedKey(point.key)}
        ><span className="inline-chart-bar" style={{ height: `${height}%` }} /></button>
      })}
    </div>
    <div className="inline-chart-ticks" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
      {points.map(point => <small key={point.key}>{point.tick ?? ''}</small>)}
    </div>
    <div className="inline-chart-selection" role="status" aria-live="polite">
      {selectedPoint ? <><span>{selectedPoint.label}</span><strong>{formatAmount(selectedPoint.amount)}</strong></> : <span>{emptySelectionText}</span>}
    </div>
  </div>
}
