import { useState } from 'react'
import { 状态文字, 配置, type SyncMock, type Conflict } from './data'

/**
 * 同步中心——**弹窗**。
 *
 * 它是一个「专门处理一件事」的界面：处理完就关掉，不该长期占着内容区。
 * 内部两个页签：概览（状态 + 待处理 + 操作）、冲突（待处理的副本列表）。
 *
 * 页签放在**内容区顶部**而不是标题栏——「同步中心」是标题，
 * 页签是导航，两者不是一回事。把标题做成页签会让人以为点它有反应。
 *
 * **弹窗高度固定**，与设置弹窗同一个值（640px / 85vh 兜底）：两个页签的
 * 内容长短差得远（概览四块、冲突可能只有两条），跟着内容变的话，切一下页签
 * 整个窗口跳一次，用户还得重新找刚才那个按钮在哪儿。
 */
export function SyncCenterDialog({
  mock,
  onClose,
  onOverlay,
}: {
  mock: SyncMock
  onClose: () => void
  onOverlay: (o: 'first' | 'delete' | { conflict: Conflict }) => void
}) {
  const hasConflicts = mock.conflicts.length > 0
  const [tab, setTab] = useState<'overview' | 'conflicts'>(
    hasConflicts ? 'conflicts' : 'overview',
  )
  const [armed, setArmed] = useState<null | '上传' | '下载'>(null)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(26,23,20,0.15)' }}>
      <div className="flex h-[640px] max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden shadow-2xl" style={{ borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--surface-primary)', border: '1px solid var(--border-color)' }}>
        <div className="flex shrink-0 items-center px-4 py-2.5" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--content-primary)' }}>同步中心</span>
          <button
            onClick={onClose}
            className="ml-auto rounded px-2 py-0.5 text-xs transition-colors hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--content-muted)' }}
          >
            关闭
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-1 px-4" style={{ borderBottom: '1px solid var(--rule-soft)', backgroundColor: 'var(--surface-secondary)' }}>
            {(['overview', 'conflicts'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="-mb-px border-b-2 px-3 py-2 text-xs transition"
                style={{
                  borderColor: tab === t ? 'var(--accent)' : 'transparent',
                  color: tab === t ? 'var(--accent)' : 'var(--content-secondary)',
                  fontWeight: tab === t ? 500 : 400,
                }}
              >
                {{ overview: '概览', conflicts: '冲突' }[t]}
                {t === 'conflicts' && hasConflicts && (
                  <span className="ml-1.5 rounded px-1 text-[10px]" style={{ backgroundColor: 'var(--accent)', color: 'white' }}>
                    {mock.conflicts.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto" style={{ backgroundColor: 'var(--surface-secondary)' }}>
            <div className="p-5">
              {tab === 'overview' ? (
                <div className="space-y-4">
                  <StatusCard mock={mock} onOverlay={onOverlay} />
                  {mock.pendingDeletes > 0 && (
                    <DeleteWarning count={mock.pendingDeletes} onOverlay={onOverlay} />
                  )}
                  <PendingSection
                    mock={mock}
                    onJumpToConflicts={hasConflicts ? () => setTab('conflicts') : undefined}
                  />
                  <Operations mock={mock} armed={armed} setArmed={setArmed} />
                </div>
              ) : (
                <ConflictList
                  conflicts={mock.conflicts}
                  onOpen={(c) => onOverlay({ conflict: c })}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 区块

function StatusCard({
  mock,
  onOverlay,
}: {
  mock: SyncMock
  onOverlay: (o: 'first' | 'delete') => void
}) {
  const s = mock.status
  return (
    <section className="rounded-lg border p-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)' }}>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm font-semibold" style={{ color: 'var(--content-primary)' }}>{状态文字(s)}</div>
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--content-muted)' }}>
            {s.phase === 'unconfigured'
              ? '还没填 WebDAV 信息，去菜单 →「设置…」里填好就能开始同步。'
              : `远端 ${配置.server}${配置.path}`}
          </div>
        </div>
        {s.phase === 'never' && (
          <button
            onClick={() => onOverlay('first')}
            className="rounded-md px-3 py-1.5 text-xs text-white transition-colors"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            开始首次同步
          </button>
        )}
        {s.phase === 'failed' && (
          <button className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-hover)]" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-secondary)' }}>
            立即重试
          </button>
        )}
      </div>

      {s.phase === 'syncing' && s.progress && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--surface-tertiary)' }}>
            <div
              className="h-full"
              style={{ width: `${(s.progress.done / s.progress.total) * 100}%`, backgroundColor: 'var(--accent)' }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px]" style={{ color: 'var(--content-muted)' }}>
            <span className="truncate">{s.currentFile}</span>
            <span className="shrink-0">
              {s.progress.done} / {s.progress.total}
            </span>
          </div>
        </div>
      )}

      {s.phase === 'failed' && s.error && (
        <div className="mt-3 rounded-md border px-3 py-2 text-[11px] leading-relaxed" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-hover)' }}>
          {s.error}
        </div>
      )}
    </section>
  )
}

function DeleteWarning({
  count,
  onOverlay,
}: {
  count: number
  onOverlay: (o: 'delete') => void
}) {
  return (
    <section className="rounded-lg border p-4" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--accent-subtle)' }}>
      <div className="text-xs font-medium" style={{ color: 'var(--accent-hover)' }}>这次同步要删 {count} 篇笔记</div>
      <div className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--accent)' }}>
        超过阈值（10 篇），需要你确认后才会继续。
      </div>
      <button
        onClick={() => onOverlay('delete')}
        className="mt-2 rounded-md px-3 py-1.5 text-xs text-white transition-colors"
        style={{ backgroundColor: 'var(--accent-hover)' }}
      >
        查看并确认
      </button>
    </section>
  )
}

function PendingSection({
  mock,
  onJumpToConflicts,
}: {
  mock: SyncMock
  /** 选项卡布局里，点冲突数跳到冲突页；单页布局里冲突就在下面，不需要跳 */
  onJumpToConflicts?: () => void
}) {
  const byKind = (k: string) => mock.changes.filter((c) => c.kind === k).length
  if (byKind('upload') === 0 && byKind('download') === 0 && mock.conflicts.length === 0) {
    return null
  }
  return (
    <section className="rounded-lg border p-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)' }}>
      <div className="mb-2.5 text-xs font-medium" style={{ color: 'var(--content-primary)' }}>待处理</div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="本地改动待上传" value={byKind('upload')} />
        <Stat label="远端改动待下载" value={byKind('download')} />
        <Stat
          label="冲突待处理"
          value={mock.conflicts.length}
          tone="accent"
          onClick={onJumpToConflicts}
        />
      </div>
    </section>
  )
}

function Operations({
  mock,
  armed,
  setArmed,
}: {
  mock: SyncMock
  armed: null | '上传' | '下载'
  setArmed: (a: null | '上传' | '下载') => void
}) {
  const byKind = (k: string) => mock.changes.filter((c) => c.kind === k).length
  return (
    <section className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)' }}>
      <div className="border-b px-4 py-2.5 text-xs font-medium" style={{ borderColor: 'var(--rule-soft)', color: 'var(--content-primary)' }}>
        操作
      </div>

      <CommandRow
        title="同步"
        desc="合并两边的改动"
        consequence="不覆盖任何一侧；两边都改过的走冲突处理"
        tone="safe"
        action={
          <button className="rounded-md px-3 py-1.5 text-xs transition-colors" style={{ backgroundColor: 'var(--solid-bg)', color: 'var(--solid-fg)' }}>
            执行
          </button>
        }
      />

      <CommandRow
        title="上传"
        desc="以本地为准，推送到远端"
        consequence="远端不同的文件会被无条件覆盖"
        tone="danger"
        action={
          armed === '上传' ? (
            <ConfirmInline
              word="上传"
              target={`远端 ${byKind('download') + mock.conflicts.length} 个不同的文件`}
              onCancel={() => setArmed(null)}
            />
          ) : (
            <button
              onClick={() => setArmed('上传')}
              className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-red-50"
              style={{ borderColor: '#dc2626', color: '#dc2626' }}
            >
              上传…
            </button>
          )
        }
      />

      <CommandRow
        title="下载"
        desc="以远端为准，拉取到本地"
        consequence="本地不同的文件会被无条件覆盖"
        tone="danger"
        action={
          armed === '下载' ? (
            <ConfirmInline
              word="下载"
              target={`本地 ${byKind('upload') + mock.conflicts.length} 个不同的文件`}
              onCancel={() => setArmed(null)}
            />
          ) : (
            <button
              onClick={() => setArmed('下载')}
              className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-red-50"
              style={{ borderColor: '#dc2626', color: '#dc2626' }}
            >
              下载…
            </button>
          )
        }
      />
    </section>
  )
}

