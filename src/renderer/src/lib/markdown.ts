import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'
import { splitFrontmatter, type FrontmatterSplit } from '@shared/frontmatter'

export { splitFrontmatter, type FrontmatterSplit }

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

// FrontmatterSplit / splitFrontmatter now live in src/shared/frontmatter.ts
// (see re-export above) so the main process can share the exact same
// "don't search frontmatter" boundary logic used here for WYSIWYG display.
