import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Image, Package, Plus, Search, Upload, X } from 'lucide-react'
import type { Business, CatalogProduct, CatalogProductInput, PublicCatalogPriceMode } from '../lib/database.types'
import { catalogImageUrl, isValidCatalogSlug, savePublicCatalogSettings, slugifyCatalogName, validateCatalogImage, type PublicCatalogSettingsInput } from '../lib/catalog'
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
    <PublicCatalogSettings business={business} onSaved={setNotice} onError={setError} />
    <section className="panel catalog-filters"><label>Buscar por nombre o categoría<span className="catalog-search"><Search size={18} /><input type="search" value={search} onChange={e => setSearch(e.target.value)} /></span></label><div className="form-grid"><label>Categoría<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Todas</option>{[...new Set(products.map(p => p.category))].sort().map(c => <option key={c}>{c}</option>)}</select></label><label>Estado<select value={status} onChange={e => setStatus(e.target.value)}><option value="active">Activos</option><option value="inactive">Inactivos</option><option value="all">Todos</option></select></label></div></section>
    {loading ? <Loading text="Cargando tu catálogo…" /> : <section className="catalog-grid">{visible.map(p => <article className="panel catalog-card" key={p.id}><ProductImage path={p.image_path} name={p.name} /><div className="catalog-card-copy"><span className="eyebrow accent">{p.category}</span><h2>{p.name}</h2><p>{formatCurrency(p.default_unit_price, business)} / {p.unit_label}</p>{p.default_portions !== null && <p>{p.default_portions} porciones</p>}<div className="catalog-statuses"><span className="subtle-badge">{p.is_active ? 'Activo' : 'Inactivo'}</span><span className="subtle-badge">{p.is_public ? 'Público' : 'Privado'}</span></div></div><div className="catalog-actions"><button className="secondary-button" onClick={() => setEditing(p)}>Editar</button><button className="text-button" disabled={busy} onClick={() => void toggle(p)}>{p.is_active ? 'Desactivar' : 'Activar'}</button></div></article>)}{!visible.length && <div className="panel"><h2>{products.length ? 'No hay productos con estos filtros' : 'Tu catálogo comienza aquí'}</h2><p>Agrega tus productos habituales. También puedes cotizar productos personalizados sin registrarlos aquí.</p></div>}</section>}
  </div>
}

function ProductImage({ path, name }: { path: string | null; name: string }) {
  const url = catalogImageUrl(path)
  return <div className="catalog-product-image">{url ? <img src={url} alt={`Imagen de ${name}`} /> : <div aria-label={`Sin imagen para ${name}`}><Image size={28} /></div>}</div>
}

