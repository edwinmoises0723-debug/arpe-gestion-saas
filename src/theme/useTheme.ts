import { createContext, useContext } from 'react'
import type { ResolvedTheme, ThemePreference } from './theme'

export const ThemeContext = createContext<{
  themePreference: ThemePreference
  resolvedTheme: ResolvedTheme
  setTheme: (preference: ThemePreference) => void
} | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme requiere ThemeProvider')
  return context
}
