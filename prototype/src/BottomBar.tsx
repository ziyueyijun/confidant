import { 状态栏文字, type SyncMock } from './sync/data'
import type { Theme } from './App'
import { IconFocus, IconMoon, IconSettings, IconSun, IconSync } from './icons'

/**
 * 底部栏——**应用级的常驻一行**。
 *
 * ## 左边那一段与文件树同宽
 *
 * 传了 `alignWidth`（就是文件树的宽度）时，左边这一段就**正好压在文件树下面**，
 * 它的右边框与文件树的右边框在同一条竖线上——竖线从上到下一整条不断，
 * 读起来是「左列：上面文件树、下面入口」。
 * 不传时（专注模式、或文件树收起了）就缩成一组按钮，不画右边框：
 * 那会儿上面没有一列可以对齐，硬画一条线只会跟文件树的边框错开。
 *
 * 段里的按钮**均分这一段的宽度**（`flex-1`），跟侧栏那条工具条一个做法：
 * 220px 的段里挤着 4 个 24px 的按钮，右边会空出一大片。
 *
 * **这一排只放「应用级」的入口**：设置、同步中心、主题、专注模式。
 * 搜索与工作空间**不在这里**——搜索住在它搜的那一列的上方（文件树那条工具条），
 * 工作空间住进设置（它是一项配置，不是常驻动作）。
 *
 * ## 中间为什么只有同步状态，没有文件名
 *
 * 同步中的**进度**要看得见（正在进行是活动信号），但**正在处理哪个文件**
 * 不该出现在这一行：一个随机滚动的文件名对用户没有任何可行动的信息，
 * 却在这一条每天看几百次的位置上不停闪。要看细节的人去同步中心。
 *
 * ## 中间那块为什么用 grid 而不是 flex
 *
 * 它要**相对右边这一整块**居中。用 flex + `mx-auto` 的话，它居中于
 * 「左边按钮占完之后剩下的空间」，左边按钮一变多就偏——同一个位置，
 * 状态一会儿偏左一会儿偏右，看起来像在抖。`1fr auto 1fr` 让左右两列
 * 各占等分，中间那块才是真的在正中。
 */
