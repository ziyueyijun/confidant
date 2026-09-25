import { 状态栏文字, type SyncMock } from './data'

/**
 * 常驻状态栏——**同步是环境，不是地方**。
 *
 * ## 显示逻辑（这是本节最要紧的部分）
 *
 * **默认不显示任何同步信息。** 左区只在三种情况下出现：
 *
 * 1. **正在进行**——同步中、有待确认的删除。活动信号，必须可见。
 * 2. **需要你处理**——冲突、自动同步失败。待办信号，不冒出来用户就不知道。
 * 3. **本次会话刚同步过**——「上次同步于 X 分钟前」。
 *
 * 其余时候（未配置、已配置但没同步过、上次会话同步过）**整个左区是空的**。
 * 理由是「上次同步于 8 分钟前」这种话，用户看第二遍就没有信息量了，
 * 而它占着一个每天看几百次的位置。想看的人会去同步中心。
 *
 * **重启后不显示时间**——`sessionSynced` 是会话级的，这是刻意的。
 *
 * 右区是**文档信息**（字数、行数）——它是文档级的，与应用级入口（菜单）分开。
 */
export function StatusBar({
  mock,
  stats,
  onOpenSync,
}: {
  mock: SyncMock
  stats: { chars: number; lines: number }
  /** 点状态文字打开同步中心 */
  onOpenSync: () => void
}) {
  const s = mock.status
  const text = 状态栏文字(mock)

  // 有话说才给状态点与文字，否则整个左区不渲染
  const tone =
    s.phase === 'failed'
      ? 'text-amber-300'
      : s.phase === 'syncing'
        ? 'text-sky-300'
        : mock.conflicts.length > 0 || mock.pendingDeletes > 0
          ? 'text-amber-200'
          : 'text-slate-400'

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex h-7 items-center gap-3 border-t border-slate-800 bg-slate-900 px-3 text-[11px] text-slate-300">
      {/* ---- 左：同步。无话可说时整区消失 ---- */}
      {text && (
        <button
          onClick={onOpenSync}
          className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white/10"
          title="打开同步中心"
        >
          <Dot phase={s.phase} hasConflicts={mock.conflicts.length > 0} />
          <span className={tone}>{text}</span>
          {s.phase === 'idle' && s.sessionSynced && s.syncedFiles > 0 && (
            <span className="text-slate-500">· {s.syncedFiles} 个文件</span>
          )}
        </button>
      )}

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

      {/* 自动同步失败时，具体原因直接摊在状态栏上，不藏进弹窗 */}
      {s.phase === 'failed' && s.autoSync && s.error && (
        <span className="truncate text-amber-300/80">{s.error}</span>
      )}

      {/* ---- 右：文档信息 ---- */}
      <div className="ml-auto flex items-center gap-3 text-slate-500">
        <span>{stats.chars.toLocaleString()} 字</span>
        <span>{stats.lines} 行</span>
      </div>
    </div>
  )
}

function Dot({ phase, hasConflicts }: { phase: string; hasConflicts: boolean }) {
  const c =
    phase === 'failed'
      ? 'bg-amber-400'
      : phase === 'syncing'
        ? 'animate-pulse bg-sky-400'
        : hasConflicts
          ? 'bg-amber-400'
          : 'bg-emerald-400'
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${c}`} />
}
