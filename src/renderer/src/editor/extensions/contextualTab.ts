import { keymap } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'

/**
 * Ticket #26: Tab/Shift+Tab 上下文相关行为
 *
 * - 在列表项内：Tab 缩进（增加两个空格），Shift+Tab 反缩进
 * - 在代码块内：插入制表符
 * - 其他上下文：使用 CM6 默认行为
 */

/**
 * 检查节点或其祖先是否匹配指定的类型名称模式
 */
function findAncestor(node: SyntaxNode | null, predicate: (name: string) => boolean): SyntaxNode | null {
  let cur = node
  while (cur) {
    if (predicate(cur.type.name)) {
      return cur
    }
    cur = cur.parent
  }
  return null
}

/**
 * 上下文相关的 Tab 处理
 */
function contextualTab(view: EditorView): boolean {
  const { from } = view.state.selection.main
  const tree = syntaxTree(view.state)
  const node = tree.resolveInner(from, -1)

  // 检查是否在列表项内
  const listNode = findAncestor(node, (name) =>
    name.includes('ListItem') || name === 'BulletList' || name === 'OrderedList'
  )

  if (listNode) {
    // 在列表项内，执行缩进（在行首添加两个空格）
    const line = view.state.doc.lineAt(from)
    view.dispatch({
      changes: { from: line.from, insert: '  ' }
    })
    return true
  }

  // 检查是否在代码块内
  const codeNode = findAncestor(node, (name) =>
    name === 'FencedCode' || name === 'CodeBlock' || name === 'InlineCode'
  )

  if (codeNode) {
    // 在代码块内，插入制表符
    view.dispatch({
      changes: { from, insert: '\t' }
    })
    return true
  }

  // 其他上下文：返回 false 让 CM6 使用默认行为
  return false
}

/**
 * 上下文相关的 Shift+Tab 处理（反缩进）
 */
function contextualShiftTab(view: EditorView): boolean {
  const { from } = view.state.selection.main
  const tree = syntaxTree(view.state)
  const node = tree.resolveInner(from, -1)

  // 检查是否在列表项内
  const listNode = findAncestor(node, (name) =>
    name.includes('ListItem') || name === 'BulletList' || name === 'OrderedList'
  )

  if (listNode) {
    // 在列表项内，执行反缩进（移除行首最多两个空格）
    const line = view.state.doc.lineAt(from)
    const lineText = line.text

    // 计算要移除的空格数（最多 2 个）
    let spacesToRemove = 0
    for (let i = 0; i < Math.min(2, lineText.length); i++) {
      if (lineText[i] === ' ') {
        spacesToRemove++
      } else {
        break
      }
    }

    if (spacesToRemove > 0) {
      view.dispatch({
        changes: { from: line.from, to: line.from + spacesToRemove }
      })
    }
    return true
  }

  // 其他上下文：返回 false 让 CM6 使用默认行为
  return false
}

/**
 * 导出上下文相关 Tab 扩展
 */
export function contextualTabExtension(): Extension {
  return keymap.of([
    { key: 'Tab', run: contextualTab },
    { key: 'Shift-Tab', run: contextualShiftTab }
  ])
}
