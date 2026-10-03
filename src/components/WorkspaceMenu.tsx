import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BarChart3, Menu, Settings, ShoppingBag, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { Business } from '../lib/database.types'
import { BusinessLogo } from './BusinessLogo'

export function WorkspaceMenu({ business, logout }: { business: Business; logout: ReactNode }) {
  const [open, setOpen] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!open) return
    const current = dialog.current
    const previousFocus = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    current?.showModal()
    document.body.style.overflow = 'hidden'
    return () => { current?.close(); document.body.style.overflow = overflow; previousFocus?.focus() }
  }, [open])
  return <><button className="settings-button" aria-label="Abrir menú" aria-expanded={open} aria-controls="workspace-menu" onClick={() => setOpen(true)}><Menu size={22} /></button>
    <dialog id="workspace-menu" ref={dialog} className="workspace-menu" aria-label="Menú del negocio" onCancel={() => setOpen(false)} onClick={e => { if (e.target === dialog.current) { const bounds = dialog.current.getBoundingClientRect(); if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) setOpen(false) } }}>
      <div className="menu-heading"><BusinessLogo path={business.logo_path} name={business.name} /><strong>{business.name}</strong><button className="icon-button" aria-label="Cerrar menú" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <nav aria-label="Módulos complementarios"><NavLink to="/catalogo" onClick={() => setOpen(false)}><ShoppingBag size={20} /> Catálogo</NavLink><NavLink to="/reportes" onClick={() => setOpen(false)}><BarChart3 size={20} /> Reportes</NavLink><NavLink to="/configuracion" onClick={() => setOpen(false)}><Settings size={20} /> Configuración</NavLink></nav>{logout}
    </dialog></>
}
