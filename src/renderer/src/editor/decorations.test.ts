import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'
import { buildWysiwygDecorations } from './decorations'

function decorationClasses(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [markdown({ extensions: [Table] })] })
  const decos = buildWysiwygDecorations(state)
  const classes: string[] = []
  decos.between(0, doc.length, (_from, _to, deco) => {
    const cls = (deco.spec as { class?: string }).class
    if (cls) classes.push(cls)
  })
  return classes
}

describe('buildWysiwygDecorations', () => {
  it('marks an ATX heading line and hides its # marker', () => {
    const classes = decorationClasses('# Title\n')
    expect(classes).toContain('cf-h1')
    expect(classes).toContain('cf-syntax-hidden')
  })

  it('marks bold text and hides the ** markers', () => {
    const classes = decorationClasses('this is **bold** text\n')
    expect(classes).toContain('cf-strong')
    expect(classes.filter((c) => c === 'cf-syntax-hidden').length).toBeGreaterThanOrEqual(2)
  })

  it('marks italic text and hides the * markers', () => {
    const classes = decorationClasses('this is *italic* text\n')
    expect(classes).toContain('cf-em')
  })

  it('marks inline code and hides the backticks', () => {
    const classes = decorationClasses('use `code` here\n')
    expect(classes).toContain('cf-code-inline')
  })

  it('marks blockquote lines', () => {
    const classes = decorationClasses('> quoted line\n')
    expect(classes).toContain('cf-blockquote')
  })

  it('marks fenced code block lines', () => {
    const classes = decorationClasses('```js\nconst x = 1\n```\n')
    expect(classes).toContain('cf-code-block')
  })

  it('marks link text and hides the [ ]( url ) syntax markers', () => {
    const classes = decorationClasses('see [the docs](https://example.com) now\n')
    expect(classes).toContain('cf-link')
    // 4 LinkMark ('[', ']', '(', ')') + 1 URL node, all hidden.
    expect(classes.filter((c) => c === 'cf-syntax-hidden').length).toBeGreaterThanOrEqual(5)
  })

  it('marks table rows and distinguishes the header row', () => {
    const classes = decorationClasses('| a | b |\n| - | - |\n| 1 | 2 |\n')
    expect(classes).toContain('cf-table-row')
    expect(classes).toContain('cf-table-header')
  })
})
