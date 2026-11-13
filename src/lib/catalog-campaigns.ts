import type { CatalogCampaign, CatalogCampaignInput, CatalogCampaignKind, CatalogProduct, CatalogPromotionType } from './database.types'
import { removeCatalogMedia, uploadCatalogMedia } from './catalog'
import { client } from './supabase'

export type CampaignOfferType = CatalogPromotionType | 'showcase'
export type CampaignStatus = 'inactive' | 'scheduled' | 'active' | 'finished'
export type CampaignWithProducts = CatalogCampaign & { product_ids: string[] }

export type CampaignDraft = {
  offerType: CampaignOfferType
  name: string
  description: string
  badgeText: string
  value: string
  productIds: string[]
  startsOn: string
  endsOn: string
  featured: boolean
  imagePath: string | null
  imageFile: File | null
  removeImage: boolean
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const CAMPAIGN_OVERLAP_MESSAGE = 'Uno de los productos ya tiene una promoción activa para estas fechas. Ajusta la vigencia o desactiva la promoción anterior.'

export const campaignOfferTypes: Array<{
  value: CampaignOfferType | 'combo'
  title: string
  description: string
  example: string
  icon: 'percent' | 'amount' | 'tag' | 'gift' | 'combo' | 'sparkles'
}> = [
  { value: 'percentage', title: 'Descuento porcentual', description: 'Aplica un porcentaje de descuento sobre el precio habitual.', example: '25% OFF', icon: 'percent' },
  { value: 'fixed_discount', title: 'Descuento por monto', description: 'Resta una cantidad fija al precio habitual.', example: 'Monto fijo menos', icon: 'amount' },
  { value: 'fixed_price', title: 'Precio especial', description: 'Define un nuevo precio promocional temporal.', example: 'Un precio especial', icon: 'tag' },
  { value: 'two_for_one', title: '2x1', description: 'El cliente obtiene dos unidades del mismo producto pagando una.', example: 'Compra 1 y recibe 2', icon: 'gift' },
  { value: 'combo', title: 'Combo', description: 'Agrupa varios productos en una oferta.', example: 'Próximamente', icon: 'combo' },
  { value: 'showcase', title: 'Campaña visual', description: 'Destaca novedades, temporadas o productos sin cambiar su precio.', example: 'Nuevo · Temporada · Edición limitada', icon: 'sparkles' },
]

export function defaultCampaignBadge(type: CampaignOfferType, value = '') {
  if (type === 'percentage' && Number(value) > 0) return `${Number(value)}% OFF`
  if (type === 'fixed_discount') return 'Oferta'
  if (type === 'fixed_price') return 'Precio especial'
  if (type === 'two_for_one') return '2x1'
  return 'Nuevo'
}

export function getCampaignDisplayStatus(campaign: Pick<CatalogCampaign, 'active' | 'starts_on' | 'ends_on'>, today = localDateString()): CampaignStatus {
  if (!campaign.active) return 'inactive'
  if (campaign.ends_on && campaign.ends_on < today) return 'finished'
  if (campaign.starts_on && campaign.starts_on > today) return 'scheduled'
  return 'active'
}

export function campaignStatusLabel(status: CampaignStatus) {
  return { inactive: 'Inactiva', scheduled: 'Programada', active: 'Activa', finished: 'Finalizada' }[status]
}

export function campaignTypeFromRecord(campaign: Pick<CatalogCampaign, 'campaign_kind' | 'promotion_type'>): CampaignOfferType {
  return campaign.campaign_kind === 'showcase' ? 'showcase' : campaign.promotion_type ?? 'percentage'
}

export function campaignValueFromRecord(campaign: CatalogCampaign) {
  const value = campaign.percentage_discount ?? campaign.fixed_discount ?? campaign.promo_price
  return value === null ? '' : String(value)
}

export function campaignDraftFromRecord(campaign: CampaignWithProducts): CampaignDraft {
  const offerType = campaignTypeFromRecord(campaign)
  return {
    offerType,
    name: campaign.name,
    description: campaign.description,
    badgeText: campaign.badge_text ?? '',
    value: campaignValueFromRecord(campaign),
    productIds: campaign.product_ids,
    startsOn: campaign.starts_on ?? '',
    endsOn: campaign.ends_on ?? '',
    featured: campaign.featured,
    imagePath: campaign.image_path,
    imageFile: null,
    removeImage: false,
  }
}

export function validateCampaignDraft(draft: Pick<CampaignDraft, 'offerType' | 'name' | 'description' | 'badgeText' | 'value' | 'productIds' | 'startsOn' | 'endsOn'>, products: CatalogProduct[]) {
  const errors: string[] = []
  const name = draft.name.trim()
  const description = draft.description.trim()
  const badge = draft.badgeText.trim()
  const value = draft.value.trim() === '' ? Number.NaN : Number(draft.value)
  const selected = products.filter(product => draft.productIds.includes(product.id))

  if (draft.offerType === 'combo') errors.push('El configurador de combos estará disponible en una siguiente fase.')
  if (!name || name.length > 120) errors.push('Escribe un nombre de campaña de hasta 120 caracteres.')
  if (description.length > 1000) errors.push('La descripción no puede superar 1,000 caracteres.')
  if (badge && badge.length > 60) errors.push('El badge no puede superar 60 caracteres.')
  if (draft.productIds.length === 0) errors.push('Selecciona al menos un producto.')
  if (selected.length !== draft.productIds.length) errors.push('Actualiza la lista de productos antes de guardar.')
  if (draft.startsOn && draft.endsOn && draft.endsOn < draft.startsOn) errors.push('La fecha final debe ser igual o posterior a la fecha de inicio.')

  if (draft.offerType === 'percentage' && (!Number.isInteger(value) || value < 1 || value > 100)) errors.push('El descuento debe ser un número entero entre 1 y 100.')
  if (draft.offerType === 'fixed_discount') {
    if (!Number.isFinite(value) || value <= 0) errors.push('Indica un monto de descuento mayor que cero.')
    if (selected.some(product => product.public_price_mode === 'contact')) errors.push('Los productos con Precio pendiente no pueden tener descuentos monetarios.')
    if (Number.isFinite(value) && selected.some(product => product.public_price_mode !== 'contact' && value > Number(product.default_unit_price))) {
      errors.push('El descuento no puede ser mayor que el precio habitual de un producto seleccionado.')
    }
  }
  if (draft.offerType === 'fixed_price' && (!Number.isFinite(value) || value < 0)) errors.push('Indica un precio especial válido, igual o mayor que cero.')
  if (draft.offerType === 'percentage' && selected.some(product => product.public_price_mode === 'contact')) errors.push('Los productos con Precio pendiente no pueden tener descuentos monetarios.')
  if (draft.offerType === 'fixed_price' && selected.some(product => product.public_price_mode === 'contact')) errors.push('Los productos con Precio pendiente no pueden tener descuentos monetarios.')
  return errors
}

export type CampaignPricePreview = {
  badge: string
  before: number | null
  after: number | null
  message: string
}

export function buildCampaignPricePreview(type: CampaignOfferType, product: Pick<CatalogProduct, 'default_unit_price' | 'public_price_mode'>, value: number, badgeText = ''): CampaignPricePreview {
  const badge = badgeText.trim() || defaultCampaignBadge(type, String(value))
  if (product.public_price_mode === 'contact') return { badge, before: null, after: null, message: 'Precio pendiente' }
  const before = Number(product.default_unit_price)
  if (type === 'percentage') return { badge, before, after: Math.round((before * (1 - value / 100) + Number.EPSILON) * 100) / 100, message: 'Precio promocional' }
  if (type === 'fixed_discount') return { badge, before, after: Math.round((before - value + Number.EPSILON) * 100) / 100, message: 'Precio promocional' }
  if (type === 'fixed_price') return { badge, before, after: value, message: 'Precio especial' }
  if (type === 'two_for_one') return { badge, before, after: before, message: 'Compra 1 y recibe 2 del mismo producto.' }
  return { badge, before, after: before, message: 'Producto destacado' }
}

export function buildCampaignInput(draft: CampaignDraft, businessId: string, active = false): CatalogCampaignInput {
  const value = draft.value.trim() === '' ? null : Number(draft.value)
  const showcase = draft.offerType === 'showcase'
  const type: CatalogPromotionType | null = draft.offerType === 'showcase' ? null : draft.offerType
  return {
    business_id: businessId,
    name: draft.name.trim(),
    description: draft.description.trim(),
    campaign_kind: showcase ? 'showcase' : 'promotion',
    promotion_type: type,
    percentage_discount: type === 'percentage' ? value : null,
    fixed_discount: type === 'fixed_discount' ? value : null,
    promo_price: type === 'fixed_price' ? value : null,
    badge_text: draft.badgeText.trim() || defaultCampaignBadge(draft.offerType, draft.value),
    image_path: draft.imagePath,
    starts_on: draft.startsOn || null,
    ends_on: draft.endsOn || null,
    active,
    featured: draft.featured,
    sort_order: 0,
  }
}

export function campaignErrorMessage(error: unknown) {
  const record = typeof error === 'object' && error !== null ? error as { message?: unknown; code?: unknown } : null
  const message = typeof record?.message === 'string' ? record.message : error instanceof Error ? error.message : ''
  if (/overlapping active commercial promotions/i.test(message)) return CAMPAIGN_OVERLAP_MESSAGE
  if (record?.code === '23514') return 'No pudimos guardar la promoción. Revisa sus productos, fechas y valores.'
  if (/fetch|network|offline/i.test(message)) return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.'
  return 'No pudimos completar esta acción. Revisa la información e inténtalo de nuevo.'
}

export async function listCatalogCampaigns(businessId: string): Promise<CampaignWithProducts[]> {
  const { data, error } = await client().from('ejnexa_catalog_campaigns').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
  if (error) throw error
  const campaigns = data ?? []
  if (campaigns.length === 0) return []
  const ids = campaigns.map(campaign => campaign.id)
  const { data: links, error: linkError } = await client().from('ejnexa_catalog_campaign_products').select('campaign_id,product_id,position').eq('business_id', businessId).in('campaign_id', ids).order('position')
  if (linkError) throw linkError
  const productsByCampaign = new Map<string, string[]>()
  for (const link of links ?? []) productsByCampaign.set(link.campaign_id, [...(productsByCampaign.get(link.campaign_id) ?? []), link.product_id])
  return campaigns.map(campaign => ({ ...campaign, product_ids: productsByCampaign.get(campaign.id) ?? [] }))
}

function campaignUpdateFromRecord(campaign: CatalogCampaign): Partial<Omit<CatalogCampaignInput, 'business_id'>> {
  return {
    name: campaign.name,
    description: campaign.description,
    campaign_kind: campaign.campaign_kind,
    promotion_type: campaign.promotion_type,
    percentage_discount: campaign.percentage_discount,
    fixed_discount: campaign.fixed_discount,
    promo_price: campaign.promo_price,
    badge_text: campaign.badge_text,
    image_path: campaign.image_path,
    starts_on: campaign.starts_on,
    ends_on: campaign.ends_on,
    active: campaign.active,
    featured: campaign.featured,
    sort_order: campaign.sort_order,
  }
}

async function ignoreFailure(action: () => PromiseLike<unknown>) {
  try {
    await action()
  } catch {
    // Preserve the original operation error while attempting best-effort cleanup.
  }
}

export async function saveCatalogCampaign(args: {
  businessId: string
  ownerId: string
  values: CatalogCampaignInput
  productIds: string[]
  existing?: CatalogCampaign | null
  imageFile?: File | null
  removeImage?: boolean
}) {
  const db = client()
  const linksTable = db.from('ejnexa_catalog_campaign_products')
  const campaignsTable = db.from('ejnexa_catalog_campaigns')
  const businessId = args.businessId
  if (args.values.business_id !== businessId) throw new Error('Invalid business')

  let uploadedPath: string | null = null
  let savedCampaign: CatalogCampaign | null = null
  let writeStarted = false
  let created = false
  let originalCampaign = args.existing ?? null
  let originalLinks: Array<{ campaign_id: string; business_id: string; product_id: string; position: number }> = []
  const previousImagePath = originalCampaign?.image_path ?? null

  try {
    if (originalCampaign) {
      const { data, error } = await campaignsTable.select('*').eq('id', originalCampaign.id).eq('business_id', businessId).maybeSingle()
      if (error) throw error
      if (!data) throw new Error('Campaign not found')
      originalCampaign = data
      const { data: linkData, error: linkError } = await linksTable.select('campaign_id,business_id,product_id,position').eq('campaign_id', data.id).eq('business_id', businessId).order('position')
      if (linkError) throw linkError
      originalLinks = linkData ?? []
    }
    if (args.imageFile) uploadedPath = await uploadCatalogMedia(args.ownerId, businessId, 'campaigns', args.imageFile)
    const nextImagePath = uploadedPath ?? (args.removeImage ? null : originalCampaign?.image_path ?? args.values.image_path)
    const safeValues: CatalogCampaignInput = { ...args.values, business_id: businessId, image_path: nextImagePath, active: false }
    const updateValues: Partial<Omit<CatalogCampaignInput, 'business_id'>> = {
      name: safeValues.name,
      description: safeValues.description,
      campaign_kind: safeValues.campaign_kind,
      promotion_type: safeValues.promotion_type,
      percentage_discount: safeValues.percentage_discount,
      fixed_discount: safeValues.fixed_discount,
      promo_price: safeValues.promo_price,
      badge_text: safeValues.badge_text,
      image_path: safeValues.image_path,
      starts_on: safeValues.starts_on,
      ends_on: safeValues.ends_on,
      active: safeValues.active,
      featured: safeValues.featured,
      sort_order: safeValues.sort_order,
    }

    if (originalCampaign) {
      if (originalCampaign.active) {
        const { error } = await campaignsTable.update({ active: false }).eq('id', originalCampaign.id).eq('business_id', businessId)
        if (error) throw error
        writeStarted = true
      }
      const { data, error } = await campaignsTable.update(updateValues).eq('id', originalCampaign.id).eq('business_id', businessId).select().single()
      if (error) throw error
      savedCampaign = data
      writeStarted = true
    } else {
      const { data, error } = await campaignsTable.insert(safeValues).select().single()
      if (error) throw error
      savedCampaign = data
      created = true
      writeStarted = true
    }

    const { error: deleteError } = await linksTable.delete().eq('campaign_id', savedCampaign.id).eq('business_id', businessId)
    if (deleteError) throw deleteError
    if (args.productIds.length) {
      const { error: insertError } = await linksTable.insert(args.productIds.map((productId, position) => ({ campaign_id: savedCampaign!.id, business_id: businessId, product_id: productId, position: position + 1 })))
      if (insertError) throw insertError
    }

    if (args.values.active) {
      const { data, error } = await campaignsTable.update({ active: true }).eq('id', savedCampaign.id).eq('business_id', businessId).select().single()
      if (error) throw error
      savedCampaign = data
    }
    if (previousImagePath && previousImagePath !== nextImagePath) await removeCatalogMedia(previousImagePath, args.ownerId).catch(() => undefined)
    return savedCampaign
  } catch (error) {
    const campaignToRestore = originalCampaign
    if (writeStarted && campaignToRestore && !created) {
      await ignoreFailure(() => linksTable.delete().eq('campaign_id', campaignToRestore.id).eq('business_id', businessId))
      if (originalLinks.length) await ignoreFailure(() => linksTable.insert(originalLinks))
      await ignoreFailure(() => campaignsTable.update({ ...campaignUpdateFromRecord(campaignToRestore), active: false }).eq('id', campaignToRestore.id).eq('business_id', businessId))
      if (campaignToRestore.active) await ignoreFailure(() => campaignsTable.update({ active: true }).eq('id', campaignToRestore.id).eq('business_id', businessId))
    } else if (created && savedCampaign) {
      await ignoreFailure(() => campaignsTable.delete().eq('id', savedCampaign!.id).eq('business_id', businessId))
    }
    if (uploadedPath) await removeCatalogMedia(uploadedPath, args.ownerId).catch(() => undefined)
    throw error
  }
}

export async function setCatalogCampaignActive(businessId: string, campaignId: string, active: boolean) {
  const { data, error } = await client().from('ejnexa_catalog_campaigns').update({ active }).eq('id', campaignId).eq('business_id', businessId).select().single()
  if (error) throw error
  return data
}

export function campaignKindForType(type: CampaignOfferType): CatalogCampaignKind {
  return type === 'showcase' ? 'showcase' : 'promotion'
}
