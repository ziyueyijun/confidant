import { useEffect, useImperativeHandle, useRef } from 'react'
import type { Ref } from 'react'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { markdownLivePreview, type SyntaxReveal } from './markdownLivePreview'

/** 外部（如大纲、工具栏）驱动编辑器的入口 */
export interface EditorApi {
  /** 滚到指定行并把光标放上去。line 是 0-based 行号。 */
  scrollToLine: (line: number) => void
  /** 在光标处插入文本（工具栏用） */
  insert: (text: string) => void
  /** 用包裹标记包住选区（粗体、斜体……）；已包裹则去掉 */
  wrap: (before: string, after: string, placeholder: string) => void
  /** 把当前行（或选中的若干行）的行首加上前缀；已有则去掉 */
  prefixLines: (prefix: string) => void
  /** 清掉选区内的 Markdown 标记，只留文字 */
  clearFormat: () => void
}

interface Props {
  initialDoc: string
  reveal: SyntaxReveal
  sourceMode: boolean
  renderTables: boolean
  onChange?: (text: string) => void
  ref?: Ref<EditorApi>
}

/**
 * 原型用的最小编辑器和封装。
 * 刻意不做的：文件读写、撤销持久化、多光标特殊处理、粘贴图片。
 * 只做「能打字、能看手感」这一件事。
 */
export function MarkdownEditor({ initialDoc, reveal, sourceMode, renderTables, onChange, ref }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // 把回调放进 ref，避免因回调变化重建编辑器（那会丢光标）
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

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
  }), [])

  useEffect(() => {
    if (!host.current) return

    const extensions = [
      history(),
      drawSelection(),
      highlightActiveLine(),
      bracketMatching(),
      EditorState.allowMultipleSelections.of(true),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
      markdown({ base: markdownLanguage, codeLanguages: [] }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current?.(u.state.doc.toString())
      }),
      ...(sourceMode ? [] : [markdownLivePreview({ reveal, renderTables })]),
    ]

    const view = new EditorView({
      state: EditorState.create({ doc: initialDoc, extensions }),
      parent: host.current,
    })
    viewRef.current = view
    view.focus()

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
  return <pre className="whitespace-pre-wrap text-sm text-slate-600">{text}</pre>
}
