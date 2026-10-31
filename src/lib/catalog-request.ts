import type { Json, PublicCatalogPriceMode, PublicCatalogProduct } from './database.types'
import { normalizeWhatsAppNumber } from './catalog-sharing'
import { client } from './supabase'

export type CatalogRequestItem = {
  productId: string
  name: string
  category: string
  quantity: number
  unitLabel: string
  publicPriceMode: PublicCatalogPriceMode
  publicUnitPrice: number | null
  defaultPortions: number | null
  imagePath?: string | null
}

export type CatalogRequestForm = { customerName: string; desiredDate: string; details: string }
export type CatalogRequestErrors = Partial<Record<keyof CatalogRequestForm | 'items', string>>
export type CatalogRequestSubmissionPayload = {
  p_slug: string
  p_client_request_key: string
  p_customer_name: string
  p_customer_phone: string
  p_desired_date: string | null
  p_details: string
  p_items: Array<{ product_id: string; quantity: number }>
}
export type CatalogRequestSubmission = { id: string; requestNumber: string; status: 'new'; submittedAt: string }

export function addCatalogRequestItem(items: CatalogRequestItem[], product: PublicCatalogProduct): CatalogRequestItem[] {
  const existing = items.find(item => item.productId === product.id)
  if (existing) return items.map(item => item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item)
  return [...items, {
    productId: product.id,
    name: product.name,
    category: product.category,
    quantity: 1,
    unitLabel: product.unit_label,
    publicPriceMode: product.public_price_mode,
    publicUnitPrice: product.default_unit_price,
    defaultPortions: product.default_portions,
    imagePath: product.image_path,
  }]
}

export function setCatalogRequestQuantity(items: CatalogRequestItem[], productId: string, quantity: number): CatalogRequestItem[] {
  const safeQuantity = Number.isInteger(quantity) ? Math.min(9999, Math.max(1, quantity)) : 1
  return items.map(item => item.productId === productId ? { ...item, quantity: safeQuantity } : item)
}

export function removeCatalogRequestItem(items: CatalogRequestItem[], productId: string): CatalogRequestItem[] {
  return items.filter(item => item.productId !== productId)
}

export function validateCatalogRequest(items: CatalogRequestItem[], form: CatalogRequestForm, today = localDateString()): CatalogRequestErrors {
  const errors: CatalogRequestErrors = {}
  if (!items.length) errors.items = 'Agrega al menos un producto a tu solicitud.'
  if (items.length > 50) errors.items = 'Puedes incluir hasta 50 productos distintos por solicitud.'
  if (items.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999)) errors.items = 'Cada cantidad debe estar entre 1 y 9999.'
  const customerName = form.customerName.trim()
  if (customerName.length < 2 || customerName.length > 100) errors.customerName = 'Escribe un nombre de 2 a 100 caracteres.'
  if (form.desiredDate && (!isDateOnly(form.desiredDate) || form.desiredDate < today)) errors.desiredDate = 'Elige una fecha de hoy o posterior.'
  if (form.details.length > 1000) errors.details = 'Las observaciones pueden tener hasta 1000 caracteres.'
  return errors
}

export function buildCatalogRequestSubmissionPayload(args: {
  slug: string
  requestKey: string
  form: CatalogRequestForm
  items: CatalogRequestItem[]
}): CatalogRequestSubmissionPayload {
  return {
    p_slug: args.slug,
    p_client_request_key: args.requestKey,
    p_customer_name: args.form.customerName.trim(),
    p_customer_phone: '',
    p_desired_date: args.form.desiredDate || null,
    p_details: args.form.details.trim(),
    p_items: args.items.map(item => ({ product_id: item.productId, quantity: item.quantity })),
  }
}

export async function submitCatalogRequest(payload: CatalogRequestSubmissionPayload): Promise<CatalogRequestSubmission> {
  const args: { p_slug: string; p_client_request_key: string; p_customer_name: string; p_customer_phone: string | null; p_desired_date: string | null; p_details: string | null; p_items: Json } = payload
  const { data, error } = await client().rpc('ejnexa_submit_catalog_request', args)
  if (error) throw error
  const result = data?.[0]
  if (!result || result.status !== 'new') throw new Error('Submission response could not be confirmed')
  return { id: result.id, requestNumber: result.request_number, status: 'new', submittedAt: result.submitted_at }
}

export function calculateCatalogReference(items: CatalogRequestItem[]) {
  if (!items.length || items.some(item => item.publicPriceMode !== 'exact' || item.publicUnitPrice === null)) return null
  return items.reduce((total, item) => total + item.quantity * (item.publicUnitPrice ?? 0), 0)
}

export function formatRequestedDate(date: string) {
  if (!isDateOnly(date)) return ''
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('es', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}

export function buildQuoteRequestMessage(args: {
  businessName: string
  customerName: string
  items: CatalogRequestItem[]
  desiredDate: string
  details: string
  catalogUrl: string
  currencySymbol: string
  requestNumber?: string
}) {
  const lines = [
    'Hola 👋',
    '',
    `Mi nombre es ${args.customerName.trim()}.`,
    ...(args.requestNumber ? [`Número de solicitud: ${args.requestNumber}`] : []),
    '',
    `Vi el catálogo de ${args.businessName} y me gustaría solicitar una cotización.`,
    '',
    'PRODUCTOS:',
    ...args.items.flatMap((item, index) => [
      `${index + 1}. ${item.name}`,
      `   Cantidad: ${item.quantity} ${item.unitLabel}`,
      `   Precio publicado: ${publicPriceText(item, args.currencySymbol)}`,
      '',
    ]),
  ]
  if (args.desiredDate) lines.push('Fecha deseada:', formatRequestedDate(args.desiredDate), '')
  if (args.details.trim()) lines.push('Detalles:', args.details.trim(), '')
  lines.push(`Catálogo: ${args.catalogUrl}`, '', '¿Podrían ayudarme con la cotización?')
  return lines.join('\n')
}

export function buildQuoteRequestWhatsAppUrl(phone: string | null | undefined, message: string) {
  const number = normalizeWhatsAppNumber(phone)
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null
}

export function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function publicPriceText(item: CatalogRequestItem, currencySymbol: string) {
  if (item.publicPriceMode === 'contact' || item.publicUnitPrice === null) return 'Consultar precio'
  const formatted = `${currencySymbol} ${new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(item.publicUnitPrice)}`
  return item.publicPriceMode === 'from' ? `Desde ${formatted}` : formatted
}

function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
