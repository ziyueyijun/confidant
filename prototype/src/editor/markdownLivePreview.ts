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
import { EditorView, Decoration, WidgetType, keymap, ViewPlugin } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { EditorSelection, EditorState, Prec, StateField } from '@codemirror/state'
import type { Extension, Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { undo as cmUndo, redo as cmRedo } from '@codemirror/commands'
import {
  parseTable,
  serializeTable,
  insertTableRow,
  insertTableRows,
  deleteTableRow,
  insertTableColumn,
  insertTableColumns,
  deleteTableColumn,
  type ParsedTable,
} from './tableParser'
import hljs from 'highlight.js'

// ---------------------------------------------------------------------------
// 全局 view 引用（widget 通过它提交 transaction）
// ---------------------------------------------------------------------------

let _currentView: EditorView | null = null
function setCurrentView(v: EditorView) { _currentView = v }
function getCurrentView(): EditorView | null { return _currentView }
if (typeof window !== 'undefined') {
  ;(window as any).__cmDebug = {
    get view() { return _currentView },
    dumpDoc() {
      const v = _currentView
      if (!v) return 'no view'
      const out = []
      for (let n = 1; n <= v.state.doc.lines; n++) {
        out.push(n + ': ' + v.state.doc.line(n).text.slice(0, 50))
      }
      return out.join('\n')
    },
    dumpDom() {
      const v = _currentView
      if (!v) return 'no view'
      const lines = v.contentDOM.querySelectorAll('.cm-line')
      const out = []
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]
        const r = l.getBoundingClientRect()
        out.push(`D${i} top=${Math.round(r.top)} h=${Math.round(r.height)} cls=${l.className.slice(0, 20)} | ${(l.textContent ?? '').slice(0, 30)}`)
      }
      return out.join('\n')
    },
    posAtY(y: number) {
      const v = _currentView
      if (!v) return 'no view'
      // posAtCoords 直接返回文档位置（number），不是 { pos } 对象
      const pos = v.posAtCoords({ x: 100, y })
      if (pos == null) return 'null'
      const line = v.state.doc.lineAt(pos)
      return `pos=${pos} line=${line.number} text="${line.text.slice(0, 30)}"`
    },
  }
}

/**
 * 待接管焦点的单元格。
 *
 * 表格加行会让 widget 的 `eq()` 失配，CodeMirror 于是重建整个 widget DOM——
 * 旧单元格连同焦点一起被丢弃。重建后由**新 widget 自己**在 toDOM 里接管焦点，
 * 比事后用 querySelector 抢元素可靠：后者要赌 CM 在哪一帧完成重建。
 */
let _pendingFocus: { tableFrom: number; row: number; col: number } | null = null

// ---------------------------------------------------------------------------
// 表格的读写——**一律从文档现读，不存快照**
// ---------------------------------------------------------------------------

/**
 * 表格的当前状态。
 *
 * ⚠️ **不要把它缓存到 widget 字段里。** widget 的 `eq()` 只比形状，
 * 所以打完一个单元格再打另一个时 DOM 会被复用、widget 实例不会重建，
 * 而文档已经变了——缓存下来的 `lines` 会把前一个单元格的改动覆盖回去。
 * 这个 bug 真的发生过：改 `27%` 为 `AAA`，再去改另一个格子，`27%` 就回来了。
 * 每次要用就现读，读的是唯一真相。
 */
interface LiveTable {
  parsed: ParsedTable
  lines: string[]
  from: number
  to: number
}

function readTableAt(view: EditorView, tableFrom: number): LiveTable | null {
  const doc = view.state.doc
  if (tableFrom > doc.length) return null
  const start = doc.lineAt(tableFrom)
  const lines: string[] = []
  // 表格是**连续的、每行都含 `|` 的若干行**。遇到第一个不含 `|` 的行就结束——
  // 这是 GFM 表格的边界，也是 syntaxTree 给的 Table 节点范围的等价描述。
  for (let n = start.number; n <= doc.lines; n++) {
    const l = doc.line(n)
    if (!l.text.includes('|')) break
    lines.push(l.text)
  }
  const parsed = parseTable(lines)
  if (!parsed) return null
  const last = doc.line(start.number + lines.length - 1)
  return { parsed, lines, from: start.from, to: last.to }
}

/** 把新的表格结构写回文档，并安排焦点落到指定单元格。 */
function writeTableAt(view: EditorView, cur: LiveTable, next: ParsedTable, focus: { row: number; col: number }) {
  const lines = serializeTable(next)
  _pendingFocus = { tableFrom: cur.from, row: focus.row, col: focus.col }
  view.dispatch({ changes: { from: cur.from, to: cur.to, insert: lines.join('\n') } })
  view.focus()
  // 形状没变时 widget 不会重建，toDOM 也就不会来取走 _pendingFocus——
  // 留着它会让**下一次**重建时焦点莫名其妙地跳走。widget 自己的 setTimeout
  // 先于这一个执行，所以这里只清理没被取走的那份。
  const mine = _pendingFocus
  setTimeout(() => { if (_pendingFocus === mine) _pendingFocus = null }, 0)
}

/** 在右键菜单里执行一次表格结构改动。`op` 拿当前结构，还一份新结构和落点。 */
function applyTableOp(
  target: TableTarget,
  op: (t: ParsedTable) => { table: ParsedTable; focus: { row: number; col: number } } | null,
) {
  const view = getCurrentView()
  if (!view) return
  const cur = readTableAt(view, target.tableFrom)
  if (!cur) return
  const res = op(cur.parsed)
  if (!res) return
  writeTableAt(view, cur, res.table, res.focus)
}

// ---------------------------------------------------------------------------
// 表格右键菜单
// ---------------------------------------------------------------------------

/**
 * 菜单项左侧的小图标。
 *
 * 用图标承载「往哪个方向」，文字就不用再重复一遍方向词——「在上方插入行」
 * 和「在下方插入行」两行字读起来几乎一样，一眼扫过去分不出差别，而箭头
 * 是**形状**，不用读就能分辨。删除类共用垃圾桶，靠文字区分删的是行还是列。
 */
type IconName = 'up' | 'down' | 'left' | 'right' | 'trash'

const ICON_PATHS: Record<IconName, string> = {
  up: 'M8 12.5V3.5M8 3.5L4.5 7M8 3.5L11.5 7',
  down: 'M8 3.5V12.5M8 12.5L4.5 9M8 12.5L11.5 9',
  left: 'M12.5 8H3.5M3.5 8L7 4.5M3.5 8L7 11.5',
  right: 'M3.5 8H12.5M12.5 8L9 4.5M12.5 8L9 11.5',
  trash: 'M3.5 5h9M6.5 5V3.5h3V5M5 5l.5 8h5l.5-8',
}

function icon(name: IconName, cls = 'text-slate-400 dark:text-neutral-400'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.4')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('class', `shrink-0 ${cls}`)
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', ICON_PATHS[name])
  svg.appendChild(path)
  return svg
}

interface TableTarget {
  tableFrom: number
  /** 视觉行号：0 是表头，1..n 是数据行 */
  visualRow: number
  col: number
}

let _menuEl: HTMLElement | null = null
let _menuCleanup: (() => void) | null = null

/** 关掉菜单。**只有这一个出口**，监听器的摘除跟着一起做，免得越积越多。 */
function closeTableMenu() {
  _menuEl?.remove()
  _menuEl = null
  _menuCleanup?.()
  _menuCleanup = null
}

/**
 * 在指针处弹出表格菜单。
 *
 * 菜单挂在 `document.body` 上而不是 widget 里——widget 的 DOM 会被
 * CodeMirror 重建，菜单要是住在里面就会被连带销毁。挂出去之后，
 * 菜单项只靠 `tableFrom + 行号 + 列号` 定位，不持有 widget 实例。
 */
