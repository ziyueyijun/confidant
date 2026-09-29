import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { StateField, StateEffect } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'

/**
 * Ticket #25: 表格整块编辑模式
 *
 * 需求：
 * 1. 表格默认以渲染态展示（网格、边框）
 * 2. 点击表格切换为源码编辑模式
 * 3. 失焦后自动切回渲染态
 * 4. 源码模式下 Tab 键跳转单元格
 */

// StateEffect 用于切换表格的编辑/渲染模式
export const toggleTableEdit = StateEffect.define<{ from: number; to: number }>()

// StateField 记录当前正在编辑的表格范围
export const editingTableField = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(toggleTableEdit)) {
        // 如果点击同一个表格，切回渲染态（toggle）
        return value && value.from === effect.value.from ? null : effect.value
      }
    }
    return value
  }
})

/**
 * 解析 Markdown 表格为二维数组
 */
export function parseMarkdownTable(markdown: string): string[][] {
  const lines = markdown.trim().split('\n')
  return lines
    .filter((_line, i) => i !== 1) // 跳过对齐行（第二行）
    .map((line) =>
      line
        .split('|')
        .slice(1, -1) // 移除首尾空白 |
        .map((cell) => cell.trim())
    )
}

/**
 * 渲染表格为 HTML
 */
export function renderTableHTML(rows: string[][]): string {
  if (rows.length === 0) return '<table></table>'

  const [header, ...body] = rows
  let html = '<table style="border-collapse: collapse; width: 100%;">'

  html += '<thead><tr>'
  header.forEach((cell) => {
    html += `<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5; font-weight: bold; text-align: left;">${escapeHtml(
      cell
    )}</th>`
  })
  html += '</tr></thead>'

  html += '<tbody>'
  body.forEach((row) => {
    html += '<tr>'
    row.forEach((cell) => {
      html += `<td style="border: 1px solid #ddd; padding: 8px;">${escapeHtml(cell)}</td>`
    })
    html += '</tr>'
  })
  html += '</tbody></table>'

  return html
}

/**
 * HTML 转义，防止 XSS
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * 表格渲染 Widget
 */
class TableWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly markdown: string
  ) {
    super()
  }

  toDOM(view: EditorView): HTMLElement {
    const container = document.createElement('div')
    container.className = 'table-widget'
    container.style.cssText =
      'border: 1px solid #ddd; margin: 8px 0; cursor: pointer; padding: 4px;'

    try {
      const table = parseMarkdownTable(this.markdown)
      container.innerHTML = renderTableHTML(table)
    } catch (e) {
      container.textContent = '⚠️ 表格解析失败'
      container.style.color = '#d32f2f'
    }

    // 点击切换到源码编辑模式
    container.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      view.dispatch({
        effects: toggleTableEdit.of({ from: this.from, to: this.to }),
        selection: { anchor: this.from }
      })
      view.focus()
    }

    // Hover 效果
    container.onmouseenter = () => {
      container.style.borderColor = '#999'
    }
    container.onmouseleave = () => {
      container.style.borderColor = '#ddd'
    }

    return container
  }

  ignoreEvent(event: Event): boolean {
    return event.type !== 'mousedown'
  }

  eq(other: TableWidget): boolean {
    return this.markdown === other.markdown && this.from === other.from && this.to === other.to
  }
}

/**
 * 构建表格装饰
 */
function buildTableDecorations(state: EditorState): DecorationSet {
  const decorations: any[] = []
  const editingTable = state.field(editingTableField)
  const cursorPos = state.selection.main.head

  const tree = syntaxTree(state)
  tree.iterate({
    enter: (node) => {
      if (node.name === 'Table') {
        const from = node.from
        const to = node.to

        // 如果这个表格正在编辑，不渲染 widget
        if (editingTable && editingTable.from === from) {
          return
        }

        // 如果光标在表格内，不渲染 widget（允许编辑）
        if (cursorPos >= from && cursorPos <= to) {
          return
        }

        const markdown = state.doc.sliceString(from, to)
        decorations.push(
          Decoration.replace({
            widget: new TableWidget(from, to, markdown),
            block: true
          }).range(from, to)
        )
      }
    }
  })

  return Decoration.set(decorations)
}

/**
 * 表格渲染插件
 */
const tablePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildTableDecorations(view.state)
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        update.state.field(editingTableField) !== update.startState.field(editingTableField)
      ) {
        this.decorations = buildTableDecorations(update.view.state)
      }
    }
  },
  {
    decorations: (v) => v.decorations
  }
)

/**
 * 失焦处理：自动退出表格编辑模式
 */
const tableFocusHandler = EditorView.domEventHandlers({
  blur(_event, view) {
    const editingTable = view.state.field(editingTableField)
    if (editingTable) {
      // 短暂延迟，确保点击表格时不会立即切回渲染态
      setTimeout(() => {
        view.dispatch({
          effects: toggleTableEdit.of(editingTable)
        })
      }, 100)
    }
  }
})

/**
 * 导出表格 widget 扩展
 */
export function tableWidgetExtension() {
  return [editingTableField, tablePlugin, tableFocusHandler]
}