export function BottomBar({
  mock,
  stats,
  theme,
  onThemeChange,
  focusMode,
  onToggleFocus,
  onOpenSettings,
  onOpenSync,
  alignWidth,
}: {
  mock: SyncMock
  stats: { chars: number; lines: number }
  theme: Theme
  onThemeChange: (theme: Theme) => void
  focusMode: boolean
  onToggleFocus: () => void
  onOpenSettings: () => void
  /** 点状态文字、或点「同步中心」都打开同步中心 */
  onOpenSync: () => void
  /** 左边那一段的宽度（文件树有多宽就多宽）。不给就缩成一组按钮 */
  alignWidth?: number
}) {
  const s = mock.status
  const text = 状态栏文字(mock)

  // 有话说才给状态点与文字，否则整块不渲染
  // 状态文字用 content-primary 保证对比度
  const statusColor =
    s.phase === 'failed' || s.phase === 'syncing' || mock.conflicts.length > 0 || mock.pendingDeletes > 0
      ? 'var(--accent)'
      : 'var(--content-primary)'

  const 对齐 = alignWidth !== undefined

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 flex h-7 items-stretch border-t"
      style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-color)' }}
    >
      {/* ---- 左：与文件树同宽的那一段 ---- */}
      <div
        className="flex shrink-0 items-center gap-0.5 px-2"
        style={{
          width: alignWidth,
          borderRight: 对齐 ? '1px solid var(--border-color)' : undefined,
        }}
      >
        <BarButton label="设置" align={对齐} onClick={onOpenSettings}>
          <IconSettings />
        </BarButton>
        <BarButton label="同步中心" align={对齐} onClick={onOpenSync}>
          <IconSync />
        </BarButton>
        <BarButton
          label={theme === 'dark' ? '切换到亮色模式' : '切换到深色模式'}
          align={对齐}
          onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <IconSun /> : <IconMoon />}
        </BarButton>
        {/* 专注模式是**开关**：开着的时候按钮自己亮着——
            两侧栏都没了，它是界面上唯一说明"为什么只剩正文"的东西。 */}
        <BarButton
          label={focusMode ? '退出专注模式' : '专注模式'}
          align={对齐}
          active={focusMode}
          onClick={onToggleFocus}
        >
          <IconFocus />
        </BarButton>
      </div>

      {/* ---- 右：状态居中、文档信息靠右 ---- */}
      <div
        className="grid min-w-0 flex-1 grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-3 px-2 text-[11px]"
        style={{ color: 'var(--content-secondary)' }}
      >
        <span />

        {/* 无话可说时整块消失。min-w-0 + overflow-hidden：失败场景那句错误很长
            （「连接超时（dav.example.com 30 秒无响应）。下次启动会自动重试。」），
            窄窗口里得截断而不是把左右两块挤出去 */}
        <div className="flex min-w-0 items-center justify-center gap-3 overflow-hidden">
          {text && (
            <button
              onClick={onOpenSync}
              className="flex shrink-0 items-center gap-1.5 rounded px-1 py-0.5 transition-colors hover:bg-[var(--surface-hover)]"
              title="打开同步中心"
            >
              <Dot phase={s.phase} hasConflicts={mock.conflicts.length > 0} />
              <span style={{ color: statusColor }}>{text}</span>
              {s.phase === 'idle' && s.sessionSynced && s.syncedFiles > 0 && (
                <span style={{ color: 'var(--content-muted)' }}>· {s.syncedFiles} 个文件</span>
              )}
            </button>
          )}

          {/* 同步中的进度条——只到「多少 / 共多少」，不报正在处理哪个文件 */}
          {s.phase === 'syncing' && s.progress && (
            <div className="h-1 w-32 shrink-0 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--surface-tertiary)' }}>
              <div
                className="h-full"
                style={{ width: `${(s.progress.done / s.progress.total) * 100}%`, backgroundColor: 'var(--accent)' }}
              />
            </div>
          )}

          {/* 同步失败时——错误原文照说（「连接超时」而非「同步失败」） */}
          {s.phase === 'failed' && s.error && (
            <span className="truncate" style={{ color: 'var(--accent)' }}>{s.error}</span>
          )}
        </div>

        <div className="flex items-center justify-end gap-3" style={{ color: 'var(--content-muted)' }}>
          <span>{stats.chars.toLocaleString()} 字</span>
          <span>{stats.lines} 行</span>
        </div>
      </div>
    </div>
  )
}

/**
 * 底部栏里的按钮。
 *
 * 只有图标，没有文字——这一行只有 28px 高，塞不下标签。名字走
 * `aria-label` 与 tooltip。24×24 是可点区域的下限（WCAG 2.5.8），
 * 再小就点不准了——文件树的最小宽度就是照这个定的（见 AppShell）。
 */
function BarButton({
  label,
  align,
  active,
  onClick,
  children,
}: {
  label: string
  /** 是否跟着文件树宽度均分。对齐时按钮被拉宽，图标仍然居中 */
  align: boolean
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-6 items-center justify-center rounded-md transition-colors hover:bg-[var(--surface-hover)] ${
        align ? 'min-w-0 flex-1' : 'w-6 shrink-0'
      }`}
      style={{
        backgroundColor: active ? 'var(--solid-bg)' : undefined,
        // content-secondary 而不是 muted：muted 在这个底色上低于图标的 3:1 底线。
        // 按下态用实心墨色，深色下自动反转——朱砂留给"活着的东西"。
        color: active ? 'var(--solid-fg)' : 'var(--content-secondary)',
      }}
    >
      {children}
    </button>
  )
}

function Dot({ phase, hasConflicts }: { phase: string; hasConflicts: boolean }) {
  const c =
    phase === 'failed'
      ? 'var(--accent)'
      : phase === 'syncing'
        ? 'var(--accent)'
        : hasConflicts
          ? 'var(--accent)'
          : '#5A8A4A' // 草绿表示一切正常
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c, animation: phase === 'syncing' ? 'pulse 1.5s ease-in-out infinite' : undefined }} />
}