function openTableMenu(clientX: number, clientY: number, target: TableTarget) {
  closeTableMenu()
  const view = getCurrentView()
  if (!view) return
  const cur = readTableAt(view, target.tableFrom)
  if (!cur) return

  const totalCols = cur.parsed.headers.length
  const totalRows = cur.parsed.rows.length + 1
  const onHeader = target.visualRow === 0

  type Item =
    | {
        kind: 'action'
        label: string
        /** 左侧图标承载「往哪个方向」——文字就不用再重复一遍方向 */
        icon?: IconName
        hint?: string
        disabled?: boolean
        /** 破坏性操作：悬停用红色。删除不该和插入长得一样 */
        danger?: boolean
        run: () => void
      }
    /** 带数量输入的一项：填几就加几 */
    | { kind: 'count'; label: string; icon?: IconName; unit: string; run: (n: number) => void }
    | 'sep'

  // 按「行 / 列 / 删除」分三组。同组内的项彼此可比（都在动同一个维度），
  // 跨组的用分隔线断开——11 项平铺成一列时，找「删列」要逐行读过去。
  const items: Item[] = [
    {
      kind: 'action',
      label: '在上方插入行',
      icon: 'up',
      disabled: onHeader,
      run: () =>
        applyTableOp(target, (t) => ({
          table: insertTableRow(t, target.visualRow - 1),
          focus: { row: target.visualRow, col: target.col },
        })),
    },
    {
      kind: 'action',
      label: '在下方插入行',
      icon: 'down',
      run: () =>
        applyTableOp(target, (t) => ({
          table: insertTableRow(t, target.visualRow),
          focus: { row: target.visualRow + 1, col: target.col },
        })),
    },
    {
      kind: 'count',
      label: '添加多行',
      icon: 'down',
      unit: '行',
      run: (n) =>
        applyTableOp(target, (t) => ({
          table: insertTableRows(t, target.visualRow, n),
          focus: { row: target.visualRow + 1, col: target.col },
        })),
    },
    'sep',
    {
      kind: 'action',
      label: '在左侧插入列',
      icon: 'left',
      run: () =>
        applyTableOp(target, (t) => ({
          table: insertTableColumn(t, target.col),
          focus: { row: target.visualRow, col: target.col },
        })),
    },
    {
      kind: 'action',
      label: '在右侧插入列',
      icon: 'right',
      run: () =>
        applyTableOp(target, (t) => ({
          table: insertTableColumn(t, target.col + 1),
          focus: { row: target.visualRow, col: target.col + 1 },
        })),
    },
    {
      kind: 'count',
      label: '添加多列',
      icon: 'right',
      unit: '列',
      run: (n) =>
        applyTableOp(target, (t) => ({
          table: insertTableColumns(t, target.col + 1, n),
          focus: { row: target.visualRow, col: target.col + 1 },
        })),
    },
    'sep',
    {
      kind: 'action',
      label: '删除本行',
      icon: 'trash',
      danger: true,
      disabled: onHeader,
      hint: onHeader ? '表头删不掉' : undefined,
      run: () =>
        applyTableOp(target, (t) => {
          const next = deleteTableRow(t, target.visualRow - 1)
          return {
            table: next,
            focus: { row: Math.min(target.visualRow, next.rows.length), col: target.col },
          }
        }),
    },
    {
      kind: 'action',
      label: '删除本列',
      icon: 'trash',
      danger: true,
      disabled: totalCols <= 1,
      hint: totalCols <= 1 ? '至少要留一列' : undefined,
      run: () =>
        applyTableOp(target, (t) => {
          const next = deleteTableColumn(t, target.col)
          return {
            table: next,
            focus: { row: target.visualRow, col: Math.min(target.col, next.headers.length - 1) },
          }
        }),
    },
    {
      kind: 'action',
      label: '删除整个表格',
      icon: 'trash',
      danger: true,
      run: () => deleteTableAt(target),
    },
  ]

  const menu = document.createElement('div')
  // 宽度要装得下「添加多行 [3] 行 添加」这一行，窄了它会折成三行
  // cm-table-menu 是给测试用的稳定钩子——Tailwind 的 z-[100] 类名在 CSS 选择器里
  // 要转义，测试写起来又长又容易错。
  menu.className =
    'cm-table-menu fixed z-[100] w-56 select-none overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-2xl ring-1 ring-black/5 dark:border-neutral-700 dark:bg-neutral-800 dark:ring-white/10'

  // 顶部标注「右键的是哪一格」——没有它，用户点「删除本行」前得自己数一遍。
  // 用浅底把标题和菜单项分开：它是一句说明，不是可点的项。
  const header = document.createElement('div')
  header.className = 'mb-1 border-b border-slate-100 bg-slate-50/70 px-3 py-1.5 text-xs text-slate-500 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-400'
  header.textContent = `${onHeader ? '表头' : `第 ${target.visualRow} 行`} · 第 ${target.col + 1} 列`
  menu.appendChild(header)

  for (const item of items) {
    if (item === 'sep') {
      const hr = document.createElement('div')
      hr.className = 'mx-2 my-1 h-px bg-slate-100 dark:bg-neutral-700'
      menu.appendChild(hr)
      continue
    }
    if (item.kind === 'count') {
      menu.appendChild(makeCountRow(item))
      continue
    }
    const btn = document.createElement('button')
    // 悬停色分两档：插入类是蓝的，删除类是红的。删除不该和插入长得一样——
    // 两者在这个菜单里挨着，视觉上区分开才不至于点错。
    const hover = item.danger
      ? 'hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/40 dark:hover:text-red-400'
      : 'hover:bg-blue-50 hover:text-blue-900 dark:hover:bg-blue-950/40 dark:hover:text-blue-300'
    btn.className = `flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition ${
      item.disabled ? 'cursor-default text-slate-300 dark:text-neutral-600' : `text-slate-700 dark:text-neutral-200 ${hover}`
    }`
    if (item.icon) btn.appendChild(icon(item.icon, item.disabled ? 'text-slate-200 dark:text-neutral-700' : 'text-slate-400 dark:text-neutral-400'))
    const text = document.createElement('span')
    text.textContent = item.label
    btn.appendChild(text)
    if (item.hint) {
      const h = document.createElement('span')
      h.className = 'ml-auto text-[10px] text-slate-300 dark:text-neutral-600'
      h.textContent = item.hint
      btn.appendChild(h)
    }
    if (!item.disabled) {
      // mousedown 要拦下来：否则焦点离开单元格，菜单还没执行就先丢了上下文
      btn.addEventListener('mousedown', (e) => e.preventDefault())
      btn.addEventListener('click', () => {
        closeTableMenu()
        item.run()
      })
    }
    menu.appendChild(btn)
  }

  document.body.appendChild(menu)
  _menuEl = menu

  // 贴边时往回收，别让菜单跑到窗口外
  const rect = menu.getBoundingClientRect()
  const left = Math.min(clientX, window.innerWidth - rect.width - 8)
  const top =
    clientY + rect.height > window.innerHeight - 8 ? clientY - rect.height : clientY
  menu.style.left = `${Math.max(8, left)}px`
  menu.style.top = `${Math.max(8, top)}px`

  const onOutside = (e: MouseEvent) => {
    if (!menu.contains(e.target as Node)) closeTableMenu()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeTableMenu()
  }
  document.addEventListener('mousedown', onOutside, true)
  document.addEventListener('keydown', onKey, true)
  // 滚动或改窗口大小都会让菜单脱离它标注的那一格，直接关掉比重新定位简单。
  // ⚠️ scroll 监听必须**延迟一帧**再加：右键这一下会让单元格拿到焦点，
  // CodeMirror 随即把目标滚进视口——那个滚动是右键自己的副作用，不是用户
  // 在滚页面，立刻监听会被它自己关掉，菜单一闪就没。
  requestAnimationFrame(() => {
    // 这一帧里菜单可能已经被关掉了（点了别处、按了 Esc），那就别再绑监听——
    // 绑了没人摘，会一直留着
    if (_menuEl !== menu) return
    window.addEventListener('scroll', closeTableMenu, true)
  })
  window.addEventListener('resize', closeTableMenu)
  _menuCleanup = () => {
    document.removeEventListener('mousedown', onOutside, true)
    document.removeEventListener('keydown', onKey, true)
    window.removeEventListener('resize', closeTableMenu)
    window.removeEventListener('scroll', closeTableMenu, true)
  }
}

