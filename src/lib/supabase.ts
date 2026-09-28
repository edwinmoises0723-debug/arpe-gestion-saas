import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
// A strict public-key allowlist prevents accidental use of privileged credentials.
const valid = Boolean(url && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && key?.startsWith('sb_publishable_') && !key.includes('REPLACE_ME'))
export const supabase = valid ? createClient<Database>(url!, key!, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null

export function client() {
  if (!supabase) throw new Error('Falta configurar la conexión con Supabase.')
  return supabase
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
  if (/Invalid login credentials/i.test(message)) return 'El correo o la contraseña no son correctos.'
  if (/Email not confirmed/i.test(message)) return 'Confirma tu correo antes de iniciar sesión.'
  if (/rate limit|too many requests/i.test(message)) return 'Has realizado varios intentos. Espera unos minutos e inténtalo de nuevo.'
  if (/fetch|network|offline/i.test(message)) return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.'
  if (/already registered/i.test(message)) return 'Este correo ya está registrado. Inicia sesión o recupera tu contraseña.'
  return message || 'No pudimos completar la acción. Inténtalo de nuevo.'
}
