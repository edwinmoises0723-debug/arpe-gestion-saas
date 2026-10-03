import type { BusinessDocumentFormat } from './database.types'

export type DocumentPrintFormat = 'a4' | 'thermal-80' | 'thermal-58'

export function getInitialDocumentPrintFormat(defaultFormat: BusinessDocumentFormat, savedFormat: string | null): DocumentPrintFormat {
  if (savedFormat === 'a4' || savedFormat === 'thermal-80' || savedFormat === 'thermal-58') return savedFormat
  if (defaultFormat === 'thermal80') return 'thermal-80'
  if (defaultFormat === 'thermal58') return 'thermal-58'
  return 'a4'
}