function PublicCatalogSettings({ business, onSaved, onError }: { business: Business; onSaved: (message: string) => void; onError: (message: string) => void }) {
  const [values, setValues] = useState<PublicCatalogSettingsInput>(() => ({ catalog_slug: business.catalog_slug ?? slugifyCatalogName(business.name), public_catalog_enabled: business.public_catalog_enabled, public_catalog_show_whatsapp: business.public_catalog_show_whatsapp, public_catalog_logo_path: business.public_catalog_logo_path }))
  const [file, setFile] = useState<File | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : catalogImageUrl(removeLogo ? null : values.public_catalog_logo_path), [file, removeLogo, values.public_catalog_logo_path])
  useEffect(() => () => { if (file && previewUrl) URL.revokeObjectURL(previewUrl) }, [file, previewUrl])
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setLocalError(''); onError('')
    try { const saved = await savePublicCatalogSettings(business, values, file, removeLogo); setValues({ catalog_slug: saved.catalog_slug, public_catalog_enabled: saved.public_catalog_enabled, public_catalog_show_whatsapp: saved.public_catalog_show_whatsapp, public_catalog_logo_path: saved.public_catalog_logo_path }); setFile(null); setRemoveLogo(false); onSaved('Configuración del catálogo público guardada.') }
    catch (reason) { setLocalError(errorMessage(reason)) } finally { setBusy(false) }
  }
  const validSlug = isValidCatalogSlug(values.catalog_slug ?? '')
  return <section className="panel public-catalog-settings"><div><span className="eyebrow accent">VISIBILIDAD COMERCIAL</span><h2>Catálogo público</h2><p className="muted">Prepara un enlace para mostrar tus productos cuando habilitemos el escaparate público.</p></div>
    <form onSubmit={submit}><fieldset className="bundle-fieldset" disabled={busy}>
      <label className="catalog-check"><input type="checkbox" checked={values.public_catalog_enabled} onChange={e => setValues({ ...values, public_catalog_enabled: e.target.checked })} /> Activar catálogo público</label>
      <label>Enlace del catálogo<input required minLength={3} maxLength={80} autoCapitalize="none" value={values.catalog_slug ?? ''} onChange={e => setValues({ ...values, catalog_slug: e.target.value })} /><small>Vista previa: /catalogo/{values.catalog_slug || 'tu-negocio'}</small>{values.catalog_slug && !validSlug && <small className="catalog-field-error">Usa letras minúsculas, números y guiones.</small>}</label>
      <label className="catalog-check"><input type="checkbox" checked={values.public_catalog_show_whatsapp} onChange={e => setValues({ ...values, public_catalog_show_whatsapp: e.target.checked })} /> Permitir mostrar mi WhatsApp</label>
      {values.public_catalog_show_whatsapp && !business.whatsapp && <p className="catalog-warning">Agrega un número de WhatsApp en la configuración del negocio para poder mostrarlo.</p>}
      <div className="catalog-public-logo"><strong>Logo público (opcional)</strong>{previewUrl && <img src={previewUrl} alt="Vista previa del logo público" />}<div className="catalog-actions"><label className="secondary-button catalog-file-button"><Upload size={16} />{values.public_catalog_logo_path || file ? 'Cambiar logo' : 'Seleccionar logo'}<input aria-label="Seleccionar logo público" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const chosen = e.target.files?.[0] ?? null; if (chosen) { try { validateCatalogImage(chosen); setFile(chosen); setRemoveLogo(false); setLocalError('') } catch (reason) { setLocalError(errorMessage(reason)) } } }} /></label>{(values.public_catalog_logo_path || file) && <button className="text-button" type="button" onClick={() => { setFile(null); setRemoveLogo(true); setValues({ ...values, public_catalog_logo_path: null }) }}><X size={16} /> Quitar logo</button>}</div><small>Las imágenes del catálogo son contenido comercial público. Una URL conocida puede seguir accesible mientras exista el archivo.</small></div>
    </fieldset>{localError && <Notice error>{localError}</Notice>}<div className="form-actions"><button className="primary" disabled={busy || (values.public_catalog_enabled && !validSlug)}>{busy ? 'Guardando…' : 'Guardar catálogo público'}</button></div></form>
  </section>
}

