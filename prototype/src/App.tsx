import { useCallback, useEffect, useMemo, useState } from 'react'
import { NOTES } from './data'
import { VariantA } from './variants/VariantA'
import { VariantB } from './variants/VariantB'
import { VariantC } from './variants/VariantC'
import { CaptureWindow, type CaptureShape } from './capture/CaptureWindow'
import { ControlBar, type PrototypeState } from './ControlBar'
import type { SyntaxReveal } from './editor/markdownLivePreview'

/**
 * 原型入口。
 *
 * 三个变体在**同一个页面**上切换，共用同一份数据与同一个编辑器内核——
 * 这样差异只来自布局本身，而不是别的东西。
 *
 * URL 参数：?variant=A|B|C&reveal=line|marker|never&source=1&capture=bar|card|inline
 * 键盘：← → 切换布局（输入框聚焦时不拦截）
 */
function readState(): PrototypeState {
  const p = new URLSearchParams(location.search)
  const v = p.get('variant')
  const r = p.get('reveal')
  const c = p.get('capture')
  return {
    variant: v === 'B' || v === 'C' ? v : 'A',
    reveal: r === 'marker' || r === 'never' ? r : 'line',
    sourceMode: p.get('source') === '1',
    renderTables: p.get('tables') !== '0',
    captureShape: c === 'card' || c === 'inline' ? c : 'bar',
  }
}

export default function App() {
  const [state, setState] = useState<PrototypeState>(readState)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [currentPath, setCurrentPath] = useState(NOTES[0].path)
  const [inbox, setInbox] = useState<string[]>([])

  const update = useCallback((next: Partial<PrototypeState>) => {
    setState((s) => {
      const merged = { ...s, ...next }
      const p = new URLSearchParams()
      p.set('variant', merged.variant)
      p.set('reveal', merged.reveal)
      if (merged.sourceMode) p.set('source', '1')
      if (!merged.renderTables) p.set('tables', '0')
      p.set('capture', merged.captureShape)
      history.replaceState(null, '', '?' + p.toString())
      return merged
    })
  }, [])

  // 左右方向键切换布局；输入框聚焦时不拦截
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable
      if (editable) return

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const order: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C']
        const i = order.indexOf(state.variant)
        const next = e.key === 'ArrowRight' ? (i + 1) % 3 : (i + 2) % 3
        update({ variant: order[next] })
      }
      // 全局捕捉快捷键
      if (e.ctrlKey && e.shiftKey && e.code === 'Space') {
        e.preventDefault()
        setCaptureOpen(true)
      }
      // 源码视图开关
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault()
        update({ sourceMode: !state.sourceMode })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.variant, state.sourceMode, update])

  const shared = useMemo(
    () => ({
      reveal: state.reveal as SyntaxReveal,
      sourceMode: state.sourceMode,
      renderTables: state.renderTables,
      onCapture: () => setCaptureOpen(true),
      currentPath,
      onSelect: setCurrentPath,
    }),
    [state.reveal, state.sourceMode, state.renderTables, currentPath],
  )

  return (
    <div className="h-full w-full overflow-hidden pb-0">
      {state.variant === 'A' && <VariantA {...shared} />}
      {state.variant === 'B' && <VariantB {...shared} />}
      {state.variant === 'C' && <VariantC {...shared} />}

      {captureOpen && (
        <CaptureWindow
          shape={state.captureShape as CaptureShape}
          onClose={() => setCaptureOpen(false)}
          onSave={(t) => setInbox((prev) => [...prev, t])}
        />
      )}

      {/* 捕捉到的内容在下角累积，证明"落进收件箱"这件事真的发生了 */}
      {inbox.length > 0 && (
        <div className="fixed bottom-4 left-4 z-40 max-w-xs rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow-lg">
          <div className="mb-1.5 font-medium text-slate-500">
            inbox.md（本次会话追加 {inbox.length} 条）
          </div>
          <ul className="space-y-0.5 text-slate-600">
            {inbox.slice(-4).map((t, i) => (
              <li key={i} className="truncate">
                · {t}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ControlBar state={state} onChange={update} onCapture={() => setCaptureOpen(true)} />
    </div>
  )
}