/**
 * 「按数量添加」那一行：一个数字输入框 + 单位 + 确定。
 *
 * 为什么不把数量做成菜单项的子菜单：子菜单要点两次才到，而这里最常见的情形
 * 就是加 1 行——那已经有「在下方插入行」了。这一项服务的是「一次加好几行」，
 * 所以直接给一个能敲数字的框，敲完回车。
 *
 * 输入框与确定按钮都住在菜单里，所以菜单的「点外面关掉」和 Escape 逻辑
 * 不用改：点它们算菜单内部。
 */
function makeCountRow(item: { label: string; icon?: IconName; unit: string; run: (n: number) => void }): HTMLElement {
  const row = document.createElement('div')
  // nowrap：这一行是「图标 + 标签 + 输入框 + 单位 + 按钮」五件，折行会散成一团
  row.className = 'flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-xs text-slate-700 dark:text-neutral-200'

  if (item.icon) row.appendChild(icon(item.icon))

  const label = document.createElement('span')
  label.textContent = item.label
  row.appendChild(label)

  const input = document.createElement('input')
  input.type = 'number'
  input.min = '1'
  input.step = '1'
  input.value = '1'
  // 数字输入框默认带上下箭头（spinner），在这里挤且没用——键盘就能改
  input.className =
    'ml-auto w-10 shrink-0 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-right text-xs text-slate-700 outline-none transition [appearance:textfield] focus:border-blue-400 focus:bg-white dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:focus:border-blue-500 dark:focus:bg-neutral-900 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
  input.setAttribute('aria-label', `${item.label}的数量（${item.unit}）`)
  row.appendChild(input)

  const unit = document.createElement('span')
  unit.className = 'shrink-0 text-slate-400 dark:text-neutral-500'
  unit.textContent = item.unit
  row.appendChild(unit)

  const go = document.createElement('button')
  go.className =
    'shrink-0 rounded bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-white transition hover:bg-slate-800 dark:bg-neutral-200 dark:text-neutral-900 dark:hover:bg-white'
  go.textContent = '添加'
  go.setAttribute('aria-label', `确认${item.label}`)

  const submit = () => {
    // 空值、0、负数、小数、非数字都归到 1——这里不值得为输入校验弹错误，
    // 用户想加东西，最不济加一行/一列，比什么都不做或者报错要好。
    const raw = Number.parseInt(input.value, 10)
    const n = Number.isFinite(raw) && raw > 0 ? raw : 1
    closeTableMenu()
    item.run(n)
  }

  go.addEventListener('mousedown', (e) => e.preventDefault())
  go.addEventListener('click', submit)
  // 输入框里的回车＝确定。要拦掉冒泡，否则会传到编辑器那边去。
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      submit()
    }
    // Escape 留给菜单关闭（document 上的捕获监听），这里不拦
  })
  row.appendChild(go)

  // 点这一行的空白处也把光标送进输入框——一行里只有 11 个单位宽是输入区，
  // 点不中会显得这一项「点了没反应」。
  row.addEventListener('mousedown', (e) => {
    if (e.target !== input && e.target !== go) {
      e.preventDefault()
      input.focus()
      input.select()
    }
  })

  return row
}

/**
 * 删掉整张表。
 *
 * 表格前后通常各有一个空行。只删表格本身会留下**两个**空行（原来的一对
 * 挤在一起），所以连表格两侧的换行一起收掉一个——结果是原位留一个空行，
 * 和表格在时的排版一致。
 */
function deleteTableAt(target: TableTarget) {
  const view = getCurrentView()
  if (!view) return
  const cur = readTableAt(view, target.tableFrom)
  if (!cur) return
  const doc = view.state.doc
  let { from, to } = cur
  const hasLeadNewline = from > 0 && doc.sliceString(from - 1, from) === '\n'
  const hasTrailNewline = to < doc.length && doc.sliceString(to, to + 1) === '\n'
  if (hasLeadNewline) {
    from -= 1
    if (hasTrailNewline) to += 1
  } else if (hasTrailNewline) {
    to += 1
  }
  view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } })
  view.focus()
}

// ---------------------------------------------------------------------------
// 可编辑表格 widget
// ---------------------------------------------------------------------------

class EditableTableWidget extends WidgetType {
  constructor(
    readonly parsed: ParsedTable,
    readonly tableFrom: number,
  ) {
    super()
  }

  /**
   * 这个 widget 与另一个是否**完全相同**。
   *
   * ⚠️ 内容也要比。这是 CM6 的契约：`eq()` 回答「是否完全相同」，
   * 内容不同就该返回 false，好让 CM 去调 `updateDOM` 把 DOM 追上。
   * 曾经这里只比形状，于是**撤销**（只改内容、不改形状）被判为「一样」，
   * CM 走 `Reused.Full` 连 `updateDOM` 都不调——文档回退了，DOM 却停在
   * 撤销之前的样子，用户看到的就是「Ctrl+Z 没反应」。
   *
   * 打字不会因此重建 DOM：内容变了 → `eq` 为 false → CM 调 `updateDOM`，
   * 它认出形状没变、且被编辑的那一格 DOM 与文档本就一致，于是不写任何东西，
   * 只把 DOM 元素**复用**下来（`Reused.DOM`），焦点和插入点都还在。
   */
  eq(other: EditableTableWidget) {
    return (
      other.tableFrom === this.tableFrom &&
      other.parsed.headers.length === this.parsed.headers.length &&
      other.parsed.rows.length === this.parsed.rows.length &&
      JSON.stringify(other.parsed.aligns) === JSON.stringify(this.parsed.aligns) &&
      JSON.stringify(other.parsed.headers) === JSON.stringify(this.parsed.headers) &&
      JSON.stringify(other.parsed.rows) === JSON.stringify(this.parsed.rows)
    )
  }

  get editable() {
    // 让 CM 不插手这个 widget 的 contentEditable——由 toDOM 自己设为 "false"，
    // 理由见那里的注释。
    return true
  }

  /** 当前文档里的表格；拿不到说明它已经不是表格了。 */
  private read(): LiveTable | null {
    const view = getCurrentView()
    if (!view) return null
    return readTableAt(view, this.tableFrom)
  }

  toDOM(view: EditorView): HTMLElement {
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

    // 内容一律以文档为准（widget 可能是被复用的旧实例）
    const live = this.read()
    const t = live?.parsed ?? this.parsed

    const table = document.createElement('table')
    table.className = 'cm-md-table'
    table.style.cssText =
      'border-collapse: collapse; font-size: 0.94em; line-height: 1.6; min-width: 60%; width: 100%; border-spacing: 0;'

    // thead
    const thead = document.createElement('thead')
    const hRow = document.createElement('tr')
    t.headers.forEach((h, i) => {
      const th = document.createElement('th')
      this.initCell(th, i, 0, h)
      applyThStyle(th)
      hRow.appendChild(th)
    })
    thead.appendChild(hRow)
    table.appendChild(thead)

    // tbody
    const tbody = document.createElement('tbody')
    t.rows.forEach((row, rowIdx) => {
      const tr = document.createElement('tr')
      for (let colIdx = 0; colIdx < t.headers.length; colIdx++) {
        const td = document.createElement('td')
        this.initCell(td, colIdx, rowIdx + 1, row[colIdx] ?? '')
        applyAlign(td, t.aligns[colIdx])
        applyTdStyle(td)
        tr.appendChild(td)
      }
      tbody.appendChild(tr)
    })
    table.appendChild(tbody)
    wrap.appendChild(table)

    this.takePendingFocus(wrap)

    return wrap
  }

