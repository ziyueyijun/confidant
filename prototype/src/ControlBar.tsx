import type { SyntaxReveal } from './editor/markdownLivePreview'
import { 场景, 场景说明, type ScenarioKey } from './sync/data'
import type { Theme } from './App'

export interface PrototypeState {
  reveal: SyntaxReveal
  sourceMode: boolean
  renderTables: boolean
  scenario: ScenarioKey
}

interface Props {
  state: PrototypeState
  onChange: (next: Partial<PrototypeState>) => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
}

/**
 * 原型控制条。固定底部，视觉上刻意与界面本身区分（深色、高对比）。
 * 生产构建里会被移除——它只是用来切换实验变量的。
 */
export function ControlBar({ state, onChange, theme, onThemeChange }: Props) {
  return (
    <div className="proto-control-bar fixed bottom-11 left-1/2 z-[60] -translate-x-1/2">
      <div
        className="flex items-center gap-3 whitespace-nowrap rounded-full px-4 py-2 text-xs shadow-2xl backdrop-blur"
        style={{
          backgroundColor: 'var(--surface-secondary)',
          border: '1px solid var(--border-color)',
          color: 'var(--content-secondary)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {/* 主题切换 */}
        <button
          onClick={() => {
            const next = theme === 'light' ? 'dark' : 'light'
            onThemeChange(next)
          }}
          className="flex items-center gap-1.5 rounded-full px-2 py-0.5 transition-colors hover:bg-[var(--surface-hover)]"
          title="Ctrl+Shift+D 切换主题"
          style={{ color: 'var(--content-secondary)' }}
        >
          <span>{theme === 'dark' ? '🌙' : '☀️'}</span>
          <span style={{ color: 'var(--content-muted)' }}>{theme === 'dark' ? '深色' : '浅色'}</span>
        </button>

        <Divider />

        <Group label="语法">
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

        <Group label="同步">
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

      <div className="mt-1.5 whitespace-nowrap text-center text-[11px]" style={{ color: 'var(--content-muted)' }}>
        {场景说明(state.scenario)} · ← → 切换场景 · Ctrl+Shift+D 切换主题
      </div>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color: 'var(--content-muted)' }}>{label}</span>
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
      className="rounded-full px-2 py-0.5 transition-colors"
      style={{
        backgroundColor: active ? 'var(--accent)' : 'transparent',
        color: active ? 'white' : 'var(--content-secondary)',
      }}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="h-4 w-px" style={{ backgroundColor: 'var(--border-color)' }} />
}
