import type { SyntaxReveal } from './editor/markdownLivePreview'
import { 场景, 场景说明, type ScenarioKey } from './sync/data'

export interface PrototypeState {
  reveal: SyntaxReveal
  sourceMode: boolean
  renderTables: boolean
  scenario: ScenarioKey
}

interface Props {
  state: PrototypeState
  onChange: (next: Partial<PrototypeState>) => void
}

/**
 * 原型控制条。固定底部，视觉上刻意与界面本身区分（深色、高对比）。
 * 生产构建里会被移除——它只是用来切换实验变量的。
 */
export function ControlBar({ state, onChange }: Props) {
  return (
    <div className="fixed bottom-11 left-1/2 z-[60] -translate-x-1/2">
      <div className="flex items-center gap-3 whitespace-nowrap rounded-full bg-slate-900/95 px-4 py-2 text-xs text-slate-100 shadow-2xl backdrop-blur">
        <Group label="语法标记">
          <Pill active={state.reveal === 'line'} onClick={() => onChange({ reveal: 'line' })}>
            整行
          </Pill>
          <Pill active={state.reveal === 'marker'} onClick={() => onChange({ reveal: 'marker' })}>
            标记
          </Pill>
          <Pill active={state.reveal === 'never'} onClick={() => onChange({ reveal: 'never' })}>
            不展开
          </Pill>
        </Group>

        <Divider />

        <Pill active={state.sourceMode} onClick={() => onChange({ sourceMode: !state.sourceMode })}>
          源码
        </Pill>

        <Pill
          active={state.renderTables}
          onClick={() => onChange({ renderTables: !state.renderTables })}
        >
          表格
        </Pill>

        <Divider />

        <Group label="同步场景">
          {场景.map((s) => (
            <Pill
              key={s.key}
              active={state.scenario === s.key}
              onClick={() => onChange({ scenario: s.key })}
            >
              {s.label}
            </Pill>
          ))}
        </Group>
      </div>

      <div className="mt-1.5 whitespace-nowrap text-center text-[11px] text-slate-400">
        {场景说明(state.scenario)} · ← → 切换场景 · 这些开关只在原型里存在
      </div>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-slate-400">{label}</span>
      {children}
    </div>
  )
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 transition ${
        active ? 'bg-white font-medium text-slate-900' : 'text-slate-300 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="h-4 w-px bg-white/15" />
}
