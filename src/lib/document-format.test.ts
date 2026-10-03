import { describe, expect, it } from 'vitest'
import { getInitialDocumentPrintFormat } from './document-format'

describe('default document printing format', () => {
  it('uses the business format when the current session has no selection', () => {
    expect(getInitialDocumentPrintFormat('a4', null)).toBe('a4')
    expect(getInitialDocumentPrintFormat('thermal80', null)).toBe('thermal-80')
    expect(getInitialDocumentPrintFormat('thermal58', null)).toBe('thermal-58')
  })

  it('respects a format selected during the session', () => {
    expect(getInitialDocumentPrintFormat('thermal80', 'thermal-58')).toBe('thermal-58')
    expect(getInitialDocumentPrintFormat('thermal58', 'a4')).toBe('a4')
    expect(getInitialDocumentPrintFormat('a4', 'invalid')).toBe('a4')
  })
})
