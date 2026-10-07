export type DocumentPageSlice = { startPx: number; endPx: number; fitToPage: boolean }

export function planDocumentPages(canvasWidthPx: number, canvasHeightPx: number, sectionCuts: number[], contentHeightMm = 269, toleranceMm = 2, keepTogetherFromPx?: number): DocumentPageSlice[] {
  if (canvasWidthPx <= 0 || canvasHeightPx <= 0) return []
  const contentWidthMm = 182
  const pixelsPerMm = canvasWidthPx / contentWidthMm
  const capacityPx = contentHeightMm * pixelsPerMm
  const tolerancePx = toleranceMm * pixelsPerMm

  if (canvasHeightPx <= capacityPx + tolerancePx) {
    return [{ startPx: 0, endPx: canvasHeightPx, fitToPage: true }]
  }

  const pages: DocumentPageSlice[] = []
  let startPx = 0
  while (startPx < canvasHeightPx) {
    const remainingPx = canvasHeightPx - startPx
    const fitsFinalPage = remainingPx <= capacityPx + tolerancePx
    const idealEnd = Math.min(startPx + capacityPx, canvasHeightPx)
    const safeEnd = fitsFinalPage
      ? undefined
      : sectionCuts.filter(position => position > startPx + capacityPx * 0.42 && position <= idealEnd && (keepTogetherFromPx === undefined || position < keepTogetherFromPx)).at(-1)
    const endPx = fitsFinalPage ? canvasHeightPx : safeEnd ?? idealEnd
    pages.push({ startPx, endPx, fitToPage: fitsFinalPage })
    startPx = endPx
  }
  return pages
}