function CatalogForm({ business, product, onSaved, onCancel }: { business: Business; product: CatalogProduct | null; onSaved: (p: CatalogProduct) => void; onCancel: () => void }) {
  const [values, setValues] = useState<CatalogProductInput>(() => product ?? { business_id: business.id, name: '', category: 'Otros', description: '', unit_label: 'unidad', default_unit_price: 0, default_portions: null, default_flavor: '', default_filling: '', default_decoration: '', default_extras: '', is_active: true, image_path: null, is_public: false, public_price_mode: 'exact', public_sort_order: 0 })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const previewUrl = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : catalogImageUrl(removeImage ? null : values.image_path), [imageFile, removeImage, values.image_path])
  useEffect(() => () => { if (imageFile && previewUrl) URL.revokeObjectURL(previewUrl) }, [imageFile, previewUrl])
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { onSaved(await saveCatalog(product?.id ?? null, values, { ownerId: business.owner_id, imageFile, removeImage, previousImagePath: product?.image_path ?? null })) } catch (reason) { setError(errorMessage(reason)) } finally { setBusy(false) } }
  function chooseImage(file: File | undefined) { if (!file) return; try { validateCatalogImage(file); setImageFile(file); setRemoveImage(false); setError('') } catch (reason) { setError(errorMessage(reason)) } }
  return <div className="quote-editor"><button className="back-button" disabled={busy} onClick={onCancel}>← Catálogo</button><h1>{product ? 'Editar producto' : 'Crear producto'}</h1><p className="muted">Estos valores se usarán como punto de partida. No cambian propuestas anteriores.</p><form className="panel quote-form" onSubmit={submit}><fieldset className="bundle-fieldset" disabled={busy}>
    <section className="catalog-image-editor"><strong>Imagen del producto</strong><div className="catalog-image-preview">{previewUrl ? <img src={previewUrl} alt="Vista previa del producto" /> : <div><Package size={32} /><span>Sin imagen</span></div>}</div><div className="catalog-actions"><label className="secondary-button catalog-file-button"><Upload size={16} />{values.image_path || imageFile ? 'Cambiar imagen' : 'Seleccionar imagen'}<input aria-label="Seleccionar imagen del producto" type="file" accept="image/png,image/jpeg,image/webp" onChange={e => chooseImage(e.target.files?.[0])} /></label>{(values.image_path || imageFile) && <button className="text-button" type="button" onClick={() => { setImageFile(null); setRemoveImage(true); setValues({ ...values, image_path: null }) }}><X size={16} /> Quitar imagen</button>}</div><small>PNG, JPG o WebP. Máximo 5 MB. La foto puede ser pública si se conoce su enlace.</small></section>
    <label>Nombre<input required maxLength={160} value={values.name} onChange={e => setValues({ ...values, name: e.target.value })} /></label><div className="form-grid"><label>Categoría<input required maxLength={80} value={values.category} onChange={e => setValues({ ...values, category: e.target.value })} /></label><label>Unidad<input required maxLength={40} value={values.unit_label} onChange={e => setValues({ ...values, unit_label: e.target.value })} /></label><label>Precio habitual<input required type="number" min="0" step="0.01" value={values.default_unit_price} onChange={e => setValues({ ...values, default_unit_price: Number(e.target.value) })} /></label><label>Porciones <small>Opcional</small><input type="number" min="1" step="1" value={values.default_portions ?? ''} onChange={e => setValues({ ...values, default_portions: e.target.value ? Number(e.target.value) : null })} /></label></div>
    <label>Descripción<textarea maxLength={1000} value={values.description} onChange={e => setValues({ ...values, description: e.target.value })} /></label><div className="form-grid">{(['default_flavor', 'default_filling', 'default_decoration', 'default_extras'] as const).map((field, n) => <label key={field}>{['Sabor', 'Relleno', 'Decoración', 'Extras'][n]}<input maxLength={n < 2 ? 120 : 500} value={values[field]} onChange={e => setValues({ ...values, [field]: e.target.value })} /></label>)}</div>
    <div className="catalog-publishing"><h2>Visibilidad y precio público</h2><label className="catalog-check"><input type="checkbox" checked={values.is_active} onChange={e => setValues({ ...values, is_active: e.target.checked })} /> Disponible para operaciones internas</label><label className="catalog-check"><input type="checkbox" checked={values.is_public} onChange={e => setValues({ ...values, is_public: e.target.checked })} /> Mostrar en catálogo público</label><div className="form-grid"><label>Cómo mostrar el precio<select value={values.public_price_mode} onChange={e => setValues({ ...values, public_price_mode: e.target.value as PublicCatalogPriceMode })}><option value="exact">Precio exacto</option><option value="from">Desde este precio</option><option value="contact">Consultar precio</option></select></label><label>Orden en catálogo público<input type="number" min="0" step="1" value={values.public_sort_order} onChange={e => setValues({ ...values, public_sort_order: Number(e.target.value) })} /></label></div><small>Un producto solo aparecerá cuando esté activo, marcado como público y el catálogo del negocio esté habilitado.</small></div>
    </fieldset>{error && <Notice error>{error}</Notice>}<div className="form-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Cancelar</button><button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar producto'}</button></div></form></div>
}
