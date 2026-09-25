import { 状态文字, type SyncMock } from './data'

/**
 * 常驻状态栏——**同步是环境，不是地方**。
 *
 * 分两半，各管各的：
 * - **左半：同步**。状态点 + 一句话 + 进度条。只做指示与入口，**不做操作**
 *   （所有操作在同步中心里，避免同一件事有两个入口、两套样子）。
 * - **右半：文档**。字数、行数——**这是文档级信息，不是应用级入口**。
 *   设置住在菜单里（见 `AppMenu`）。
 *
 * 例外是同步中的进度条：那是「悄悄进行」的可见性，必须长在状态栏上。
 */
export function StatusBar({
  mock,
  stats,
  onOpenSync,
  onOpenConflicts,
}: {
  mock: SyncMock
  stats: { chars: number; lines: number }
  onOpenSync: () => void
  /** 跳到同步中心的冲突页——点「冲突 N」就该落在冲突上，不是落在概览 */
  onOpenConflicts: () => void
}) {
  const s = mock.status
  const tone =
    s.phase === 'failed'
      ? 'text-amber-300'
      : s.phase === 'syncing'
        ? 'text-sky-300'
        : 'text-slate-400'

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex h-7 items-center gap-3 border-t border-slate-800 bg-slate-900 px-3 text-[11px] text-slate-300">
      {/* ---- 左：同步 ---- */}
      <button
        onClick={onOpenSync}
        className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white/10"
        title="打开同步中心"
      >
        <Dot phase={s.phase} />
        <span className={tone}>{状态文字(s)}</span>
        {s.phase === 'idle' && s.minutesAgo !== null && (
          <span className="text-slate-500">· {s.syncedFiles} 个文件</span>
        )}
      </button>

      {/* 同步中的进度就长在状态栏里，不弹东西 */}
      {s.phase === 'syncing' && s.progress && (
        <>
          <div className="h-1 w-32 overflow-hidden rounded-full bg-slate-700">
            <div
              className="h-full bg-sky-400"
              style={{ width: `${(s.progress.done / s.progress.total) * 100}%` }}
            />
          </div>
          <span className="truncate text-slate-500">{s.currentFile}</span>
        </>
      )}

      {/* 失败时的原因直接摊在状态栏上，不藏在弹窗里 */}
      {s.phase === 'failed' && s.error && (
        <span className="truncate text-amber-300/80">{s.error}</span>
      )}

      {s.phase === 'never' && <span className="text-slate-500">· 尚未开始</span>}

      {mock.conflicts.length > 0 && (
        <button
          onClick={onOpenConflicts}
          className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-200 hover:bg-amber-500/30"
        >
          冲突 {mock.conflicts.length}
        </button>
      )}
      {mock.pendingDeletes > 0 && (
        <button
          onClick={onOpenSync}
          className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-200 hover:bg-red-500/30"
        >
          待删 {mock.pendingDeletes}
        </button>
      )}

      {/* ---- 右：文档信息 ---- */}
      <div className="ml-auto flex items-center gap-3 text-slate-500">
        <span>{stats.chars.toLocaleString()} 字</span>
        <span>{stats.lines} 行</span>
      </div>
    </div>
  )
}

function Dot({ phase }: { phase: string }) {
  const c =
    phase === 'failed'
      ? 'bg-amber-400'
      : phase === 'syncing'
        ? 'animate-pulse bg-sky-400'
        : phase === 'unconfigured'
          ? 'bg-slate-600'
          : 'bg-emerald-400'
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c}`} />
}
