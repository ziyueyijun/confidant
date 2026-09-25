import { useCallback, useEffect, useMemo, useState } from 'react'
import { NOTES } from './data'
import { SyncFeature } from './sync/SyncFeature'
import { ControlBar, type PrototypeState } from './ControlBar'
import { 场景, type ScenarioKey } from './sync/data'
import type { SyntaxReveal } from './editor/markdownLivePreview'

/**
 * 原型入口。
 *
 * **只有一个界面。** 编辑器、文件树、标签页、大纲、同步都是它的部件，
 * 不是可以切换的几种形态——之前把它们做成「变体 A/B/C」是错的。
 *
 * URL 参数：?reveal=line|marker|never&source=1&scenario=ready|...
 * 键盘：← → 切换场景
 */
function readState(): PrototypeState {
  const p = new URLSearchParams(location.search)
  const r = p.get('reveal')
  const s = p.get('scenario')
  const 已知 = 场景.some((x) => x.key === s)
  return {
    reveal: r === 'marker' || r === 'never' ? r : 'line',
    sourceMode: p.get('source') === '1',
    renderTables: p.get('tables') !== '0',
    scenario: (已知 ? s : 'ready') as ScenarioKey,
  }
}

export default function App() {
  const [state, setState] = useState<PrototypeState>(readState)
  const [currentPath, setCurrentPath] = useState(NOTES[0].path)

  const update = useCallback((next: Partial<PrototypeState>) => {
    setState((s) => {
      const merged = { ...s, ...next }
      const p = new URLSearchParams()
      p.set('reveal', merged.reveal)
      if (merged.sourceMode) p.set('source', '1')
      if (!merged.renderTables) p.set('tables', '0')
      p.set('scenario', merged.scenario)
      history.replaceState(null, '', '?' + p.toString())
      return merged
    })
  }, [])

  // 左右方向键切换场景；输入框聚焦时不拦截
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      const editable = tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable
      if (editable) return

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const order = 场景.map((s) => s.key)
        const i = order.indexOf(state.scenario)
        const next =
          e.key === 'ArrowRight'
            ? (i + 1) % order.length
            : (i + order.length - 1) % order.length
        update({ scenario: order[next] })
      }
      // 源码视图开关
      if (e.ctrlKey && e.key === '/') {
        e.preventDefault()
        update({ sourceMode: !state.sourceMode })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.scenario, state.sourceMode, update])

  const shared = useMemo(
    () => ({
      reveal: state.reveal as SyntaxReveal,
      sourceMode: state.sourceMode,
      renderTables: state.renderTables,
      currentPath,
      onSelect: setCurrentPath,
    }),
    [state.reveal, state.sourceMode, state.renderTables, currentPath],
  )

  return (
    <div className="h-full w-full overflow-hidden">
      <SyncFeature scenario={state.scenario} {...shared} />
      <ControlBar state={state} onChange={update} />
    </div>
  )
}
