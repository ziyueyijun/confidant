/**
 * 在本文中查找。
 *
 * ## 为什么没有用 `@codemirror/search`
 *
 * 它自带的高亮**只在它自己的面板打开时才算**——`searchHighlighter` 里第一句就是
 * `if (!panel || !query.spec.valid) return Decoration.none`。要用它就得连那块
 * 面板一起放出来，而查找条要跟工具栏、底部栏长成一个样子，不是它那个样子。
 * 自己画一层装饰反而更短：一篇笔记几千字，全篇扫一遍是瞬时的——与全局搜索
 * 同一个做法（`search/query.ts`）。
 *
 * ## 查找词为什么存在 StateField 里
 *
 * **编辑器视图会重建**：切源码视图、换语法标记方式都会重建它（见
 * `MarkdownEditor` 的 effect 依赖）。查找词若只活在 React 里，重建之后
 * 高亮就没了，而查找条还开着——那是两处对不上的状态。存进 StateField，
 * 外面只要在重建后重新 dispatch 一次（`MarkdownEditor` 里做了），就还是同一件事。
 */
import { EditorSelection, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

/** 设当前查找词。空串 = 清掉高亮。 */
export const setFindQuery = StateEffect.define<string>()

const 查找词 = StateField.define<string>({
  create: () => '',
  update(q, tr) {
    for (const e of tr.effects) if (e.is(setFindQuery)) return e.value
    return q
  },
})

const 命中 = Decoration.mark({ class: 'cm-find-match' })
/** 当前落在光标上的那一个——查找条上那个「3 / 12」指的就是它。 */
const 当前命中 = Decoration.mark({ class: 'cm-find-match-current' })

interface 区间 {
  from: number
  to: number
}

/**
 * 全篇找一遍，返回所有命中区间。
 *
 * 忽略大小写：中文不受影响，英文有用——与全局搜索同一套规则
 * （`search/query.ts` 的 `findRanges`）。逐字子串，不做词边界，
 * 也不做模糊匹配。
 */
function 全部命中(state: EditorState, q: string): 区间[] {
  if (!q) return []
  const hay = state.doc.toString().toLowerCase()
  const needle = q.toLowerCase()
  const out: 区间[] = []
  let i = hay.indexOf(needle)
  while (i !== -1) {
    out.push({ from: i, to: i + needle.length })
    i = hay.indexOf(needle, i + needle.length)
  }
  return out
}

/**
 * 只装饰视口里那一段。
 *
 * 命中区间是从头扫出来的（全篇有序），这里按视口过滤即可——不必按
 * visibleRanges 逐段再扫一遍：跨段边界的命中会被扫出两次，两边都画一遍
 * 就是两个叠在一起的 `<mark>`，颜色深一块。
 */
function 画高亮(view: EditorView): DecorationSet {
  const q = view.state.field(查找词)
  if (!q) return Decoration.none

  const sel = view.state.selection.main
  const { from: 视口起, to: 视口止 } = view.viewport
  const 装饰 = []
  for (const m of 全部命中(view.state, q)) {
    if (m.to < 视口起) continue
    if (m.from > 视口止) break
    const 是当前 = m.from === sel.from && m.to === sel.to
    装饰.push((是当前 ? 当前命中 : 命中).range(m.from, m.to))
  }
  return Decoration.set(装饰)
}

const 高亮层 = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = 画高亮(view)
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.selectionSet ||
        u.viewportChanged ||
        u.state.field(查找词) !== u.startState.field(查找词)
      ) {
        this.decorations = 画高亮(u.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)

/**
 * 高亮用应用自己的色，不用 CodeMirror 那套（浅色下是半透明黄、
 * 深色下是半透明青）。选中那一个用实心 accent——与全局搜索面板里
 * 的 `<mark>`、底部栏的按下态是同一个色。
 */
const 配色 = EditorView.baseTheme({
  '.cm-find-match': {
    backgroundColor: 'var(--accent-subtle-hover)',
    color: 'var(--accent-hover)',
    borderRadius: '2px',
  },
  '.cm-find-match-current': {
    backgroundColor: 'var(--accent)',
    color: 'white',
    borderRadius: '2px',
  },
})

export function findHighlight(): Extension {
  return [查找词, 高亮层, 配色]
}

/** 设查找词。空串清掉高亮。 */
export function setQuery(view: EditorView, q: string) {
  view.dispatch({ effects: setFindQuery.of(q) })
}

/** 当前查找词。 */
export function getQuery(view: EditorView): string {
  return view.state.field(查找词)
}

/**
 * 当前查到第几个 / 共几个。
 *
 * `index` 为 0 表示**光标没落在任何一个命中上**（刚打开查找条、或刚敲进
 * 一个还没跳过去的词）。界面据此决定是显示「3 / 12」还是「12 处」。
 */
export function findStatus(view: EditorView): { index: number; total: number } | null {
  const q = view.state.field(查找词)
  if (!q) return null
  const all = 全部命中(view.state, q)
  const sel = view.state.selection.main
  const at = all.findIndex((m) => m.from === sel.from && m.to === sel.to)
  return { index: at + 1, total: all.length }
}

/** 把某个命中选中并滚到眼前。**不夺焦点**——焦点要留在查找条的输入框里。 */
function 选中(view: EditorView, m: 区间) {
  view.dispatch({
    selection: EditorSelection.single(m.from, m.to),
    effects: EditorView.scrollIntoView(m.from, { y: 'center' }),
  })
}

/** 下一个。到末尾绕回开头——与所有编辑器的查找一致。 */
export function findNext(view: EditorView): boolean {
  const all = 全部命中(view.state, getQuery(view))
  if (all.length === 0) return false
  const sel = view.state.selection.main
  选中(view, all.find((m) => m.from > sel.from) ?? all[0])
  return true
}

/** 上一个。到开头绕回末尾。 */
export function findPrev(view: EditorView): boolean {
  const all = 全部命中(view.state, getQuery(view))
  if (all.length === 0) return false
  const sel = view.state.selection.main
  const 之前的 = all.filter((m) => m.to < sel.from)
  选中(view, 之前的.length > 0 ? 之前的[之前的.length - 1] : all[all.length - 1])
  return true
}