  /**
   * 形状没变时 CM 会复用旧 DOM，只调这里。
   *
   * 存在的理由：撤销（Ctrl+Z）改的是文档内容，形状不变——没有这一步的话
   * DOM 会停在撤销之前的样子，用户看到的是"撤销没反应"。
   *
   * 正在打字的那个单元格不会被动：它的 DOM 内容与文档一致，比较下来相等，
   * 不写就不动插入点。
   */
  /**
   * 让已有 DOM 追上本 widget 的内容。
   *
   * 走到这里说明 `eq()` 已判定内容不同（形状可能同也可能不同）。
   * 结构对不上就返回 `false`，交回 CM 重建——只有 `toDOM` 能加 `<tr>` / `<td>`，
   * 也只有它会取走 `_pendingFocus`。结构相同则只同步文字，DOM 元素被复用，
   * 正在打字的单元格插入点不受影响（它的 DOM 与文档本就一致，不写）。
   */
  updateDOM(dom: HTMLElement): boolean {
    const live = this.read()
    if (!live) return false

    // 结构对不上 → 交回给 CM 重建（toDOM 会带上新行列和 _pendingFocus）
    const domRows = dom.querySelectorAll('tbody tr').length
    const domCols = dom.querySelectorAll('thead th').length
    if (domRows !== live.parsed.rows.length || domCols !== live.parsed.headers.length) {
      return false
    }

    for (const el of Array.from(dom.querySelectorAll<HTMLElement>('[data-row][data-col]'))) {
      const row = Number(el.dataset.row)
      const col = Number(el.dataset.col)
      const text = rawCell(live.lines[row === 0 ? 0 : row + 1] ?? '', col)
      if (el.textContent !== text) el.textContent = text
    }
    return true
  }

