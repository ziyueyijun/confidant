import { describe, expect, it } from 'vitest'
import { detectLargeDocumentWarning, LARGE_DOCUMENT_CHAR_THRESHOLD } from './fileSystem'

describe('detectLargeDocumentWarning', () => {
  it('returns undefined for a normal-sized document', () => {
    const content = 'a'.repeat(1_000)
    expect(detectLargeDocumentWarning(content)).toBeUndefined()
  })

  it('returns undefined right below the threshold', () => {
    const content = 'a'.repeat(LARGE_DOCUMENT_CHAR_THRESHOLD - 1)
    expect(detectLargeDocumentWarning(content)).toBeUndefined()
  })

  it('returns a warning at or above the threshold', () => {
    const content = 'a'.repeat(LARGE_DOCUMENT_CHAR_THRESHOLD)
    const warning = detectLargeDocumentWarning(content)
    expect(warning).toBeDefined()
    expect(warning).toContain(String(LARGE_DOCUMENT_CHAR_THRESHOLD))
  })

  it('returns a warning for a much larger document', () => {
    const content = '中'.repeat(150_000)
    expect(detectLargeDocumentWarning(content)).toBeDefined()
  })
})
