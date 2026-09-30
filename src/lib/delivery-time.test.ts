import { describe, expect, it } from 'vitest'
import { deliveryTimeFromParts, deliveryTimeToParts, formatDeliveryTime } from './delivery-time'

describe('delivery time display and conversion', () => {
  it.each([
    [{ hour: '3', minute: '30', period: 'AM' as const }, '03:30'],
    [{ hour: '3', minute: '30', period: 'PM' as const }, '15:30'],
    [{ hour: '12', minute: '00', period: 'AM' as const }, '00:00'],
    [{ hour: '12', minute: '00', period: 'PM' as const }, '12:00'],
    [{ hour: '5', minute: '00', period: 'PM' as const }, '17:00'],
  ])('%j converts to %s', (parts, expected) => {
    expect(deliveryTimeFromParts(parts)).toBe(expected)
  })

  it('leaves an undefined delivery time as null', () => {
    expect(deliveryTimeFromParts(null)).toBeNull()
    expect(deliveryTimeToParts(null)).toBeNull()
    expect(formatDeliveryTime(null)).toBe('Hora por definir')
  })

  it.each([
    ['17:00', '5:00 p. m.'],
    ['03:30', '3:30 a. m.'],
    ['00:00', '12:00 a. m.'],
    ['12:00', '12:00 p. m.'],
  ])('formats stored %s as %s', (stored, expected) => {
    expect(formatDeliveryTime(stored)).toBe(expected)
  })
})
