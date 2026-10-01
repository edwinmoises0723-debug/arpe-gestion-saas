import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Search } from 'lucide-react'
import type { Business, CatalogProduct, CatalogProductInput } from '../lib/database.types'
import { filterCatalog, listCatalog, saveCatalog } from '../lib/products'
import { formatCurrency } from '../lib/quotes'
import { errorMessage } from '../lib/supabase'
import { Loading, Notice } from '../components/Feedback'

export function CatalogPage({ business }: { business: Business }) {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('active')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<CatalogProduct | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { let active = true; void listCatalog(business.id).then(data => { if (active) setProducts(data) }).catch(e => { if (active) setError(errorMessage(e)) }).finally(() => { if (active) setLoading(false) }); return () => { active = false } }, [business.id])
  function saved(product: CatalogProduct) { setProducts(current => [...current.filter(p => p.id !== product.id), product].sort((a, b) => a.name.localeCompare(b.name))); setEditing(null); setNotice('Producto guardado. Las cotizaciones y pedidos existentes conservan sus datos.') }
  async function toggle(product: CatalogProduct) {
    setBusy(true); setError('')
    try { saved(await saveCatalog(product.id, { ...product, is_active: !product.is_active })) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  if (editing) return <CatalogForm business={business} product={editing === 'new' ? null : editing} onSaved={saved} onCancel={() => setEditing(null)} />
  const visible = filterCatalog(products, search, category, status)
  return <div className="catalog-page"><div className="page-heading"><div><span className="eyebrow accent">TU COLECCIÓN DE PRODUCTOS</span><h1>Catálogo</h1><p className="muted">Guarda lo habitual y personaliza cada cotización con libertad.</p></div><button className="primary" onClick={() => setEditing('new')}><Plus size={18} /> Crear producto</button></div>
    {error && <Notice error>{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    <section className="panel catalog-filters"><label>Buscar por nombre o categoría<span className="catalog-search"><Search size={18} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} /></span></label><div className="form-grid"><label>Categoría<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas</option>{[...new Set(products.map(p => p.category))].sort().map(c => <option key={c}>{c}</option>)}</select></label><label>Estado<select value={status} onChange={e => setStatus(e.target.value)}><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></select></label></div></section>
    {loading ? <Loading text="Cargando tu catálogo…" /> : <section className="catalog-grid">{visible.map(p => <article className="panel catalog-card" key={p.id}><span className="eyebrow accent">{p.category}</span><h2>{p.name}</h2><p>{formatCurrency(p.default_unit_price, business)} / {p.unit_label}</p>{p.default_portions !== null && <p>{p.default_portions} porciones</p>}<span className="subtle-badge">{p.is_active ? 'Activo' : 'Inactivo'}</span><div className="catalog-actions"><button className="secondary-button" onClick={() => setEditing(p)}>Editar</button><button className="text-button" disabled={busy} onClick={() => void toggle(p)}>{p.is_active ? 'Desactivar' : 'Activar'}</button></div></article>)}{!visible.length && <div className="panel"><h2>{products.length ? 'No hay productos con estos filtros' : 'Tu catálogo comienza aquí'}</h2><p>Agrega tus productos habituales. También puedes cotizar productos personalizados sin registrarlos aquí.</p></div>}</section>}
  </div>
}

function CatalogForm({ business, product, onSaved, onCancel }: { business: Business; product: CatalogProduct | null; onSaved: (p: CatalogProduct) => void; onCancel: () => void }) {
  const [values, setValues] = useState<CatalogProductInput>(() => product ?? { business_id: business.id, name: '', category: 'Otros', description: '', unit_label: 'unidad', default_unit_price: 0, default_portions: null, default_flavor: '', default_filling: '', default_decoration: '', default_extras: '', is_active: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { onSaved(await saveCatalog(product?.id ?? null, values)) } catch (reason) { setError(errorMessage(reason)) } finally { setBusy(false) } }
  return <div className="quote-editor"><button className="back-button" disabled={busy} onClick={onCancel}>← Catálogo</button><h1>{product ? 'Editar producto' : 'Crear producto'}</h1><p className="muted">Estos valores se usarán como punto de partida. No cambian propuestas anteriores.</p><form className="panel quote-form" onSubmit={submit}><fieldset className="bundle-fieldset" disabled={busy}>
    <label>Nombre<input required maxLength={160} value={values.name} onChange={e => setValues({ ...values, name: e.target.value })} /></label><div className="form-grid"><label>Categoría<input required maxLength={80} value={values.category} onChange={e => setValues({ ...values, category: e.target.value })} /></label><label>Unidad<input required maxLength={40} value={values.unit_label} onChange={e => setValues({ ...values, unit_label: e.target.value })} /></label><label>Precio habitual<input required type="number" min="0" step="0.01" value={values.default_unit_price} onChange={e => setValues({ ...values, default_unit_price: Number(e.target.value) })} /></label><label>Porciones <small>Opcional</small><input type="number" min="1" step="1" value={values.default_portions ?? ''} onChange={e => setValues({ ...values, default_portions: e.target.value ? Number(e.target.value) : null })} /></label></div>
    <label>Descripción<textarea maxLength={1000} value={values.description} onChange={e => setValues({ ...values, description: e.target.value })} /></label><div className="form-grid">{(['default_flavor', 'default_filling', 'default_decoration', 'default_extras'] as const).map((field, n) => <label key={field}>{['Sabor', 'Relleno', 'Decoración', 'Extras'][n]}<input maxLength={n < 2 ? 120 : 500} value={values[field]} onChange={e => setValues({ ...values, [field]: e.target.value })} /></label>)}</div>
    </fieldset>{error && <Notice error>{error}</Notice>}<div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar producto'}</button></div></form></div>
}
