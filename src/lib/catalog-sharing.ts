import { isValidCatalogSlug } from './catalog'

export type CatalogShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

export function buildPublicCatalogUrl(slug: string, origin = window.location.origin) {
  if (!isValidCatalogSlug(slug)) throw new Error('El catálogo no tiene un enlace válido.')
  return new URL(`/catalogo/${slug}`, origin).toString()
}

export function buildCatalogShareMessage(businessName: string, url: string) {
  return `Hola 👋\n\nTe comparto nuestro catálogo de ${businessName}:\n\n${url}\n\nPuedes revisar nuestros productos, precios y opciones disponibles.\n\nSerá un gusto atenderte.`
}

export function buildCatalogInquiryMessage(businessName: string, url: string) {
  return `Hola, vi su catálogo de ${businessName} y me gustaría recibir más información.\n\n${url}`
}

export function normalizeWhatsAppNumber(phone: string | null | undefined) {
  const digits = phone?.replace(/\D/g, '') ?? ''
  return digits.length >= 8 && digits.length <= 15 ? digits : null
}

export function buildWhatsAppUrl(phone: string | null, message: string, recipientRequired = false) {
  const number = normalizeWhatsAppNumber(phone)
  if (recipientRequired && !number) return null
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(message)}`
}

export async function copyCatalogLink(url: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      return true
    }
  } catch {
    // Fall through to the browser's selection-based clipboard fallback.
  }

  const input = document.createElement('textarea')
  input.value = url
  input.setAttribute('readonly', '')
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.append(input)
  input.select()
  let copied: boolean
  try { copied = document.execCommand('copy') } catch { input.remove(); return false }
  input.remove()
  return copied
}

export async function sharePublicCatalog(name: string, url: string): Promise<CatalogShareResult> {
  if (navigator.share) {
    try {
      await navigator.share({ title: `Catálogo de ${name}`, text: 'Conoce nuestro catálogo y encuentra lo que tenemos para ti.', url })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      return await copyCatalogLink(url) ? 'copied' : 'failed'
    }
  }
  return await copyCatalogLink(url) ? 'copied' : 'failed'
}
