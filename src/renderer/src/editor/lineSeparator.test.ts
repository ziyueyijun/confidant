import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'

/**
 * Regression test for a real bug caught during ticket #15 review: CM6's
 * `EditorState.create` accepts any of `\n`/`\r\n`/`\r` on input, but its
 * *default* behavior is to join lines back together with a bare `\n`
 * regardless of what was loaded (see the `EditorState.lineSeparator`
 * facet docs). Without pinning `lineSeparator` to the on-disk line
 * ending, `state.doc.toString()` silently turns every CRLF into LF on
 * the very first save - a whole-file diff that violates the
 * minimal-diff requirement (acceptance criterion #6) even though no
 * unit test at the `fileSystem.ts` layer alone can catch it (that layer
 * never goes through CM6 at all).
 */
describe('EditorState.lineSeparator pinning (regression)', () => {
  const crlfDoc =
    '# Title\r\n' +
    '\r\n' +
    'A line with a hard break at the end.  \r\n' +
    '\r\n' +
    '- item one\r\n' +
    '- item two\r\n'

  it('WITHOUT pinning lineSeparator, CM6 normalizes CRLF to LF on toString() (documents the bug this test guards against)', () => {
    const state = EditorState.create({
      doc: crlfDoc,
      extensions: [markdown({ extensions: [Table] })]
    })

    // This is CM6's documented default, not a bug in our code - it's
    // exactly what createMarkdownEditor must avoid by always passing an
    // explicit lineSeparator.
    expect(state.doc.toString()).not.toBe(crlfDoc)
    expect(state.doc.toString().includes('\r\n')).toBe(false)
  })

  it('WITH lineSeparator pinned to \\r\\n, an untouched round-trip is byte-identical via sliceString (NOT toString)', () => {
    const state = EditorState.create({
      doc: crlfDoc,
      extensions: [EditorState.lineSeparator.of('\r\n'), markdown({ extensions: [Table] })]
    })

    // toString() always joins with \n regardless of the facet - that's
    // the bug this whole test file documents. sliceString's explicit
    // lineSep parameter is the only API that actually round-trips CRLF.
    expect(state.doc.toString().includes('\r\n')).toBe(false)
    expect(state.doc.sliceString(0, state.doc.length, '\r\n')).toBe(crlfDoc)
  })

  it('WITH lineSeparator pinned to \\r\\n, editing one character preserves every other line exactly', () => {
    const state = EditorState.create({
      doc: crlfDoc,
      extensions: [EditorState.lineSeparator.of('\r\n'), markdown({ extensions: [Table] })]
    })

    // Use CM6's own line API for the edit offset, not a string index:
    // `Text` positions count each line break as a single unit
    // internally regardless of `lineSeparator`, so an index computed
    // from a \r\n-joined string (2 chars per break) would be off by the
    // number of line breaks before it. This also better matches how a
    // real caller (a CM6 command/transaction) would locate text.
    const targetLine = state.doc.line(state.doc.lines - 1) // "- item two" (last line is a trailing empty one)
    const wordStart = targetLine.from + targetLine.text.indexOf('two')

    const tr = state.update({
      changes: { from: wordStart, to: wordStart + 3, insert: 'IX' } // "two" -> "IX"
    })

    const result = tr.state.doc.sliceString(0, tr.state.doc.length, '\r\n')
    const expected = crlfDoc.replace('item two', 'item IX')
    expect(result).toBe(expected)
    expect(result.includes('\r\n')).toBe(true)
  })

  it('LF-only documents still round-trip correctly when pinned to \\n', () => {
    const lfDoc = crlfDoc.replace(/\r\n/g, '\n')
    const state = EditorState.create({
      doc: lfDoc,
      extensions: [EditorState.lineSeparator.of('\n'), markdown({ extensions: [Table] })]
    })

    expect(state.doc.toString()).toBe(lfDoc)
  })
})