  /**
   * 若这个 widget 正是刚改完形状的那张表，把焦点交给指定单元格。
   * 用 setTimeout 而非 rAF：toDOM 是同步调用的，DOM 尚未挂进文档，
   * 要等本轮任务结束（CM 完成 DOM 同步）后才聚焦得到。
   */
  private takePendingFocus(root: HTMLElement) {
    const pending = _pendingFocus
    if (!pending || pending.tableFrom !== this.tableFrom) return
    _pendingFocus = null
    setTimeout(() => {
      const cell = root.querySelector(
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
    el.addEventListener('contextmenu', (e) => this.onCellContextMenu(e as MouseEvent, colIdx, visualRow))
  }

  ignoreEvent(event: Event): boolean {
    // 表格内部由 contenteditable 单元格处理；阻止 CodeMirror 把点击映射到隐藏源码。
    return (
      event.type === 'mousedown' ||
      event.type === 'mouseup' ||
      event.type === 'click' ||
      event.type === 'contextmenu' ||
      event.type === 'beforeinput' ||
      event.type === 'input' ||
      event.type === 'keydown'
    )
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

  private onCellContextMenu(e: MouseEvent, colIdx: number, visualRow: number) {
    e.preventDefault()
    e.stopPropagation()
    // 先把焦点收到被右键的那一格，菜单项执行完落点才自然
    ;(e.currentTarget as HTMLElement).focus()
    openTableMenu(e.clientX, e.clientY, {
      tableFrom: this.tableFrom,
      visualRow,
      col: colIdx,
    })
  }

  private onCellInput(_e: InputEvent, colIdx: number, visualRow: number) {
    const view = getCurrentView()
    if (!view) return
    const cur = readTableAt(view, this.tableFrom)
    if (!cur) return

    const target = _e.target as HTMLElement
    const newText = target.textContent ?? ''
    const updatedLines = buildUpdatedLines(cur, colIdx, visualRow, newText)
    const newContent = updatedLines.join('\n')

    if (newContent === view.state.doc.sliceString(cur.from, cur.to)) return
    view.dispatch({ changes: { from: cur.from, to: cur.to, insert: newContent } })
  }

  // ------------------------------------------------------------------ 键盘导航
  private onCellKeydown(e: KeyboardEvent, colIdx: number, visualRow: number) {
    const cur = this.read()
    if (!cur) return
    const totalCols = cur.parsed.headers.length
    // 视觉行数含表头
    const totalRows = cur.parsed.rows.length + 1

    /*
     * 撤销 / 重做交给 CodeMirror 的历史，不用 contenteditable 自带的那个。
     *
     * 浏览器的原生撤销只知道 DOM 里的文字，不知道每敲一个字我们都提交了一个
     * **替换整张表**的 transaction。用它会出现「按一次 Ctrl+Z 只回退半个单元格」
     * 这类对不上的结果，而且撤销到一半时 DOM 与文档就不一致了。
     * 走 CM 的历史则是一步一个 transaction，和编辑器其余部分同源。
     */
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const key = e.key.toLowerCase()
      const isUndo = key === 'z' && !e.shiftKey
      const isRedo = (key === 'z' && e.shiftKey) || key === 'y'
      if (isUndo || isRedo) {
        e.preventDefault()
        const view = getCurrentView()
        if (!view) return
        const ok = isUndo ? cmUndo(view) : cmRedo(view)
        if (ok) this.refocusAfterHistory(visualRow, colIdx)
        return
      }
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey && colIdx === 0 && visualRow > 0) {
        this.moveFocus(visualRow - 1, totalCols - 1)
      } else if (!e.shiftKey && colIdx === totalCols - 1 && visualRow + 1 < totalRows) {
        this.moveFocus(visualRow + 1, 0)
      } else if (!e.shiftKey && colIdx === totalCols - 1) {
        // 最后一格按 Tab：补一行再落上去，Tab 在这里不应该是死路
        this.appendRow()
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
        this.appendRow()
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
    const cur = readTableAt(view, this.tableFrom)
    if (!cur) return
    const firstLine = doc.lineAt(cur.from).number
    const lastLine = doc.lineAt(cur.to).number

    const targetLineNo = dir === 'up' ? firstLine - 1 : lastLine + 1
    if (targetLineNo < 1 || targetLineNo > doc.lines) {
      // 表格就在文档首/尾，没有相邻行——在表格外补一行再落上去
      const insertAt = dir === 'up' ? cur.from : cur.to
      view.dispatch({
        changes: { from: insertAt, insert: dir === 'up' ? '\n' : '\n\n' },
        selection: { anchor: dir === 'up' ? cur.from : cur.to + 2 },
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

  /** 末尾补一条空数据行，焦点落到它的第一格。Tab / Enter 在最后一格时走这里。 */
  private appendRow() {
    const view = getCurrentView()
    if (!view) return
    const cur = readTableAt(view, this.tableFrom)
    if (!cur) return
    writeTableAt(view, cur, insertTableRow(cur.parsed, cur.parsed.rows.length), {
      row: cur.parsed.rows.length + 1,
      col: 0,
    })
  }

  /**
   * 撤销 / 重做之后把焦点放回单元格。
   *
   * 形状变了 CM 会重建 DOM，焦点随之丢失（回到 body）——用户按了 Ctrl+Z
   * 却发现没法接着打字。行号要**夹到新形状范围内**：撤销可能把行删掉了，
   * 原来那一行已经不存在，落到最后一行比什么都不做要好。
   */
  private refocusAfterHistory(visualRow: number, colIdx: number) {
    setTimeout(() => {
      const cur = this.read()
      if (!cur) return
      const maxRow = cur.parsed.rows.length // 视觉行号上限（含表头）
      const maxCol = cur.parsed.headers.length - 1
      const row = Math.max(0, Math.min(visualRow, maxRow))
      const col = Math.max(0, Math.min(colIdx, maxCol))
      const cell = this.getCellDOM(row, col)
      if (cell && document.contains(cell)) focusCell(cell, false)
    }, 0)
  }

  private moveFocus(visualRow: number, colIdx: number) {
    const view = getCurrentView()
    if (!view) return
    const pos = this.cellOffsetToDocPos(colIdx, visualRow)
    if (pos != null) view.dispatch({ selection: { anchor: pos } })
    // 行数没变，widget DOM 不会被重建——单元格还在原处，可以直接聚焦。
    // 仍然留一次重试：selection 更新会让 CM 重排 DOM，极端情况下 td 会被替换。
    const td = this.getCellDOM(visualRow, colIdx)
    if (td) focusCell(td, false)
    else setTimeout(() => {
      const late = this.getCellDOM(visualRow, colIdx)
      if (late) focusCell(late, false)
    }, 0)
  }

  /**
   * 单元格 → 文档位置。
   *
   * 只是为了让 CodeMirror 的 selection 跟着单元格走（离开表格时起点自然），
   * 位置是**估算**的：按 `| ` 与 ` | ` 的固定宽度累加，手写的宽窄不一
   * 会差几个字符。差一点无所谓，别拿它做精确改写。
   */
  private cellOffsetToDocPos(colIdx: number, visualRow: number): number | null {
    const cur = this.read()
    if (!cur) return null
    const lineIdx = this.lineIndexOf(visualRow)
    if (lineIdx >= cur.lines.length) return null
    let offset = 0
    for (let i = 0; i < lineIdx; i++) offset += (cur.lines[i] ?? '').length + 1
    const cells = splitCells(cur.lines[lineIdx] ?? '')
    for (let i = 0; i < colIdx && i < cells.length; i++) offset += cells[i].length + 3
    offset += 2
    return Math.min(cur.from + offset, cur.to)
  }

  /** 视觉行号 → this.lines 的下标（表头 0 / 分隔行 1 / 数据行 2..） */
  private lineIndexOf(visualRow: number): number {
    return visualRow === 0 ? 0 : visualRow + 1
  }

  private getCellDOM(visualRow: number, colIdx: number): HTMLElement | null {
    const dom = _currentView?.dom
    if (!dom) return null
    return dom.querySelector(
      `[data-row="${visualRow}"][data-col="${colIdx}"]`,
    ) as HTMLElement | null
  }
}

/** 改一个单元格的文字，返回整张表的新行。 */
function buildUpdatedLines(cur: LiveTable, colIdx: number, visualRow: number, newText: string): string[] {
  const lines = [...cur.lines]
  const lineIdx = visualRow === 0 ? 0 : visualRow + 1
  if (lineIdx < 0 || lineIdx >= lines.length) return lines
  const cells = splitCells(lines[lineIdx])
  while (cells.length < cur.parsed.headers.length) cells.push('')
  cells[colIdx] = newText
  lines[lineIdx] = '| ' + cells.join(' | ') + ' |'
  return lines
}

/**
 * 取第 `col` 格的**原文**（不 trim）。
 *
 * `updateDOM` 要用它和 DOM 比对：用户刚敲下的尾随空格还在文档里，
 * 若拿 trim 过的值去比就会判定"不一致"，写回去等于把用户刚敲的空格吃掉。
 * 这里只剥掉序列化时加的**那一个**空格。
 */
function rawCell(line: string, col: number): string {
  const cells = line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.replace(/^ /, '').replace(/ $/, ''))
  return cells[col] ?? ''
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

/**
 * 加一个 Mark 装饰，**区间为空时什么都不做**。
 *
 * CodeMirror 不接受空的 Mark 区间：`from === to` 会抛
 * `RangeError: Mark decorations may not be empty`。空行上就是这种情形——
 * 围栏代码块中间的空行、引用里的空行都算。工具栏插入的代码块骨架正好是
 * ` ```\n\n``` `，中间那一行是空的，所以一点就报错。
 *
 * 挡在这里而不是让每个调用点各自判：这是 Mark 装饰的**性质**，不是某一处
 * 的疏忽。以后新增调用点也不会重蹈。
 */
function pushMark(out: Range<Decoration>[], cls: string, from: number, to: number) {
  if (from >= to) return
  out.push(MARK(cls).range(from, to))
}

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
          pushMark(out, 'cm-md-bold', from, to)
          if (!showSyntax) hideDelimiters(state, from, to, out, 2, 2)
          break
        case 'Emphasis':
          pushMark(out, 'cm-md-italic', from, to)
          if (!showSyntax) hideDelimiters(state, from, to, out, 1, 1)
          break
        case 'Strikethrough':
          pushMark(out, 'cm-md-strike', from, to)
          if (!showSyntax) hideDelimiters(state, from, to, out, 2, 2)
          break
        case 'InlineCode':
          pushMark(out, 'cm-md-code', from, to)
          if (!showSyntax) hideDelimiters(state, from, to, out, 1, 1)
          break
        case 'Link':
          pushMark(out, 'cm-md-link', from, to)
          // 链接的 URL 部分太长会把正文撑乱；不显示语法时把它藏起来，
          // 只留方括号里的文字（与 Typora 一致）。
          if (!showSyntax) hideLinkUrl(state, from, to, out)
          break
        case 'Image': {
          // 渲染真正的 <img>（#5）。原方案只是给 `![...](...)` 上颜色，
          // 用户看不到图。src 用文档原值，浏览器按 base URL 解析；
          // 加载失败时由 onerror 退回占位符，避免破坏布局。
          const text = state.doc.sliceString(from, to)
          const m = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/.exec(text)
          if (m) {
            out.push(
              Decoration.replace({
                widget: new ImageWidget(m[2], m[1]),
                inclusive: false,
              }).range(from, to),
            )
          } else {
            pushMark(out, 'cm-md-image', from, to)
          }
          break
        }
        case 'URL':
          // 裸 URL 也标成链接色
          pushMark(out, 'cm-md-link', from, to)
          break
      }
    },
  })
  return out
}

/**
 * 藏掉 `[文字](url)` 里除文字之外的部分：**开头的 `[` 和结尾的 `](url)`**。
 *
 * 只藏后半截的话用户看到的是「[链接」——一头有一头没有，看着像坏了。
 * 两端都藏掉才是所见即所得的样子（与 Typora 一致）。
 */
function hideLinkUrl(state: EditorState, from: number, to: number, out: Range<Decoration>[]) {
  const text = state.doc.sliceString(from, to)
  const close = text.lastIndexOf('](')
  if (close < 0) return

  // 开头的 `[`（图片的 `![` 在 Image 分支里整体替换了，这里只为稳妥）
  const openLen = text.startsWith('![') ? 2 : 1
  if (from + openLen > from) out.push(Decoration.replace({}).range(from, from + openLen))

  // 结尾的 `](url)`
  const urlStart = from + close
  if (urlStart > from + openLen) out.push(Decoration.replace({}).range(urlStart, to))
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

const HEADING = ['cm-md-h1', 'cm-md-h2', 'cm-md-h3', 'cm-md-h4', 'cm-md-h5', 'cm-md-h6']

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
          pushMark(out, HEADING[level] ?? 'cm-md-h3', line.from, line.to)
          if (!showSyntax) {
            const m = /^(#{1,6}\s+)/.exec(line.text)
            if (m) out.push(Decoration.replace({}).range(line.from, line.from + m[1].length))
          }
          break
        }
        case 'Blockquote': {
          // 先把这一段引用的所有行收集起来——需要知道哪行是首/末，
          // 首行的竖线不向上延伸、末行不向下延伸（否则会戳进块外的段落里）
          const lines = []
          let l = state.doc.lineAt(node.from)
          const end = node.to
          for (;;) {
            lines.push(l)
            if (l.to >= end) break
            l = state.doc.line(l.number + 1)
          }

          lines.forEach((line, i) => {
            const m = /^(>\s?)/.exec(line.text)
            // 空引用行（`>` 后面什么都没有）的判断：整行就是引用前缀本身
            const isEmpty = !!m && line.text === m[1]

            // 行装饰：给这一行的 cm-line 一个类。
            // 隐藏 `>` 前缀用的空 widget 会连同两个 cm-widgetBuffer 撑出一条
            // line box（约一个行高），叠在 .cm-md-quote 这个 block 上，cm-line
            // 就变成两个行高——用户看到的是「引用块里多出空白行」（问题 7）。
            // 类名让 CSS 能把那条 line box 压掉。
            out.push(Decoration.line({ class: 'cm-quote-line' }).range(line.from))

            const cls = ['cm-md-quote']
            if (isEmpty) cls.push('cm-md-quote-empty')
            if (i === 0) cls.push('cm-md-quote-first')
            if (i === lines.length - 1) cls.push('cm-md-quote-last')
            pushMark(out, cls.join(' '), line.from, line.to)

            if (isEmpty) {
              // 空引用行**不替换** `>`——它的整行内容只有这一个字符，被 replace
              // 掉之后同范围的 Mark 装饰就没有内容可包裹，整行连同竖线一起消失。
              // 字符保留在 DOM 里撑住装饰，由 CSS 涂成透明。
            } else if (m) {
              // 引用前缀**始终**隐藏，不跟着光标走——用户明确要求点击引用块
              // 不要露出 `>`。
              out.push(Decoration.replace({}).range(line.from, line.from + m[1].length))
            }
          })
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

        // 代码块：整块一个方框，顶部一条头（语言 + 复制 + 语言切换）
        case 'FencedCode': {
          const firstLine = state.doc.lineAt(node.from)
          const lastLine = state.doc.lineAt(node.to)
          const lang = readFenceLang(firstLine.text)

          // 正文范围：围栏之间。只有一对围栏（空块）时范围为空。
          const hasBody = lastLine.number > firstLine.number
          const codeFrom = hasBody ? state.doc.line(firstLine.number + 1).from : firstLine.to
          const codeTo = hasBody ? state.doc.line(lastLine.number - 1).to : codeFrom

          // 闭围栏行隐藏：必须用 line 装饰而不是 Decoration.replace({})，
          // 因为后者会**新增一个隐藏的空行**——文档逻辑行数与视觉行数不一致，
          // CodeMirror 的 ArrowUp keymap 就会跳到看不见的那一行，用户感觉
          // 光标"乱跳"。line 装饰让该行仍占一个 line slot 但视觉上为 0 高度。
          const closeFrom = lastLine.from
          const closeTo = Math.min(lastLine.to + 1, state.doc.length)
          if (closeTo > closeFrom) {
            out.push(Decoration.line({ attributes: { style: 'display: none' } }).range(closeFrom))
          }

          // 头替换开围栏那一行
          if (!showSyntax) {
            // 用 Decoration.replace({ ..., block: false }) 替换 ``` 开围栏字符。
            // 不能用 block: true——它会吃掉 line 末尾的 \n，导致下一行被合并；
            // 也不能用 line { display: none }——它会把整个 widget 也隐藏掉。
            // block: false 的 inline 替换只覆盖 from-to 字符，行 slot 保留。
            out.push(
              Decoration.replace({
                widget: new CodeBlockHeaderWidget(lang, codeFrom, codeTo, firstLine.from),
                inclusive: false,
              }).range(firstLine.from, firstLine.to),
            )
          } else {
            out.push(Decoration.line({ class: 'cm-codeblock-fence' }).range(firstLine.from))
          }

          // 正文各行：行装饰（边框+背景）+ 语法高亮
          if (hasBody) {
            const bodyLast = lastLine.number - 1
            for (let n = firstLine.number + 1; n <= bodyLast; n++) {
              const line = state.doc.line(n)
              const isLast = n === bodyLast
              const lineCls = isLast ? 'cm-codeblock-line cm-codeblock-last' : 'cm-codeblock-line'
              out.push(Decoration.line({ class: lineCls }).range(line.from))
              // 语法高亮
              if (!showSyntax && lang) {
                addCodeHighlights(state, out, line.from, line.to, lang)
              }
            }
          }
          break
        }

        // 分割线：`---` 换成一条真正的横线
        case 'HorizontalRule': {
          if (!showSyntax) {
            // inline replace（block: false）——block: true 会吞掉 line 末尾的 \n
            // 合并下一行；line display: none 会把 widget 也藏起来
            out.push(
              Decoration.replace({
                widget: new RuleWidget(),
                inclusive: false,
              }).range(line.from, line.to),
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

          const from = state.doc.line(fromLine).from
          const widget = new EditableTableWidget(parsed, from)
          out.push(Decoration.replace({ widget, block: true }).range(from, state.doc.line(toLine).to))
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
    // 有序列表的 `1.` **不带尾随空格**——间距统一交给 CSS 的 margin-right，
    // 有序无序才会一样。原来有序的写 `marker + ' '`，它比无序的 `•` 多一个
    // 空格，两者间距不一致（问题 6）。
    span.textContent = /\d/.test(this.marker) ? this.marker : '•'
    return span
  }
  ignoreEvent() { return true }
}

/**
 * 图片 widget。Markdown 源码 `![alt](src)` 整体被替换成一个真正的 <img>。
 *
 * - src 用文档原值。浏览器按页面 base URL 解析（`assets/001/x.png` →
 *   `http://localhost:5173/assets/001/x.png`，对应 `public/` 下的资源）。
 * - 加载失败时退回占位符：保留 alt 文字 + 一个明显的"图裂"标记，避免整行
 *   塌成 0 高让用户找不到位置。
 */
class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) { super() }

  eq(other: ImageWidget) {
    return other.src === this.src && other.alt === this.alt
  }

  toDOM() {
    const wrap = document.createElement('span')
    wrap.className = 'cm-md-image-wrap'
    wrap.contentEditable = 'false'

    const img = document.createElement('img')
    img.className = 'cm-md-image'
    img.src = this.src
    img.alt = this.alt
    img.draggable = false
    // 加载失败：用 alt 显示一个占位框，不让整行高度塌成 0
    img.addEventListener('error', () => {
      wrap.classList.add('is-broken')
      wrap.innerHTML = ''
      const box = document.createElement('span')
      box.className = 'cm-md-image-fallback'
      box.textContent = `[图片：${this.alt || '加载失败'}]`
      wrap.appendChild(box)
    })

    wrap.appendChild(img)
    return wrap
  }

  ignoreEvent(event: Event) {
    // 图片是只读的，事件默认不交给 CodeMirror——但 **Ctrl/Cmd + 左键**要放行，
    // 否则事件在 widget 这一层就被吞掉，编辑器上的 mousedown 处理器收不到，
    // Ctrl+点击图片就打不开地址（文字链接能点、图片不能点，用起来很割裂）。
    if (event.type === 'mousedown') {
      const e = event as MouseEvent
      return !(e.ctrlKey || e.metaKey)
    }
    return true
  }
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
    // 用 span 而不是 div——widget 容器是 inline-block，div 会撑高并破坏 inline 行为
    const hr = document.createElement('span')
    hr.className = 'cm-md-rule'
    return hr
  }
  ignoreEvent() { return true }
}

/**
 * 代码块的头部：左上角语言，右上角复制按钮。
 *
 * 它**替换掉开围栏那一行**（```js），所以语言没法直接点进去改——
 * 语言本身做成可点击的按钮，点它打开语言选择菜单。
 *
 * 复制的是**正文**，不含围栏和语言。范围由构造时算好（`codeFrom`/`codeTo`），
 * 复制时按当前文档取文本——用快照会在编辑后复制出旧内容。
 *
 * 语言选择器提供常用语言列表，点击后修改开围栏行的语言。
 */
class CodeBlockHeaderWidget extends WidgetType {
  constructor(
    readonly lang: string,
    /** 代码正文在文档里的范围（不含围栏行） */
    readonly codeFrom: number,
    readonly codeTo: number,
    /** 开围栏行的起点；点语言时把光标送到这里 */
    readonly fencePos: number,
  ) {
    super()
  }

  eq(other: CodeBlockHeaderWidget) {
    return (
      other.lang === this.lang &&
      other.codeFrom === this.codeFrom &&
      other.codeTo === this.codeTo &&
      other.fencePos === this.fencePos
    )
  }

  toDOM() {
    const bar = document.createElement('div')
    bar.className = 'cm-codeblock-bar'

    // 语言选择器
    const langWrap = document.createElement('div')
    langWrap.className = 'cm-codeblock-lang-wrap'
    langWrap.style.cssText = 'position: relative;'

    const langBtn = document.createElement('button')
    langBtn.type = 'button'
    langBtn.className = 'cm-codeblock-lang'
    langBtn.textContent = this.lang || 'text'
    langBtn.title = '点击切换语言'
    langBtn.style.cssText = 'border: none; background: none; padding: 0; font: inherit; color: var(--content-secondary); cursor: pointer; display: flex; align-items: center; gap: 2px;'
    langBtn.addEventListener('mousedown', (e) => e.preventDefault())

    // 语言下拉箭头
    const arrow = document.createElement('span')
    arrow.textContent = '▼'
    arrow.style.cssText = 'font-size: 8px; opacity: 0.6;'
    langBtn.appendChild(arrow)

    langBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      // 如果菜单已打开，先关掉
      const existing = document.querySelector('.cm-codeblock-lang-menu')
      if (existing) existing.remove()

      const menu = document.createElement('div')
      menu.className = 'cm-codeblock-lang-menu'
      // 用 CSS 变量跟随主题：这段是 innerHTML 之外的原生 DOM，拿不到 Tailwind 的
      // dark: 变体（它由 class 驱动，但内联 style 优先级更高，改不动）。
      menu.style.cssText = `
        position: absolute; top: 100%; left: 0; z-index: 100;
        background: var(--surface-primary); border: 1px solid var(--border-color); border-radius: 6px;
        box-shadow: var(--shadow-md); padding: 4px 0;
        min-width: 120px; max-height: 240px; overflow-y: auto;
      `

      const langs = ['text', 'javascript', 'typescript', 'python', 'rust', 'go', 'java', 'cpp', 'c', 'html', 'css', 'json', 'yaml', 'markdown', 'sql', 'bash', 'shell']
      langs.forEach(l => {
        const item = document.createElement('button')
        item.type = 'button'
        item.textContent = l
        item.style.cssText = `
          display: block; width: 100%; text-align: left;
          padding: 4px 12px; border: none; background: none;
          font: inherit; font-size: 12px; color: var(--content-primary);
          cursor: pointer;
        `
        if (l === this.lang) {
          item.style.background = 'var(--surface-tertiary)'
          item.style.color = 'var(--accent)'
        }
        item.addEventListener('mouseenter', () => { item.style.background = 'var(--surface-hover)' })
        item.addEventListener('mouseleave', () => { item.style.background = l === this.lang ? 'var(--surface-tertiary)' : 'none' })
        item.addEventListener('click', (ev) => {
          ev.stopPropagation()
          menu.remove()
          this.changeLanguage(l)
        })
        menu.appendChild(item)
      })

      // 点击外部关闭菜单
      const closeMenu = (ev: MouseEvent) => {
        if (!langWrap.contains(ev.target as Node)) {
          menu.remove()
          document.removeEventListener('click', closeMenu)
        }
      }
      setTimeout(() => document.addEventListener('click', closeMenu), 0)

      langWrap.appendChild(menu)
    })
    langWrap.appendChild(langBtn)

    // 更新语言按钮显示（当语言改变时）
    const updateLangBtn = () => {
      const view = getCurrentView()
      if (!view) return
      const line = view.state.doc.lineAt(this.fencePos)
      const lang = readFenceLang(line.text)
      langBtn.textContent = ''
      langBtn.appendChild(document.createTextNode(lang || 'text'))
      langBtn.appendChild(arrow)
    }

    bar.appendChild(langWrap)

    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'cm-codeblock-copy'
    copy.textContent = '复制'
    copy.setAttribute('aria-label', '复制代码')
    copy.addEventListener('mousedown', (e) => e.preventDefault())
    copy.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const view = getCurrentView()
      if (!view) return
      const text = view.state.doc.sliceString(this.codeFrom, this.codeTo)
      const done = (label: string) => {
        copy.textContent = label
        copy.classList.toggle('is-done', label === '已复制')
        setTimeout(() => {
          copy.textContent = '复制'
          copy.classList.remove('is-done')
        }, 1200)
      }
      navigator.clipboard?.writeText(text).then(() => done('已复制')).catch(() => done('复制失败'))
    })
    bar.appendChild(copy)

