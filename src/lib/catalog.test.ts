import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CATALOG_MEDIA_BUCKET, MAX_CATALOG_IMAGE_SIZE, catalogImageUrl, isPublicCatalogProduct, isValidCatalogSlug, publicCatalogPriceLabel, removeCatalogMedia, slugifyCatalogName, uploadCatalogMedia, validateCatalogImage, validatePublicCatalogSettings } from './catalog'

const { mockClient, upload, remove, getPublicUrl } = vi.hoisted(() => {
  const upload = vi.fn().mockResolvedValue({ error: null })
  const remove = vi.fn().mockResolvedValue({ error: null })
  const getPublicUrl = vi.fn((path: string) => ({ data: { publicUrl: `https://example.test/${path}` } }))
  const storage = { from: vi.fn(() => ({ upload, remove, getPublicUrl })) }
  return { mockClient: { storage }, upload, remove, getPublicUrl }
})
vi.mock('./supabase', () => ({ client: () => mockClient }))

describe('catálogo público y multimedia', () => {
  beforeEach(() => { upload.mockClear(); remove.mockClear(); getPublicUrl.mockClear() })
  it('normaliza slugs con acentos, símbolos y espacios', () => {
    expect(slugifyCatalogName('ARPE Dulce Encanto')).toBe('arpe-dulce-encanto')
    expect(slugifyCatalogName('Pastelería Doña María')).toBe('pasteleria-dona-maria')
    expect(slugifyCatalogName('  Té  &  Café! ')).toBe('te-cafe')
    expect(isValidCatalogSlug('arpe-dulce-encanto')).toBe(true)
    expect(isValidCatalogSlug('ARPE Dulce')).toBe(false)
    for (const invalid of ['Arpe-Dulce', 'arpe dulce', '-arpe', 'arpe-', 'arpe--dulce', 'ab', `${'a'.repeat(81)}`]) {
      expect(isValidCatalogSlug(invalid)).toBe(false)
    }
  })
  it('valida formatos permitidos y el límite de 5 MB', () => {
    expect(MAX_CATALOG_IMAGE_SIZE).toBe(5 * 1024 * 1024)
    expect(validateCatalogImage({ type: 'image/webp', size: MAX_CATALOG_IMAGE_SIZE })).toBe(true)
    expect(() => validateCatalogImage({ type: 'image/svg+xml', size: 30 })).toThrow('PNG, JPG o WebP')
    expect(() => validateCatalogImage({ type: 'image/png', size: MAX_CATALOG_IMAGE_SIZE + 1 })).toThrow('5 MB o menos')
  })
  it('valida la configuración y no permite activar sin slug válido', () => {
    const payload = { catalog_slug: 'arpe-dulce', public_catalog_enabled: true, public_catalog_show_whatsapp: true, public_catalog_logo_path: null }
    expect(validatePublicCatalogSettings(payload)).toEqual(payload)
    expect(() => validatePublicCatalogSettings({ ...payload, catalog_slug: null })).toThrow('Escribe un enlace válido')
    expect(() => validatePublicCatalogSettings({ ...payload, catalog_slug: 'Con espacios' })).toThrow('letras minúsculas')
  })
  it('muestra precios según el modo y exige negocio, activo y público para visibilidad', () => {
    expect(publicCatalogPriceLabel('exact', 1200, 'C$')).toBe('C$1200')
    expect(publicCatalogPriceLabel('from', 1200, '$')).toMatch('Desde $')
    expect(publicCatalogPriceLabel('contact', 1200, '€')).toBe('Consultar precio')
    expect(isPublicCatalogProduct(true, true, true)).toBe(true)
    expect(isPublicCatalogProduct(false, true, true)).toBe(false)
    expect(isPublicCatalogProduct(true, false, true)).toBe(false)
    expect(isPublicCatalogProduct(true, true, false)).toBe(false)
  })
  it('genera URL pública solo desde el path y sube en la carpeta del dueño', async () => {
    expect(catalogImageUrl(null)).toBeNull()
    expect(catalogImageUrl('owner/business/products/a.png')).toBe('https://example.test/owner/business/products/a.png')
    expect(CATALOG_MEDIA_BUCKET).toBe('ejnexa-catalog-media')
    vi.stubGlobal('crypto', { randomUUID: () => 'file-id' })
    const file = { type: 'image/png', size: 10 } as File
    const path = await uploadCatalogMedia('owner-1', 'business-1', 'products', file)
    expect(path).toMatch(/^owner-1\/business-1\/products\/file-id\.png$/)
    expect(upload).toHaveBeenCalledWith(path, file, { contentType: 'image/png', upsert: false })
    await expect(removeCatalogMedia('someone/business/products/a.png', 'owner-1')).rejects.toThrow('no pertenece')
    await removeCatalogMedia(path, 'owner-1')
    expect(remove).toHaveBeenCalledWith([path])
    vi.unstubAllGlobals()
  })
})
