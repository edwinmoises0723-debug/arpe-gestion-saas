import { client } from './supabase'
import type { Business, BusinessInput, BusinessPreferencesInput, Currency } from './database.types'

export const currencies: { code: Currency; symbol: string; name: string }[] = [
  { code: 'NIO', symbol: 'C$', name: 'Córdoba nicaragüense' },
  { code: 'USD', symbol: '$', name: 'Dólar estadounidense' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'CRC', symbol: '₡', name: 'Colón costarricense' },
]
export const emptyBusiness: BusinessInput = { name: '', slogan: '', description: '', whatsapp: '', email: '', address: '', currency: 'NIO' }
export const LOGO_BUCKET = 'arpe-business-logos'
export const MAX_LOGO_SIZE = 5 * 1024 * 1024

export function validateLogo(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Selecciona una imagen PNG, JPG o WebP.')
  if (file.size > MAX_LOGO_SIZE) throw new Error('El logo debe pesar como máximo 5 MB.')
}

export function businessPreferencesPayload(input: BusinessPreferencesInput): BusinessPreferencesInput {
  return { ...input, document_footer_message: input.document_footer_message.trim() }
}

export function validateBusinessPreferences(input: BusinessPreferencesInput) {
  if (!['percentage', 'fixed'].includes(input.default_deposit_type)) throw new Error('Selecciona un tipo de anticipo válido.')
  if (!Number.isFinite(input.default_deposit_value) || input.default_deposit_value < 0) throw new Error('El anticipo predeterminado debe ser un número igual o mayor que cero.')
  if (input.default_deposit_type === 'percentage' && input.default_deposit_value > 100) throw new Error('El anticipo porcentual no puede superar el 100%.')
  if (!['a4', 'thermal80', 'thermal58'].includes(input.default_document_format)) throw new Error('Selecciona un formato de impresión válido.')
  if (typeof input.document_footer_message !== 'string' || Array.from(input.document_footer_message).length > 300) throw new Error('El mensaje de agradecimiento puede tener como máximo 300 caracteres.')
  if ([input.show_slogan_on_documents, input.show_description_on_documents, input.show_whatsapp_on_documents, input.show_email_on_documents, input.show_address_on_documents].some(value => typeof value !== 'boolean')) {
    throw new Error('Revisa las preferencias de información para clientes.')
  }
}

export async function saveBusinessPreferences(ownerId: string, businessId: string, input: BusinessPreferencesInput) {
  validateBusinessPreferences(input)
  const { data, error } = await client().from('arpe_businesses')
    .update(businessPreferencesPayload(input))
    .eq('id', businessId)
    .eq('owner_id', ownerId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function loadBusiness(ownerId: string) {
  const { data, error } = await client().from('arpe_businesses').select('*').eq('owner_id', ownerId).maybeSingle()
  if (error) throw error
  return data
}

export async function saveBusiness(ownerId: string, input: BusinessInput, existing: Business | null, logo: File | null, removeLogo: boolean) {
  const db = client()
  let logoPath = removeLogo ? null : existing?.logo_path ?? null
  let uploadedPath: string | null = null
  if (logo) {
    validateLogo(logo)
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[logo.type]
    uploadedPath = `${ownerId}/${crypto.randomUUID()}.${extension}`
    const { error } = await db.storage.from(LOGO_BUCKET).upload(uploadedPath, logo, { contentType: logo.type, upsert: false })
    if (error) throw error
    logoPath = uploadedPath
  }
  const payload = { ...input, name: input.name.trim(), logo_path: logoPath }
  const query = existing
    ? db.from('arpe_businesses').update(payload).eq('id', existing.id).eq('owner_id', ownerId)
    : db.from('arpe_businesses').insert({ ...payload, owner_id: ownerId })
  const { data, error } = await query.select().single()
  if (error) {
    // Compensate a failed database write without deleting the previous logo.
    if (uploadedPath) await db.storage.from(LOGO_BUCKET).remove([uploadedPath])
    throw error
  }
  // A failed cleanup leaves only an inaccessible-to-others orphan, never loses the saved logo.
  if (existing?.logo_path && existing.logo_path !== logoPath) await db.storage.from(LOGO_BUCKET).remove([existing.logo_path])
  return data
}
