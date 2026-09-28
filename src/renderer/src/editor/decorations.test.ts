import { describe, expect, it } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'
import { buildWysiwygDecorations, computeActiveNodeRanges } from './decorations'

/**
 * All node-shape assertions from #14 are re-checked here with the cursor
 * placed explicitly (either far away from every node, to assert markers
 * are hidden, or inside a node, to assert they become visible) since
 * ticket #15 makes marker visibility cursor-dependent instead of always
 * hidden.
 */
function decorationClasses(doc: string, cursorPos: number): string[] {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [Table] })],
    selection: EditorSelection.single(cursorPos)
  })
  const decos = buildWysiwygDecorations(state)
  const classes: string[] = []
  decos.between(0, doc.length, (_from, _to, deco) => {
    const cls = (deco.spec as { class?: string }).class
    if (cls) classes.push(...cls.split(' '))
  })
  return classes
}

describe('buildWysiwygDecorations (cursor outside every node)', () => {
  it('marks an ATX heading line and hides its # marker', () => {
    const doc = '# Title\n\nplain paragraph far below\n'
    const classes = decorationClasses(doc, doc.length)
    expect(classes).toContain('cf-h1')
    expect(classes).toContain('cf-syntax-hidden')
    expect(classes).not.toContain('cf-syntax-visible')
  })

  it('marks bold text and hides the ** markers', () => {
    const doc = 'this is **bold** text\n\nplain paragraph far below\n'
    const classes = decorationClasses(doc, doc.length)
    expect(classes).toContain('cf-strong')
    expect(classes.filter((c) => c === 'cf-syntax-hidden').length).toBeGreaterThanOrEqual(2)
    expect(classes).not.toContain('cf-syntax-visible')
  })

  it('marks italic text and hides the * markers', () => {
    const doc = 'this is *italic* text\n\nplain paragraph far below\n'
    const classes = decorationClasses(doc, doc.length)
    expect(classes).toContain('cf-em')
    expect(classes).not.toContain('cf-syntax-visible')
  })

  it('marks inline code and hides the backticks', () => {
    const doc = 'use `code` here\n\nplain paragraph far below\n'
    const classes = decorationClasses(doc, doc.length)
    expect(classes).toContain('cf-code-inline')
    expect(classes).not.toContain('cf-syntax-visible')
  })

  it('marks blockquote lines and hides the > marker', () => {
    const doc = '> quoted line\n\nplain paragraph far below\n'
    const classes = decorationClasses(doc, doc.length)
    expect(classes).toContain('cf-blockquote')
    expect(classes).not.toContain('cf-syntax-visible')
  })

  it('marks fenced code block lines', () => {
    const classes = decorationClasses('```js\nconst x = 1\n```\n', 0)
    expect(classes).toContain('cf-code-block')
  })

  it('tags the first and last line of a fenced code block for the CSS border (#18)', () => {
    const classes = decorationClasses('```js\nconst x = 1\nconst y = 2\n```\n')
    expect(classes).toContain('cf-code-block-start')
    expect(classes).toContain('cf-code-block-end')
    // The middle line should carry the base class only, no start/end marker.
    expect(classes.filter((c) => c === 'cf-code-block-start').length).toBe(1)
    expect(classes.filter((c) => c === 'cf-code-block-end').length).toBe(1)
  })

  it('marks link text and hides the [ ]( url ) syntax markers', () => {
    const doc = 'see [the docs](https://example.com) now\n\nplain paragraph far below\n'
    const classes = decorationClasses(doc, doc.length)
    expect(classes).toContain('cf-link')
    // 4 LinkMark ('[', ']', '(', ')') + 1 URL node, all hidden.
    expect(classes.filter((c) => c === 'cf-syntax-hidden').length).toBeGreaterThanOrEqual(5)
    expect(classes).not.toContain('cf-syntax-visible')
  })

  it('marks list items and hides the list marker', () => {
    const doc = '- item one\n- item two\n\nplain paragraph far below\n'
    const classes = decorationClasses(doc, doc.length)
    expect(classes.filter((c) => c === 'cf-syntax-hidden').length).toBeGreaterThanOrEqual(2)
    expect(classes).not.toContain('cf-syntax-visible')
  })

  it('marks table rows and distinguishes the header row', () => {
    const classes = decorationClasses('| a | b |\n| - | - |\n| 1 | 2 |\n', 0)
    expect(classes).toContain('cf-table-row')
    expect(classes).toContain('cf-table-header')
  })
})

