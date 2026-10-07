import { describe, expect, it } from 'vitest'
import { planDocumentPages } from './document-pagination'

const width = 1430
const pixelsPerMm = width / 182
const capacity = 269 * pixelsPerMm

describe('A4 document page planning', () => {
  it('keeps a short document on one page even when a safe section cut appears before its footer', () => {
    const pages = planDocumentPages(width, capacity - 1, [capacity * 0.6, capacity * 0.88])
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({ startPx: 0, fitToPage: true })
  })

  it('fits a document that exceeds the printable height only within the 2 mm rounding tolerance', () => {
    const pages = planDocumentPages(width, capacity + pixelsPerMm * 1.5, [capacity * 0.9])
    expect(pages).toHaveLength(1)
    expect(pages[0].fitToPage).toBe(true)
  })

  it('adds a page only when content exceeds printable height plus tolerance', () => {
    const pages = planDocumentPages(width, capacity + pixelsPerMm * 3, [capacity * 0.82])
    expect(pages.length).toBeGreaterThan(1)
    expect(pages.at(-1)?.endPx).toBe(capacity + pixelsPerMm * 3)
    expect(pages.at(-1)?.fitToPage).toBe(true)
    expect(pages.every(page => page.endPx > page.startPx)).toBe(true)
    expect(pages[0].startPx).toBe(0)
    expect(pages.slice(1).every((page, index) => page.startPx === pages[index].endPx)).toBe(true)
  })

  it('keeps the commercial summary and footer together instead of isolating the footer', () => {
    const summaryStart = capacity * 0.82
    const footerStart = capacity + pixelsPerMm * 4
    const documentEnd = capacity + pixelsPerMm * 26
    const pages = planDocumentPages(width, documentEnd, [capacity * 0.55, summaryStart, footerStart], 269, 2, summaryStart)

    expect(pages).toHaveLength(2)
    expect(pages[0].endPx).toBeLessThan(summaryStart)
    expect(pages[1].startPx).toBeLessThan(summaryStart)
    expect(pages[1].endPx).toBe(documentEnd)
    expect(pages.every(page => page.endPx > page.startPx)).toBe(true)
  })
})