    return bar
  }

  /** 修改代码块的语言 */
  private changeLanguage(newLang: string) {
    const view = getCurrentView()
    if (!view) return
    const line = view.state.doc.lineAt(this.fencePos)
    const oldLang = readFenceLang(line.text)
    // 匹配 ```` 后面的整个语言标记（含可选空格），替换成 `\`\`\` ${newLang}`——
    // 显式保留 backticks 后的那 1 个空格，避免 `\s*` 匹配 0 空格时多塞一个。
    const newText = line.text.replace(/^(`+).*/, `$1 ${newLang}`)

    if (newText !== line.text) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: newText },
      })
    }
    view.focus()
  }

  ignoreEvent() { return true }
}

/**
 * 从开围栏那一行取语言。````js` → `js`；```` ` → 空串。
 *
 * 围栏里的信息串按 CommonMark 可以带别的东西（````js title=x`），
 * 这里只取第一个词——它是语言，其余的是给渲染器的参数，这里不解释。
 */
function readFenceLang(text: string): string {
  const m = /^`{3,}\s*(\S+)?/.exec(text)
  return m?.[1] ?? ''
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
    'border: 1px solid var(--border-color); padding: 0.35em 0.8em; text-align: left; background: var(--surface-tertiary); font-weight: 600; color: var(--content-primary); white-space: nowrap; outline: none;'
}

function applyTdStyle(td: HTMLElement) {
  td.style.cssText =
    'border: 1px solid var(--border-color); padding: 0.35em 0.8em; text-align: left; color: var(--content-primary); white-space: nowrap; outline: none; cursor: cell;'
}

// ---------------------------------------------------------------------------
// 代码块语法高亮
// ---------------------------------------------------------------------------

/** highlight.js 语言别名映射（常见变体统一到标准名） */
const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'shell',
  zsh: 'shell',
  bash: 'shell',
  'c++': 'cpp',
  'c#': 'csharp',
  md: 'markdown',
  yml: 'yaml',
}

/**
 * 为一行代码添加语法高亮装饰。
 *
 * 使用 highlight.js 高亮整行代码，然后解析返回的 HTML
 * 来提取高亮区间的字符位置，转换为 CodeMirror Mark 装饰。
 */
function addCodeHighlights(
  state: EditorState,
  out: Range<Decoration>[],
  lineFrom: number,
  lineTo: number,
  lang: string,
) {
  const text = state.doc.sliceString(lineFrom, lineTo)
  const normalizedLang = LANG_ALIASES[lang.toLowerCase()] ?? lang

  let html: string
  try {
    const result = hljs.highlight(text, { language: normalizedLang, ignoreIllegals: true })
    html = result.value
  } catch {
    return
  }

  // 用 DOMParser 解析 HTML，在浏览器环境直接用 innerHTML 也可以
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<span>${html}</span>`, 'text/html')
  const root = doc.querySelector('span')!
  extractHighlightsFromDOM(root, text, lineFrom, out)
}

/** 从 DOM 树提取高亮区间 */
function extractHighlightsFromDOM(node: Node, fullText: string, lineFrom: number, out: Range<Decoration>[]) {
  let textPos = 0

  function walk(n: Node) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.textContent ?? ''
      textPos += text.length
    } else if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as Element
      const cls = el.className
        ? hljsClassToCssClass(el.className)
        : null

      // 先处理子节点，收集子节点覆盖的文本范围
      const startPos = textPos
      for (const child of Array.from(n.childNodes)) {
        walk(child)
      }
      const endPos = textPos

      // 如果有类名，给这个区间加装饰
      if (cls && startPos < endPos) {
        const from = lineFrom + startPos
        const to = lineFrom + endPos
        pushMark(out, cls, from, to)
      }
    }
  }

  walk(node)
}

