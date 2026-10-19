import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPublicCatalogPdf, getCatalogPdfFilename, loadPublicCatalogPdfData } from './catalog-pdf'
import type { PublicCatalogProduct, PublicCatalogProfile } from './database.types'

const mocks = vi.hoisted(() => ({
  profileLoader: vi.fn(), productLoader: vi.fn(),
  text: vi.fn(), addPage: vi.fn(), addImage: vi.fn(), output: vi.fn(() => new Blob(['%PDF-mock'])),
  priceLabel: vi.fn((mode: string, price: number, currency: string) => mode === 'contact' ? 'Consultar precio' : `${mode === 'from' ? 'Desde ' : ''}${currency}${price}`),
}))
vi.mock('./public-catalog', () => ({ loadPublicCatalogProfile: mocks.profileLoader, loadPublicCatalogProducts: mocks.productLoader }))
vi.mock('./catalog', () => ({
  catalogImageUrl: () => null,
  isValidCatalogSlug: (slug: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug),
  publicCatalogPriceLabel: mocks.priceLabel,
}))
vi.mock('./catalog-qr', () => ({ generateCatalogQrDataUrl: async () => 'data:image/png;base64,catalog-qr-fixture' }))
vi.mock('jspdf', () => ({ jsPDF: vi.fn(function MockJsPDF() { return ({
  setFillColor: vi.fn(), rect: vi.fn(), roundedRect: vi.fn(), setTextColor: vi.fn(), setFont: vi.fn(), setFontSize: vi.fn(),
  splitTextToSize: (value: string) => String(value).length > 64 ? [String(value).slice(0, 64), String(value).slice(64)] : [String(value)],
  text: mocks.text, addImage: mocks.addImage, setDrawColor: vi.fn(), addPage: mocks.addPage, line: vi.fn(),
  getNumberOfPages: () => mocks.addPage.mock.calls.length + 1, setPage: vi.fn(), output: mocks.output,
}) }) }))

const profile: PublicCatalogProfile = { catalog_slug: 'dulce-encanto', name: 'Dulce Encanto', slogan: 'Hecho con cariño', description: 'Repostería artesanal', currency: 'NIO', public_catalog_logo_path: null, whatsapp: null }
const items: PublicCatalogProduct[] = [
  { id: 'a', name: 'Pastel exacto', category: 'Pasteles', description: 'Con chocolate.', unit_label: 'pastel', default_unit_price: 850, default_portions: 20, image_path: null, public_price_mode: 'exact', public_sort_order: 1 },
  { id: 'b', name: 'Postre desde', category: 'Postres', description: 'Fruta fresca.', unit_label: 'unidad', default_unit_price: 1200, default_portions: null, image_path: null, public_price_mode: 'from', public_sort_order: 2 },
  { id: 'c', name: 'Galleta a consultar', category: 'Galletas', description: 'Preparación especial.', unit_label: 'unidad', default_unit_price: null, default_portions: null, image_path: null, public_price_mode: 'contact', public_sort_order: 3 },
]

describe('PDF independiente del catálogo público', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.profileLoader.mockResolvedValue(profile)
    mocks.productLoader.mockResolvedValue(items)
  })

  it('lee exclusivamente el modelo de las RPC públicas y construye la URL del catálogo', async () => {
    const data = await loadPublicCatalogPdfData('dulce-encanto', 'https://shop.example')
    expect(mocks.profileLoader).toHaveBeenCalledWith('dulce-encanto')
    expect(mocks.productLoader).toHaveBeenCalledWith('dulce-encanto')
    expect(data.url).toBe('https://shop.example/catalogo/dulce-encanto')
    expect(data.products).toEqual(items)
    expect(data.profile).not.toHaveProperty('owner_id')
  })

  it('genera varias páginas, precios públicos, placeholder sin foto, QR y nombre de archivo', async () => {
    const manyProducts = [...items, ...Array.from({ length: 10 }, (_, index) => ({ ...items[0], id: `more-${index}`, name: `Pastel ${index}`, image_path: null }))]
    mocks.productLoader.mockResolvedValue(manyProducts)
    const file = await createPublicCatalogPdf('dulce-encanto', 'https://shop.example')
    expect(file.name).toBe('catalogo-dulce-encanto.pdf')
    expect(file.type).toBe('application/pdf')
    expect(await file.text()).toBe('%PDF-mock')
    expect(mocks.addPage).toHaveBeenCalled()
    expect(mocks.addImage.mock.calls.some(([source]) => source === 'data:image/png;base64,catalog-qr-fixture')).toBe(true)
    const rendered = mocks.text.mock.calls.flatMap(([value]) => Array.isArray(value) ? value : [value]).join('\n')
    expect(rendered).toContain('Pastel exacto')
    expect(rendered).toContain('Desde C$1200')
    expect(rendered).toContain('Consultar precio')
    expect(rendered).toContain('Imagen no disponible')
    expect(rendered).toContain('Escanea para ver el catálogo actualizado.')
    expect(rendered).toContain('https://shop.example/catalogo/dulce-encanto')
  })

  it('usa el nombre solicitado al descargar', () => {
    expect(getCatalogPdfFilename('dulce-encanto')).toBe('catalogo-dulce-encanto.pdf')
  })
})
