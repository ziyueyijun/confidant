import { useState } from 'react'
import { 状态文字, 配置, type SyncMock, type Conflict } from './data'

/**
 * 同步中心——**弹窗**。
 *
 * 它是一个「专门处理一件事」的界面：处理完就关掉，不该长期占着内容区。
 * 所以用弹窗而不是整页——弹窗天然表达「这是个任务，不是个地方」。
 *
 * 三个按钮的区分：每条命令占一整行、右侧直写后果；覆盖类要求输入确认词
 * 并显示具体影响范围。
 */
export function SyncCenterDialog({
  mock,
  tab,
  setTab,
  armed,
  setArmed,
  onClose,
  onOverlay,
}: {
  mock: SyncMock
  tab: 'overview' | 'conflicts'
  setTab: (t: 'overview' | 'conflicts') => void
  armed: null | '上传' | '下载'
  setArmed: (a: null | '上传' | '下载') => void
  onClose: () => void
  onOverlay: (o: 'first' | 'delete' | { conflict: Conflict }) => void
}) {
  const s = mock.status
  const byKind = (k: string) => mock.changes.filter((c) => c.kind === k).length

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-6">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        {/* 标题栏——不放重复的状态信息，那在状态栏上已经有了 */}
        <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 px-4 py-2.5">
          <span className="mr-2 text-sm font-medium text-slate-700">同步</span>
          {(['overview', 'conflicts'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-0.5 text-xs ${
                tab === t ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {{ overview: '概览', conflicts: '冲突' }[t]}
              {t === 'conflicts' && mock.conflicts.length > 0 && (
                <span className="ml-1 rounded bg-amber-400 px-1 text-[10px] text-slate-900">
                  {mock.conflicts.length}
                </span>
              )}
            </button>
          ))}
          <button
            onClick={onClose}
            className="ml-auto rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            关闭
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50">
          <div className="p-5">
            {tab === 'overview' ? (
              <div className="space-y-4">
                {/* 状态卡 */}
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">{状态文字(s)}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {s.phase === 'unconfigured'
                          ? '还没填 WebDAV 信息，去菜单 →「设置…」里填好就能开始同步。'
                          : `远端 ${配置.server}${配置.path}`}
                      </div>
                    </div>
                    {s.phase === 'never' && (
                      <button
                        onClick={() => onOverlay('first')}
                        className="rounded bg-sky-600 px-3 py-1.5 text-xs text-white hover:bg-sky-500"
                      >
                        开始首次同步
                      </button>
                    )}
                    {s.phase === 'failed' && (
                      <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
                        立即重试
                      </button>
                    )}
                  </div>

                  {s.phase === 'syncing' && s.progress && (
                    <div className="mt-3">
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full bg-sky-500"
                          style={{ width: `${(s.progress.done / s.progress.total) * 100}%` }}
                        />
                      </div>
                      <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
                        <span className="truncate">{s.currentFile}</span>
                        <span className="shrink-0">
                          {s.progress.done} / {s.progress.total}
                        </span>
                      </div>
                    </div>
                  )}

                  {s.phase === 'failed' && s.error && (
                    <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                      {s.error}
                    </div>
                  )}
                </section>

                {/* 待处理 */}
                {(byKind('upload') > 0 ||
                  byKind('download') > 0 ||
                  mock.conflicts.length > 0) && (
                  <section className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="mb-2.5 text-xs font-medium text-slate-700">待处理</div>
                    <div className="grid grid-cols-3 gap-2">
                      <Stat label="本地改动待上传" value={byKind('upload')} />
                      <Stat label="远端改动待下载" value={byKind('download')} />
                      <Stat
                        label="冲突待处理"
                        value={mock.conflicts.length}
                        tone="amber"
                        onClick={mock.conflicts.length > 0 ? () => setTab('conflicts') : undefined}
                      />
                    </div>
                  </section>
                )}

                {/* 操作 */}
                <section className="rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-medium text-slate-700">
                    操作
                  </div>

                  <CommandRow
                    title="同步"
                    desc="合并两边的改动"
                    consequence="不覆盖任何一侧；两边都改过的走冲突处理"
                    tone="safe"
                    action={
                      <button className="rounded bg-slate-800 px-3 py-1.5 text-xs text-white hover:bg-slate-700">
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
                          className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs text-red-800 hover:bg-red-50"
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
                          className="rounded border border-red-300 bg-white px-3 py-1.5 text-xs text-red-800 hover:bg-red-50"
                        >
                          下载…
                        </button>
                      )
                    }
                  />
                </section>

                {mock.pendingDeletes > 0 && (
                  <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
                    <div className="text-xs font-medium text-amber-900">
                      这次同步要删 {mock.pendingDeletes} 篇笔记
                    </div>
                    <div className="mt-1 text-[11px] leading-relaxed text-amber-800">
                      超过阈值（10 篇），需要你确认后才会继续。
                    </div>
                    <button
                      onClick={() => onOverlay('delete')}
                      className="mt-2 rounded bg-amber-700 px-3 py-1.5 text-xs text-white hover:bg-amber-600"
                    >
                      查看并确认
                    </button>
                  </section>
                )}
              </div>
            ) : (
              <Conflicts conflicts={mock.conflicts} onOpen={(c) => onOverlay({ conflict: c })} />
            )}
          </div>
        </div>
      </div>
    </div>
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
  tone?: 'amber'
  onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      onClick={onClick}
      className={`rounded border px-2.5 py-2 text-left ${
        tone === 'amber' && value > 0
          ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
          : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-base font-semibold text-slate-800">{value}</div>
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
      className={`flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-b-0 ${
        tone === 'danger' ? 'bg-red-50/40' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${tone === 'danger' ? 'text-red-800' : 'text-slate-800'}`}
          >
            {title}
          </span>
          <span className="text-[11px] text-slate-500">{desc}</span>
        </div>
        <div
          className={`mt-0.5 text-[11px] ${tone === 'danger' ? 'text-red-600' : 'text-slate-400'}`}
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
      <div className="text-right text-[10px] leading-tight text-red-700">
        <div>将覆盖{target}</div>
        <div className="text-slate-500">
          输入 <span className="font-mono font-medium">{word}</span> 确认
        </div>
      </div>
      <input
        autoFocus
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="w-16 rounded border border-red-300 px-1.5 py-0.5 text-xs outline-none focus:border-red-500"
      />
      <button
        disabled={!ok}
        className={`rounded px-2 py-1 text-xs ${
          ok
            ? 'bg-red-700 text-white hover:bg-red-600'
            : 'cursor-not-allowed bg-slate-200 text-slate-400'
        }`}
      >
        执行
      </button>
      <button
        onClick={onCancel}
        className="rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
      >
        取消
      </button>
    </div>
  )
}

function Conflicts({
  conflicts,
  onOpen,
}: {
  conflicts: Conflict[]
  onOpen: (c: Conflict) => void
}) {
  if (conflicts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center">
        <div className="text-sm text-slate-400">没有待处理的冲突</div>
        <div className="mt-1 text-[11px] text-slate-400">
          两处都改了同一篇且无法自动合并时，会出现在这里
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] leading-relaxed text-slate-500">
        副本存在 <code className="rounded bg-slate-100 px-1">.confidant/conflicts/</code>
        ，它们是真实的 <code className="rounded bg-slate-100 px-1">.md</code> 文件，
        用记事本也能打开。处理完就从这里消失。
      </div>
      {conflicts.map((c) => (
        <div key={c.id} className="rounded-lg border border-amber-200 bg-white p-4">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium text-slate-800">{c.path}</span>
            <span className="ml-auto text-[10px] text-slate-500">
              {c.at} · 来自 {c.from}
            </span>
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-slate-400">{c.copyName}</div>
          <div className="mt-3 flex items-center gap-2">
            <button className="rounded bg-slate-800 px-3 py-1.5 text-xs text-white hover:bg-slate-700">
              保留我的
            </button>
            <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
              保留远端的
            </button>
            <button
              onClick={() => onOpen(c)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100"
            >
              手工合并…
            </button>
          </div>
        </div>
      ))}
    </div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-baseline justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{conflict.path}</h3>
            <div className="font-mono text-[10px] text-slate-500">{conflict.copyName}</div>
          </div>
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-800">
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
              className={`rounded border-2 text-left transition ${
                pick === key
                  ? 'border-sky-500 bg-sky-50/50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="border-b border-slate-100 px-3 py-2">
                <div className="text-xs font-medium text-slate-700">{title}</div>
                <div className="text-[10px] text-slate-400">{sub}</div>
              </div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-3 py-2.5 font-sans text-[12px] leading-[1.8] text-slate-700">
                {body}
              </pre>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <span className="text-[11px] text-slate-500">
            {pick ? '点「采用」后，另一份会保留为副本。' : '点一边把它选为最终版本。'}
          </span>
          <button
            disabled={!pick}
            className={`ml-auto rounded px-3 py-1.5 text-xs ${
              pick
                ? 'bg-slate-800 text-white hover:bg-slate-700'
                : 'cursor-not-allowed bg-slate-200 text-slate-400'
            }`}
          >
            采用选中的版本
          </button>
        </div>
      </div>
    </div>
  )
}