/** 将 highlight.js 的 className（如 'hljs-keyword'）映射为 CSS 类名 */
function hljsClassToCssClass(hljsClass: string): string | null {
  const map: Record<string, string> = {
    'hljs-keyword': 'cm-hljs-keyword',
    'hljs-built_in': 'cm-hljs-built_in',
    'hljs-type': 'cm-hljs-type',
    'hljs-literal': 'cm-hljs-literal',
    'hljs-number': 'cm-hljs-number',
    'hljs-string': 'cm-hljs-string',
    'hljs-comment': 'cm-hljs-comment',
    'hljs-doctag': 'cm-hljs-comment',
    'hljs-meta': 'cm-hljs-meta',
    'hljs-function': 'cm-hljs-function',
    'hljs-title': 'cm-hljs-title',
    'hljs-params': 'cm-hljs-params',
    'hljs-variable': 'cm-hljs-variable',
    'hljs-attr': 'cm-hljs-attr',
    'hljs-attribute': 'cm-hljs-attribute',
    'hljs-selector-tag': 'cm-hljs-selector-tag',
    'hljs-selector-class': 'cm-hljs-selector-class',
    'hljs-selector-id': 'cm-hljs-selector-id',
    'hljs-operator': 'cm-hljs-operator',
    'hljs-punctuation': 'cm-hljs-punctuation',
    'hljs-regexp': 'cm-hljs-regexp',
    'hljs-template-variable': 'cm-hljs-template-variable',
    'hljs-addition': 'cm-hljs-addition',
    'hljs-deletion': 'cm-hljs-deletion',
    'hljs-section': 'cm-hljs-section',
    'hljs-name': 'cm-hljs-name',
    'hljs-selector-attr': 'cm-hljs-selector-attr',
    'hljs-selector-pseudo': 'cm-hljs-selector-pseudo',
  }
  return map[hljsClass] ?? null
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

// ---------------------------------------------------------------------------
// 严格的光标上/下移动（解决 #1 光标乱跳 / #6 从代码块向上跳过列表）
// ---------------------------------------------------------------------------

/**
 * CodeMirror 默认的 `cursorLineUp` 在跨过**被 widget 替换的整行 block**（代码块、
 * 分割线、表格）时，会直接跳到 block 外侧——用户感觉光标"乱跳"。
 * 比如从代码块 `function greet(name) {` 那行（38 行）按 ↑，默认行为会把
 * 光标放到代码块外、上一行（22 行分割线那里）。中间隔着的 36, 35, 34, …
 * 任务列表/有序列表/无序列表**全部跳过**。
 *
 * 这里改成**逐行**移动：按当前 head 在本行的"视觉列"（字符偏移），
 * 目标行 = 当前行 ± 1，再把光标放到 `target.from + col`。
 *
 * 不需要"找上一个非隐藏行"——CM 的 `doc.line(n)` 永远给的是**逻辑行**
 * （按 \n 切分），与 widget 显示/隐藏无关。逐行 ±1 一定能落在某个逻辑行上。
 */
function strictLineUp(view: EditorView, extend: boolean): boolean {
  return moveByLogicalLine(view, -1, extend)
}
function strictLineDown(view: EditorView, extend: boolean): boolean {
  return moveByLogicalLine(view, +1, extend)
}
function moveByLogicalLine(view: EditorView, dir: -1 | 1, extend: boolean): boolean {
  const state = view.state
  const sel = state.selection.main
  const head = sel.head
  const line = state.doc.lineAt(head)
  const targetNo = line.number + dir
  if (targetNo < 1 || targetNo > state.doc.lines) return false
  const target = state.doc.line(targetNo)
  // 视觉列：head 在本行的字符偏移。目标行可能更短，截断到行末。
  const col = head - line.from
  const newPos = Math.min(target.from + Math.max(0, col), target.to)

  if (extend) {
    // 选区延伸：保持 anchor 在原行不动（CM 默认行为），head 移到目标行
    view.dispatch({ selection: EditorSelection.range(sel.anchor, newPos) })
  } else {
    view.dispatch({ selection: EditorSelection.cursor(newPos) })
  }
  return true
}

/**
 * 取某个文档位置上的链接 URL；那里不是链接就返回 null。
 *
 * 三种都要认：
 *   - `[文字](url)` —— Link 节点
 *   - `![alt](url)` —— Image 节点（图片也能点开看原图）
 *   - `https://…`   —— 裸 URL，节点名就叫 URL
 *
 * 从最内层的节点往外爬，遇到这几种就停——`resolveInner` 给的是最深节点，
 * 直接看它多半是 `LinkMark` 之类的子节点。
 */
function linkAt(state: EditorState, pos: number): string | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1)
  while (node) {
    if (node.name === 'URL') {
      const text = state.doc.sliceString(node.from, node.to)
      return /^https?:\/\//i.test(text) ? text : null
    }
    if (node.name === 'Link' || node.name === 'Image') {
      const text = state.doc.sliceString(node.from, node.to)
      const m = /\]\(([^)\s]+)/.exec(text)
      return m ? m[1] : null
    }
    node = node.parent
  }
  return null
}

