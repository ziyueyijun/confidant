import { useEffect, useImperativeHandle, useRef } from 'react'
import type { Ref } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, highlightActiveLine, drawSelection } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language'
import { markdownLivePreview, type SyntaxReveal } from './markdownLivePreview'

/** 外部（如大纲）驱动编辑器的入口 */
export interface EditorApi {
  /** 滚到指定行并把光标放上去。line 是 0-based 行号。 */
  scrollToLine: (line: number) => void
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

/** 只读预览用的最小渲染（不走 CodeMirror，够原型展示即可） */
export function plainPreview({ text }: { text: string }) {
  return <pre className="whitespace-pre-wrap text-sm text-slate-600">{text}</pre>
}
