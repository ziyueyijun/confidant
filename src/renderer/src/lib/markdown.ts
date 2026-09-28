import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

/**
 * Parser scope per spec.md 1.3 / 5: CommonMark + tables + task lists.
 * No math, mermaid, footnotes, wikilinks, highlight marks, etc.
 * `html: false` because unknown/foreign syntax must render as plain
 * text, never be interpreted (spec.md 4.4: byte-identical passthrough).
 */
const md = new MarkdownIt({
  html: false,
  breaks: false,
  linkify: false,
  typographer: false
}).enable(['table'])

/**
 * Parses a markdown body (frontmatter already stripped) into
 * markdown-it tokens. This is the read-only AST that drives the WYSIWYG
 * rendering decorations in editor/render.ts.
 */
export function parseMarkdown(source: string): Token[] {
  return md.parse(source, {})
}

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
