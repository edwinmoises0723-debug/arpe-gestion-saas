import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ArrowLeft, LogOut, Settings, ShieldCheck } from 'lucide-react'
import { AuthProvider } from './auth/AuthProvider'
import { useAuth } from './auth/useAuth'
import { client, errorMessage, supabase } from './lib/supabase'
import { loadBusiness } from './lib/business'
import type { Business } from './lib/database.types'
import { sections } from './lib/navigation'
import { Brand, Credit } from './components/Brand'
import { Loading, Notice } from './components/Feedback'
import { BusinessLogo } from './components/BusinessLogo'
import { PwaStatus } from './components/PwaStatus'

const AuthPage = lazy(() => import('./pages/AuthPage').then(m => ({ default: m.AuthPage })))
const BusinessForm = lazy(() => import('./pages/BusinessForm').then(m => ({ default: m.BusinessForm })))
const Dashboard = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })))
const Upcoming = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Upcoming })))
const QuotesPage = lazy(() => import('./pages/QuotesPage').then(m => ({ default: m.QuotesPage })))

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="center-page"><Brand /><h1>No pudimos abrir este espacio</h1><p>Recarga la aplicación para volver a intentarlo.</p><button className="primary" onClick={() => location.reload()}>Recargar</button><Credit /></div> : this.props.children }
}

function Logout() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  return <div className="logout"><button disabled={busy} className="text-button" onClick={async () => {
    setBusy(true); setError('')
    try { const { error } = await client().auth.signOut(); if (error) throw error } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }}><LogOut size={17} />{busy ? 'Cerrando…' : 'Cerrar sesión'}</button>{error && <Notice error>{error}</Notice>}</div>
}

function Workspace({ ownerId }: { ownerId: string }) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  useEffect(() => {
    let active = true
    loadBusiness(ownerId).then(value => { if (active) setBusiness(value) }).catch((e: unknown) => { if (active) setError(errorMessage(e)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [ownerId, retry])
  if (loading) return <Loading />
  if (error) return <div className="center-page"><Brand /><h1>No pudimos cargar tu negocio</h1><Notice error>{error}</Notice><button className="primary" onClick={() => { setLoading(true); setError(''); setRetry(v => v + 1) }}>Reintentar</button><Logout /><Credit /></div>
  if (!business) return <div className="onboarding"><header><Brand /><Logout /></header><main><div className="onboarding-intro"><span className="eyebrow accent">VAMOS A DAR EL PRIMER PASO</span><h1>Tu negocio merece<br />su propio espacio<span className="heading-dot">.</span></h1><p className="muted">Comienza con el nombre y la moneda. Los demás detalles pueden esperar.</p><span className="onboarding-step"><span>1</span> Crea tu negocio <ArrowLeft size={14} className="step-arrow" /> <span className="step-pending">2</span> Empieza a explorar</span></div><BusinessForm business={null} ownerId={ownerId} onSaved={setBusiness} /><p className="secure-note"><ShieldCheck size={16} /> Solo tú puedes acceder a los datos de este negocio.</p></main><Credit /></div>
  return <div className="app-shell"><header className="app-header"><Link to="/" aria-label="ARPE Inicio"><Brand /></Link><div className="header-right"><div className="header-business"><BusinessLogo path={business.logo_path} name={business.name} /><span><strong>{business.name}</strong><small>Mi negocio</small></span></div><NavLink to="/configuracion" className="settings-button" aria-label="Configuración"><Settings size={21} /></NavLink></div></header>
    <main className="main-content" id="main"><Routes><Route path="/" element={<Dashboard business={business} />} /><Route path="/cotizar" element={<QuotesPage business={business} />} />{sections.slice(2).map(s => <Route key={s.path} path={s.path} element={<Upcoming name={s.label}/>} />)}<Route path="/configuracion" element={<><div className="page-heading"><div><Link className="text-link back-link" to="/"><ArrowLeft size={16}/> Volver a Inicio</Link><h1>Configuración</h1><p className="muted">Tu negocio cambia contigo. Mantén sus datos al día.</p></div></div><BusinessForm business={business} ownerId={ownerId} onSaved={setBusiness} /><section className="panel account-panel"><div><h2>Tu cuenta</h2><p className="muted">Cierra tu sesión al terminar en un dispositivo compartido.</p></div><Logout /></section></>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></main><Credit />
    <nav className="bottom-nav" aria-label="Navegación principal">{sections.map(({ path, label, icon: Icon }) => <NavLink to={path} end={path === '/'} key={path}><span><Icon size={21}/></span>{label}</NavLink>)}</nav>
  </div>
}

function SessionGate() {
  const { session, loading, error, recovering } = useAuth()
  if (loading) return <Loading />
  if (error) return <div className="center-page"><Notice error>{error}</Notice><button className="primary" onClick={() => location.reload()}>Reintentar</button></div>
  if (!session) return <AuthPage />
  if (recovering) return <AuthPage recovery />
  return <Workspace key={session.user.id} ownerId={session.user.id} />
}

export default function App() {
  return <ErrorBoundary><a className="skip-link" href="#main">Saltar al contenido</a><BrowserRouter><Suspense fallback={<Loading />}>{supabase ? <AuthProvider><SessionGate /></AuthProvider> : <div className="center-page"><Brand /><h1>Conectemos tu espacio</h1><p>Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local y reinicia la aplicación.</p><p>Encontrarás los pasos en el README del proyecto.</p><Credit /></div>}</Suspense><PwaStatus /></BrowserRouter></ErrorBoundary>
}