describe('buildWysiwygDecorations (cursor inside a node: Typora-style show-on-focus)', () => {
  it('shows the # marker when the cursor is on the heading line', () => {
    const doc = '# Title\n\nplain paragraph far below\n'
    const classes = decorationClasses(doc, 3) // inside "Title"
    expect(classes).toContain('cf-syntax-visible')
    expect(classes).not.toContain('cf-syntax-hidden')
  })

  it('shows the ** markers when the cursor is inside the bold text', () => {
    const doc = 'this is **bold** text\n'
    const cursorPos = doc.indexOf('bold') + 1
    const classes = decorationClasses(doc, cursorPos)
    expect(classes).toContain('cf-syntax-visible')
    expect(classes.filter((c) => c === 'cf-syntax-hidden').length).toBe(0)
  })

  it('shows the markers when the cursor sits right at the boundary (adjacent to the marker)', () => {
    const doc = 'this is **bold** text\n'
    const cursorPos = doc.indexOf('**bold**') // right before the opening **
    const classes = decorationClasses(doc, cursorPos)
    expect(classes).toContain('cf-syntax-visible')
  })

  it('shows the > marker when the cursor is inside the blockquote', () => {
    const doc = '> quoted line\n'
    const cursorPos = doc.indexOf('quoted')
    const classes = decorationClasses(doc, cursorPos)
    expect(classes).toContain('cf-syntax-visible')
  })

  it('shows the list marker when the cursor is inside that list item only', () => {
    const doc = '- item one\n- item two\n'
    const cursorInFirst = doc.indexOf('item one')
    const classes = decorationClasses(doc, cursorInFirst)
    // Exactly one ListMark should be visible (the first item's), the
    // second item's marker stays hidden.
    expect(classes.filter((c) => c === 'cf-syntax-visible').length).toBe(1)
    expect(classes.filter((c) => c === 'cf-syntax-hidden').length).toBe(1)
  })

  it('hides unrelated node markers even while one node is active (only current node, not the whole document)', () => {
    const doc = '# Title\n\nthis is **bold** and *em* text\n'
    const cursorPos = 3 // inside "Title" heading only
    const classes = decorationClasses(doc, cursorPos)
    expect(classes).toContain('cf-syntax-visible') // the heading mark
    // bold/em markers must remain hidden since the cursor never entered them
    expect(classes.filter((c) => c === 'cf-syntax-hidden').length).toBeGreaterThanOrEqual(4)
  })
})

describe('buildWysiwygDecorations (unknown syntax stays untouched plain text - acceptance criterion #8)', () => {
  it('does not style or hide brackets in a footnote reference [^1]', () => {
    const doc = 'footnote ref[^1] here\n'
    const classes = decorationClasses(doc, 0)
    expect(classes).not.toContain('cf-link')
    expect(classes).not.toContain('cf-syntax-hidden')
    expect(classes).not.toContain('cf-syntax-visible')
  })

  it('does not style or hide brackets in a footnote definition [^1]: ...', () => {
    const doc = '[^1]: footnote definition text\n'
    const classes = decorationClasses(doc, 0)
    expect(classes).not.toContain('cf-link')
    expect(classes).not.toContain('cf-syntax-hidden')
  })

  it('does not style or hide brackets in a WikiLink [[Page Name]]', () => {
    const doc = 'a [[Page Name]] reference\n'
    const classes = decorationClasses(doc, 0)
    expect(classes).not.toContain('cf-link')
    expect(classes).not.toContain('cf-syntax-hidden')
  })

  it('still styles and hides markers for a real [text](url) link next to unknown syntax', () => {
    const doc = 'footnote[^1] and a [real link](https://example.com) too\n\n[^1]: def\n'
    const classes = decorationClasses(doc, 0)
    expect(classes).toContain('cf-link')
    expect(classes.filter((c) => c === 'cf-syntax-hidden').length).toBeGreaterThanOrEqual(4)
  })

  it('leaves a raw HTML block as plain text with no WYSIWYG styling', () => {
    const doc = '<div class="x">raw html block</div>\n'
    const classes = decorationClasses(doc, 0)
    expect(classes).toEqual([])
  })

  it('leaves inline HTML tags as plain text with no WYSIWYG styling', () => {
    const doc = 'inline <span>html</span> stays as-is\n'
    const classes = decorationClasses(doc, 0)
    expect(classes).toEqual([])
  })

  it('leaves a mermaid fenced code block untouched (still a generic code block, not interpreted)', () => {
    const doc = '```mermaid\ngraph TD; A-->B;\n```\n'
    const classes = decorationClasses(doc, 0)
    expect(classes).toContain('cf-code-block')
    expect(classes).not.toContain('cf-link')
  })

  it('leaves inline/block math ($...$ / $$...$$) as plain text, not interpreted', () => {
    const doc = 'math $x^2$ inline and $$y=1$$ block\n'
    const classes = decorationClasses(doc, 0)
    expect(classes).toEqual([])
  })
})

describe('computeActiveNodeRanges', () => {
  it('returns an empty set when the cursor is outside every recognized node', () => {
    const doc = '# Title\n\nplain paragraph, nothing special here\n'
    const state = EditorState.create({ doc, extensions: [markdown()] })
    const active = computeActiveNodeRanges(state, EditorSelection.single(doc.length))
    expect(active.size).toBe(0)
  })

  it('activates the heading container when the cursor is anywhere on the heading line', () => {
    const doc = '# Title\n\nbody\n'
    const state = EditorState.create({ doc, extensions: [markdown()] })
    const active = computeActiveNodeRanges(state, EditorSelection.single(5))
    expect(active.size).toBe(1)
  })

  it('activates every node touched by a multi-node selection (acceptance criterion #2)', () => {
    const doc = 'this is **bold** and *em* text\n'
    const state = EditorState.create({ doc, extensions: [markdown()] })
    const from = doc.indexOf('**bold**')
    const to = doc.indexOf('*em*') + '*em*'.length
    const active = computeActiveNodeRanges(state, EditorSelection.create([EditorSelection.range(from, to)]))
    // Both StrongEmphasis and Emphasis containers should be active.
    expect(active.size).toBe(2)
  })

  it('deactivates everything once the selection moves away (blur/leave semantics)', () => {
    const doc = 'this is **bold** text\n\nfar away paragraph\n'
    const state = EditorState.create({ doc, extensions: [markdown()] })
    const insideBold = computeActiveNodeRanges(state, EditorSelection.single(doc.indexOf('bold') + 1))
    expect(insideBold.size).toBeGreaterThan(0)

    const farAway = computeActiveNodeRanges(state, EditorSelection.single(doc.length))
    expect(farAway.size).toBe(0)
  })
})
