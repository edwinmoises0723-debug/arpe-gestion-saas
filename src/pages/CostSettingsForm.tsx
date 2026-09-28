import { useEffect, useState, type FormEvent } from 'react'
import { Check, CircleDollarSign, Save } from 'lucide-react'
import type { Business } from '../lib/database.types'
import { defaultCostSettings, getCostSettings, saveCostSettings } from '../lib/costs'
import { errorMessage } from '../lib/supabase'
import { Notice } from '../components/Feedback'

export function CostSettingsForm({ business }: { business: Business }) {
  const [values, setValues] = useState(defaultCostSettings)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    let active = true
    void getCostSettings(business.id).then(settings => { if (active) setValues({ waste_percent: Number(settings.waste_percent), indirect_percent: Number(settings.indirect_percent), labor_hourly_rate: Number(settings.labor_hourly_rate), markup_percent: Number(settings.markup_percent) }) }).catch(e => { if (active) setError(errorMessage(e)) }).finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [business.id])
  function field(key: keyof typeof values, value: string) { setValues(current => ({ ...current, [key]: Number(value) || 0 })); setSaved(false) }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setSaved(false)
    try {
      if (values.waste_percent > 100) throw new Error('La merma no puede superar el 100%.')
      await saveCostSettings(business.id, values)
      setSaved(true)
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return <form className="cost-settings-form" onSubmit={submit}><section className="panel form-section"><div className="section-title"><span className="section-icon"><CircleDollarSign size={20} /></span><div><h2>Configuración de costos</h2><p>Deja listas tus referencias para calcular precios con menos esfuerzo.</p></div></div><fieldset disabled={busy}><div className="form-grid"><label>Merma predeterminada (%)<input type="number" min="0" max="100" step="0.01" value={values.waste_percent} onChange={e => field('waste_percent', e.target.value)} /><small className="field-hint">Cubre pequeños desperdicios, sobrantes o pérdidas durante la preparación.</small></label><label>Gastos indirectos (%)<input type="number" min="0" step="0.01" value={values.indirect_percent} onChange={e => field('indirect_percent', e.target.value)} /><small className="field-hint">Ayuda a cubrir agua, electricidad, gas, limpieza y desgaste de equipos.</small></label><label>Costo por hora de trabajo<input type="number" min="0" step="0.01" value={values.labor_hourly_rate} onChange={e => field('labor_hourly_rate', e.target.value)} /><small className="field-hint">Cuánto deseas reconocer por cada hora de trabajo.</small></label><label>Ganancia sobre costo (%)<input type="number" min="0" step="0.01" value={values.markup_percent} onChange={e => field('markup_percent', e.target.value)} /><small className="field-hint">Porcentaje que agregas al costo de producción para obtener tu precio sugerido.</small></label></div></fieldset></section><div className="form-actions">{error && <Notice error>{error}</Notice>}{saved && <Notice><Check size={17} /> La configuración de costos se guardó.</Notice>}<button className="primary" disabled={busy}>{busy ? 'Cargando…' : 'Guardar configuración'}<Save size={18} /></button></div></form>
}
