import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '../theme/useTheme'

const options = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'system', label: 'Sistema', Icon: Monitor },
] as const

export function ThemeSwitcher() {
  const { themePreference, setTheme } = useTheme()
  return <div className="theme-switcher" role="group" aria-label="Apariencia">
    <span className="theme-switcher-label">Apariencia</span>
    <div className="theme-switcher-options">{options.map(({ value, label, Icon }) => <button key={value} type="button" aria-pressed={themePreference === value} onClick={() => setTheme(value)}><Icon size={17} aria-hidden="true" />{label}</button>)}</div>
  </div>
}
