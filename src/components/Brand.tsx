import { Sprout } from 'lucide-react'
export function Brand({ light = false }: { light?: boolean }) {
  return <div className={`brand ${light ? 'brand-light' : ''}`}><span className="brand-icon"><Sprout aria-hidden="true" size={26} /></span><span><strong>ARPE<span className="brand-dot">.</span></strong><small>GESTIÓN SAAS</small></span></div>
}
export function Credit() { return <footer className="credit">Sistema diseñado por Ing. Edwin Nicaragua</footer> }
