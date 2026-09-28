import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'
import {
  buildRenderedTextSegments,
  collectMarkerRanges,
  findMatches,
  findMatchesInDocument,
  flattenRenderedText,
  mapMatchesToDoc,
  nextMatchIndex,
  prevMatchIndex
} from './search'

function stateFor(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown({ extensions: [Table] })] })
}

describe('collectMarkerRanges', () => {
  it('collects HeaderMark/EmphasisMark/CodeMark/QuoteMark/ListMark/LinkMark/URL ranges', () => {
    const doc = '# Title\n\nthis is **bold** and `code` and [text](http://x)\n'
    const ranges = collectMarkerRanges(stateFor(doc))
    // "# " heading mark, "**"x2, "`"x2, link marks + URL - at least these.
    expect(ranges.length).toBeGreaterThanOrEqual(7)
    // Every collected range's source text should look like a marker
    // (short, punctuation-heavy), never a full word like "bold".
    for (const r of ranges) {
      const text = doc.slice(r.from, r.to)
      expect(text).not.toBe('bold')
      expect(text).not.toBe('code')
    }
  })

  it('returns no ranges for plain paragraph text with no markdown syntax', () => {
    const doc = 'just plain text, nothing special here\n'
    expect(collectMarkerRanges(stateFor(doc))).toEqual([])
  })
})

describe('buildRenderedTextSegments (search-target text: exclude marker ranges)', () => {
  it('excludes a single marker range from the middle of the text', () => {
    // "AA[MARK]BB" with marker at [2,6)
    const segments = buildRenderedTextSegments('AAxxxxBB', [{ from: 2, to: 6 }])
    expect(segments).toEqual([
      { docFrom: 0, text: 'AA' },
      { docFrom: 6, text: 'BB' }
    ])
  })

  it('excludes multiple non-overlapping marker ranges', () => {
    // "**bold** and *em*" -> markers at the ** and * positions
    const doc = '**bold** and *em*'
    // ** at [0,2) and [6,8), * at [13,14) and [16,17)
    const ranges = [
      { from: 0, to: 2 },
      { from: 6, to: 8 },
      { from: 13, to: 14 },
      { from: 16, to: 17 }
    ]
    const segments = buildRenderedTextSegments(doc, ranges)
    const flattened = segments.map((s) => s.text).join('')
    expect(flattened).toBe('bold and em')
  })

  it('handles marker ranges that touch the start/end of the document', () => {
    const doc = '**bold**'
    const ranges = [
      { from: 0, to: 2 },
      { from: 6, to: 8 }
    ]
    const segments = buildRenderedTextSegments(doc, ranges)
    expect(segments.map((s) => s.text).join('')).toBe('bold')
  })

  it('handles adjacent/overlapping marker ranges without emitting empty or negative segments', () => {
    const doc = 'ABCDEF'
    const ranges = [
      { from: 1, to: 3 },
      { from: 2, to: 4 } // overlaps the previous range
    ]
    const segments = buildRenderedTextSegments(doc, ranges)
    expect(segments.map((s) => s.text).join('')).toBe('AEF')
    for (const seg of segments) {
      expect(seg.text.length).toBeGreaterThan(0)
    }
  })

  it('returns the whole text as one segment when there are no marker ranges', () => {
    const segments = buildRenderedTextSegments('hello world', [])
    expect(segments).toEqual([{ docFrom: 0, text: 'hello world' }])
  })
})

describe('flattenRenderedText + mapMatchesToDoc round-trip', () => {
  it('maps a match position in the flattened text back to the correct document offset', () => {
    const segments = buildRenderedTextSegments('**bold** text', [
      { from: 0, to: 2 },
      { from: 6, to: 8 }
    ])
    const { text, offsets } = flattenRenderedText(segments)
    expect(text).toBe('bold text')

    const matches = findMatches(text, 'bold')
    expect(matches).toEqual([{ from: 0, to: 4 }])

    const docMatches = mapMatchesToDoc(matches, offsets)
    // "bold" starts right after the leading "**" (offset 2) in the source.
    expect(docMatches).toEqual([{ from: 2, to: 6 }])
    expect('**bold** text'.slice(docMatches[0].from, docMatches[0].to)).toBe('bold')
  })
})

