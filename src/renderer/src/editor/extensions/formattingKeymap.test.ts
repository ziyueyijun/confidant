import { describe, expect, it } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { formattingKeymapExtension } from './formattingKeymap'

/**
 * Ticket #26: Ctrl+B/I 粗体斜体切换测试
 */

function createTestView(doc: string, from: number, to: number = from): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [markdown(), formattingKeymapExtension()],
    selection: EditorSelection.range(from, to)
  })
  return new EditorView({ state })
}

describe('formattingKeymap - Ctrl+B (bold)', () => {
  it('wraps selected text with **', () => {
    const view = createTestView('hello world', 0, 5)

    // 模拟 Ctrl+B
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('**hello** world')
    expect(view.state.selection.main.from).toBe(2)
    expect(view.state.selection.main.to).toBe(7)

    view.destroy()
  })

  it('removes ** markers when text is already bold', () => {
    const view = createTestView('**hello** world', 2, 7)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('hello world')
    expect(view.state.selection.main.from).toBe(0)
    expect(view.state.selection.main.to).toBe(5)

    view.destroy()
  })

  it('adds ** when cursor is at a position (empty selection)', () => {
    const view = createTestView('hello world', 0, 0)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('****hello world')
    expect(view.state.selection.main.from).toBe(2)
    expect(view.state.selection.main.to).toBe(2)

    view.destroy()
  })
})

describe('formattingKeymap - Ctrl+I (italic)', () => {
  it('wraps selected text with *', () => {
    const view = createTestView('hello world', 0, 5)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('*hello* world')
    expect(view.state.selection.main.from).toBe(1)
    expect(view.state.selection.main.to).toBe(6)

    view.destroy()
  })

  it('removes * markers when text is already italic', () => {
    const view = createTestView('*hello* world', 1, 6)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('hello world')
    expect(view.state.selection.main.from).toBe(0)
    expect(view.state.selection.main.to).toBe(5)

    view.destroy()
  })

  it('adds * when cursor is at a position (empty selection)', () => {
    const view = createTestView('hello world', 0, 0)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('**hello world')
    expect(view.state.selection.main.from).toBe(1)
    expect(view.state.selection.main.to).toBe(1)

    view.destroy()
  })

  it('does not confuse * with ** (bold)', () => {
    const view = createTestView('**hello** world', 2, 7)

    // 在已有粗体的文本上按 Ctrl+I，应该添加斜体标记，而不是移除粗体
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'i', ctrlKey: true, bubbles: true })
    )

    // 期望: **被保留，在其内部添加 *
    expect(view.state.doc.toString()).toBe('***hello*** world')

    view.destroy()
  })
})
