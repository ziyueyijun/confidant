/**
 * 关闭有未保存改动的标签时的确认框。
 *
 * 三个出口：保存 / 不保存 / 取消。Esc 等同取消，Enter 等同保存——
 * 关标签是个高频动作，键盘能走完就不必找鼠标。
 *
 * 配色全部走主题变量：这个框在深色模式下是深底浅字，写死浅色会变成刺眼白块。
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
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(26,23,20,0.25)' }}
      onMouseDown={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-80 p-5"
        style={{
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'var(--surface-primary)',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div className="text-sm font-medium" style={{ color: 'var(--content-primary)' }}>
          保存对「{title}」的更改？
        </div>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--content-secondary)' }}>
          不保存的话，这次的修改会丢失。
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--content-secondary)' }}
          >
            取消
          </button>
          <button
            onClick={onDiscard}
            className="rounded px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--accent)' }}
          >
            不保存
          </button>
          <button
            onClick={onSave}
            className="rounded px-3 py-1.5 text-xs font-medium transition-colors"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
