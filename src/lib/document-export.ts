import { getDocumentFilename } from './documents'
import type { ClientDocumentModel } from './documents'
import { planDocumentPages } from './document-pagination'

const exportWidth = 794
const exportPixelRatio = 1.8

function createExportClone(element: HTMLElement) {
  const wrapper = document.createElement('div')
  wrapper.setAttribute('aria-hidden', 'true')
  wrapper.style.cssText = `position:fixed;left:-10000px;top:0;z-index:-1;width:${exportWidth}px;background:#fff;pointer-events:none;`
  const clone = element.cloneNode(true) as HTMLElement
  clone.classList.remove('document-format-thermal-80', 'document-format-thermal-58')
  clone.classList.add('document-format-a4', 'document-export-a4')
  clone.style.width = `${exportWidth}px`
  clone.style.maxWidth = 'none'
  clone.style.minWidth = `${exportWidth}px`
  clone.style.margin = '0'
  wrapper.append(clone)
  document.body.append(wrapper)
  return { wrapper, clone }
}

async function renderDocumentCanvas(element: HTMLElement) {
  const { toCanvas } = await import('html-to-image')
  const { wrapper, clone } = createExportClone(element)
  try {
    await document.fonts?.ready
    const canvas = await toCanvas(clone, { pixelRatio: exportPixelRatio, backgroundColor: '#ffffff', cacheBust: true })
    return { canvas, clone, wrapper }
  } catch (error) {
    wrapper.remove()
    throw error
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function createDocumentPng(element: HTMLElement, model: ClientDocumentModel): Promise<File> {
  const { canvas, wrapper } = await renderDocumentCanvas(element)
  try {
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('No pudimos crear la imagen.')), 'image/png'))
    return new File([blob], getDocumentFilename(model, 'png'), { type: 'image/png' })
  } finally {
    canvas.width = 0
    canvas.height = 0
    wrapper.remove()
  }
}

export async function saveDocumentPng(element: HTMLElement, model: ClientDocumentModel) {
  const file = await createDocumentPng(element, model)
  downloadBlob(file, file.name)
}

export async function saveDocumentPdf(element: HTMLElement, model: ClientDocumentModel) {
  const { jsPDF } = await import('jspdf')
  const { canvas, clone, wrapper } = await renderDocumentCanvas(element)
  try {
    const pageWidthMm = 210
    const pageHeightMm = 297
    const marginMm = 14
    const contentWidthMm = pageWidthMm - marginMm * 2
    const contentHeightMm = pageHeightMm - marginMm * 2
    const pixelsPerMm = canvas.width / contentWidthMm
    const rootTop = clone.getBoundingClientRect().top
    const safeCuts = [...clone.querySelectorAll<HTMLElement>('[data-document-section]')]
      .map(section => (section.getBoundingClientRect().top - rootTop) * (canvas.width / clone.getBoundingClientRect().width))
      .filter(position => position > 0 && position < canvas.height)
      .sort((a, b) => a - b)
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
    const pages = planDocumentPages(canvas.width, canvas.height, safeCuts, contentHeightMm)

    pages.forEach(({ startPx, endPx, fitToPage }, pageIndex) => {
      const sliceHeight = Math.max(1, Math.ceil(endPx - startPx))
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = canvas.width
      pageCanvas.height = sliceHeight
      const context = pageCanvas.getContext('2d')
      if (!context) throw new Error('No pudimos preparar una página del PDF.')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
      context.drawImage(canvas, 0, startPx, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)
      if (pageIndex > 0) pdf.addPage('a4', 'portrait')
      const naturalHeightMm = sliceHeight / pixelsPerMm
      const fitScale = fitToPage ? Math.min(1, contentHeightMm / naturalHeightMm) : 1
      const renderedWidthMm = contentWidthMm * fitScale
      const renderedHeightMm = naturalHeightMm * fitScale
      const leftMm = marginMm + (contentWidthMm - renderedWidthMm) / 2
      pdf.addImage(pageCanvas, 'PNG', leftMm, marginMm, renderedWidthMm, renderedHeightMm, undefined, 'FAST')
      pageCanvas.width = 0
      pageCanvas.height = 0
    })

    pdf.save(getDocumentFilename(model, 'pdf'))
  } finally {
    canvas.width = 0
    canvas.height = 0
    wrapper.remove()
  }
}
