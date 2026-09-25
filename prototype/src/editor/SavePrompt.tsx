/**
 * 关闭有未保存改动的标签时的确认框。
 *
 * 三个出口：保存 / 不保存 / 取消。Esc 等同取消，Enter 等同保存——
 * 关标签是个高频动作，键盘能走完就不必找鼠标。
 */
import { useEffect } from 'react'

interface Props {
  title: string
  onSave: () => void
  onDiscard: () => void
  onCancel: () => void
}

export function SavePrompt({ title, onSave, onDiscard, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onSave])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/25"
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-80 rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <div className="text-sm font-medium text-slate-800">
          保存对「{title}」的更改？
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
          不保存的话，这次的修改会丢失。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
          >
            取消
          </button>
          <button
            onClick={onDiscard}
            className="rounded px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            不保存
          </button>
          <button
            onClick={onSave}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
