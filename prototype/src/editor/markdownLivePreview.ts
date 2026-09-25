/**
 * 原型：Markdown 所见即所得（live preview）扩展
 *
 * 规则：
 *   - 光标不在的那一行 → 隐藏 Markdown 语法标记，按渲染后的样子显示
 *   - 光标所在的那一行 → 显示语法标记（淡色），让用户能改
 *   - 表格 → 可编辑的 <table contenteditable>，敲字自动同步回 markdown
 *
 * ⚠️ 架构说明：
 *   widget 通过模块级 `_currentView` 访问编辑器，这样 input 事件触发时能提交
 *   transaction 把改动同步回 markdown。该引用由 updateListener 在每次 update 时刷新。
 */
import { EditorView, Decoration, WidgetType } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { EditorState, StateField } from '@codemirror/state'
import type { Extension, Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { parseTable, type ParsedTable } from './tableParser'

// ---------------------------------------------------------------------------
// 全局 view 引用（widget 通过它提交 transaction）
// ---------------------------------------------------------------------------

let _currentView: EditorView | null = null
function setCurrentView(v: EditorView) { _currentView = v }
function getCurrentView(): EditorView | null { return _currentView }

/**
 * 待接管焦点的单元格。
 *
 * 表格加行会让 widget 的 `eq()` 失配，CodeMirror 于是重建整个 widget DOM——
 * 旧单元格连同焦点一起被丢弃。重建后由**新 widget 自己**在 toDOM 里接管焦点，
 * 比事后用 querySelector 抢元素可靠：后者要赌 CM 在哪一帧完成重建。
 */
let _pendingFocus: { tableFrom: number; row: number; col: number } | null = null

// ---------------------------------------------------------------------------
// 可编辑表格 widget
// ---------------------------------------------------------------------------

class EditableTableWidget extends WidgetType {
  constructor(
    readonly parsed: ParsedTable,
    lines: string[],
    tableFrom: number,
    tableTo: number,
  ) {
    super()
    this.lines = lines
    this.tableFrom = tableFrom
    this.tableTo = tableTo
  }

  private lines: string[]
  private tableFrom: number
  private tableTo: number
  private view: EditorView | null = null

  eq(other: EditableTableWidget) {
    // 单元格内容由当前 DOM 直接维护；只要表格形状没变，就保留 DOM 和光标。
    return (
      other.parsed.headers.length === this.parsed.headers.length &&
      other.parsed.rows.length === this.parsed.rows.length &&
      JSON.stringify(other.parsed.aligns) === JSON.stringify(this.parsed.aligns)
    )
  }

  get editable() {
    // 让 CM 不插手这个 widget 的 contentEditable——由 toDOM 自己设为 "false"，
    // 理由见那里的注释。
    return true
  }

  toDOM(view: EditorView): HTMLElement {
    this.view = view

    const wrap = document.createElement('div')
    wrap.className = 'cm-editable-table'
    // ⚠️ 间距用 **margin 而不是 padding**。
    // padding 属于元素的命中区——表格上下那几像素的"空白"也会被点中，
    // 于是点表格上方的空白等于点表格，光标被 CodeMirror 吸附到替换区的
    // 起点（表格首行），按 ↑ 就跳到表格前面去了。margin 不属于命中区，
    // 点它等于点真正的空白。
    wrap.style.cssText = 'margin: 0.35em 0; overflow-x: auto;'
    // 必须是 "false"：cm-content 是可编辑的，contenteditable 会向下继承，
    // 于是 td 不算独立的 editing host——浏览器在原生 mousedown 时把焦点
    // 归一化到最近的 editing host（cm-content），单元格永远拿不到焦点。
    // 在这一层切断继承链，td 才成为自己的 editing host。
    wrap.contentEditable = 'false'

    const table = document.createElement('table')
    table.className = 'cm-md-table'
    table.style.cssText =
      'border-collapse: collapse; font-size: 0.94em; line-height: 1.6; min-width: 60%; width: 100%; border-spacing: 0;'

    // thead
    const thead = document.createElement('thead')
    const hRow = document.createElement('tr')
    this.parsed.headers.forEach((h, i) => {
      const th = document.createElement('th')
      this.initCell(th, i, 0, h)
      applyThStyle(th)
      hRow.appendChild(th)
    })
    thead.appendChild(hRow)
    table.appendChild(thead)

    // tbody
    const tbody = document.createElement('tbody')
    this.parsed.rows.forEach((row, rowIdx) => {
      const tr = document.createElement('tr')
      for (let colIdx = 0; colIdx < this.parsed.headers.length; colIdx++) {
        const td = document.createElement('td')
        this.initCell(td, colIdx, rowIdx + 1, row[colIdx] ?? '')
        applyAlign(td, this.parsed.aligns[colIdx])
        applyTdStyle(td)
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)
    wrap.appendChild(table)

    this.takePendingFocus(table)

    return wrap
  }

  /**
   * 若这个 widget 正是刚加完行的那张表，把焦点交给指定单元格。
   * 用 setTimeout 而非 rAF：toDOM 是同步调用的，DOM 尚未挂进文档，
   * 要等本轮任务结束（CM 完成 DOM 同步）后才聚焦得到。
   */
  private takePendingFocus(table: HTMLElement) {
    const pending = _pendingFocus
    if (!pending || pending.tableFrom !== this.tableFrom) return
    _pendingFocus = null
    setTimeout(() => {
      const cell = table.querySelector(
        `[data-row="${pending.row}"][data-col="${pending.col}"]`,
      ) as HTMLElement | null
      if (!cell || !document.contains(cell)) return
      focusCell(cell, true)
    }, 0)
  }

  /**
   * 让一个单元格（th 或 td）可编辑、可聚焦、可响应键盘。
   *
   * 行号用**视觉行号**：0 是表头，1..n 是数据行。整个 widget 内部统一用这套
   * 坐标，只有落到 doc 上时才换算成行索引（见 lineIndexOf）。
   */
  private initCell(el: HTMLElement, colIdx: number, visualRow: number, text: string) {
    el.contentEditable = 'true'
    // 没有 tabindex 时 focus() 静默失败——焦点会落到最近的可聚焦祖先
    // （cm-content），单元格永远拿不到键盘事件。tabindex=-1 只允许编程式
    // 聚焦，不把单元格塞进 Tab 序列（Tab 由 onCellKeydown 接管）。
    el.tabIndex = -1
    el.textContent = text
    el.dataset.row = String(visualRow)
    el.dataset.col = String(colIdx)
    el.addEventListener('mousedown', (e) => this.onCellMousedown(e as MouseEvent), { capture: true })
    el.addEventListener('input', (e) => this.onCellInput(e as InputEvent, colIdx, visualRow))
    el.addEventListener('keydown', (e) => this.onCellKeydown(e as KeyboardEvent, colIdx, visualRow))
  }

  /** 视觉行号 → this.lines 的下标（表头 0 / 分隔行 1 / 数据行 2..） */
  private lineIndexOf(visualRow: number): number {
    return visualRow === 0 ? 0 : visualRow + 1
  }

  ignoreEvent(event: Event): boolean {
    // 表格内部由 contenteditable 单元格处理；阻止 CodeMirror 把点击映射到隐藏源码。
    return event.type === 'mousedown' || event.type === 'mouseup' || event.type === 'click' || event.type === 'beforeinput' || event.type === 'input' || event.type === 'keydown'
  }

  // ------------------------------------------------------------------ input 同步
  private onCellMousedown(e: MouseEvent) {
    // capture 阶段：阻止浏览器 mousedown 默认 focus 行为，然后自己把焦点和
    // 插入点放到被点的单元格上（caretRangeFromPoint 按坐标定位）。
    e.preventDefault()
    const cell = e.currentTarget as HTMLElement
    cell.focus()
    const sel = window.getSelection()
    if (sel) {
      const range = document.caretRangeFromPoint
        ? document.caretRangeFromPoint(e.clientX, e.clientY)
        : null
      if (range) {
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
  }

  private onCellInput(_e: InputEvent, colIdx: number, visualRow: number) {
    const view = getCurrentView()
    if (!view) return

    const target = _e.target as HTMLElement
    const newText = target.textContent ?? ''
    const updatedLines = this.buildUpdatedLines(colIdx, visualRow, newText)
    const { from } = view.state.doc.lineAt(this.tableFrom)
    const currentEnd = Math.min(this.tableTo, view.state.doc.length)
    const currentText = view.state.doc.sliceString(from, currentEnd)
    const newContent = updatedLines.join('\n')

    if (newContent === currentText) return
    view.dispatch({ changes: { from, to: currentEnd, insert: newContent } })
  }

  private buildUpdatedLines(colIdx: number, visualRow: number, newText: string): string[] {
    const lines = [...this.lines]
    const lineIdx = this.lineIndexOf(visualRow)
    if (lineIdx < 0 || lineIdx >= lines.length) return lines
    const cells = splitCells(lines[lineIdx])
    while (cells.length < this.parsed.headers.length) cells.push('')
    cells[colIdx] = newText
    lines[lineIdx] = '| ' + cells.join(' | ') + ' |'
    return lines
  }

  // ------------------------------------------------------------------ 键盘导航
  private onCellKeydown(e: KeyboardEvent, colIdx: number, visualRow: number) {
    const totalCols = this.parsed.headers.length
    // 视觉行数含表头
    const totalRows = this.parsed.rows.length + 1

    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey && colIdx === 0 && visualRow > 0) {
        this.moveFocus(visualRow - 1, totalCols - 1)
      } else if (!e.shiftKey && colIdx === totalCols - 1 && visualRow + 1 < totalRows) {
        this.moveFocus(visualRow + 1, 0)
      } else if (!e.shiftKey && colIdx === totalCols - 1) {
        this.insertRowAfterLast()
      } else {
        const nextCol = e.shiftKey ? colIdx - 1 : colIdx + 1
        if (nextCol >= 0 && nextCol < totalCols) this.moveFocus(visualRow, nextCol)
      }
      return
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      if (visualRow + 1 < totalRows) {
        this.moveFocus(visualRow + 1, colIdx)
      } else {
        this.insertRowAfterLast()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (visualRow + 1 < totalRows) this.moveFocus(visualRow + 1, colIdx)
      else this.leaveTable('down')
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (visualRow > 0) this.moveFocus(visualRow - 1, colIdx)
      else this.leaveTable('up')
      return
    }
  }

  /**
   * 把光标移出表格。
   *
   * **必须有这条出口。** 否则焦点在表头按 ↑（或在最后一行按 ↓）时无处可去，
   * 用户会觉得"卡在表格里"——而点表格上下的空白想出去又不可靠
   * （那本来是 widget 的 padding 区，已改为 margin）。
   *
   * 出口位置：表格**源码区间之外**的相邻行。表格被整块替换成一个 widget，
   * 区间是 [tableFrom, tableTo]——光标必须落到区间外的行上，
   * 否则会被 CodeMirror 吸附回替换区起点。
   */
  private leaveTable(dir: 'up' | 'down') {
    const view = getCurrentView()
    if (!view) return
    const doc = view.state.doc
    const firstLine = doc.lineAt(this.tableFrom).number
    const lastLine = doc.lineAt(Math.min(this.tableTo, doc.length)).number

    const targetLineNo = dir === 'up' ? firstLine - 1 : lastLine + 1
    if (targetLineNo < 1 || targetLineNo > doc.lines) {
      // 表格就在文档首/尾，没有相邻行——在表格外补一行再落上去
      const insertAt = dir === 'up' ? this.tableFrom : Math.min(this.tableTo, doc.length)
      view.dispatch({
        changes: { from: insertAt, insert: dir === 'up' ? '\n' : '\n\n' },
        selection: { anchor: dir === 'up' ? this.tableFrom : this.tableTo + 2 },
      })
      view.focus()
      return
    }

    const target = doc.line(targetLineNo)
    view.dispatch({
      selection: { anchor: dir === 'up' ? target.to : target.from },
      effects: EditorView.scrollIntoView(dir === 'up' ? target.from : target.to, { y: 'nearest' }),
    })
    view.focus()
  }

  private insertRowAfterLast() {
    const view = getCurrentView()
    if (!view) return
    const newRow = '| ' + this.parsed.headers.map(() => '').join(' | ') + ' |'
    const insertPos = Math.min(this.tableTo, view.state.doc.length)
    // 新行的第一个单元格的 doc position 就在 insertPos + 2（"| " 之后）。
    const newRowStart = insertPos + 2
    // 交给重建后的 widget 接管焦点。表头的 tableFrom 不变——插入点在表格内部。
    // 视觉行号 = 数据行数 + 1（0 是表头）。
    _pendingFocus = { tableFrom: this.tableFrom, row: this.parsed.rows.length + 1, col: 0 }
    view.dispatch({
      changes: { from: insertPos, insert: '\n' + newRow },
      selection: { anchor: newRowStart },
    })
  }

  private moveFocus(visualRow: number, colIdx: number) {
    const view = getCurrentView()
    if (!view) return
    const pos = this.cellOffsetToDocPos(colIdx, visualRow)
    view.dispatch({ selection: { anchor: pos } })
    // 行数没变，widget DOM 不会被重建——单元格还在原处，可以直接聚焦。
    // 仍然留一次重试：selection 更新会让 CM 重排 DOM，极端情况下 td 会被替换。
    const td = this.getCellDOM(visualRow, colIdx)
    if (td) focusCell(td, false)
    else setTimeout(() => {
      const late = this.getCellDOM(visualRow, colIdx)
      if (late) focusCell(late, false)
    }, 0)
  }

  private cellOffsetToDocPos(colIdx: number, visualRow: number): number {
    const lineIdx = this.lineIndexOf(visualRow)
    let offset = 0
    for (let i = 0; i < lineIdx; i++) offset += (this.lines[i] ?? '').length + 1
    const cells = splitCells(this.lines[lineIdx] ?? '')
    for (let i = 0; i < colIdx && i < cells.length; i++) offset += cells[i].length + 3
    offset += 2
    return Math.min(this.tableFrom + offset, this.tableTo)
  }

  private getCellDOM(visualRow: number, colIdx: number): HTMLElement | null {
    const dom = _currentView?.dom
    if (!dom) return null
    return dom.querySelector(
      `[data-row="${visualRow}"][data-col="${colIdx}"]`,
    ) as HTMLElement | null
  }
}

// ---------------------------------------------------------------------------
// 行内装饰：粗体、斜体、行内代码、删除线、链接
// ---------------------------------------------------------------------------

export type SyntaxReveal = 'line' | 'marker' | 'never'

export interface PreviewOptions {
  reveal: SyntaxReveal
  renderTables: boolean
}

const MARK = (cls: string) => Decoration.mark({ class: cls })

function inlineDecorations(state: EditorState, o: PreviewOptions): Range<Decoration>[] {
  const out: Range<Decoration>[] = []
  const cursorLine = state.doc.lineAt(state.selection.main.head).number

  syntaxTree(state).iterate({
    enter: (node) => {
      const { name, from, to } = node
      const showSyntax =
        o.reveal === 'never'
          ? false
          : o.reveal === 'marker'
            ? isTouchingCursor(state, from, to)
            : state.doc.lineAt(from).number === cursorLine

      switch (name) {
        case 'StrongEmphasis':
          out.push(MARK('cm-md-bold').range(from, to))
          if (!showSyntax) hideDelimiters(state, from, to, out, 2, 2)
          break
        case 'Emphasis':
          out.push(MARK('cm-md-italic').range(from, to))
          if (!showSyntax) hideDelimiters(state, from, to, out, 1, 1)
          break
        case 'Strikethrough':
          out.push(MARK('cm-md-strike').range(from, to))
          if (!showSyntax) hideDelimiters(state, from, to, out, 2, 2)
          break
        case 'InlineCode':
          out.push(MARK('cm-md-code').range(from, to))
          if (!showSyntax) hideDelimiters(state, from, to, out, 1, 1)
          break
        case 'Link':
          out.push(MARK('cm-md-link').range(from, to))
          // 链接的 URL 部分太长会把正文撑乱；不显示语法时把它藏起来，
          // 只留方括号里的文字（与 Typora 一致）。
          if (!showSyntax) hideLinkUrl(state, from, to, out)
          break
        case 'Image':
          out.push(MARK('cm-md-image').range(from, to))
          break
        case 'URL':
          // 裸 URL 也标成链接色
          out.push(MARK('cm-md-link').range(from, to))
          break
      }
    },
  })
  return out
}

/** 藏掉 `[文字](url)` 里的 `](url)` 部分，只留 `文字`。 */
function hideLinkUrl(state: EditorState, from: number, to: number, out: Range<Decoration>[]) {
  const text = state.doc.sliceString(from, to)
  const close = text.lastIndexOf('](')
  if (close < 0) return
  const urlStart = from + close
  if (urlStart > from) out.push(Decoration.replace({}).range(urlStart, to))
}

function hideDelimiters(state: EditorState, from: number, to: number, out: Range<Decoration>[], openLen: number, closeLen: number) {
  const docLen = state.doc.length
  const openTo = Math.min(from + openLen, docLen)
  const closeFrom = Math.max(to - closeLen, openTo)
  if (openTo > from) out.push(Decoration.replace({}).range(from, openTo))
  if (to > closeFrom) out.push(Decoration.replace({}).range(closeFrom, to))
}

function isTouchingCursor(state: EditorState, from: number, to: number) {
  const head = state.selection.main.head
  return head >= from - 1 && head <= to + 1
}

// ---------------------------------------------------------------------------
// 块级装饰：标题、引用、列表、表格（可编辑）
// ---------------------------------------------------------------------------

const HEADING = ['cm-md-h1', 'cm-md-h2', 'cm-md-h3', 'cm-md-h3', 'cm-md-h3', 'cm-md-h3']

function blockDecorations(state: EditorState, o: PreviewOptions): Range<Decoration>[] {
  const out: Range<Decoration>[] = []
  const cursorLine = state.doc.lineAt(state.selection.main.head).number

  syntaxTree(state).iterate({
    enter: (node) => {
      const line = state.doc.lineAt(node.from)
      const showSyntax = o.reveal !== 'never' && line.number === cursorLine

      switch (node.name) {
        case 'ATXHeading1':
        case 'ATXHeading2':
        case 'ATXHeading3':
        case 'ATXHeading4':
        case 'ATXHeading5':
        case 'ATXHeading6': {
          const level = Number(node.name.slice(-1)) - 1
          out.push(MARK(HEADING[level] ?? 'cm-md-h3').range(line.from, line.to))
          if (!showSyntax) {
            const m = /^(#{1,6}\s+)/.exec(line.text)
            if (m) out.push(Decoration.replace({}).range(line.from, line.from + m[1].length))
          }
          break
        }
        case 'Blockquote': {
          let l = state.doc.lineAt(node.from)
          const end = node.to
          while (l.from <= end) {
            out.push(MARK('cm-md-quote').range(l.from, l.to))
            if (!showSyntax && l.number !== cursorLine) {
              const m = /^(>\s?)/.exec(l.text)
              if (m) out.push(Decoration.replace({}).range(l.from, l.from + m[1].length))
            }
            if (l.to >= end) break
            l = state.doc.line(l.number + 1)
          }
          break
        }
        case 'ListItem': {
          if (!showSyntax) {
            // 任务列表先判：`- [ ]` / `- [x]`。
            // **任务项不该同时画项目符号**——`- ` 和 `[ ]` 一起被勾选框替换掉，
            // 否则会看到 `•□ 文字` 两个标记叠着。
            const task = /^(\s*)([-*+])(\s+)\[([ xX])\]\s+/.exec(line.text)
            if (task) {
              const start = line.from + task[1].length
              const end = start + task[2].length + task[3].length + 3 + 1
              // 要改的是方括号**中间**那个字符（空格 / x），不是 `[` 本身——
              // 所以是 `[` 的位置再 +1。少了这个 +1 会读到 "["，
              // 于是点击静默失败（char 既不是空格也不是 x）。
              const bracketPos =
                line.from + task[1].length + task[2].length + task[3].length + 1
              out.push(
                Decoration.replace({
                  widget: new CheckboxWidget(task[4] !== ' ', bracketPos),
                  inclusive: false,
                }).range(start, end),
              )
              break
            }

            const m = /^(\s*)([-*+]|\d+\.)(\s+)/.exec(line.text)
            if (m) {
              const start = line.from + m[1].length
              out.push(
                Decoration.replace({
                  widget: new BulletWidget(m[2]),
                  inclusive: false,
                }).range(start, start + m[2].length + m[3].length),
              )
            }
          }
          break
        }

        // 代码块：整块加背景，围栏行（```）在光标不在时藏掉
        case 'FencedCode': {
          let l = state.doc.lineAt(node.from)
          const endLine = state.doc.lineAt(node.to).number
          while (l.number <= endLine) {
            out.push(MARK('cm-md-codeblock').range(l.from, l.to))
            if (!showSyntax && (l.number === state.doc.lineAt(node.from).number || l.number === endLine)) {
              out.push(Decoration.replace({}).range(l.from, l.to))
            }
            if (l.number === endLine) break
            l = state.doc.line(l.number + 1)
          }
          break
        }

        // 分割线：`---` 换成一条真正的横线
        case 'HorizontalRule': {
          if (!showSyntax) {
            out.push(
              Decoration.replace({ widget: new RuleWidget(), block: true }).range(
                line.from,
                line.to,
              ),
            )
          }
          break
        }

        // 表格：始终渲染可编辑 widget，用户直接在表格内编辑
        case 'Table': {
          if (!o.renderTables) break
          const fromLine = state.doc.lineAt(node.from).number
          const toLine = state.doc.lineAt(node.to).number

          const lines: string[] = []
          for (let n = fromLine; n <= toLine; n++) lines.push(state.doc.line(n).text)
          const parsed = parseTable(lines)
          if (!parsed) break

          const widget = new EditableTableWidget(parsed, lines, line.from, state.doc.line(toLine).to)
          out.push(Decoration.replace({ widget, block: true }).range(line.from, state.doc.line(toLine).to))
          break
        }
      }
    },
  })
  return out
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

class BulletWidget extends WidgetType {
  constructor(readonly marker: string) { super() }
  eq(other: BulletWidget) { return other.marker === this.marker }
  toDOM() {
    const span = document.createElement('span')
    span.className = 'cm-md-bullet'
    span.textContent = /\d/.test(this.marker) ? this.marker + ' ' : '•'
    return span
  }
  ignoreEvent() { return true }
}

/**
 * 任务列表的勾选框。
 *
 * **点得动**——点击把文档里的 `[ ]` 改成 `[x]`（或反过来）。
 * 这是「文件是唯一真相」的直接体现：勾选状态不活在应用里，
 * 它就是文件里的那一个字符。
 *
 * `bracketPos` 是 `[ ]` 里那个**空格/x 字符**在文档中的位置
 * （方括号本身不动，只换中间那一个字符）。
 */
class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly bracketPos: number,
  ) {
    super()
  }

  eq(other: CheckboxWidget) {
    return other.checked === this.checked && other.bracketPos === this.bracketPos
  }

  toDOM() {
    const box = document.createElement('span')
    box.className = `cm-md-checkbox${this.checked ? ' is-checked' : ''}`
    box.setAttribute('role', 'checkbox')
    box.setAttribute('aria-checked', String(this.checked))
    box.setAttribute('title', this.checked ? '点击取消勾选' : '点击勾选')
    box.textContent = this.checked ? '✓' : ''

    box.addEventListener('mousedown', (e) => {
      // 阻止 CodeMirror 把这次点击当成「把光标放到 widget 处」
      e.preventDefault()
      e.stopPropagation()
    })
    box.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const view = getCurrentView()
      if (!view) return
      // 只换方括号中间那一个字符，括号与其余内容原样不动
      const ch = view.state.doc.sliceString(this.bracketPos, this.bracketPos + 1)
      if (ch !== ' ' && ch !== 'x' && ch !== 'X') return
      const next = ch === ' ' ? 'x' : ' '
      view.dispatch({
        changes: { from: this.bracketPos, to: this.bracketPos + 1, insert: next },
      })
    })

    return box
  }

  ignoreEvent() {
    // 交给自己的 click 处理器；不让 CodeMirror 插手
    return true
  }
}

/** 分割线：一条横线，替换掉 `---` 那一行。 */
class RuleWidget extends WidgetType {
  eq() { return true }
  toDOM() {
    const hr = document.createElement('div')
    hr.className = 'cm-md-rule'
    return hr
  }
  ignoreEvent() { return true }
}

function splitCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim())
}

