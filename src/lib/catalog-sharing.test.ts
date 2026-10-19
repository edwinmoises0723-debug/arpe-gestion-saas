import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCatalogInquiryMessage, buildCatalogShareMessage, buildPublicCatalogUrl, buildWhatsAppUrl, copyCatalogLink, normalizeWhatsAppNumber, sharePublicCatalog } from './catalog-sharing'

afterEach(() => vi.unstubAllGlobals())

describe('compartir catálogo', () => {
  it('construye una URL del origen actual y valida el slug', () => {
    expect(buildPublicCatalogUrl('dulce-encanto', 'https://tienda.example')).toBe('https://tienda.example/catalogo/dulce-encanto')
    expect(() => buildPublicCatalogUrl('slug inválido', 'https://tienda.example')).toThrow()
  })

  it('usa Web Share API con título, texto y URL', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share })
    await expect(sharePublicCatalog('Dulce Encanto', 'https://example.test/catalogo/dulce')).resolves.toBe('shared')
    expect(share).toHaveBeenCalledWith({ title: 'Catálogo de Dulce Encanto', text: 'Conoce nuestro catálogo y encuentra lo que tenemos para ti.', url: 'https://example.test/catalogo/dulce' })
  })

  it('trata AbortError como cancelación sin copiar ni reportar fallo', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelado', 'AbortError'))
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } })
    await expect(sharePublicCatalog('Dulce Encanto', 'https://example.test/catalogo/dulce')).resolves.toBe('cancelled')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('copia al portapapeles y usa la copia como fallback de compartir', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } })
    await expect(copyCatalogLink('https://example.test/catalogo/dulce')).resolves.toBe(true)
    await expect(sharePublicCatalog('Dulce Encanto', 'https://example.test/catalogo/dulce')).resolves.toBe('copied')
    expect(writeText).toHaveBeenCalledWith('https://example.test/catalogo/dulce')
  })

  it('genera mensajes comerciales y normaliza WhatsApp sin inventar el país', () => {
    const url = 'https://example.test/catalogo/dulce'
    expect(buildCatalogShareMessage('Dulce Encanto', url)).toContain(url)
    expect(buildCatalogInquiryMessage('Dulce Encanto', url)).toContain('vi su catálogo de Dulce Encanto')
    expect(normalizeWhatsAppNumber('+505 (8888) 1111')).toBe('50588881111')
    expect(normalizeWhatsAppNumber('8888-1111')).toBe('88881111')
    expect(normalizeWhatsAppNumber('abc')).toBeNull()
    expect(buildWhatsAppUrl('8888 1111', `Hola ${url}`, true)).toBe(`https://wa.me/88881111?text=${encodeURIComponent(`Hola ${url}`)}`)
    expect(buildWhatsAppUrl(null, 'Hola', true)).toBeNull()
    expect(buildWhatsAppUrl(null, 'Hola', false)).toBe('https://wa.me/?text=Hola')
  })
})
