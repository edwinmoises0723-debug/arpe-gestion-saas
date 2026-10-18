import { client } from './supabase'
import type { Business, PublicCatalogPriceMode } from './database.types'

export const CATALOG_MEDIA_BUCKET = 'ejnexa-catalog-media'
export const MAX_CATALOG_IMAGE_SIZE = 5 * 1024 * 1024
const mimeExtensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export function slugifyCatalogName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/g, '')
}

export function isValidCatalogSlug(slug: string) {
  return slug.length >= 3 && slug.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
}

export function validateCatalogSlug(slug: string) {
  if (!isValidCatalogSlug(slug)) throw new Error('Usa entre 3 y 80 caracteres: letras minúsculas, números y guiones entre palabras.')
  return slug
}

export function validateCatalogImage(file: Pick<File, 'type' | 'size'>) {
  if (!mimeExtensions[file.type]) throw new Error('Elige una imagen PNG, JPG o WebP.')
  if (file.size > MAX_CATALOG_IMAGE_SIZE) throw new Error('La imagen debe pesar 5 MB o menos.')
  if (file.size <= 0) throw new Error('El archivo de imagen está vacío.')
  return true
}

export const isPublicCatalogProduct = (catalogEnabled: boolean, active: boolean, isPublic: boolean) => catalogEnabled && active && isPublic

export function publicCatalogPriceLabel(mode: PublicCatalogPriceMode, price: number, currency: string) {
  const formatted = new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(price)
  if (mode === 'contact') return 'Consultar precio'
  return `${mode === 'from' ? 'Desde ' : ''}${currency}${formatted}`
}

export function catalogImageUrl(path: string | null | undefined) {
  if (!path) return null
  return client().storage.from(CATALOG_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl
}

export async function uploadCatalogMedia(ownerId: string, businessId: string, folder: 'products' | 'profile', file: File) {
  validateCatalogImage(file)
  const extension = mimeExtensions[file.type]
  const path = `${ownerId}/${businessId}/${folder}/${crypto.randomUUID()}.${extension}`
  const { error } = await client().storage.from(CATALOG_MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw error
  return path
}

export async function removeCatalogMedia(path: string | null, ownerId: string) {
  if (!path) return
  if (!path.startsWith(`${ownerId}/`)) throw new Error('La imagen no pertenece a este negocio.')
  const { error } = await client().storage.from(CATALOG_MEDIA_BUCKET).remove([path])
  if (error) throw error
}

export type PublicCatalogSettingsInput = Pick<Business, 'catalog_slug' | 'public_catalog_enabled' | 'public_catalog_show_whatsapp' | 'public_catalog_logo_path'>
export function validatePublicCatalogSettings(input: PublicCatalogSettingsInput) {
  if (input.catalog_slug !== null) validateCatalogSlug(input.catalog_slug)
  if (input.public_catalog_enabled && !input.catalog_slug) throw new Error('Escribe un enlace válido antes de activar el catálogo público.')
  return input
}
export async function savePublicCatalogSettings(business: Business, input: PublicCatalogSettingsInput, logoFile?: File | null, removeLogo = false) {
  validatePublicCatalogSettings(input)
  let uploaded: string | null = null
  const previous = business.public_catalog_logo_path
  try {
    if (logoFile) uploaded = await uploadCatalogMedia(business.owner_id, business.id, 'profile', logoFile)
    const nextPath = uploaded ?? (removeLogo ? null : input.public_catalog_logo_path)
    const { data, error } = await client().from('arpe_businesses').update({ ...input, public_catalog_logo_path: nextPath }).eq('id', business.id).eq('owner_id', business.owner_id).select().single()
    if (error) throw error
    if (previous && previous !== nextPath) await removeCatalogMedia(previous, business.owner_id).catch(() => undefined)
    return data
  } catch (error) {
    if (uploaded) await removeCatalogMedia(uploaded, business.owner_id).catch(() => undefined)
    throw error
  }
}