describe('findMatches (pure text + query -> match positions)', () => {
  it('finds a single match', () => {
    expect(findMatches('hello world', 'world')).toEqual([{ from: 6, to: 11 }])
  })

  it('finds multiple non-overlapping matches', () => {
    expect(findMatches('abcabcabc', 'abc')).toEqual([
      { from: 0, to: 3 },
      { from: 3, to: 6 },
      { from: 6, to: 9 }
    ])
  })

  it('finds overlapping matches', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([
      { from: 0, to: 2 },
      { from: 1, to: 3 },
      { from: 2, to: 4 }
    ])
  })

  it('is case-insensitive', () => {
    expect(findMatches('Hello WORLD hello', 'hello')).toEqual([
      { from: 0, to: 5 },
      { from: 12, to: 17 }
    ])
  })

  it('returns no matches when the query is not found', () => {
    expect(findMatches('hello world', 'xyz')).toEqual([])
  })

  it('returns no matches for an empty query', () => {
    expect(findMatches('hello world', '')).toEqual([])
  })
})

describe('findMatchesInDocument (end-to-end pipeline)', () => {
  it('matches visible text inside a bold span but not the ** markers themselves', () => {
    const doc = 'this is **bold** text'
    const markerRanges = collectMarkerRanges(stateFor(doc))

    const boldMatches = findMatchesInDocument(doc, markerRanges, 'bold')
    expect(boldMatches).toEqual([{ from: 10, to: 14 }])
    expect(doc.slice(10, 14)).toBe('bold')

    const starMatches = findMatchesInDocument(doc, markerRanges, '**')
    expect(starMatches).toEqual([])
  })

  it('matches text inside a heading but not the # marker', () => {
    const doc = '# Title\n\nplain paragraph\n'
    const markerRanges = collectMarkerRanges(stateFor(doc))

    expect(findMatchesInDocument(doc, markerRanges, 'Title')).toEqual([{ from: 2, to: 7 }])
    expect(findMatchesInDocument(doc, markerRanges, '#')).toEqual([])
  })

  it('matches text inside inline code but not the backticks', () => {
    const doc = 'use `code` here\n'
    const markerRanges = collectMarkerRanges(stateFor(doc))

    expect(findMatchesInDocument(doc, markerRanges, 'code')).toEqual([{ from: 5, to: 9 }])
    expect(findMatchesInDocument(doc, markerRanges, '`code`')).toEqual([])
  })

  it('matches link text but not the [](url) syntax', () => {
    const doc = 'see [my link](http://example.com) here\n'
    const markerRanges = collectMarkerRanges(stateFor(doc))

    const matches = findMatchesInDocument(doc, markerRanges, 'my link')
    expect(matches).toEqual([{ from: 5, to: 12 }])
    expect(findMatchesInDocument(doc, markerRanges, 'example.com')).toEqual([])
  })

  it('returns no matches in a document with no marker syntax at all', () => {
    const doc = 'plain text document with no markdown syntax\n'
    const markerRanges = collectMarkerRanges(stateFor(doc))
    expect(findMatchesInDocument(doc, markerRanges, 'markdown')).toEqual([{ from: 28, to: 36 }])
  })
})

describe('nextMatchIndex (cyclic next navigation)', () => {
  it('advances to the next index', () => {
    expect(nextMatchIndex(3, 0)).toBe(1)
    expect(nextMatchIndex(3, 1)).toBe(2)
  })

  it('wraps around from the last match to the first', () => {
    expect(nextMatchIndex(3, 2)).toBe(0)
  })

  it('starts at the first match when nothing is selected yet (-1)', () => {
    expect(nextMatchIndex(3, -1)).toBe(0)
  })

  it('returns -1 when there are no matches', () => {
    expect(nextMatchIndex(0, -1)).toBe(-1)
  })
})

describe('prevMatchIndex (cyclic previous navigation)', () => {
  it('goes back to the previous index', () => {
    expect(prevMatchIndex(3, 2)).toBe(1)
    expect(prevMatchIndex(3, 1)).toBe(0)
  })

  it('wraps around from the first match to the last', () => {
    expect(prevMatchIndex(3, 0)).toBe(2)
  })

  it('wraps to the last match when nothing is selected yet (-1)', () => {
    expect(prevMatchIndex(3, -1)).toBe(2)
  })

  it('returns -1 when there are no matches', () => {
    expect(prevMatchIndex(0, -1)).toBe(-1)
  })
})
