import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BarChart3, Inbox, Menu, Settings, ShoppingBag, X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import type { Business } from '../lib/database.types'
import { CATALOG_REQUESTS_CHANGED_EVENT, countNewCatalogRequests } from '../lib/catalog-requests'
import { BusinessLogo } from './BusinessLogo'

export function WorkspaceMenu({ business, logout }: { business: Business; logout: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [newRequests, setNewRequests] = useState(0)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    let active = true
    const refreshCount = async () => {
      try { const count = await countNewCatalogRequests(business.id); if (active) setNewRequests(count) }
      catch { if (active) setNewRequests(0) }
    }
    const onRequestsChanged = () => { void refreshCount() }
    void refreshCount()
    window.addEventListener(CATALOG_REQUESTS_CHANGED_EVENT, onRequestsChanged)
    return () => { active = false; window.removeEventListener(CATALOG_REQUESTS_CHANGED_EVENT, onRequestsChanged) }
  }, [business.id])
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
      <div className="menu-heading"><BusinessLogo path={business.logo_path} name={business.name} /><div className="menu-business-copy"><strong>{business.name}</strong><small>Negocio activo</small></div><button className="icon-button" aria-label="Cerrar menú" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <nav aria-label="Módulos complementarios"><NavLink to="/solicitudes" onClick={() => setOpen(false)}><Inbox size={20} /> Solicitudes{newRequests > 0 && <span className="workspace-request-count" aria-label={`${newRequests} solicitudes nuevas`}>{newRequests > 99 ? '99+' : newRequests}</span>}</NavLink><NavLink to="/catalogo" onClick={() => setOpen(false)}><ShoppingBag size={20} /> Catálogo</NavLink><NavLink to="/reportes" onClick={() => setOpen(false)}><BarChart3 size={20} /> Reportes</NavLink><NavLink to="/configuracion" onClick={() => setOpen(false)}><Settings size={20} /> Configuración</NavLink></nav>{logout}
    </dialog></>
}