/**
 * 跟踪 Ctrl / Cmd 是否按住，给编辑器根节点挂一个类。
 *
 * 光有 Ctrl+点击还不够——用户不知道能这么点。按住修饰键时让链接变成
 * 手型 + 下划线，这个功能才**可被发现**（VS Code、Typora 都是这个套路）。
 *
 * 监听挂在 window 上而不是编辑器上：用户经常是先按住 Ctrl 再把鼠标移进
 * 编辑器，那时焦点还不在编辑器里，编辑器自己的 keydown 收不到。
 */
const modifierHeldPlugin = ViewPlugin.fromClass(
  class {
    private readonly onKeyDown: (e: KeyboardEvent) => void
    private readonly onKeyUp: (e: KeyboardEvent) => void
    private readonly onBlur: () => void

    constructor(private readonly view: EditorView) {
      const set = (held: boolean) => view.dom.classList.toggle('cm-link-modifier-held', held)
      this.onKeyDown = (e) => {
        if (e.key === 'Control' || e.key === 'Meta') set(true)
      }
      this.onKeyUp = (e) => {
        if (e.key === 'Control' || e.key === 'Meta') set(false)
      }
      // 切走窗口时收不到 keyup，Ctrl 状态会卡住——失焦就复位
      this.onBlur = () => set(false)
      window.addEventListener('keydown', this.onKeyDown)
      window.addEventListener('keyup', this.onKeyUp)
      window.addEventListener('blur', this.onBlur)
    }

    destroy() {
      window.removeEventListener('keydown', this.onKeyDown)
      window.removeEventListener('keyup', this.onKeyUp)
      window.removeEventListener('blur', this.onBlur)
      this.view.dom.classList.remove('cm-link-modifier-held')
    }
  },
)

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

  // 高优先级 keymap：拦截 ArrowUp/ArrowDown，跑逐行逻辑。
  // 用 Prec.high 是因为 defaultKeymap 里也有 ArrowUp，且优先级一致会按顺序匹配——
  // 我们的更靠前，return true 后 CM 不再走默认 keymap。
  const arrowKeymap = Prec.high(keymap.of([
    { key: 'ArrowUp', run: (v) => strictLineUp(v, false) },
    { key: 'ArrowDown', run: (v) => strictLineDown(v, false) },
    { key: 'Shift-ArrowUp', run: (v) => strictLineUp(v, true) },
    { key: 'Shift-ArrowDown', run: (v) => strictLineDown(v, true) },
  ]))

  /*
   * Ctrl / Cmd + 左键点击链接 → 在新窗口打开。
   *
   * 用 mousedown 而不是 click：CodeMirror 在 mousedown 阶段就会把光标挪过去、
   * 开始拖拽选择，等到 click 时用户已经"选中"了链接文字——再开窗口会显得突兀。
   * 在 mousedown 里拦掉并 preventDefault，光标不动，行为更接近浏览器里的链接。
   *
   * `noopener,noreferrer`：新窗口拿不到本页的 window.opener，避免被反向控制。
   */
  const linkClickHandler = EditorView.domEventHandlers({
    mousedown: (event, view) => {
      if (event.button !== 0) return false
      if (!event.ctrlKey && !event.metaKey) return false
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
      if (pos == null) return false
      const url = linkAt(view.state, pos)
      if (!url) return false
      event.preventDefault()
      window.open(url, '_blank', 'noopener,noreferrer')
      return true
    },
  })

  return [viewListener, field, arrowKeymap, linkClickHandler, modifierHeldPlugin]
}
