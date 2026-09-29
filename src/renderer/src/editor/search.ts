import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

/**
 * Ticket #23: find-in-document.
 *
 * "Rendered text" in this project doesn't mean a separate document model -
 * the editor is min-diff-fidelity (CM6 + Lezer tree + cursor-driven marker
 * show/hide from #15, see decorations.ts). There is no independent
 * "rendered string" distinct from the source. What the user actually
 * *sees* is the source text minus whatever marker characters are
 * currently hidden by CSS (`cf-syntax-hidden` - `**`, `` ` ``, `#`, `>`,
 * `-`, `[`/`](url)`, ...).
 *
 * We chose to build the searchable text by excluding those marker node
 * ranges (rather than searching the raw source verbatim), because the
 * acceptance criterion is explicit: search the rendered/visible text, not
 * raw markdown syntax. E.g. searching "bold" must match inside
 * `**bold**` while searching "**" must not match every emphasis run in
 * the document. Reusing `MARKER_NODE_NAMES` from decorations.ts (a single
 * syntax-tree walk collecting marker ranges) keeps this cheap - there's
 * no meaningful complexity difference vs. matching on the raw source, so
 * we didn't take the "simpler but literally wrong" shortcut (option B in
 * the ticket).
 *
 * Known simplification (called out in the ticket as acceptable): this
 * uses the tree's *static* marker ranges, not the cursor-dependent
 * "active" set from `computeActiveNodeRanges`. If the cursor is inside a
 * `**bold**` span, decorations.ts makes the `**` visible on screen, but
 * search still treats it as hidden/excluded. That's a deliberate
 * simplification - a find box that changes which characters are
 * searchable based on where the text cursor happens to be would be
 * confusing, and the mismatch only affects the exact node the caret is
 * in.
 */

const MARKER_NODE_NAMES = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'QuoteMark', 'ListMark', 'LinkMark', 'URL'])

export interface MarkerRange {
  from: number
  to: number
}

/**
 * Collects the [from, to) ranges of every syntax-marker node in the
 * document (the same node set `decorations.ts` hides via CSS unless the
 * cursor is inside their container). Pure function of `state` - no
 * selection/cursor dependency, see module doc above.
 */
export function collectMarkerRanges(state: EditorState): MarkerRange[] {
  const ranges: MarkerRange[] = []
  const tree = syntaxTree(state)

  tree.iterate({
    enter(node) {
      if (MARKER_NODE_NAMES.has(node.name)) {
        ranges.push({ from: node.from, to: node.to })
      }
    }
  })

  return ranges
}

export interface RenderedTextSegment {
  /** Offset of this segment's first character in the original source doc. */
  docFrom: number
  /** The visible text of this segment (source text with markers removed). */
  text: string
}

/**
 * Builds the "rendered" (visible-to-the-user) text for the whole
 * document by removing marker node ranges from the source text, and
 * returns it as a list of contiguous segments each tagged with its
 * original document offset. Segments (rather than one flat string) are
 * what let `mapRenderedOffsetToDoc` translate a match position back to a
 * real document offset without re-scanning.
 *
 * Pure function of (source text, marker ranges) - no CM6 objects beyond
 * what's needed to slice text, so it's directly unit-testable.
 */
export function buildRenderedTextSegments(docText: string, markerRanges: MarkerRange[]): RenderedTextSegment[] {
  const sorted = [...markerRanges].sort((a, b) => a.from - b.from)
  const segments: RenderedTextSegment[] = []
  let cursor = 0

  for (const range of sorted) {
    const from = Math.max(range.from, cursor)
    const to = Math.max(range.to, cursor)
    if (from > cursor) {
      segments.push({ docFrom: cursor, text: docText.slice(cursor, from) })
    }
    cursor = Math.max(cursor, to)
  }

  if (cursor < docText.length) {
    segments.push({ docFrom: cursor, text: docText.slice(cursor) })
  }

  return segments
}

/** Flattens segments into one searchable string plus a per-character offset map back to the document. */
export function flattenRenderedText(segments: RenderedTextSegment[]): { text: string; offsets: number[] } {
  let text = ''
  const offsets: number[] = []
  for (const seg of segments) {
    for (let i = 0; i < seg.text.length; i++) {
      offsets.push(seg.docFrom + i)
    }
    text += seg.text
  }
  return { text, offsets }
}

export interface DocMatch {
  from: number
  to: number
}

/**
 * Finds every case-insensitive occurrence of `query` in `text`, returning
 * offsets into `text` itself (not yet mapped to document positions).
 * Pure string function - deliberately has no knowledge of CM6, markers,
 * or the document, so "match finding" is unit-testable independent of
 * "what text to search".
 */
export function findMatches(text: string, query: string): DocMatch[] {
  if (query.length === 0) return []

  const matches: DocMatch[] = []
  const haystack = text.toLowerCase()
  const needle = query.toLowerCase()

  let from = 0
  while (from <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, from)
    if (idx === -1) break
    matches.push({ from: idx, to: idx + needle.length })
    from = idx + 1 // allow overlapping matches, same as browser/editor find
  }

  return matches
}

/**
 * Maps matches found in the flattened rendered text back to real document
 * offsets using the per-character `offsets` map from `flattenRenderedText`.
 * A match that lands exactly at the end of the text (from === offsets.length,
 * i.e. an empty match at EOF) is dropped since there's no offset to map.
 */
export function mapMatchesToDoc(matches: DocMatch[], offsets: number[]): DocMatch[] {
  return matches
    .filter((m) => m.from < offsets.length && m.to <= offsets.length)
    .map((m) => ({
      from: offsets[m.from],
      // `to` is exclusive: map the offset of the last matched character
      // (index `to - 1`) and add 1, rather than indexing `offsets[to]`
      // which may belong to a different (non-contiguous) source segment.
      to: offsets[m.to - 1] + 1
    }))
}

/**
 * End-to-end pure pipeline: given the full document text and the marker
 * ranges to exclude, find every match of `query` in the rendered text and
 * return their positions in *document* coordinates, sorted by position.
 */
export function findMatchesInDocument(docText: string, markerRanges: MarkerRange[], query: string): DocMatch[] {
  const segments = buildRenderedTextSegments(docText, markerRanges)
  const { text, offsets } = flattenRenderedText(segments)
  const matches = findMatches(text, query)
  return mapMatchesToDoc(matches, offsets)
}

/**
 * Cyclic "next match" navigation: given the total match count and the
 * current index (-1 if none selected yet), returns the next index,
 * wrapping around to 0 after the last match. Returns -1 if there are no
 * matches at all. Kept as a pure function (no CM6/DOM) so the
 * next/prev/wrap-around logic is unit-testable in isolation.
 */
export function nextMatchIndex(count: number, currentIndex: number): number {
  if (count === 0) return -1
  return (currentIndex + 1) % count
}

/** Same as `nextMatchIndex` but cycling backwards, wrapping to the last match before index 0. */
export function prevMatchIndex(count: number, currentIndex: number): number {
  if (count === 0) return -1
  if (currentIndex <= 0) return count - 1
  return currentIndex - 1
}
