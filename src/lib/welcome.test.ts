import { describe, expect, it } from 'vitest'
import { getDailyWelcomeMessage, getWelcomeEyebrow, getWelcomeFirstName, getWelcomeGreeting } from './welcome'

describe('dashboard welcome', () => {
  it.each([
    [0, 'Buenas noches', 'CIERRA EL DÍA CON CLARIDAD'],
    [4, 'Buenas noches', 'CIERRA EL DÍA CON CLARIDAD'],
    [5, 'Buenos días', 'UN NUEVO DÍA PARA AVANZAR'],
    [11, 'Buenos días', 'UN NUEVO DÍA PARA AVANZAR'],
    [12, 'Buenas tardes', 'SIGAMOS AVANZANDO'],
    [17, 'Buenas tardes', 'SIGAMOS AVANZANDO'],
    [18, 'Buenas noches', 'CIERRA EL DÍA CON CLARIDAD'],
    [23, 'Buenas noches', 'CIERRA EL DÍA CON CLARIDAD'],
  ])('uses local hour %i for matching greeting and eyebrow', (hour, greeting, eyebrow) => {
    expect(getWelcomeGreeting(hour)).toBe(greeting)
    expect(getWelcomeEyebrow(hour)).toBe(eyebrow)
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
