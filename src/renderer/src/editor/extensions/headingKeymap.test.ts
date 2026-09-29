import { describe, expect, it } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { headingKeymapExtension } from './headingKeymap'

/**
 * Ticket #26: Ctrl+0~6 标题切换测试
 */

function createTestView(doc: string, cursorPos: number): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [markdown(), headingKeymapExtension()],
    selection: EditorSelection.single(cursorPos)
  })
  return new EditorView({ state })
}

describe('headingKeymap - Ctrl+1~6', () => {
  it('Ctrl+1 converts plain line to h1', () => {
    const view = createTestView('hello world', 0)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('# hello world')

    view.destroy()
  })

  it('Ctrl+2 converts plain line to h2', () => {
    const view = createTestView('hello world', 5)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('## hello world')

    view.destroy()
  })

  it('Ctrl+3 converts plain line to h3', () => {
    const view = createTestView('hello world', 0)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: '3', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('### hello world')

    view.destroy()
  })

  it('Ctrl+6 converts plain line to h6', () => {
    const view = createTestView('hello world', 0)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: '6', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('###### hello world')

    view.destroy()
  })

  it('Ctrl+2 replaces h1 with h2', () => {
    const view = createTestView('# hello world', 2)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('## hello world')

    view.destroy()
  })

  it('Ctrl+0 removes heading marker', () => {
    const view = createTestView('### hello world', 4)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: '0', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('hello world')

    view.destroy()
  })

  it('pressing same level twice removes heading (Ctrl+1 on h1)', () => {
    const view = createTestView('# hello world', 2)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: '1', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('hello world')

    view.destroy()
  })

  it('pressing same level twice removes heading (Ctrl+3 on h3)', () => {
    const view = createTestView('### hello world', 5)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: '3', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('hello world')

    view.destroy()
  })

  it('works with cursor at end of heading line', () => {
    const doc = '## hello world'
    const view = createTestView(doc, doc.length)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: '4', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('#### hello world')

    view.destroy()
  })

  it('works on multi-line document, only affects current line', () => {
    const view = createTestView('first line\nsecond line\nthird line', 12)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: '2', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('first line\n## second line\nthird line')

    view.destroy()
  })
})
