import { describe, expect, it } from 'vitest'
import { generateCatalogQrDataUrl, getCatalogQrFilename, getEncodedCatalogQrText } from './catalog-qr'

describe('QR de catálogo', () => {
  it('codifica la URL pública exacta en el QR', async () => {
    const url = 'https://example.test/catalogo/dulce-encanto'
    await expect(getEncodedCatalogQrText(url)).resolves.toBe(url)
  })

  it('genera un PNG nítido con el nombre de descarga esperado', async () => {
    const dataUrl = await generateCatalogQrDataUrl('https://example.test/catalogo/dulce-encanto')
    expect(dataUrl).toMatch(/^data:image\/png;base64,/)
    expect(getCatalogQrFilename('dulce-encanto')).toBe('catalogo-dulce-encanto-qr.png')
  })
})
