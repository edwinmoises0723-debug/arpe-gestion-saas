import { describe, expect, it } from 'vitest'
import { getDailyWelcomeMessage, getWelcomeFirstName, getWelcomeGreeting } from './welcome'

describe('dashboard welcome', () => {
  it.each([
    [0, 'Buenas noches'], [4, 'Buenas noches'], [5, 'Buenos días'], [11, 'Buenos días'],
    [12, 'Buenas tardes'], [17, 'Buenas tardes'], [18, 'Buenas noches'], [23, 'Buenas noches'],
  ])('uses local hour %i for the greeting', (hour, expected) => {
    expect(getWelcomeGreeting(hour)).toBe(expected)
  })

  it('keeps one original message for a local calendar day', () => {
    const morning = new Date(2026, 9, 31, 7)
    const evening = new Date(2026, 9, 31, 22)
    expect(getDailyWelcomeMessage(morning)).toBe(getDailyWelcomeMessage(evening))
    expect(getDailyWelcomeMessage(new Date(2026, 10, 1))).not.toBe(getDailyWelcomeMessage(morning))
  })

  it('uses a name only when profile metadata provides one', () => {
    expect(getWelcomeFirstName()).toBeUndefined()
    expect(getWelcomeFirstName({ email: 'edwin@example.com' })).toBeUndefined()
    expect(getWelcomeFirstName({ full_name: '  Edwin Nicaragua  ', name: 'Other Name' })).toBe('Edwin')
  })
})
