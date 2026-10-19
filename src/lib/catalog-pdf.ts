import { catalogImageUrl, publicCatalogPriceLabel } from './catalog'
import { loadPublicCatalogProducts, loadPublicCatalogProfile } from './public-catalog'
import { buildPublicCatalogUrl } from './catalog-sharing'
import type { PublicCatalogProduct, PublicCatalogProfile } from './database.types'
import type { jsPDF as JsPDFDocument } from 'jspdf'

export const getCatalogPdfFilename = (slug: string) => `catalogo-${slug}.pdf`

type PublicCatalogPdfData = { profile: PublicCatalogProfile; products: PublicCatalogProduct[]; url: string }

export async function loadPublicCatalogPdfData(slug: string, origin?: string): Promise<PublicCatalogPdfData> {
  const [profile, products] = await Promise.all([loadPublicCatalogProfile(slug), loadPublicCatalogProducts(slug)])
  if (!profile) throw new Error('Este catálogo no está disponible.')
  return { profile, products, url: buildPublicCatalogUrl(slug, origin) }
}

export async function createPublicCatalogPdf(slug: string, origin?: string): Promise<File> {
  const data = await loadPublicCatalogPdfData(slug, origin)
  const [{ jsPDF }, qrDataUrl] = await Promise.all([import('jspdf'), import('./catalog-qr').then(module => module.generateCatalogQrDataUrl(data.url))])
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const page = { width: 210, height: 297, margin: 16 }
  const contentWidth = page.width - page.margin * 2
  let y = 20

  pdf.setFillColor(248, 246, 239)
  pdf.rect(0, 0, page.width, page.height, 'F')
  const logo = await loadPublicImage(data.profile.public_catalog_logo_path)
  if (logo) {
    pdf.addImage(logo, 'PNG', page.margin, y, 27, 27)
    y += 34
  } else {
    pdf.setFillColor(41, 77, 64)
    pdf.roundedRect(page.margin, y, 27, 27, 7, 7, 'F')
    pdf.setTextColor(255, 253, 246)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    pdf.text(initials(data.profile.name), page.margin + 13.5, y + 17, { align: 'center' })
    y += 34
  }

  pdf.setTextColor(41, 77, 64)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(25)
  const nameLines = pdf.splitTextToSize(data.profile.name, contentWidth)
  pdf.text(nameLines, page.margin, y + 7)
  y += nameLines.length * 10 + 7
  if (data.profile.slogan.trim()) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(13)
    const lines = pdf.splitTextToSize(data.profile.slogan, contentWidth)
    pdf.text(lines, page.margin, y)
    y += lines.length * 6 + 4
  }
  if (data.profile.description.trim()) {
    pdf.setTextColor(94, 108, 98)
    pdf.setFontSize(10)
    const lines = pdf.splitTextToSize(data.profile.description, contentWidth)
    pdf.text(lines, page.margin, y)
    y += lines.length * 5 + 12
  } else y += 10

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.setTextColor(33, 53, 47)
  pdf.text('Catálogo', page.margin, y)
  y += 11
  if (data.products.length === 0) {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(11)
    pdf.text('Consulta nuestro catálogo actualizado en el enlace.', page.margin, y)
    y += 10
  }

  for (const product of data.products) {
    const image = await loadPublicImage(product.image_path)
    const height = productCardHeight(pdf, product, contentWidth)
    if (y + height > page.height - page.margin - 12) {
      pdf.addPage('a4', 'portrait')
      paintPage(pdf, page)
      y = page.margin
    }
    pdf.setDrawColor(225, 227, 218)
    pdf.setFillColor(255, 254, 250)
    pdf.roundedRect(page.margin, y, contentWidth, height, 3, 3, 'FD')
    const imageWidth = 38
    if (image) pdf.addImage(image, 'PNG', page.margin + 5, y + 5, imageWidth, Math.min(35, height - 10))
    else {
      pdf.setFillColor(238, 239, 230)
      pdf.roundedRect(page.margin + 5, y + 5, imageWidth, Math.min(35, height - 10), 2, 2, 'F')
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(104, 118, 110)
      pdf.text('Imagen no disponible', page.margin + 7, y + height / 2, { maxWidth: imageWidth - 4 })
    }
    const textX = page.margin + 6 + imageWidth
    const textWidth = contentWidth - imageWidth - 13
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(113, 130, 95)
    pdf.text(product.category, textX, y + 8)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.setTextColor(33, 53, 47)
    const productNameLines = pdf.splitTextToSize(product.name, textWidth)
    pdf.text(productNameLines, textX, y + 14)
    const textY = y + 14 + productNameLines.length * 5
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.setTextColor(41, 77, 64)
    pdf.text(publicCatalogPriceLabel(product.public_price_mode, product.default_unit_price ?? 0, currencySymbol(data.profile.currency)), textX, textY)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(104, 118, 110)
    pdf.text(`/ ${product.unit_label}${product.default_portions ? ` · ${product.default_portions} porciones` : ''}`, textX, textY + 4)
    if (product.description.trim()) {
      pdf.setFontSize(8)
      pdf.setTextColor(82, 94, 86)
      const description = pdf.splitTextToSize(product.description, textWidth).slice(0, 4)
      pdf.text(description, textX, textY + 9)
    }
    y += height + 5
  }

  const qrSize = 42
  if (y + qrSize + 30 > page.height - page.margin) {
    pdf.addPage('a4', 'portrait')
    paintPage(pdf, page)
    y = page.margin
  }
  y += 5
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.setTextColor(33, 53, 47)
  pdf.text('Escanea para ver el catálogo actualizado.', page.margin, y + 5)
  pdf.addImage(qrDataUrl, 'PNG', page.margin, y + 9, qrSize, qrSize)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.text(pdf.splitTextToSize(data.url, contentWidth - qrSize - 8), page.margin + qrSize + 7, y + 18)

  const pageCount = pdf.getNumberOfPages()
  for (let index = 1; index <= pageCount; index += 1) {
    pdf.setPage(index)
    pdf.setDrawColor(225, 227, 218)
    pdf.line(page.margin, page.height - 12, page.width - page.margin, page.height - 12)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(104, 118, 110)
    pdf.text('Catálogo impulsado por EJNEXA Business', page.margin, page.height - 7)
    pdf.text(data.url, page.width - page.margin, page.height - 7, { align: 'right', maxWidth: 105 })
  }

  return new File([pdf.output('blob')], getCatalogPdfFilename(slug), { type: 'application/pdf' })
}

function productCardHeight(pdf: JsPDFDocument, product: PublicCatalogProduct, width: number) {
  const textWidth = width - 51
  const titleLines = pdf.splitTextToSize(product.name, textWidth).length
  const descriptionLines = product.description.trim() ? Math.min(4, pdf.splitTextToSize(product.description, textWidth).length) : 0
  return Math.max(45, 22 + titleLines * 5 + descriptionLines * 4)
}

async function loadPublicImage(path: string | null) {
  const url = catalogImageUrl(path)
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    try {
      const image = new Image()
      image.src = objectUrl
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) return null
      context.drawImage(image, 0, 0)
      return canvas.toDataURL('image/png')
    } finally { URL.revokeObjectURL(objectUrl) }
  } catch { return null }
}

function paintPage(pdf: JsPDFDocument, page: { width: number; height: number }) {
  pdf.setFillColor(248, 246, 239)
  pdf.rect(0, 0, page.width, page.height, 'F')
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

function currencySymbol(code: PublicCatalogProfile['currency']) {
  return ({ NIO: 'C$', USD: '$', EUR: '€', CRC: '₡' } as const)[code]
}
