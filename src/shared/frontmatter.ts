/**
 * Shared (main + renderer) frontmatter-splitting logic.
 *
 * Originally lived only in `src/renderer/src/lib/markdown.ts` (ticket #14/#15),
 * where it drives the WYSIWYG editor's read-only frontmatter block. Ticket
 * #22 (full-text search) needs the exact same "don't search frontmatter"
 * boundary in the *main* process (which walks the filesystem directly and
 * has no access to renderer-only modules). Rather than reimplement an
 * equivalent regex in two places and risk them drifting apart, this pure
 * function moved here so both processes import the same implementation.
 * `lib/markdown.ts` re-exports it unchanged so existing renderer imports
 * keep working.
 */

export interface FrontmatterSplit {
  /** Raw frontmatter block including both `---` fences, or null if absent. */
  frontmatter: string | null
  /** Document body after the frontmatter block (or the whole source). */
  body: string
  /** Character offset in the original source where `body` begins. */
  bodyOffset: number
}

const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/

/**
 * Splits a leading YAML frontmatter block from the rest of the document.
 *
 * Spec rule (spec.md 4.4): frontmatter is detected, shown read-only in a
 * grey block, and must be preserved byte-for-byte on disk. We only need
 * to *detect* the boundary here, never parse or rewrite the YAML.
 */
export function splitFrontmatter(source: string): FrontmatterSplit {
  const match = FRONTMATTER_RE.exec(source)

  if (!match || match.index !== 0) {
    return { frontmatter: null, body: source, bodyOffset: 0 }
  }

  const frontmatter = match[0]
  return {
    frontmatter,
    body: source.slice(frontmatter.length),
    bodyOffset: frontmatter.length
  }
}
