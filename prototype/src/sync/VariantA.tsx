import { useEffect, useState } from 'react'
import { AppShell } from './AppShell'
import {
  取场景,
  状态文字,
  语义说明,
  配置,
  type ScenarioKey,
  type SyncMock,
  type Conflict,
} from './data'

/**
 * 变体 A —— **状态栏**。
 *
 * 结构主张：同步是**环境**，不是地方。它占据屏幕底部一条 28px 的细线，
 * 永远在那儿、永远不说废话；所有操作藏在它的弹出层里。
 *
 * 三个按钮的区分方式：**分层**——「同步」是普通按钮，「上传 / 下载」被归进
 * 一个视觉上明显不同的「覆盖」区，并且执行前要求**输入确认词**。
 */
export function VariantA({ scenario }: { scenario: ScenarioKey }) {
  const mock = 取场景(scenario)
  const [panel, setPanel] = useState<null | 'actions' | 'conflicts' | 'settings'>(null)
  const [overlay, setOverlay] = useState<null | 'first' | 'delete' | { conflict: Conflict }>(null)

  // 切换场景时收起所有浮层——否则上一个场景的弹窗会挂在新场景上
  useEffect(() => {
    setPanel(null)
    setOverlay(null)
  }, [scenario])

  return (
    <AppShell
      onOpenSettings={() => setPanel('settings')}
      overlay={
        <>
          {panel === 'conflicts' && (
            <ConflictPanel
              conflicts={mock.conflicts}
              onClose={() => setPanel(null)}
              onOpen={(c) => {
                setPanel(null)
                setOverlay({ conflict: c })
              }}
            />
          )}

          {panel === 'actions' && (
            <ActionPopover
              mock={mock}
              onClose={() => setPanel(null)}
              onFirstSync={() => {
                setPanel(null)
                setOverlay('first')
              }}
              onDanger={() => {
                setPanel(null)
                setOverlay('delete')
              }}
            />
          )}

          {panel === 'settings' && <SettingsSheet onClose={() => setPanel(null)} />}

          {overlay === 'first' && <FirstSyncDialog mock={mock} onClose={() => setOverlay(null)} />}
          {overlay === 'delete' && (
            <DeleteDialog count={mock.pendingDeletes} onClose={() => setOverlay(null)} />
          )}
          {overlay && typeof overlay === 'object' && (
            <ConflictCompare conflict={overlay.conflict} onClose={() => setOverlay(null)} />
          )}

          <StatusBar
            mock={mock}
            panel={panel}
            onPanel={setPanel}
            onFirstSync={() => setOverlay('first')}
          />
        </>
      }
    />
  )
}

// ---------------------------------------------------------------- 状态栏

