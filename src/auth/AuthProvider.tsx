import { createContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { client, errorMessage } from '../lib/supabase'

type AuthState = { session: Session | null; loading: boolean; error: string; recovering: boolean; finishRecovery: () => void }
// Context is deliberately separate from its consumer hook for fast refresh.
// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recovering, setRecovering] = useState(() => sessionStorage.getItem('arpe:recovery') === 'true' || location.hash.includes('type=recovery'))
  useEffect(() => {
    let active = true
    let eventReceived = false
    const { data: { subscription } } = client().auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      eventReceived = true
      setSession(nextSession)
      setLoading(false)
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem('arpe:recovery', 'true')
        setRecovering(true)
      }
      if (event === 'SIGNED_OUT') {
        sessionStorage.removeItem('arpe:recovery')
        setRecovering(false)
      }
    })
    client().auth.getSession().then(({ data, error: authError }) => {
      if (!active) return
      if (authError) setError(errorMessage(authError))
      if (!eventReceived) setSession(data.session)
      setLoading(false)
    }).catch((e: unknown) => { if (active) { setError(errorMessage(e)); setLoading(false) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  return <AuthContext.Provider value={{ session, loading, error, recovering, finishRecovery: () => {
    sessionStorage.removeItem('arpe:recovery'); setRecovering(false)
  } }}>{children}</AuthContext.Provider>
}
