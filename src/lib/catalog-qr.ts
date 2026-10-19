export const getCatalogQrFilename = (slug: string) => `catalogo-${slug}-qr.png`

export async function generateCatalogQrDataUrl(url: string) {
  const QRCode = (await import('qrcode')).default
  return QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 1024,
    color: { dark: '#173b30', light: '#ffffff' },
  })
}

export async function getEncodedCatalogQrText(url: string) {
  const QRCode = (await import('qrcode')).default
  return QRCode.create(url, { errorCorrectionLevel: 'M' }).segments
    .map(segment => typeof segment.data === 'string' ? segment.data : new TextDecoder().decode(segment.data))
    .join('')
}