function StatusBar({
  mock,
  panel,
  onPanel,
  onFirstSync,
}: {
  mock: SyncMock
  panel: string | null
  onPanel: (p: null | 'actions' | 'conflicts' | 'settings') => void
  onFirstSync: () => void
}) {
  const s = mock.status
  const tone =
    s.phase === 'failed'
      ? 'text-amber-300'
      : s.phase === 'syncing'
        ? 'text-sky-300'
        : s.phase === 'unconfigured'
          ? 'text-slate-400'
          : 'text-slate-400'

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex h-7 items-center gap-3 border-t border-slate-800 bg-slate-900 px-3 text-[11px] text-slate-300">
      {/* 左：状态点 + 一句话 */}
      <button
        onClick={() => onPanel(panel === 'actions' ? null : 'actions')}
        className="flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-white/10"
      >
        <Dot phase={s.phase} />
        <span className={tone}>{状态文字(s)}</span>
        {s.phase === 'idle' && s.minutesAgo !== null && (
          <span className="text-slate-500">· {s.syncedFiles} 个文件</span>
        )}
      </button>

      {/* 同步中的进度条就长在状态栏里，不弹东西 */}
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

      {s.phase === 'never' && (
        <button
          onClick={onFirstSync}
          className="rounded bg-sky-600 px-1.5 py-0.5 text-white hover:bg-sky-500"
        >
          开始首次同步
        </button>
      )}

      <div className="ml-auto flex items-center gap-1">
        {mock.conflicts.length > 0 && (
          <button
            onClick={() => onPanel(panel === 'conflicts' ? null : 'conflicts')}
            className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-200 hover:bg-amber-500/30"
          >
            冲突 {mock.conflicts.length}
          </button>
        )}
        {mock.pendingDeletes > 0 && (
          <button
            onClick={() => onPanel(panel === 'actions' ? null : 'actions')}
            className="rounded bg-red-500/20 px-1.5 py-0.5 text-red-200 hover:bg-red-500/30"
          >
            待删 {mock.pendingDeletes}
          </button>
        )}
        <button
          onClick={() => onPanel(panel === 'settings' ? null : 'settings')}
          className="rounded px-1.5 py-0.5 hover:bg-white/10"
        >
          WebDAV 设置
        </button>
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

// ---------------------------------------------------------------- 操作弹层

function ActionPopover({
  mock,
  onClose,
  onFirstSync,
  onDanger,
}: {
  mock: SyncMock
  onClose: () => void
  onFirstSync: () => void
  onDanger: () => void
}) {
  const [hover, setHover] = useState<keyof typeof 语义说明 | null>(null)
  const byKind = (k: string) => mock.changes.filter((c) => c.kind === k).length

  return (
    <Sheet onClose={onClose} side="bottom-left">
      <div className="w-[26rem] p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-slate-800">同步</h3>
          <span className="text-xs text-slate-500">{状态文字(mock.status)}</span>
        </div>

        {/* 待处理变更的概览 */}
        <div className="mb-4 grid grid-cols-3 gap-2 text-xs">
          <Stat label="待上传" value={byKind('upload')} tone="sky" />
          <Stat label="待下载" value={byKind('download')} tone="sky" />
          <Stat label="冲突" value={mock.conflicts.length} tone="amber" />
        </div>

        {/* 安全操作 */}
        <button
          onMouseEnter={() => setHover('同步')}
          onMouseLeave={() => setHover(null)}
          className="w-full rounded-md bg-slate-800 px-3 py-2 text-left text-sm text-white hover:bg-slate-700"
        >
          <div className="font-medium">同步</div>
          <div className="text-[11px] text-slate-300">合并两边的改动</div>
        </button>

        {/* ⚠️ 危险操作单独成区，视觉上与上面隔开 */}
        <div className="mt-4 rounded-md border border-red-200 bg-red-50/60 p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
              覆盖操作
            </span>
            <span className="text-[11px] text-red-600/80">会无条件覆盖另一侧，不比对、不合并</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onMouseEnter={() => setHover('上传')}
              onMouseLeave={() => setHover(null)}
              onClick={onDanger}
              className="rounded border border-red-300 bg-white px-3 py-1.5 text-left text-xs hover:bg-red-100"
            >
              <div className="font-medium text-red-800">上传</div>
              <div className="text-[10px] text-red-600">以本地为准 → 覆盖远端</div>
            </button>
            <button
              onMouseEnter={() => setHover('下载')}
              onMouseLeave={() => setHover(null)}
              onClick={onDanger}
              className="rounded border border-red-300 bg-white px-3 py-1.5 text-left text-xs hover:bg-red-100"
            >
              <div className="font-medium text-red-800">下载</div>
              <div className="text-[10px] text-red-600">以远端为准 → 覆盖本地</div>
            </button>
          </div>
        </div>

        {/* 悬停时的解释——把语义差摆在鼠标旁边 */}
        <div className="mt-3 min-h-[2.5rem] rounded bg-slate-100 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
          {hover ? 语义说明[hover] : '把鼠标停在任一按钮上，这里会说明它的后果。'}
        </div>

        {mock.pendingDeletes > 0 && (
          <button
            onClick={onDanger}
            className="mt-3 w-full rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-left text-xs text-amber-900 hover:bg-amber-100"
          >
            有 {mock.pendingDeletes} 篇笔记将被删除，需要你确认
          </button>
        )}
      </div>
    </Sheet>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'sky' | 'amber' }) {
  return (
    <div
      className={`rounded border px-2 py-1.5 ${
        tone === 'amber' && value > 0
          ? 'border-amber-200 bg-amber-50'
          : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-800">{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------- 冲突面板

function ConflictPanel({
  conflicts,
  onClose,
  onOpen,
}: {
  conflicts: Conflict[]
  onClose: () => void
  onOpen: (c: Conflict) => void
}) {
  return (
    <Sheet onClose={onClose} side="bottom-left">
      <div className="w-[30rem] p-4">
        <div className="mb-1 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-slate-800">待处理的冲突</h3>
          <span className="text-xs text-slate-500">{conflicts.length} 条</span>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
          两处都改了同一篇、且无法自动合并。副本存在{' '}
          <code className="rounded bg-slate-100 px-1">.confidant/conflicts/</code>
          ，处理完就从这里消失。
        </p>

        <ul className="max-h-[24rem] space-y-2 overflow-auto">
          {conflicts.map((c) => (
            <li key={c.id} className="rounded border border-amber-200 bg-amber-50/60 p-2.5">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-medium text-slate-800">{c.path}</span>
                <span className="ml-auto shrink-0 text-[10px] text-slate-500">
                  {c.at} · 来自 {c.from}
                </span>
              </div>
              <div className="mb-2 truncate font-mono text-[10px] text-slate-500">{c.copyName}</div>
              <div className="flex gap-1.5">
                <button className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] hover:bg-slate-100">
                  保留我的
                </button>
                <button className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] hover:bg-slate-100">
                  保留远端的
                </button>
                <button
                  onClick={() => onOpen(c)}
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] hover:bg-slate-100"
                >
                  手工合并…
                </button>
                <span className="ml-auto self-center text-[10px] text-slate-400">
                  副本会保留，直到你删它
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------- 并排对比

function ConflictCompare({ conflict, onClose }: { conflict: Conflict; onClose: () => void }) {
  return (
    <Modal onClose={onClose} width="max-w-5xl">
      <div className="flex items-baseline justify-between border-b border-slate-200 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{conflict.path}</h3>
          <div className="font-mono text-[10px] text-slate-500">{conflict.copyName}</div>
        </div>
        <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-800">
          关闭
        </button>
      </div>

      <div className="grid grid-cols-2 gap-px bg-slate-200">
        <CompareSide title="本地（我的）" sub="这台机器上的版本" body={conflict.localBody} />
        <CompareSide title="远端（另一台）" sub={`来自 ${conflict.from}`} body={conflict.remoteBody} />
      </div>

      <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        <span className="text-[11px] text-slate-500">
          合并结果无法自动确定，所以两份都留着了。
        </span>
        <button className="ml-auto rounded bg-slate-800 px-3 py-1.5 text-xs text-white hover:bg-slate-700">
          以左侧为最终版本
        </button>
        <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
          以右侧为最终版本
        </button>
      </div>
    </Modal>
  )
}

function CompareSide({ title, sub, body }: { title: string; sub: string; body: string }) {
  return (
    <div className="bg-white">
      <div className="border-b border-slate-100 px-4 py-2">
        <div className="text-xs font-medium text-slate-700">{title}</div>
        <div className="text-[10px] text-slate-400">{sub}</div>
      </div>
      <pre className="max-h-[26rem] overflow-auto whitespace-pre-wrap px-4 py-3 font-sans text-[13px] leading-[1.8] text-slate-700">
        {body}
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------- 首次同步

function FirstSyncDialog({ mock, onClose }: { mock: SyncMock; onClose: () => void }) {
  const f = mock.firstSync!
  return (
    <Modal onClose={onClose} width="max-w-2xl">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-slate-800">远端已有一个库，两边内容不同</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          这是第一次同步，没有「上次同步」可参照，所以无法判断哪边是更新的。
          <span className="font-medium text-slate-700">不会自动合并</span>——选一个。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px bg-slate-200">
        <SideCard
          title="本地"
          rows={[['笔记', `${f.localCount} 篇`], ['最后改动', '刚刚']]}
        />
        <SideCard
          title="远端"
          rows={[['笔记', `${f.remoteCount} 篇`], ['最后改动', f.remoteAt]]}
        />
      </div>

      <div className="space-y-2 px-5 py-4">
        <Choice
          tone="danger"
          title="以本地为准（覆盖远端）"
          desc={`远端那 ${f.remoteCount} 篇会被本地内容覆盖，远端独有的内容将丢失。`}
        />
        <Choice
          tone="danger"
          title="以远端为准（覆盖本地）"
          desc={`本地那 ${f.localCount} 篇会被远端内容覆盖，本地独有的内容将丢失。`}
        />
        <Choice
          tone="neutral"
          title="两边合并"
          desc="保留两边全部内容，但同名的笔记会产生大量冲突副本，需要你逐条处理。"
        />
      </div>

      <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        <span className="text-[11px] text-slate-500">前两个选项执行前会自动落一份快照。</span>
        <button
          onClick={onClose}
          className="ml-auto rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100"
        >
          取消
        </button>
      </div>
    </Modal>
  )
}

function SideCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="bg-white px-5 py-3">
      <div className="mb-1.5 text-xs font-medium text-slate-700">{title}</div>
      <dl className="space-y-0.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-2 text-[11px]">
            <dt className="text-slate-400">{k}</dt>
            <dd className="text-slate-700">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function Choice({
  tone,
  title,
  desc,
}: {
  tone: 'danger' | 'neutral'
  title: string
  desc: string
}) {
  return (
    <button
      className={`block w-full rounded border px-3 py-2 text-left transition ${
        tone === 'danger'
          ? 'border-red-200 bg-red-50/50 hover:bg-red-50'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      }`}
    >
      <div className={`text-xs font-medium ${tone === 'danger' ? 'text-red-800' : 'text-slate-800'}`}>
        {title}
      </div>
      <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{desc}</div>
    </button>
  )
}

// ---------------------------------------------------------------- 批量删除

function DeleteDialog({ count, onClose }: { count: number; onClose: () => void }) {
  return (
    <Modal onClose={onClose} width="max-w-lg">
      <div className="border-b border-slate-200 px-5 py-3">
        <h3 className="text-sm font-semibold text-red-800">这次同步要删 {count} 篇笔记</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          超过阈值（10 篇），所以停下来问你。误判的 stat 曾让别家的同步器删光过整个库，
          所以这一步故意做得不顺手。
        </p>
      </div>
      <div className="px-5 py-4">
        <div className="mb-3 max-h-40 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-600">
          {[
            '技术/待整理/旧草稿-01.md',
            '技术/待整理/旧草稿-02.md',
            '技术/待整理/旧草稿-03.md',
            '思考/废弃/方案A.md',
            '思考/废弃/方案B.md',
            '… 其余 42 篇',
          ].map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
        <label className="flex items-start gap-2 text-[11px] text-slate-600">
          <input type="checkbox" className="mt-0.5" />
          <span>删掉的内容会先进回收站（<code className="rounded bg-slate-100 px-1">.confidant/trash/</code>），可以从那里还原。</span>
        </label>
      </div>
      <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
        <button
          onClick={onClose}
          className="ml-auto rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100"
        >
          取消同步
        </button>
        <button className="rounded bg-red-700 px-3 py-1.5 text-xs text-white hover:bg-red-600">
          确认删除并继续
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- WebDAV 设置

function SettingsSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet onClose={onClose} side="right">
      <div className="flex h-full w-[24rem] flex-col">
        <div className="flex items-baseline justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">WebDAV</h3>
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-800">
            关闭
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-auto p-4">
          <Field label="服务器地址" value={配置.server} />
          <Field label="远端路径" value={配置.path} />
          <Field label="用户名" value={配置.username} />
          <Field label="密码" value={配置.passwordMask} hint="存系统凭据库，不写进库文件" />
          <Field label="库标识" value={配置.vaultUuid} mono hint="随库同步，用来认领远端那份" />

          <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-500">
            密码存在系统侧而不是库里——否则它会被同步到<b>它自己要连的那台服务器</b>上。
            代价是换台电脑要重新输一次。
          </div>

          <div className="border-t border-slate-100 pt-3">
            <div className="mb-1.5 text-xs font-medium text-slate-700">自动同步</div>
            <div className="flex items-center gap-2">
              <Toggle on label="启用" />
              <span className="text-[11px] text-slate-500">每</span>
              <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px]">
                10
              </span>
              <span className="text-[11px] text-slate-500">分钟</span>
            </div>
            <div className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              另有两次自动同步：应用启动时、本地攒下一批改动之后。
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  )
}

function Field({
  label,
  value,
  hint,
  mono,
}: {
  label: string
  value: string
  hint?: string
  mono?: boolean
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] text-slate-500">{label}</div>
      <input
        defaultValue={value}
        className={`w-full rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-sky-500 ${
          mono ? 'font-mono text-[10px]' : ''
        }`}
      />
      {hint && <div className="mt-1 text-[10px] text-slate-400">{hint}</div>}
    </label>
  )
}

function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <button className="flex items-center gap-1.5 text-[11px] text-slate-600">
      <span
        className={`flex h-3.5 w-6 items-center rounded-full px-0.5 ${on ? 'bg-sky-500' : 'bg-slate-300'}`}
      >
        <span
          className={`h-2.5 w-2.5 rounded-full bg-white transition ${on ? 'translate-x-2.5' : ''}`}
        />
      </span>
      {label}
    </button>
  )
}

// ---------------------------------------------------------------- 基元

function Modal({
  children,
  onClose,
  width,
}: {
  children: React.ReactNode
  onClose: () => void
  width: string
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-6">
      <div className={`w-full ${width} overflow-hidden rounded-lg bg-white shadow-2xl`}>
        {children}
      </div>
    </div>
  )
}

function Sheet({
  children,
  onClose,
  side,
}: {
  children: React.ReactNode
  onClose: () => void
  side: 'bottom-left' | 'right'
}) {
  const pos =
    side === 'bottom-left' ? 'bottom-10 left-3' : 'right-0 top-0 h-full border-l border-slate-200'
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className={`fixed z-40 ${pos}`}>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
          {children}
        </div>
      </div>
    </>
  )
}
