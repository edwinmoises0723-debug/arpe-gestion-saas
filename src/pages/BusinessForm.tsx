import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, Check, ImagePlus, Save, Store } from 'lucide-react'
import type { Business, BusinessInput, Currency } from '../lib/database.types'
import { currencies, emptyBusiness, saveBusiness, validateLogo } from '../lib/business'
import { errorMessage } from '../lib/supabase'
import { BusinessLogo } from '../components/BusinessLogo'
import { Notice } from '../components/Feedback'

export function BusinessForm({ business, ownerId, onSaved }: { business: Business | null; ownerId: string; onSaved: (value: Business) => void }) {
  const [values, setValues] = useState<BusinessInput>(() => business ? { name: business.name, slogan: business.slogan, description: business.description, whatsapp: business.whatsapp, email: business.email, address: business.address, currency: business.currency } : { ...emptyBusiness })
  const [logo, setLogo] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [removeLogo, setRemoveLogo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  function field(key: keyof BusinessInput, value: string) { setValues(v => ({ ...v, [key]: value })); setSaved(false) }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false)
    try {
      if (!values.name.trim()) throw new Error('Escribe el nombre de tu negocio.')
      const result = await saveBusiness(ownerId, values, business, logo, removeLogo)
      onSaved(result); setLogo(null); setPreview(''); setRemoveLogo(false); setSaved(true)
      if (fileInput.current) fileInput.current.value = ''
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return <form className="business-form" onSubmit={submit}>
    <fieldset disabled={busy}>
      <section className="panel form-section"><div className="section-title"><span className="section-icon"><Store size={20} /></span><div><h2>Perfil del negocio</h2><p>Comparte el nombre y la personalidad de tu negocio.</p></div></div>
        <div className="logo-upload">{logo && preview ? <span className="business-logo"><img src={preview} alt="Vista previa del nuevo logo" /></span> : <BusinessLogo path={removeLogo ? null : business?.logo_path ?? null} name={values.name || 'tu negocio'} />}
          <div><label className="upload-button"><ImagePlus size={16} /> {logo || business?.logo_path && !removeLogo ? 'Cambiar logo' : 'Subir logo'}<input ref={fileInput} type="file" aria-label="Logo del negocio" accept="image/png,image/jpeg,image/webp" onChange={e => {
            const file = e.target.files?.[0]; if (!file) return
            try { validateLogo(file); setLogo(file); setPreview(URL.createObjectURL(file)); setRemoveLogo(false); setError(''); setSaved(false) } catch (err) { setError(errorMessage(err)); e.target.value = '' }
          }} /></label><small>PNG, JPG o WebP · Máximo 5 MB</small>
          {(logo || business?.logo_path && !removeLogo) && <button type="button" className="text-button" onClick={() => { setLogo(null); setPreview(''); setRemoveLogo(true); setSaved(false); if (fileInput.current) fileInput.current.value = '' }}>Quitar logo</button>}</div>
        </div>
        <label>Nombre del negocio <span className="required">*</span><input required maxLength={100} autoComplete="organization" placeholder="Ej. Dulce Encanto" value={values.name} onChange={e => field('name', e.target.value)} /></label>
        <label>Eslogan <span className="optional">Opcional</span><input maxLength={160} placeholder="Una frase que hable de ti" value={values.slogan} onChange={e => field('slogan', e.target.value)} /></label>
        <label>Descripción <span className="optional">Opcional</span><textarea maxLength={1000} rows={3} placeholder="Cuéntanos qué hace especial a tu negocio…" value={values.description} onChange={e => field('description', e.target.value)} /></label>
      </section>
      <section className="panel form-section"><div className="section-title"><span className="section-icon"><span aria-hidden="true">@</span></span><div><h2>Contacto y moneda</h2><p>Los datos de contacto y la moneda principal del negocio.</p></div></div>
        <div className="form-grid"><label>WhatsApp <span className="optional">Opcional</span><input type="tel" autoComplete="tel" maxLength={30} placeholder="+505 8888 8888" value={values.whatsapp} onChange={e => field('whatsapp', e.target.value)} /></label>
          <label>Correo del negocio <span className="optional">Opcional</span><input type="email" autoComplete="email" maxLength={254} placeholder="hola@tunegocio.com" value={values.email} onChange={e => field('email', e.target.value)} /></label></div>
        <label>Dirección <span className="optional">Opcional</span><textarea autoComplete="street-address" maxLength={500} rows={2} placeholder="Ciudad, barrio y dirección" value={values.address} onChange={e => field('address', e.target.value)} /></label>
        <label>Moneda principal <span className="required">*</span><select value={values.currency} onChange={e => field('currency', e.target.value as Currency)}>{currencies.map(c => <option value={c.code} key={c.code}>{c.code} / {c.symbol} — {c.name}</option>)}</select></label>
        <p className="field-hint">Cambiar la moneda modifica cómo se muestran los nuevos datos y documentos. No convierte automáticamente importes históricos.</p>
        <p className="field-hint">Podrás modificar todos estos datos cuando lo necesites.</p>
      </section>
    </fieldset>
    <div className="form-actions">{error && <Notice error>{error}</Notice>}{saved && <Notice><Check size={17} /> Los datos de tu negocio se guardaron correctamente.</Notice>}
      <button className="primary" disabled={busy}>{busy ? 'Guardando…' : business ? 'Guardar cambios' : 'Crear mi negocio'}{business ? <Save size={18} /> : <ArrowRight size={18} />}</button></div>
  </form>
}
