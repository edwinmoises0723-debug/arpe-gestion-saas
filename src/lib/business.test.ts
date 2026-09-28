import { describe, expect, it } from 'vitest'
import { currencies, validateLogo } from './business'
describe('business assets and currencies', () => {
  it('supports the four initial currencies with explicit symbols', () => {
    expect(currencies.map(({ code, symbol }) => [code, symbol])).toEqual([['NIO', 'C$'], ['USD', '$'], ['EUR', '€'], ['CRC', '₡']])
  })
  it('rejects active image formats and oversized uploads', () => {
    expect(() => validateLogo(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' }))).toThrow('PNG, JPG o WebP')
    expect(() => validateLogo(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'logo.png', { type: 'image/png' }))).toThrow('2 MB')
    expect(() => validateLogo(new File(['image'], 'logo.webp', { type: 'image/webp' }))).not.toThrow()
  })
})
