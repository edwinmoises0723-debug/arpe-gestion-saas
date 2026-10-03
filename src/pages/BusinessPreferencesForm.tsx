import { useState, type FormEvent } from 'react'
import { BadgePercent, Check, FileText, Save } from 'lucide-react'
import type { Business, BusinessPreferencesInput } from '../lib/database.types'
import { businessPreferencesPayload, saveBusinessPreferences, validateBusinessPreferences } from '../lib/business'
import { currencies } from '../lib/business'
import { errorMessage } from '../lib/supabase'
import { Notice } from '../components/Feedback'

type PreferencesDraft = Omit<BusinessPreferencesInput, 'default_deposit_value'> & { default_deposit_value: string }

function toDraft(business: Business): PreferencesDraft {
  return {
    default_deposit_type: business.default_deposit_type,
    default_deposit_value: String(business.default_deposit_value),
    default_document_format: business.default_document_format,
    show_slogan_on_documents: business.show_slogan_on_documents,
    show_description_on_documents: business.show_description_on_documents,
    show_whatsapp_on_documents: business.show_whatsapp_on_documents,
    show_email_on_documents: business.show_email_on_documents,
    show_address_on_documents: business.show_address_on_documents,
    document_footer_message: business.document_footer_message,
  }
}

function PreferenceSwitch({ checked, title, description, onChange }: { checked: boolean; title: string; description: string; onChange: (checked: boolean) => void }) {
  return <label className="business-preference-switch">
    <span><strong>{title}</strong><small>{description}</small></span>
    <input type="checkbox" role="switch" aria-checked={checked} checked={checked} onChange={event => onChange(event.target.checked)} />
  </label>
}

export function BusinessPreferencesForm({ business, ownerId, onSaved }: { business: Business; ownerId: string; onSaved: (value: Business) => void }) {
  const [values, setValues] = useState<PreferencesDraft>(() => toDraft(business))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const currency = currencies.find(option => option.code === business.currency)?.symbol ?? business.currency

  function update<K extends keyof PreferencesDraft>(key: K, value: PreferencesDraft[K]) {
    setValues(current => ({ ...current, [key]: value }))
    setSaved(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const payload: BusinessPreferencesInput = businessPreferencesPayload({ ...values, default_deposit_value: Number(values.default_deposit_value) })
      validateBusinessPreferences(payload)
      onSaved(await saveBusinessPreferences(ownerId, business.id, payload))
      setSaved(true)
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      setBusy(false)
    }
  }

  return <form className="business-preferences-form" onSubmit={submit}>
    <fieldset disabled={busy}>
      <section className="panel form-section">
        <div className="section-title"><span className="section-icon"><BadgePercent size={20} /></span><div><h2>Ventas y cotizaciones</h2><p>Define valores que ARPE utilizará como punto de partida al crear nuevas propuestas.</p></div></div>
        <div className="form-grid">
          <label>Tipo de anticipo predeterminado
            <select value={values.default_deposit_type} onChange={event => update('default_deposit_type', event.target.value as BusinessPreferencesInput['default_deposit_type'])}>
              <option value="percentage">Porcentaje</option><option value="fixed">Monto fijo</option>
            </select>
          </label>
          <label>Valor predeterminado del anticipo
            <span className="preference-deposit-input">
              {values.default_deposit_type === 'fixed' && <span aria-hidden="true">{currency}</span>}
              <input required type="number" min="0" max={values.default_deposit_type === 'percentage' ? 100 : 9999999999.99} step="0.01" value={values.default_deposit_value} onChange={event => update('default_deposit_value', event.target.value)} />
              {values.default_deposit_type === 'percentage' && <span aria-hidden="true">%</span>}
            </span>
          </label>
        </div>
        <p className="field-hint">Este valor solo se propone al crear una cotización. Puedes cambiarlo en cada propuesta y las cotizaciones guardadas no se modifican.</p>
      </section>

      <section className="panel form-section">
        <div className="section-title"><span className="section-icon"><FileText size={20} /></span><div><h2>Documentos para clientes</h2><p>Elige qué información comercial deseas mostrar en cotizaciones, confirmaciones y comprobantes.</p></div></div>
        <PreferenceSwitch checked={values.show_slogan_on_documents} title="Mostrar eslogan" description="Aparece bajo el nombre de tu negocio cuando está configurado." onChange={checked => update('show_slogan_on_documents', checked)} />
        <PreferenceSwitch checked={values.show_description_on_documents} title="Mostrar descripción" description="Incluye una breve presentación de tu negocio." onChange={checked => update('show_description_on_documents', checked)} />
        <PreferenceSwitch checked={values.show_whatsapp_on_documents} title="Mostrar WhatsApp" description="Facilita que tus clientes puedan contactarte." onChange={checked => update('show_whatsapp_on_documents', checked)} />
        <PreferenceSwitch checked={values.show_email_on_documents} title="Mostrar correo" description="Muestra el correo del negocio cuando está configurado." onChange={checked => update('show_email_on_documents', checked)} />
        <PreferenceSwitch checked={values.show_address_on_documents} title="Mostrar dirección" description="Incluye la dirección del negocio cuando está configurada." onChange={checked => update('show_address_on_documents', checked)} />
        <label>Formato de impresión predeterminado
          <select value={values.default_document_format} onChange={event => update('default_document_format', event.target.value as BusinessPreferencesInput['default_document_format'])}>
            <option value="a4">A4</option><option value="thermal80">Térmica 80 mm</option><option value="thermal58">Térmica 58 mm</option>
          </select>
        </label>
        <label>Mensaje de agradecimiento <span className="optional">Máximo 300 caracteres</span>
          <textarea maxLength={300} rows={3} value={values.document_footer_message} onChange={event => update('document_footer_message', event.target.value)} />
        </label>
        <p className="field-hint">Se mostrará al final de los documentos para clientes. El crédito de ARPE y el aviso legal de comprobantes siempre permanecen visibles.</p>
      </section>
    </fieldset>
    <div className="form-actions">
      {error && <Notice error>{error}</Notice>}
      {saved && <Notice><Check size={17} /> Las preferencias se guardaron correctamente.</Notice>}
      <button className="primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar preferencias'}<Save size={18} /></button>
    </div>
  </form>
}
