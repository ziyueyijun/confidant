import { useEffect, useImperativeHandle, useRef } from 'react'
import type { Ref } from 'react'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, keymap, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { markdownLivePreview, type SyntaxReveal } from './markdownLivePreview'
import { findHighlight, setQuery, findNext, findPrev, findStatus } from './find'
/** 外部（如大纲、工具栏）驱动编辑器的入口 */
export interface EditorApi {
  /** 滚到指定行并把光标放上去。line 是 0-based 行号。 */
  scrollToLine: (line: number) => void
  /** 在光标处插入文本（工具栏用） */
  insert: (text: string) => void
  /**
   * 插入一段**独占整行**的块级内容（表格、代码块、分割线）。
   *
   * 和 `insert` 分开是因为语义不同：`insert` 是行内的，而块级内容必须
   * 落在行边界上。在「## 标题」行首用 `insert` 插表格会得到
   * `| 列 1 | 列 2 |## 标题`——表格把标题吃了，两样一起废掉。
   * 这里在需要时补换行，保证块的前后都是行边界。
   *
   * `cursorOffset` 是插入后光标落在块内的第几个字符，默认落在末尾。
   * 代码块要落在围栏**里面**，就传它。
   */
  insertBlock: (text: string, cursorOffset?: number) => void
  /** 用包裹标记包住选区（粗体、斜体……）；已包裹则去掉 */
  wrap: (before: string, after: string, placeholder: string) => void
  /** 把当前行（或选中的若干行）的行首加上前缀；已有则去掉 */
  prefixLines: (prefix: string) => void
  /**
   * 设置当前行（或选中的若干行）的标题级别；`0` 表示去掉标题、回到正文。
   *
   * 和 `prefixLines` 分开是因为标题要**替换**而不是叠加：从 H3 改成 H5
   * 是换掉 `### `，不是再加两个 `#`。
   */
  setHeading: (level: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void
  /** 清掉选区内的 Markdown 标记，只留文字 */
  clearFormat: () => void
  /** 设查找词（在本文中查找）。空串清掉高亮 */
  setFindQuery: (q: string) => void
  /** 跳到下一个 / 上一个命中。没有命中返回 false */
  findNext: () => boolean
  findPrev: () => boolean
  /** 当前查到第几个 / 共几个。没设查找词时返回 null */
  findStatus: () => { index: number; total: number } | null
}

interface Props {
  initialDoc: string
  reveal: SyntaxReveal
  sourceMode: boolean
  renderTables: boolean
  onChange?: (text: string) => void
  /** 光标所在行的标题级别（0 = 不是标题）。工具栏拿它显示当前级别。 */
  onHeadingLevel?: (level: number) => void
  ref?: Ref<EditorApi>
}

/**
 * 原型用的最小编辑器和封装。
 * 刻意不做的：文件读写、撤销持久化、多光标特殊处理、粘贴图片。
 * 只做「能打字、能看手感」这一件事。
 */
export function MarkdownEditor({ initialDoc, reveal, sourceMode, renderTables, onChange, onHeadingLevel, ref }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  /**
   * 当前查找词。**只为了让视图重建后还能接着高亮**——真正的真相在编辑器的
   * StateField 里（见 `find.ts`）。切源码视图、换语法标记方式都会重建视图，
   * 重建完在这里补 dispatch 一次，查找条开着的时候就不会突然"什么都不亮"。
   */
  const findQueryRef = useRef('')
  // 把回调放进 ref，避免因回调变化重建编辑器（那会丢光标）
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onHeadingLevelRef = useRef(onHeadingLevel)
  onHeadingLevelRef.current = onHeadingLevel

  useImperativeHandle(ref, () => ({
    scrollToLine(line: number) {
      const view = viewRef.current
      if (!view) return
      const clamped = Math.max(0, Math.min(line, view.state.doc.lines - 1))
      const target = view.state.doc.line(clamped + 1)
      view.dispatch({
        selection: { anchor: target.from },
        effects: EditorView.scrollIntoView(target.from, { y: 'start', yMargin: 24 }),
      })
      view.focus()
    },

    insert(text: string) {
      const view = viewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
      })
      view.focus()
    },

    /**
     * 插入块级内容，必要时在前后补换行让它独占整行。
     *
     * 前后各判一次，因为两种情形都会遇到：在行中间插（后面要断）、
     * 在行首插（前面要断）。已经在行边界上就不重复补，免得每插一次
     * 就多出空行。
     */
    insertBlock(text: string, cursorOffset?: number) {
      const view = viewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main
      const doc = view.state.doc
      const atLineStart = from === doc.lineAt(from).from
      const atLineEnd = to === doc.lineAt(to).to

      const lead = atLineStart ? '' : '\n'
      const tail = atLineEnd ? '' : '\n'
      const content = lead + text + tail
      // 光标默认落在块末尾；给了偏移就落在块内那一位（代码块要进围栏里面）
      const anchor = from + lead.length + (cursorOffset ?? text.length)
      view.dispatch({
        changes: { from, to, insert: content },
        selection: { anchor },
      })
      view.focus()
    },

    /**
     * 包裹 / 解包裹。
     *
     * 已包裹时**去掉标记**——工具栏按钮应当是开关，不是「再包一层」。
     * 没选中时插入占位文字并选中它，这样用户可以直接打字替换。
     */
    wrap(before: string, after: string, placeholder: string) {
      const view = viewRef.current
      if (!view) return
      const sel = view.state.selection.main
      const doc = view.state.doc
      const outerFrom = Math.max(0, sel.from - before.length)
      const outerTo = Math.min(doc.length, sel.to + after.length)
      const outer = doc.sliceString(outerFrom, outerTo)

      // 已包裹 → 去掉
      if (outer.startsWith(before) && outer.endsWith(after) && sel.to > sel.from) {
        view.dispatch({
          changes: [
            { from: outerFrom, to: sel.from, insert: '' },
            { from: sel.to, to: outerTo, insert: '' },
          ],
          selection: { anchor: outerFrom, head: outerFrom + (sel.to - sel.from) },
        })
        view.focus()
        return
      }

      const text = sel.to > sel.from ? doc.sliceString(sel.from, sel.to) : placeholder
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: before + text + after },
        selection: { anchor: sel.from + before.length, head: sel.from + before.length + text.length },
      })
      view.focus()
    },

    /** 行首前缀（标题、引用、列表……）。同一前缀已存在则去掉。 */
    prefixLines(prefix: string) {
      const view = viewRef.current
      if (!view) return
      const sel = view.state.selection.main
      const doc = view.state.doc
      const first = doc.lineAt(sel.from)
      const last = doc.lineAt(sel.to)
      const lines = []
      for (let n = first.number; n <= last.number; n++) lines.push(doc.line(n))

      const allPrefixed = lines.every((l) => l.text.startsWith(prefix))
      const changes = lines.map((l) =>
        allPrefixed
          ? { from: l.from, to: l.from + prefix.length, insert: '' }
          : { from: l.from, to: l.from, insert: prefix },
      )
      view.dispatch({ changes, selection: { anchor: sel.from + (allPrefixed ? -prefix.length : prefix.length) } })
      view.focus()
    },

    /**
     * 设置标题级别。**替换**已有的 `#` 序列，而不是叠加。
     *
     * 用 `prefixLines` 做不到这件事：H3 上点 H5 会变成 `#####`（8 个井号），
     * 在 Markdown 里那不是标题。所以这里先把 `^#{1,6}\s+` 摘掉再加新的。
     */
    setHeading(level) {
      const view = viewRef.current
      if (!view) return
      const sel = view.state.selection.main
      const doc = view.state.doc
      const first = doc.lineAt(sel.from)
      const last = doc.lineAt(sel.to)
      const lines = []
      for (let n = first.number; n <= last.number; n++) lines.push(doc.line(n))

      const prefix = '#'.repeat(level) + (level > 0 ? ' ' : '')
      const changes = lines.map((l) => {
        const m = /^#{1,6}\s+/.exec(l.text)
        const stripTo = l.from + (m ? m[0].length : 0)
        return { from: l.from, to: stripTo, insert: prefix }
      })
      view.dispatch({ changes })
      view.focus()
    },

    /** 清掉选区（或整行）里的 Markdown 标记，只留文字。 */
    clearFormat() {
      const view = viewRef.current
      if (!view) return
      const sel = view.state.selection.main
      const doc = view.state.doc
      // 没选就取当前行
      const from = sel.to > sel.from ? sel.from : doc.lineAt(sel.from).from
      const to = sel.to > sel.from ? sel.to : doc.lineAt(sel.from).to
      const raw = doc.sliceString(from, to)
      const plain = stripMarkdown(raw)
      view.dispatch({
        changes: { from, to, insert: plain },
        selection: { anchor: from, head: from + plain.length },
      })
      view.focus()
    },

    setFindQuery(q) {
      const view = viewRef.current
      if (!view) return
      findQueryRef.current = q
      setQuery(view, q)
    },

    findNext() {
      const view = viewRef.current
      return view ? findNext(view) : false
    },

    findPrev() {
      const view = viewRef.current
      return view ? findPrev(view) : false
    },

    findStatus() {
      const view = viewRef.current
      return view ? findStatus(view) : null
    },
  }), [])

  useEffect(() => {
    if (!host.current) return

    const extensions = [
      history(),
      drawSelection(),
      bracketMatching(),
      EditorState.allowMultipleSelections.of(true),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      markdown({ base: markdownLanguage, codeLanguages: [] }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      findHighlight(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current?.(u.state.doc.toString())
        if (u.docChanged || u.selectionSet) {
          onHeadingLevelRef.current?.(headingLevelAtCursor(u.state))
        }
      }),
      ...(sourceMode ? [] : [markdownLivePreview({ reveal, renderTables })]),
    ]

    const view = new EditorView({
      state: EditorState.create({ doc: initialDoc, extensions }),
      parent: host.current,
    })
    viewRef.current = view
    // 视图是刚建的：查找词补回去，查找条开着的时候不会突然什么都不亮
    if (findQueryRef.current) setQuery(view, findQueryRef.current)
    view.focus()
    // 挂载时先报一次，否则工具栏会停留在上一篇笔记的级别上
    onHeadingLevelRef.current?.(headingLevelAtCursor(view.state))

    return () => {
      view.destroy()
      viewRef.current = null
    }
    // 刻意不依赖 initialDoc：调用方每次打字都会更新草稿，若在这里重建编辑器
    // 光标就没了。要换内容由调用方改 key 强制重挂（刷新、切标签都走这条路）。
  }, [reveal, sourceMode, renderTables])

  return <div ref={host} className="h-full w-full overflow-auto" />
}