/** 把焦点和插入点放进单元格。atStart 决定光标落在内容开头还是结尾。 */
function focusCell(td: HTMLElement, atStart: boolean) {
  td.focus()
  const range = document.createRange()
  range.selectNodeContents(td)
  range.collapse(atStart)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

function applyAlign(el: HTMLElement, a: 'left' | 'center' | 'right' | null) {
  if (a) el.style.textAlign = a
}

function applyThStyle(th: HTMLElement) {
  th.style.cssText =
    'border: 1px solid #e2e8f0; padding: 0.35em 0.8em; text-align: left; background: #f8fafc; font-weight: 600; color: #334155; white-space: nowrap; outline: none;'
}

function applyTdStyle(td: HTMLElement) {
  td.style.cssText =
    'border: 1px solid #e2e8f0; padding: 0.35em 0.8em; text-align: left; white-space: nowrap; outline: none; cursor: cell;'
}

// ---------------------------------------------------------------------------
// StateField（必须用它 —— 见文件头注释）
// ---------------------------------------------------------------------------

function build(state: EditorState, o: PreviewOptions): DecorationSet {
  const ranges: Range<Decoration>[] = [
    ...blockDecorations(state, o),
    ...inlineDecorations(state, o),
  ]
  return Decoration.set(ranges, true)
}

export function markdownLivePreview(options: PreviewOptions): Extension {
  // 同步 view 引用到模块变量，让 widget 能访问
  const viewListener = EditorView.updateListener.of((u) => {
    if (u.view) setCurrentView(u.view)
  })

  const field = StateField.define<DecorationSet>({
    create: (state) => build(state, options),
    // view 引用由 viewListener 维护；Transaction 上没有 view，这里不去碰它。
    update: (value, tr) => {
      if (tr.docChanged || tr.selection) return build(tr.state, options)
      return value.map(tr.changes)
    },
    provide: (f) => EditorView.decorations.from(f),
  })

  return [viewListener, field]
}
