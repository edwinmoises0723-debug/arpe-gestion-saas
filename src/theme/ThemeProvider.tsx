import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { readThemePreference, resolveTheme, SYSTEM_THEME_QUERY, THEME_STORAGE_KEY, type ThemePreference } from './theme'
import { ThemeContext } from './useTheme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themePreference, setThemePreference] = useState(readThemePreference)
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(SYSTEM_THEME_QUERY).matches)
  const resolvedTheme = resolveTheme(themePreference, systemDark)

  useEffect(() => {
    const media = window.matchMedia(SYSTEM_THEME_QUERY)
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
    document.documentElement.style.colorScheme = resolvedTheme
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (themeColor) themeColor.content = resolvedTheme === 'dark' ? '#0b1321' : '#f5f7fb'
  }, [resolvedTheme])

  function setTheme(next: ThemePreference) {
    setThemePreference(next)
    try { window.localStorage.setItem(THEME_STORAGE_KEY, next) } catch { /* Visual-only preference. */ }
  }

  return <ThemeContext.Provider value={{ themePreference, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
}