function Stat({
  label,
  value,
  tone,
  onClick,
}: {
  label: string
  value: number
  tone?: 'accent'
  onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className="rounded-md border px-2.5 py-2 text-left"
      style={{
        borderColor: tone === 'accent' && value > 0 ? 'var(--accent)' : 'var(--border-color)',
        backgroundColor: tone === 'accent' && value > 0 ? 'var(--accent-subtle)' : 'var(--surface-secondary)',
      }}
    >
      <div className="text-[10px]" style={{ color: 'var(--content-muted)' }}>{label}</div>
      <div className="text-base font-semibold" style={{ color: 'var(--content-primary)' }}>{value}</div>
    </Comp>
  )
}

function CommandRow({
  title,
  desc,
  consequence,
  tone,
  action,
}: {
  title: string
  desc: string
  consequence: string
  tone: 'safe' | 'danger'
  action: React.ReactNode
}) {
  return (
    <div
      className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
      style={{
        borderColor: 'var(--border-color)',
        backgroundColor: tone === 'danger' ? 'rgba(220,38,38,0.04)' : 'transparent',
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-medium"
            style={{ color: tone === 'danger' ? '#dc2626' : 'var(--content-primary)' }}
          >
            {title}
          </span>
          <span className="text-[11px]" style={{ color: 'var(--content-muted)' }}>{desc}</span>
        </div>
        <div
          className="mt-0.5 text-[11px]"
          style={{ color: tone === 'danger' ? '#dc2626' : 'var(--content-muted)' }}
        >
          {tone === 'danger' ? '⚠ ' : ''}
          {consequence}
        </div>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}

function ConfirmInline({
  word,
  target,
  onCancel,
}: {
  word: string
  target: string
  onCancel: () => void
}) {
  const [typed, setTyped] = useState('')
  const ok = typed === word
  return (
    <div className="flex items-center gap-1.5">
      <div className="text-right text-[10px] leading-tight" style={{ color: '#dc2626' }}>
        <div>将覆盖{target}</div>
        <div style={{ color: 'var(--content-muted)' }}>
          输入 <span className="font-mono font-medium">{word}</span> 确认
        </div>
      </div>
      <input
        autoFocus
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="w-16 rounded-md border px-1.5 py-0.5 text-xs outline-none"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)' }}
      />
      <button
        disabled={!ok}
        className="rounded-md px-2 py-1 text-xs"
        style={{
          backgroundColor: ok ? '#dc2626' : 'var(--surface-tertiary)',
          color: ok ? 'white' : 'var(--content-muted)',
        }}
      >
        执行
      </button>
      <button
        onClick={onCancel}
        className="rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-[var(--surface-hover)]"
        style={{ color: 'var(--content-muted)' }}
      >
        取消
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- 冲突

function ConflictList({
  conflicts,
  onOpen,
}: {
  conflicts: Conflict[]
  onOpen: (c: Conflict) => void
}) {
  if (conflicts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-16 text-center" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)' }}>
        <div className="text-sm" style={{ color: 'var(--content-muted)' }}>没有待处理的冲突</div>
        <div className="mt-1 text-[11px]" style={{ color: 'var(--content-muted)' }}>
          两处都改了同一篇且无法自动合并时，会出现在这里
        </div>
      </div>
    )
  }

  return (
    <section className="rounded-lg border p-4" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--surface-primary)' }}>
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium" style={{ color: 'var(--content-primary)' }}>待处理的冲突</span>
        <span className="text-[11px]" style={{ color: 'var(--accent)' }}>{conflicts.length} 条</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--content-muted)' }}>
        两处都改了同一篇、且无法自动合并。副本存在{' '}
        <code className="rounded px-1" style={{ backgroundColor: 'var(--surface-tertiary)' }}>.confidant/conflicts/</code>
        ，它们是真实的 <code className="rounded px-1" style={{ backgroundColor: 'var(--surface-tertiary)' }}>.md</code> 文件，
        用记事本也能打开。处理完就从这里消失。
      </p>

      <div className="mt-3 space-y-2">
        {conflicts.map((c) => (
          <div key={c.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--accent-subtle)' }}>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--content-primary)' }}>{c.path}</span>
              <span className="ml-auto text-[10px]" style={{ color: 'var(--content-muted)' }}>
                {c.at} · 来自 {c.from}
              </span>
            </div>
            <div className="mt-1 truncate font-mono text-[10px]" style={{ color: 'var(--content-muted)' }}>{c.copyName}</div>
            <div className="mt-2.5 flex items-center gap-2">
              <button className="rounded-md px-3 py-1.5 text-xs transition-colors" style={{ backgroundColor: 'var(--solid-bg)', color: 'var(--solid-fg)' }}>
                保留我的
              </button>
              <button className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-hover)]" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-secondary)' }}>
                保留远端的
              </button>
              <button
                onClick={() => onOpen(c)}
                className="rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-hover)]" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-secondary)' }}>
                手工合并…
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ConflictCompare({
  conflict,
  onClose,
}: {
  conflict: Conflict
  onClose: () => void
}) {
  const [pick, setPick] = useState<'local' | 'remote' | null>(null)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(26,23,20,0.2)' }}>
      <div className="w-full max-w-4xl overflow-hidden shadow-2xl" style={{ borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--surface-primary)', border: '1px solid var(--border-color)' }}>
        <div className="flex items-baseline justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--content-primary)' }}>{conflict.path}</h3>
            <div className="font-mono text-[10px]" style={{ color: 'var(--content-muted)' }}>{conflict.copyName}</div>
          </div>
          <button onClick={onClose} className="text-xs transition-colors hover:bg-[var(--surface-hover)]" style={{ color: 'var(--content-muted)' }}>
            关闭
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-4">
          {(
            [
              ['local', '本地（我的）', '这台机器上的版本', conflict.localBody],
              ['remote', '远端（另一台）', `来自 ${conflict.from}`, conflict.remoteBody],
            ] as const
          ).map(([key, title, sub, body]) => (
            <button
              key={key}
              onClick={() => setPick(key)}
              className="rounded-lg border-2 text-left transition"
              style={{
                borderColor: pick === key ? 'var(--accent)' : 'var(--border-color)',
                backgroundColor: pick === key ? 'var(--accent-subtle)' : 'var(--surface-primary)',
              }}
            >
              <div className="border-b px-3 py-2" style={{ borderColor: 'var(--rule-soft)' }}>
                <div className="text-xs font-medium" style={{ color: 'var(--content-primary)' }}>{title}</div>
                <div className="text-[10px]" style={{ color: 'var(--content-muted)' }}>{sub}</div>
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-3 py-2.5 font-sans text-[12px] leading-[1.8]" style={{ color: 'var(--content-secondary)' }}>
                {body}
              </pre>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--rule-soft)', backgroundColor: 'var(--surface-secondary)' }}>
          <span className="text-[11px]" style={{ color: 'var(--content-muted)' }}>
            {pick ? '点「采用」后，另一份会保留为副本。' : '点一边把它选为最终版本。'}
          </span>
          <button
            disabled={!pick}
            className="ml-auto rounded-md px-3 py-1.5 text-xs"
            style={{
              backgroundColor: pick ? 'var(--content-primary)' : 'var(--surface-tertiary)',
              color: pick ? 'white' : 'var(--content-muted)',
            }}
          >
            采用选中的版本
          </button>
        </div>
      </div>
    </div>
  )
}
