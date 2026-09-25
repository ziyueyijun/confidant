import { useCallback, useEffect, useMemo, useState } from 'react'
import { NOTES } from './data'
import { VariantA } from './variants/VariantA'
import { VariantB } from './variants/VariantB'
import { VariantC } from './variants/VariantC'
import { CaptureWindow, type CaptureShape } from './capture/CaptureWindow'
import { ControlBar, type PrototypeState } from './ControlBar'
import { SyncPrototype } from './sync/SyncPrototype'
import type { SyntaxReveal } from './editor/markdownLivePreview'

/**
 * 原型入口。
 *
 * 两组原型共用这一个壳：
 * 1. **布局原型**（#8）：编辑器 / 捕捉窗口 / 三种布局
 * 2. **同步原型**（#19）：三种同步界面形态
 *
 * 用 `?proto=sync` 切到第二组。两组不混着看——它们回答的是不同的问题。
 *
 * URL 参数：?proto=layout|sync&variant=A|B|C&reveal=line|marker|never&source=1
 *          &capture=bar|card|inline&scenario=idle|syncing|failed|first|conflicts|danger|unconfigured
 * 键盘：← → 切换变体（输入框聚焦时不拦截）
 */
function readState(): PrototypeState {
  const p = new URLSearchParams(location.search)
  const v = p.get('variant')
  const r = p.get('reveal')
  const c = p.get('capture')
  return {
    proto: p.get('proto') === 'sync' ? 'sync' : 'layout',
    variant: v === 'B' || v === 'C' ? v : 'A',
    reveal: r === 'marker' || r === 'never' ? r : 'line',
    sourceMode: p.get('source') === '1',
    renderTables: p.get('tables') !== '0',
    captureShape: c === 'card' || c === 'inline' ? c : 'bar',
    scenario: p.get('scenario') ?? 'idle',
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
      p.set('proto', merged.proto)
      p.set('variant', merged.variant)
      p.set('reveal', merged.reveal)
      if (merged.sourceMode) p.set('source', '1')
      if (!merged.renderTables) p.set('tables', '0')
      p.set('capture', merged.captureShape)
      if (merged.proto === 'sync') p.set('scenario', merged.scenario)
      history.replaceState(null, '', '?' + p.toString())
      return merged
    })
  }, [])

  // 左右方向键切换变体；输入框聚焦时不拦截
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
      // 全局捕捉快捷键（只在布局原型里有意义）
      if (state.proto === 'layout' && e.ctrlKey && e.shiftKey && e.code === 'Space') {
        e.preventDefault()
        setCaptureOpen(true)
      }
      // 源码视图开关
      if (state.proto === 'layout' && e.ctrlKey && e.key === '/') {
        e.preventDefault()
        update({ sourceMode: !state.sourceMode })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.variant, state.sourceMode, state.proto, update])

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
      {state.proto === 'layout' ? (
        <>
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
        </>
      ) : (
        <SyncPrototype variant={state.variant} scenario={state.scenario} />
      )}

      <ControlBar state={state} onChange={update} onCapture={() => setCaptureOpen(true)} />
    </div>
  )
}
