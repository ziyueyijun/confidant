import { keymap } from '@codemirror/view'
import type { EditorView, Command } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

/**
 * Ticket #26: Ctrl+0~6 标题切换
 *
 * Ctrl+1~6 将当前行设置为对应级别标题（# 到 ######）
 * Ctrl+0 或重复按同级可取消为普通段落
 */

/**
 * 设置或取消标题级别
 * @param level 0 表示取消标题，1~6 表示标题级别
 */
function setHeading(level: number): Command {
  return (view: EditorView): boolean => {
    const { from } = view.state.selection.main
    const line = view.state.doc.lineAt(from)
    const lineText = line.text

    // 检测当前行是否已经是标题
    const match = lineText.match(/^(#{1,6})\s/)

    if (level === 0) {
      // 移除标题标记
      if (match) {
        view.dispatch({
          changes: { from: line.from, to: line.from + match[0].length, insert: '' }
        })
      }
    } else {
      const prefix = '#'.repeat(level) + ' '
      const currentLevel = match ? match[1].length : 0

      if (currentLevel === level) {
        // 重复按同级，取消标题
        view.dispatch({
          changes: { from: line.from, to: line.from + match![0].length, insert: '' }
        })
      } else if (match) {
        // 替换现有标题级别
        view.dispatch({
          changes: { from: line.from, to: line.from + match[0].length, insert: prefix }
        })
      } else {
        // 插入新标题标记
        view.dispatch({
          changes: { from: line.from, insert: prefix }
        })
      }
    }
    return true
  }
}

/**
 * 导出标题快捷键扩展
 */
export function headingKeymapExtension(): Extension {
  return keymap.of([
    { key: 'Ctrl-0', run: setHeading(0) },
    { key: 'Ctrl-1', run: setHeading(1) },
    { key: 'Ctrl-2', run: setHeading(2) },
    { key: 'Ctrl-3', run: setHeading(3) },
    { key: 'Ctrl-4', run: setHeading(4) },
    { key: 'Ctrl-5', run: setHeading(5) },
    { key: 'Ctrl-6', run: setHeading(6) }
  ])
}
