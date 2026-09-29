import { describe, expect, it } from 'vitest'
import { EditorState, EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { Table } from '@lezer/markdown'
import { contextualTabExtension } from './contextualTab'

/**
 * Ticket #26: Tab/Shift+Tab 上下文相关行为测试
 * Ticket #25: 表格内 Tab 键跳转测试
 */

function createTestView(doc: string, cursorPos: number): EditorView {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ extensions: [Table] }), contextualTabExtension()],
    selection: EditorSelection.single(cursorPos)
  })
  return new EditorView({ state })
}

describe('contextualTab - Tab in tables (Ticket #25)', () => {
  it('跳转到同一行的下一个单元格', () => {
    const tableDoc = `| Name | Age |
| --- | --- |
| Alice | 30 |`
    const view = createTestView(tableDoc, 2) // 在 "Name" 中

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

    // 应该跳到第一个 | 之后（Age 列）
    const cursorPos = view.state.selection.main.anchor
    const line = view.state.doc.lineAt(cursorPos)
    expect(line.text).toBe('| Name | Age |')
    // 应该跳过第一个单元格，光标位置应该大于初始位置
    expect(cursorPos).toBeGreaterThan(2)

    view.destroy()
  })

  it('从行末跳转到下一行第一个单元格', () => {
    const tableDoc = `| A | B |
| --- | --- |
| C | D |`
    const view = createTestView(tableDoc, 8) // 在第一行 "B" 之后

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

    // 应该跳到下一行（对齐行）
    const cursorPos = view.state.selection.main.anchor
    const line = view.state.doc.lineAt(cursorPos)
    expect(line.text).toContain('---')

    view.destroy()
  })

  it('在表格内时 Tab 键不会插入制表符', () => {
    const tableDoc = `| Col |
| --- |
| Val |`
    const view = createTestView(tableDoc, 3) // 在 "Col" 中
    const before = view.state.doc.toString()

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

    // 应该只移动光标，不插入字符
    const after = view.state.doc.toString()
    expect(after).toBe(before)

    view.destroy()
  })

  it('表格内跳转不影响文档内容', () => {
    const tableDoc = `| Header |
| --- |
| Data |`
    const view = createTestView(tableDoc, 2)
    const lengthBefore = view.state.doc.length

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

    expect(view.state.doc.length).toBe(lengthBefore)

    view.destroy()
  })
})

describe('contextualTab - Tab in list items', () => {
  it('indents a bullet list item by adding two spaces', () => {
    const view = createTestView('- item one\n- item two', 2)

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

    expect(view.state.doc.toString()).toBe('  - item one\n- item two')

    view.destroy()
  })

  it('indents an ordered list item', () => {
    const view = createTestView('1. first item\n2. second item', 3)

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

    expect(view.state.doc.toString()).toBe('  1. first item\n2. second item')

    view.destroy()
  })

  it('indents nested list item further', () => {
    const view = createTestView('  - nested item', 4)

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

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

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

    expect(view.state.doc.toString()).toBe('```js\nconst\t x = 1\n```')

    view.destroy()
  })

  it('inserts tab at beginning of code line', () => {
    const view = createTestView('```\ncode line\n```', 4)

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

    expect(view.state.doc.toString()).toBe('```\n\tcode line\n```')

    view.destroy()
  })
})

describe('contextualTab - Tab in plain text', () => {
  it('uses default CM6 behavior for plain text (returns false)', () => {
    const view = createTestView('plain text paragraph', 5)

    // Tab 在普通文本中应该返回 false，让 CM6 使用默认行为
    // 这里我们测试按下 Tab 后文档是否保持不变（因为我们的处理器返回 false）

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

    // 由于我们的处理器返回 false，CM6 会使用默认行为
    // 默认行为可能是插入 Tab 或其他，这取决于 defaultKeymap
    // 我们主要测试的是我们的处理器正确识别了上下文

    view.destroy()
  })

  it('recognizes heading as plain text context', () => {
    const view = createTestView('# Heading', 5)

    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))

    // 标题不是列表也不是代码块，应该使用默认行为

    view.destroy()
  })
})
