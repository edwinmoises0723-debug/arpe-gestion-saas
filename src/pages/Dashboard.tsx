import { ArrowRight, Check, Settings } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Business } from '../lib/database.types'
import { currencies } from '../lib/business'

import { sections } from '../lib/navigation'

export function Dashboard({ business }: { business: Business }) {
  const currency = currencies.find(c => c.code === business.currency)!
  const completed = [business.name, business.logo_path, business.slogan, business.description, business.whatsapp, business.email, business.address].filter(Boolean).length
  return <>
    <div className="page-heading"><div><span className="eyebrow accent">TU ESPACIO DE TRABAJO</span><h1>Todo empieza con un buen día<span className="heading-dot">.</span></h1><p className="muted">Bienvenido a {business.name}. Hagamos espacio para crecer.</p></div><span className="date-label">{new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date())}</span></div>
    <section className="welcome-banner"><div><span className="pill"><span className="tiny-dot" /> TU NEGOCIO ESTÁ LISTO</span><h2>Pequeños pasos.<br /><em>Grandes posibilidades.</em></h2><p>La base de tu negocio ya tiene su lugar. Completa tu perfil y prepárate para lo que viene.</p><Link to="/configuracion" className="light-button">Personalizar mi negocio <ArrowRight size={17} /></Link></div><div className="banner-art" aria-hidden="true"><div className="shop-roof"/><div className="shop-body"><span>A</span><div className="shop-window"/><div className="shop-door"/></div><span className="shop-check"><Check size={25}/></span></div></section>
    <div className="dashboard-columns"><section className="panel profile-panel"><div className="panel-heading"><h2>Tu negocio, a tu manera</h2><Settings size={19} /></div><p className="muted">Cada detalle cuenta. Dale forma a tu identidad.</p><div className="progress-label"><strong>Perfil del negocio</strong><span>{completed} de 7 datos</span></div><progress max={7} value={completed} aria-label="Datos del perfil completados" /><ul className="profile-checklist"><li><Check size={16} /> Nombre y moneda definidos</li><li><Check size={16} /> Espacio privado activado</li><li className={!business.logo_path ? 'pending' : ''}>{business.logo_path ? <Check size={16} /> : <span className="empty-dot" />} {business.logo_path ? 'Logo personalizado' : 'Agrega el logo de tu negocio'}</li></ul><Link className="text-link" to="/configuracion">Revisar mi perfil <ArrowRight size={16} /></Link></section>
      <section className="panel details-panel"><span className="eyebrow accent">LOS DETALLES QUE TE DEFINEN</span><h2>{business.name}</h2><p className="business-slogan">{business.slogan || 'Tu historia comienza aquí.'}</p><div className="detail-row"><span>Moneda principal</span><strong>{currency.code} <span className="currency-symbol">{currency.symbol}</span></strong></div><div className="detail-row"><span>Estado del espacio</span><span className="status-active"><span className="tiny-dot" /> Activo</span></div><Link className="text-link" to="/configuracion">Configuración del negocio <ArrowRight size={16} /></Link></section></div>
    <section className="modules-section"><div className="panel-heading"><h2>Un lugar para cada parte de tu negocio</h2><span className="subtle-badge">PRÓXIMAMENTE</span></div><div className="module-grid">{sections.slice(1).map(({ path, label, icon: Icon }, i) => <Link to={path} className="module-card" key={path}><span className="module-icon"><Icon size={23} /></span><h3>{label}</h3><p>{['Ideas que se convierten en propuestas.', 'Cada encargo, en su lugar.', 'Claridad en cada movimiento.', 'Tiempo para lo que importa.'][i]}</p><ArrowRight className="module-arrow" size={17}/></Link>)}</div></section>
  </>
}

export function Upcoming({ name }: { name: string }) {
  const section = sections.find(s => s.label === name)!
  const Icon = section.icon
  return <><div className="page-heading"><div><span className="eyebrow accent">TU ESPACIO DE TRABAJO</span><h1>{name}</h1></div></div><section className="panel upcoming"><span className="upcoming-icon"><Icon size={36} /></span><span className="subtle-badge">PRÓXIMA FASE</span><h2>Estamos preparando este espacio</h2><p>El módulo de {name.toLowerCase()} llegará en una próxima etapa. Por ahora, puedes crear y personalizar tu negocio.</p><Link to="/" className="primary">Volver a Inicio <ArrowRight size={17}/></Link></section></>
}