/**
 * 光标所在行的标题级别；不是标题行返回 0。
 *
 * 用正则而不是 syntaxTree：`setHeading` 也是按同一个正则改写的，
 * 两边规则一致，工具栏显示的级别和点下去的结果不会打架。
 */
export function headingLevelAtCursor(state: EditorState): number {
  const line = state.doc.lineAt(state.selection.main.head)
  const m = /^#{1,6}\s+/.exec(line.text)
  return m ? m[0].trimEnd().length : 0
}

/**
 * 去掉 Markdown 标记，只留文字。
 *
 * 逐条规则而不是「一把正则」——每一条对应一种语法，读起来能对上。
 * 顺序有讲究：先处理带括号/嵌套的（链接、图片），再处理简单的包裹标记，
 * 否则链接的方括号会被后面的规则先啃掉一半。
 */
export function stripMarkdown(s: string): string {
  let out = s
  // 图片 ![alt](url) → alt；链接 [text](url) → text
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  // 行内代码与代码块围栏
  out = out.replace(/```[\s\S]*?```/g, (m) => m.replace(/```[^\n]*\n?/g, ''))
  out = out.replace(/`([^`]+)`/g, '$1')
  // 强调（先长后短，避免 ** 被 * 先吃掉一个）
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
  out = out.replace(/\*\*([^*]+)\*\*/g, '$1')
  out = out.replace(/\*([^*]+)\*/g, '$1')
  out = out.replace(/___([^_]+)___/g, '$1')
  out = out.replace(/__([^_]+)__/g, '$1')
  out = out.replace(/_([^_]+)_/g, '$1')
  out = out.replace(/~~([^~]+)~~/g, '$1')
  // 行首块级标记
  out = out.replace(/^\s{0,3}#{1,6}\s+/gm, '')
  out = out.replace(/^\s{0,3}>\s?/gm, '')
  out = out.replace(/^\s{0,3}[-*+]\s+/gm, '')
  out = out.replace(/^\s{0,3}\d+\.\s+/gm, '')
  out = out.replace(/^\s{0,3}([-*_]\s*){3,}$/gm, '')
  // 任务列表的勾选框
  out = out.replace(/^\s*\[[ xX]\]\s*/gm, '')
  return out
}

/** 只读预览用的最小渲染（不走 CodeMirror，够原型展示即可） */
export function plainPreview({ text }: { text: string }) {
  return <pre className="whitespace-pre-wrap text-sm" style={{ color: 'var(--content-secondary)' }}>{text}</pre>
}
