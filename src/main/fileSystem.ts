import { promises as fs } from 'fs'

/**
 * Ticket #14 perf acceptance criterion: documents around 100k characters
 * ("10 万字") must surface a warning so the caller can decide how to
 * handle a large load (the actual UI treatment is deferred to a later
 * ticket; this only detects and signals it).
 *
 * We threshold on JS string length (UTF-16 code units) rather than raw
 * file bytes: for CJK text each character is 1 code unit but 3 UTF-8
 * bytes, so a byte-based threshold would trigger 3x too early for
 * Chinese notes and 1x for ASCII ones. Counting characters directly
 * matches the "10 万字" (100k characters) wording of the spec regardless
 * of script.
 */
export const LARGE_DOCUMENT_CHAR_THRESHOLD = 100_000

export interface ReadFileResult {
  content: string
  /** Present when the document is large enough to warrant a load warning. */
  warning?: string
}

/**
 * Reads a UTF-8 text file from disk.
 *
 * Ticket #14 scope: read-only. No write/delete/rename here yet
 * (those land in ticket #15).
 */
export async function readFile(filePath: string): Promise<ReadFileResult> {
  const content = await fs.readFile(filePath, 'utf-8')
  const warning = detectLargeDocumentWarning(content)
  return warning ? { content, warning } : { content }
}

/**
 * Returns a warning message if `content` is large enough to risk slow
 * loads (spec perf budget: ~100k characters should still load, but the
 * caller/UI should be told so it can warn the user), or `undefined`
 * otherwise.
 */
export function detectLargeDocumentWarning(content: string): string | undefined {
  if (content.length < LARGE_DOCUMENT_CHAR_THRESHOLD) return undefined
  return `Document is large (${content.length} characters); loading may be slow.`
}
