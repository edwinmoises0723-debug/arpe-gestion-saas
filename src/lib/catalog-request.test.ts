import { describe, expect, it } from 'vitest'
import { addCatalogRequestItem, buildQuoteRequestMessage, buildQuoteRequestWhatsAppUrl, calculateCatalogReference, formatRequestedDate, removeCatalogRequestItem, setCatalogRequestQuantity, validateCatalogRequest, type CatalogRequestForm, type CatalogRequestItem } from './catalog-request'
import type { PublicCatalogProduct } from './database.types'

const products: PublicCatalogProduct[] = [
  { id: 'pastel-id', name: 'Pastel Premium', category: 'Pasteles', description: '', unit_label: 'pastel', default_unit_price: 850, default_portions: 20, image_path: 'private/path/should-not-leak.png', public_price_mode: 'exact', public_sort_order: 1 },
  { id: 'alfajor-id', name: 'Alfajor artesanal', category: 'Galletas', description: '', unit_label: 'unidad', default_unit_price: 35, default_portions: null, image_path: null, public_price_mode: 'from', public_sort_order: 2 },
  { id: 'custom-id', name: 'Diseño personalizado', category: 'Especiales', description: '', unit_label: 'pieza', default_unit_price: null, default_portions: null, image_path: null, public_price_mode: 'contact', public_sort_order: 3 },
]
const validForm: CatalogRequestForm = { customerName: 'María Gómez', desiredDate: '2026-10-25', details: 'Decoración azul' }

describe('public catalog quote request', () => {
  it('adds once, increments duplicates, keeps positive integer quantities and removes products', () => {
    const once = addCatalogRequestItem([], products[0])
    expect(once).toHaveLength(1)
    expect(addCatalogRequestItem(once, products[0])[0].quantity).toBe(2)
    const quantity = setCatalogRequestQuantity(once, 'pastel-id', 0)
    expect(quantity[0].quantity).toBe(1)
    expect(setCatalogRequestQuantity(once, 'pastel-id', 2.5)[0].quantity).toBe(1)
    expect(removeCatalogRequestItem(once, 'pastel-id')).toEqual([])
  })

  it('validates empty items, trimmed name, date boundaries and observation length', () => {
    expect(validateCatalogRequest([], { ...validForm, customerName: ' ' }, '2026-10-18')).toMatchObject({ items: expect.any(String), customerName: expect.any(String) })
    const item = addCatalogRequestItem([], products[0])
    expect(validateCatalogRequest(item, { ...validForm, desiredDate: '2026-10-17' }, '2026-10-18')).toHaveProperty('desiredDate')
    expect(validateCatalogRequest(item, { ...validForm, desiredDate: '2026-10-18' }, '2026-10-18')).toEqual({})
    expect(validateCatalogRequest(item, { ...validForm, details: 'x'.repeat(1001) }, '2026-10-18')).toHaveProperty('details')
  })

  it('calculates only a complete exact-price reference', () => {
    const exact = addCatalogRequestItem([], products[0])
    expect(calculateCatalogReference(exact)).toBe(850)
    const two = addCatalogRequestItem(exact, products[0])
    expect(calculateCatalogReference(two)).toBe(1700)
    expect(calculateCatalogReference([...exact, ...addCatalogRequestItem([], products[1])])).toBeNull()
    expect(calculateCatalogReference(addCatalogRequestItem([], products[2]))).toBeNull()
  })

  it('builds a clear WhatsApp message with exact/from/contact prices and no private identifiers', () => {
    let items: CatalogRequestItem[] = []
    for (const product of products) items = addCatalogRequestItem(items, product)
    const message = buildQuoteRequestMessage({ businessName: 'Dulce Encanto', customerName: validForm.customerName, items, desiredDate: validForm.desiredDate, details: validForm.details, catalogUrl: 'https://example.test/catalogo/dulce-encanto', currencySymbol: 'C$' })
    expect(message).toContain('Mi nombre es María Gómez')
    expect(message).toContain('Precio publicado: C$ 850,00')
    expect(message).toContain('Precio publicado: Desde C$ 35,00')
    expect(message).toContain('Precio publicado: Consultar precio')
    expect(message).toContain('25 de octubre de 2026')
    expect(message).toContain('Decoración azul')
    expect(message).toContain('https://example.test/catalogo/dulce-encanto')
    expect(message).not.toContain('pastel-id')
    expect(message).not.toContain('image_path')
    expect(message).not.toContain('private/path')
    expect(buildQuoteRequestWhatsAppUrl('+505 (8888) 1111', message)).toContain('https://wa.me/50588881111?text=')
    expect(buildQuoteRequestWhatsAppUrl(null, message)).toBeNull()
  })

  it('formats a requested date in Spanish and allows no date', () => {
    expect(formatRequestedDate('2026-10-25')).toBe('25 de octubre de 2026')
    const item = addCatalogRequestItem([], products[0])
    const message = buildQuoteRequestMessage({ businessName: 'Dulce Encanto', customerName: 'María', items: item, desiredDate: '', details: '', catalogUrl: 'https://example.test/catalogo/dulce', currencySymbol: 'C$' })
    expect(message).not.toContain('Fecha deseada:')
  })
})
