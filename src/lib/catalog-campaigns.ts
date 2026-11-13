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

  if (draft.offerType === 'percentage' && (!Number.isFinite(value) || value <= 0 || value > 100 || Math.round(value * 100) !== value * 100)) errors.push('El descuento debe ser mayor que 0 y hasta 100, con un máximo de dos decimales.')
  if (draft.offerType === 'fixed_discount') {
    if (!Number.isFinite(value) || value <= 0) errors.push('Indica un monto de descuento mayor que cero.')
    if (selected.some(product => product.public_price_mode === 'contact')) errors.push('Los productos con Precio pendiente no pueden tener descuentos monetarios.')
    if (Number.isFinite(value) && selected.some(product => product.public_price_mode !== 'contact' && value > Number(product.default_unit_price))) {
      errors.push('El descuento no puede ser mayor que el precio habitual de un producto seleccionado.')
    }
  }
  if (draft.offerType === 'fixed_price') {
    if (!Number.isFinite(value) || value < 0) errors.push('Indica un precio especial válido, igual o mayor que cero.')
    if (selected.some(product => product.public_price_mode === 'contact')) errors.push('Los productos con Precio pendiente no pueden tener descuentos monetarios.')
    const pricedProducts = selected.filter(product => product.public_price_mode !== 'contact')
    const minimumPrice = pricedProducts.length ? Math.min(...pricedProducts.map(product => Number(product.default_unit_price))) : null
    if (Number.isFinite(value) && minimumPrice !== null && value > minimumPrice) errors.push('El precio especial no puede superar el precio habitual de los productos seleccionados.')
  }
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

export function buildCampaignSaveRpcArgs(values: CatalogCampaignInput, campaignId: string | null, productIds: string[]) {
  return {
    p_campaign_id: campaignId,
    p_business_id: values.business_id,
    p_name: values.name,
    p_description: values.description,
    p_campaign_kind: values.campaign_kind,
    p_promotion_type: values.promotion_type,
    p_percentage_discount: values.percentage_discount,
    p_fixed_discount: values.fixed_discount,
    p_promo_price: values.promo_price,
    p_badge_text: values.badge_text,
    p_image_path: values.image_path,
    p_starts_on: values.starts_on,
    p_ends_on: values.ends_on,
    p_active: values.active,
    p_featured: values.featured,
    p_sort_order: values.sort_order,
    p_product_ids: productIds,
  }
}

export function campaignErrorMessage(error: unknown) {
  const record = typeof error === 'object' && error !== null ? error as { message?: unknown; code?: unknown } : null
  const message = typeof record?.message === 'string' ? record.message : error instanceof Error ? error.message : ''
  if (/overlapping active commercial promotions/i.test(message)) return CAMPAIGN_OVERLAP_MESSAGE
  if (/special price cannot exceed the usual price/i.test(message)) return 'El precio especial no puede superar el precio habitual de los productos seleccionados.'
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
  const businessId = args.businessId
  if (args.values.business_id !== businessId) throw new Error('Invalid business')

  let uploadedPath: string | null = null
  const previousImagePath = args.existing?.image_path ?? null

  try {
    if (args.imageFile) uploadedPath = await uploadCatalogMedia(args.ownerId, businessId, 'campaigns', args.imageFile)
    const nextImagePath = uploadedPath ?? (args.removeImage ? null : args.existing?.image_path ?? args.values.image_path)
    const safeValues: CatalogCampaignInput = { ...args.values, business_id: businessId, image_path: nextImagePath, active: false }
    const rpcValues = { ...safeValues, active: args.values.active }
    const { data, error } = await db.rpc('ejnexa_save_catalog_campaign', buildCampaignSaveRpcArgs(rpcValues, args.existing?.id ?? null, args.productIds)).single()
    if (error) throw error
    if (!data) throw new Error('Campaign save returned no campaign')
    if (previousImagePath && previousImagePath !== nextImagePath) await removeCatalogMedia(previousImagePath, args.ownerId).catch(() => undefined)
    return data
  } catch (error) {
    if (uploadedPath) await removeCatalogMedia(uploadedPath, args.ownerId).catch(() => undefined)
    throw error
  }
}

export async function setCatalogCampaignActive(businessId: string, campaignId: string, active: boolean) {
  const { data, error } = await client().rpc('ejnexa_set_catalog_campaign_active', {
    p_business_id: businessId,
    p_campaign_id: campaignId,
    p_active: active,
  }).single()
  if (error) throw error
  return data
}

export function campaignKindForType(type: CampaignOfferType): CatalogCampaignKind {
  return type === 'showcase' ? 'showcase' : 'promotion'
}
