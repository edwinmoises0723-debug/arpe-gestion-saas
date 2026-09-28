import { describe, expect, it } from 'vitest'
import { calculateDeposit } from './quotes'

describe('quote deposits', () => {
  it('calculates percentage deposits and clamps the percentage', () => {
    expect(calculateDeposit(1000, 'percentage', 50)).toBe(500)
    expect(calculateDeposit(1000, 'percentage', 150)).toBe(1000)
  })
  it('calculates fixed deposits and never exceeds the total', () => {
    expect(calculateDeposit(1000, 'fixed', 350)).toBe(350)
    expect(calculateDeposit(1000, 'fixed', 1500)).toBe(1000)
    expect(calculateDeposit(1000, 'fixed', -10)).toBe(0)
  })
})
