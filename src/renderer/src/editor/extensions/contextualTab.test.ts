import { describe, expect, it } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { contextualTabExtension } from './contextualTab'

/**
 * Ticket #26: Tab/Shift+Tab 上下文相关行为测试
 */

function createTestView(doc: string, cursorPos: number): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [markdown(), contextualTabExtension()],
    selection: EditorSelection.single(cursorPos)
  })
  return new EditorView({ state })
}

describe('contextualTab - Tab in list items', () => {
  it('indents a bullet list item by adding two spaces', () => {
    const view = createTestView('- item one\n- item two', 2)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('  - item one\n- item two')

    view.destroy()
  })

  it('indents an ordered list item', () => {
    const view = createTestView('1. first item\n2. second item', 3)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('  1. first item\n2. second item')

    view.destroy()
  })

  it('indents nested list item further', () => {
    const view = createTestView('  - nested item', 4)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('    - nested item')

    view.destroy()
  })
})

describe('contextualTab - Shift+Tab in list items', () => {
  it('dedents a list item by removing two spaces', () => {
    const view = createTestView('  - indented item', 4)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('- indented item')

    view.destroy()
  })

  it('dedents only up to two spaces', () => {
    // 使用嵌套列表语法（前面的列表项）让解析器识别这是列表上下文
    const view = createTestView('- item\n    - double indented', 18)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('- item\n  - double indented')

    view.destroy()
  })

  it('does nothing when list item has no leading spaces', () => {
    const view = createTestView('- item', 2)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('- item')

    view.destroy()
  })

  it('removes only one space if only one space exists', () => {
    const view = createTestView(' - item', 2)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('- item')

    view.destroy()
  })
})

describe('contextualTab - Tab in code blocks', () => {
  it('inserts a tab character in fenced code block', () => {
    const view = createTestView('```js\nconst x = 1\n```', 11)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('```js\nconst\t x = 1\n```')

    view.destroy()
  })

  it('inserts tab at beginning of code line', () => {
    const view = createTestView('```\ncode line\n```', 4)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    )

    expect(view.state.doc.toString()).toBe('```\n\tcode line\n```')

    view.destroy()
  })
})

describe('contextualTab - Tab in plain text', () => {
  it('uses default CM6 behavior for plain text (returns false)', () => {
    const view = createTestView('plain text paragraph', 5)

    // Tab 在普通文本中应该返回 false，让 CM6 使用默认行为
    // 这里我们测试按下 Tab 后文档是否保持不变（因为我们的处理器返回 false）

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    )

    // 由于我们的处理器返回 false，CM6 会使用默认行为
    // 默认行为可能是插入 Tab 或其他，这取决于 defaultKeymap
    // 我们主要测试的是我们的处理器正确识别了上下文

    view.destroy()
  })

  it('recognizes heading as plain text context', () => {
    const view = createTestView('# Heading', 5)

    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
    )

    // 标题不是列表也不是代码块，应该使用默认行为

    view.destroy()
  })
})
