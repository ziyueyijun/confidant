import { useEffect, useRef, useState } from 'react'
import { 捕捉示例 } from '../data'

export type CaptureShape = 'bar' | 'card' | 'inline'

interface Props {
  shape: CaptureShape
  onClose: () => void
  onSave: (text: string) => void
}

/**
 * 捕捉窗口的三种形态。
 *
 * 票面的问题：「捕捉完自动关闭还是常驻？落进收件箱的哪个位置？」
 * 三种形态给了不同的答案，请实际打字体验：
 *
 *   bar   —— 屏幕顶部的窄条，单行，回车即存并关闭。最快，适合"一句话"。
 *   card  —— 屏幕中央的卡片，多行，存完停留 1 秒显示"已存入收件箱"。适合两三句。
 *   inline—— 不弹窗，直接在收件箱文件末尾插入一行并聚焦。最"文件即真相"。
 *
 * 三者都对"追加到文件末尾"这件事给出同一答案（都追加到末尾）。
 * 真正的分歧在于：**弹窗 vs 不弹窗**，以及**存完是否立刻消失**。
 */
export function CaptureWindow({ shape, onClose, onSave }: Props) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = () => {
    const t = text.trim()
    if (!t) return onClose()
    onSave(t)
    if (shape === 'card') {
      setSaved(true)
      setTimeout(onClose, 900)
    } else {
      onClose()
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && shape !== 'card') {
      e.preventDefault()
      save()
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      save()
    }
  }

  const hint =
    shape === 'card' ? 'Ctrl+Enter 保存 · Esc 取消' : 'Enter 保存 · Shift+Enter 换行 · Esc 取消'

  if (shape === 'bar') {
    return (
      <Overlay onClick={onClose}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-[42rem] overflow-hidden rounded-lg bg-white shadow-2xl ring-1 ring-black/5"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-slate-400">
            <span>捕捉到收件箱</span>
            <span className="ml-auto">{hint}</span>
          </div>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder="想到什么…"
            className="block w-full resize-none px-3.5 pb-2.5 text-[15px] leading-relaxed outline-none placeholder:text-slate-300"
          />
        </div>
      </Overlay>
    )
  }

  if (shape === 'card') {
    return (
      <Overlay onClick={onClose}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-[36rem] overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/5"
        >
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-400">
            <span>捕捉到收件箱</span>
            <span className="ml-auto">{hint}</span>
          </div>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={5}
            placeholder="想到什么…（可以多写几句）"
            className="block w-full resize-none px-4 py-3 text-[15px] leading-relaxed outline-none placeholder:text-slate-300"
          />
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
            <div className="flex gap-1">
              {捕捉示例.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setText(s)}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-200"
                >
                  示例 {i + 1}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {saved ? (
                <span className="text-xs text-green-600">已存入收件箱</span>
              ) : (
                <>
                  <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">
                    取消
                  </button>
                  <button
                    onClick={save}
                    className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    保存
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </Overlay>
    )
  }

  // inline：不弹窗，在文档末尾插入并聚焦
  return (
    <Overlay onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[40rem] overflow-hidden rounded-lg border-2 border-dashed border-blue-300 bg-white/95 p-4 shadow-xl"
      >
        <div className="mb-2 text-xs text-slate-400">
          在 <code className="rounded bg-slate-100 px-1">inbox.md</code> 末尾插入一行
        </div>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="- 想到什么…"
          className="block w-full resize-none rounded border border-slate-200 px-3 py-2 text-[15px] leading-relaxed outline-none focus:border-blue-400 placeholder:text-slate-300"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
          <span>{hint}</span>
          <span>存完光标停在文件末尾，不关闭编辑器</span>
        </div>
      </div>
    </Overlay>
  )
}

function Overlay({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/10 pt-[14vh] backdrop-blur-[1px]"
    >
      {children}
    </div>
  )
}
