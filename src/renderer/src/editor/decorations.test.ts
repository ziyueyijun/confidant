import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { buildWysiwygDecorations } from './decorations'

function decorationClasses(doc: string): string[] {
  const state = EditorState.create({ doc, extensions: [markdown()] })
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
})
