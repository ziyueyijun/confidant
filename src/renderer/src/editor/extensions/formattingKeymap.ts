import { keymap } from '@codemirror/view'
import { EditorSelection, type Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

/**
 * Ticket #26: Ctrl+B/I 粗体斜体切换
 *
 * 对选中文本或光标处应用/取消粗体（**text**）或斜体（*text*）标记。
 * 如果已有标记则移除，否则添加。
 */

/**
 * 切换粗体标记（**）
 */
function toggleBold(view: EditorView): boolean {
  const { from, to } = view.state.selection.main
  const text = view.state.doc.sliceString(from, to)

  // 检查前后是否已有 ** 标记
  const before = view.state.doc.sliceString(Math.max(0, from - 2), from)
  const after = view.state.doc.sliceString(to, Math.min(view.state.doc.length, to + 2))

  if (before === '**' && after === '**') {
    // 移除粗体标记
    view.dispatch({
      changes: [
        { from: from - 2, to: from },
        { from: to, to: to + 2 }
      ],
      selection: EditorSelection.range(from - 2, to - 2)
    })
  } else {
    // 添加粗体标记
    const newText = `**${text}**`
    view.dispatch({
      changes: { from, to, insert: newText },
      selection: EditorSelection.range(from + 2, from + 2 + text.length)
    })
  }
  return true
}

/**
 * 切换斜体标记（*）
 */
function toggleItalic(view: EditorView): boolean {
  const { from, to } = view.state.selection.main
  const text = view.state.doc.sliceString(from, to)

  // 检查前后是否已有 * 标记（需要排除 ** 的情况）
  const before = view.state.doc.sliceString(Math.max(0, from - 1), from)
  const after = view.state.doc.sliceString(to, Math.min(view.state.doc.length, to + 1))
  const beforeBefore = view.state.doc.sliceString(Math.max(0, from - 2), from - 1)
  const afterAfter = view.state.doc.sliceString(to + 1, Math.min(view.state.doc.length, to + 2))

  // 确保是单个 * 而不是 ** 的一部分
  if (before === '*' && after === '*' && beforeBefore !== '*' && afterAfter !== '*') {
    // 移除斜体标记
    view.dispatch({
      changes: [
        { from: from - 1, to: from },
        { from: to, to: to + 1 }
      ],
      selection: EditorSelection.range(from - 1, to - 1)
    })
  } else {
    // 添加斜体标记
    const newText = `*${text}*`
    view.dispatch({
      changes: { from, to, insert: newText },
      selection: EditorSelection.range(from + 1, from + 1 + text.length)
    })
  }
  return true
}

/**
 * 导出格式化快捷键扩展
 */
export function formattingKeymapExtension(): Extension {
  return keymap.of([
    { key: 'Ctrl-b', run: toggleBold },
    { key: 'Ctrl-i', run: toggleItalic }
  ])
}
