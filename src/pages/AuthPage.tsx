import { useState, type FormEvent } from 'react'
import { ArrowRight, Check, Eye, EyeOff, Leaf, LockKeyhole, Sparkles } from 'lucide-react'
import { Brand, Credit } from '../components/Brand'
import { Notice } from '../components/Feedback'
import { client, errorMessage } from '../lib/supabase'
import { useAuth } from '../auth/useAuth'

export function AuthPage({ recovery = false }: { recovery?: boolean }) {
  const { finishRecovery } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const title = recovery ? 'Una nueva contraseña' : mode === 'signup' ? 'Tu próximo capítulo empieza aquí' : mode === 'reset' ? 'Recupera tu acceso' : 'Qué gusto tenerte aquí'
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      const auth = client().auth
      if (recovery) {
        const { error } = await auth.updateUser({ password }); if (error) throw error
        finishRecovery()
      } else if (mode === 'login') {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password }); if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin } })
        if (error) throw error
        if (!data.session) setMessage('Revisa tu correo y confirma tu cuenta para continuar. Si ya tienes una cuenta, inicia sesión.')
      } else {
        const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/auth/recovery` }); if (error) throw error
        setMessage('Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña.')
      }
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  function switchMode(next: typeof mode) { setMode(next); setError(''); setMessage(''); setPassword('') }
  return <main className="auth-page" id="main">
    <section className="auth-story">
      <Brand light />
      <div className="story-content"><span className="eyebrow"><span className="tiny-dot" /> HECHO PARA TU NEGOCIO</span>
        <h1>Tu talento crea.<br />ARPE <em>organiza.</em></h1>
        <p>Un espacio para cuidar cada detalle de tu negocio y darle más tiempo a lo que amas hacer.</p>
        <div className="story-art" aria-hidden="true"><div className="art-orbit" /><div className="art-card"><span className="art-leaf"><Leaf size={36} /></span><span className="art-line" /><span className="art-line short" /><div className="art-check"><Check size={18} /> Todo comienza con una idea</div></div><span className="art-spark"><Sparkles size={28} /></span></div>
        <div className="story-bottom"><span>PASTELERÍAS</span><i /><span>REPOSTERÍAS</span><i /><span>PEQUEÑOS NEGOCIOS</span></div>
      </div>
    </section>
    <section className="auth-panel"><div className="mobile-brand"><Brand /></div>
      <div className="auth-form-wrap"><span className="eyebrow accent">BIENVENIDO A TU ESPACIO</span><h2>{title}</h2>
        <p className="muted">{recovery ? 'Elige una contraseña segura de al menos 8 caracteres.' : mode === 'signup' ? 'Crea tu cuenta y dale un hogar a tu negocio.' : mode === 'reset' ? 'Te enviaremos un enlace a tu correo electrónico.' : 'Inicia sesión y sigamos haciendo crecer tu negocio.'}</p>
        {!recovery && mode !== 'reset' && <div className="auth-tabs" role="group" aria-label="Acceso"><button type="button" aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>Iniciar sesión</button><button type="button" aria-pressed={mode === 'signup'} onClick={() => switchMode('signup')}>Crear cuenta</button></div>}
        <form onSubmit={submit}>
          {!recovery && <label>Correo electrónico<input type="email" autoComplete="email" required maxLength={254} placeholder="tu@negocio.com" value={email} onChange={e => setEmail(e.target.value)} /></label>}
          {(recovery || mode !== 'reset') && <label>Contraseña<span className="password-input"><input aria-label="Contraseña" type={show ? 'text' : 'password'} required minLength={mode === 'signup' || recovery ? 8 : 1} autoComplete={recovery || mode === 'signup' ? 'new-password' : 'current-password'} placeholder="Tu contraseña" value={password} onChange={e => setPassword(e.target.value)} /><button type="button" className="icon-button" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShow(!show)}>{show ? <EyeOff size={19} /> : <Eye size={19} />}</button></span></label>}
          {mode === 'login' && !recovery && <button type="button" className="text-button forgot" onClick={() => switchMode('reset')}>¿Olvidaste tu contraseña?</button>}
          {error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}
          <button className="primary full" disabled={busy}>{busy ? 'Un momento…' : recovery ? 'Guardar contraseña' : mode === 'signup' ? 'Crear mi cuenta' : mode === 'reset' ? 'Enviar enlace' : 'Entrar a mi negocio'}<ArrowRight size={18} /></button>
          {mode === 'reset' && <button className="text-button full" type="button" onClick={() => switchMode('login')}>Volver a iniciar sesión</button>}
        </form>
        <div className="secure-note"><LockKeyhole size={15} /> Tu espacio privado. Tus ideas protegidas.</div>
      </div><Credit />
    </section>
  </main>
}
