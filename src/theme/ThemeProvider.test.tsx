import { readFileSync } from 'node:fs'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { ThemeSwitcher } from '../components/ThemeSwitcher'
import { readThemePreference, resolveTheme, THEME_STORAGE_KEY } from './theme'

let listener: ((event: { matches: boolean }) => void) | undefined
const removeListener = vi.fn()
function system(dark: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: dark, addEventListener: (_: string, next: typeof listener) => { listener = next }, removeEventListener: removeListener })))
}
beforeEach(() => { localStorage.clear(); system(false); listener = undefined })
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); delete document.documentElement.dataset.theme })

describe('local appearance', () => {
  it('defaults to system and follows changes without reload, cleaning up the listener', () => {
    const view = render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>)
    expect(screen.getByRole('button', { name: 'Sistema' })).toHaveAttribute('aria-pressed', 'true')
    expect(document.documentElement.dataset.theme).toBe('light')
    act(() => listener?.({ matches: true }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    view.unmount()
    expect(removeListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
  it('persists light/dark and ignores system changes until system is selected again', () => {
    const view = render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Oscuro' }))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    act(() => listener?.({ matches: false }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    view.unmount()
    render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>)
    expect(document.documentElement.dataset.theme).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: 'Claro' }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    fireEvent.click(screen.getByRole('button', { name: 'Sistema' }))
    act(() => listener?.({ matches: true }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('system')
  })
  it('invalid or unavailable storage falls back safely; denied writes do not break the switch', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'invalid')
    expect(readThemePreference()).toBe('system')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    render(<ThemeProvider><ThemeSwitcher /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Oscuro' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
  it.each(['light', 'dark', 'system', 'invalid', null])('pre-paint script matches provider for %s', saved => {
    const source = readFileSync('public/theme-init.js', 'utf8')
    for (const dark of [false, true]) {
      const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> }
      const storage = { getItem: () => saved }
      const browser = { matchMedia: () => ({ matches: dark }) }
      const meta = { content: '' }
      new Function('localStorage', 'document', 'window', source)(storage, { documentElement: root, querySelector: () => meta }, browser)
      const preference = saved === 'light' || saved === 'dark' ? saved : 'system'
      expect(root.dataset.theme).toBe(resolveTheme(preference, dark))
      expect(root.style.colorScheme).toBe(root.dataset.theme)
      expect(meta.content).toBe(resolveTheme(preference, dark) === 'dark' ? '#0b1321' : '#f5f7fb')
    }
  })
  it('pre-paint script tolerates blocked storage', () => {
    const source = readFileSync('public/theme-init.js', 'utf8')
    const root = { dataset: {} as Record<string, string>, style: {} as Record<string, string> }
    const browser = { matchMedia: () => ({ matches: true }) }
    const storage = { getItem: () => { throw new Error('denied') } }
    expect(() => new Function('localStorage', 'document', 'window', source)(storage, { documentElement: root, querySelector: () => null }, browser)).not.toThrow()
    expect(root.dataset.theme).toBe('dark')
  })
})
