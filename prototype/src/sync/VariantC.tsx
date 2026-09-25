import { useEffect, useState } from 'react'
import { AppShell } from './AppShell'
import {
  取场景,
  状态文字,
  配置,
  type ScenarioKey,
  type SyncMock,
  type Conflict,
  type ChangeKind,
} from './data'

/**
 * 变体 C —— **事件流**。
 *
 * 结构主张：同步是一串**已经发生和即将发生的事**，按时间排成一列。
 * 没有弹窗、没有页签、没有设置面板——每一行自己就地展开，就地处理。
 *
 * 与 A/B 的根本分歧：A 把同步做成环境（一条线），B 做成地方（一个页面），
 * C 做成**历史**（一条时间线）。所以 C 必须回答的是——「上周那次失败到底是哪个文件」，
 * 而这恰好是 A 和 B 都答不了的问题。
 *
 * 三个按钮的区分方式：**就地展开 + 后果预览**——点开某一行，它当场列出
 * 「这次操作会影响哪些文件」，不跳转、不弹窗。
 */
export function VariantC({ scenario }: { scenario: ScenarioKey }) {
  const mock = 取场景(scenario)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [armed, setArmed] = useState<null | '上传' | '下载'>(null)

  useEffect(() => {
    setExpanded(null)
    setArmed(null)
  }, [scenario])

  return (
    <AppShell
      content={
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-200 px-4">
            <span className="text-sm font-medium text-slate-700">同步</span>
            <span className="text-[11px] text-slate-400">
              {状态文字(mock.status)}
              {mock.status.phase === 'idle' && ` · ${mock.status.syncedFiles} 个文件`}
            </span>
            {mock.status.phase === 'syncing' && mock.status.progress && (
              <div className="ml-2 h-1 w-24 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full bg-sky-500"
                  style={{
                    width: `${(mock.status.progress.done / mock.status.progress.total) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto max-w-3xl px-6 py-5">
              <Timeline
                mock={mock}
                expanded={expanded}
                setExpanded={setExpanded}
                armed={armed}
                setArmed={setArmed}
              />
            </div>
          </div>
        </div>
      }
    />
  )
}

// ---------------------------------------------------------------- 时间线

type Row =
  | { key: string; kind: 'action'; title: string; tone: 'safe' | 'danger'; note: string }
  | { key: string; kind: 'banner'; tone: 'amber' | 'sky' | 'slate'; title: string; note: string }
  | { key: string; kind: 'changes'; title: string; changes: { kind: ChangeKind; path: string }[] }
  | { key: string; kind: 'conflict'; conflict: Conflict }
  | { key: string; kind: 'settings' }

function buildRows(mock: SyncMock): Row[] {
  const rows: Row[] = []

  // 1. 当前状态 —— 流的最上面永远是「现在」
  if (mock.status.phase === 'failed') {
    rows.push({
      key: 'fail',
      kind: 'banner',
      tone: 'amber',
      title: '上次同步失败',
      note: mock.status.error ?? '',
    })
  }
  if (mock.status.phase === 'unconfigured') {
    rows.push({
      key: 'unconf',
      kind: 'banner',
      tone: 'slate',
      title: '尚未配置 WebDAV',
      note: '填好服务器信息后就能开始同步。',
    })
  }
  if (mock.status.phase === 'never') {
    rows.push({
      key: 'never',
      kind: 'banner',
      tone: 'sky',
      title: '从未同步过',
      note: '这是第一次。远端如果已有内容，两边不同时会停下来问你。',
    })
  }
  if (mock.pendingDeletes > 0) {
    rows.push({
      key: 'del',
      kind: 'banner',
      tone: 'amber',
      title: `这次同步要删 ${mock.pendingDeletes} 篇笔记`,
      note: '超过阈值（10 篇），需要你确认后才会继续。',
    })
  }

  // 2. 冲突 —— 单独成块，每条一行
  for (const c of mock.conflicts) {
    rows.push({ key: `c-${c.id}`, kind: 'conflict', conflict: c })
  }

  // 3. 待处理的改动 —— 按方向分组，不是流水账
  const up = mock.changes.filter((c) => c.kind === 'upload')
  const down = mock.changes.filter((c) => c.kind === 'download')
  if (up.length) rows.push({ key: 'up', kind: 'changes', title: '本地改动待上传', changes: up })
  if (down.length) rows.push({ key: 'down', kind: 'changes', title: '远端改动待下载', changes: down })

  // 4. 操作 —— 流里的「接下来能做什么」
  rows.push({
    key: 'sync',
    kind: 'action',
    title: '同步',
    tone: 'safe',
    note: '比对本地、远端与上次同步的记录，两边都改过的走冲突处理。不会覆盖任何一侧。',
  })
  rows.push({
    key: 'push',
    kind: 'action',
    title: '上传',
    tone: 'danger',
    note: '以本地为准，把本地内容推送到远端。远端不同的文件会被无条件覆盖。',
  })
  rows.push({
    key: 'pull',
    kind: 'action',
    title: '下载',
    tone: 'danger',
    note: '以远端为准，把远端内容拉取到本地。本地不同的文件会被无条件覆盖。',
  })

  // 5. 设置永远在最底下 —— 它是背景，不是事件
  rows.push({ key: 'settings', kind: 'settings' })

  return rows
}

function Timeline({
  mock,
  expanded,
  setExpanded,
  armed,
  setArmed,
}: {
  mock: SyncMock
  expanded: string | null
  setExpanded: (k: string | null) => void
  armed: null | '上传' | '下载'
  setArmed: (a: null | '上传' | '下载') => void
}) {
  const rows = buildRows(mock)

  return (
    <div className="relative">
      {/* 竖线 */}
      <div className="absolute bottom-3 left-[7px] top-3 w-px bg-slate-200" />

      <div className="space-y-1">
        {rows.map((r) => (
          <RowView
            key={r.key}
            row={r}
            open={expanded === r.key}
            onToggle={() => setExpanded(expanded === r.key ? null : r.key)}
            armed={armed}
            setArmed={setArmed}
          />
        ))}
      </div>
    </div>
  )
}

function RowView({
  row,
  open,
  onToggle,
  armed,
  setArmed,
}: {
  row: Row
  open: boolean
  onToggle: () => void
  armed: null | '上传' | '下载'
  setArmed: (a: null | '上传' | '下载') => void
}) {
  if (row.kind === 'settings') {
    return (
      <div className="relative pl-6">
        <Marker tone="slate" />
        <button
          onClick={onToggle}
          className="w-full rounded px-2 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-100"
        >
          WebDAV 设置 · {配置.server}
        </button>
        {open && (
          <div className="mt-1 space-y-2 rounded border border-slate-200 bg-white p-3">
            <MiniField label="服务器地址" value={配置.server} />
            <MiniField label="远端路径" value={配置.path} />
            <MiniField label="用户名" value={配置.username} />
            <MiniField label="密码" value={配置.passwordMask} hint="存系统凭据库，不写进库文件" />
            <MiniField label="库标识" value={配置.vaultUuid} mono />
            <div className="flex items-center gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-600">
              <input type="checkbox" defaultChecked />
              自动同步，每
              <input
                defaultValue="10"
                className="w-10 rounded border border-slate-300 px-1 py-0.5 text-[11px] outline-none focus:border-sky-500"
              />
              分钟
            </div>
            <div className="text-[10px] leading-relaxed text-slate-400">
              密码存系统侧而非库内——否则会被同步到它自己要连的那台服务器上。
            </div>
          </div>
        )}
      </div>
    )
  }

  if (row.kind === 'banner') {
    const tone = {
      amber: 'border-amber-300 bg-amber-50 text-amber-900',
      sky: 'border-sky-300 bg-sky-50 text-sky-900',
      slate: 'border-slate-300 bg-slate-50 text-slate-700',
    }[row.tone]
    return (
      <div className="relative pl-6">
        <Marker tone={row.tone === 'slate' ? 'slate' : row.tone === 'sky' ? 'sky' : 'amber'} />
        <div className={`rounded border px-3 py-2 ${tone}`}>
          <div className="text-xs font-medium">{row.title}</div>
          {row.note && <div className="mt-0.5 text-[11px] leading-relaxed opacity-80">{row.note}</div>}
        </div>
      </div>
    )
  }

  if (row.kind === 'changes') {
    return (
      <div className="relative pl-6">
        <Marker tone="slate" />
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-slate-100"
        >
          <span className="text-xs text-slate-700">{row.title}</span>
          <span className="text-[11px] text-slate-400">{row.changes.length} 个文件</span>
          <span className="ml-auto text-[10px] text-slate-400">{open ? '收起' : '展开'}</span>
        </button>
        {open && (
          <ul className="mt-1 max-h-48 overflow-auto rounded border border-slate-200 bg-white py-1">
            {row.changes.map((c) => (
              <li
                key={c.path}
                className="flex items-center gap-2 px-3 py-0.5 font-mono text-[11px] text-slate-600"
              >
                <span className="text-slate-400">
                  {{ upload: '↑', download: '↓' }[c.kind as 'upload' | 'download'] ?? '·'}
                </span>
                <span className="truncate">{c.path}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  if (row.kind === 'conflict') {
    return <ConflictRow conflict={row.conflict} open={open} onToggle={onToggle} />
  }

  // action
  const danger = row.tone === 'danger'
  const name = row.title as '上传' | '下载'
  const isArmed = danger && armed === name
  return (
    <div className="relative pl-6">
      <Marker tone={danger ? 'red' : 'green'} />
      <div
        className={`rounded border px-3 py-2 ${
          danger ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-white'
        }`}
      >
        <button onClick={onToggle} className="flex w-full items-baseline gap-2 text-left">
          <span className={`text-xs font-medium ${danger ? 'text-red-800' : 'text-slate-800'}`}>
            {row.title}
          </span>
          {danger && <span className="text-[10px] text-red-600">覆盖操作</span>}
          <span className="ml-auto text-[10px] text-slate-400">{open ? '收起' : '详情'}</span>
        </button>

        {open && (
          <div className="mt-2 border-t border-slate-200/70 pt-2">
            <div className={`text-[11px] leading-relaxed ${danger ? 'text-red-700' : 'text-slate-500'}`}>
              {row.note}
            </div>

            {danger && (
              <div className="mt-2.5">
                <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-red-700">
                  执行前预览影响范围
                </div>
                <div className="rounded border border-red-200 bg-white px-2.5 py-1.5 font-mono text-[10px] text-slate-600">
                  将覆盖 {name === '上传' ? '远端' : '本地'} 12 个不同的文件
                </div>

                {isArmed ? (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      autoFocus
                      placeholder={`输入「${name}」`}
                      className="w-24 rounded border border-red-300 px-2 py-0.5 text-[11px] outline-none focus:border-red-500"
                    />
                    <button className="rounded bg-red-700 px-2.5 py-1 text-[11px] text-white hover:bg-red-600">
                      执行
                    </button>
                    <button
                      onClick={() => setArmed(null)}
                      className="rounded px-1.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100"
                    >
                      取消
                    </button>
                    <span className="text-[10px] text-slate-400">执行前会自动落一份快照</span>
                  </div>
                ) : (
                  <button
                    onClick={() => setArmed(name)}
                    className="mt-2 rounded border border-red-300 bg-white px-2.5 py-1 text-[11px] text-red-800 hover:bg-red-50"
                  >
                    {name}…
                  </button>
                )}
              </div>
            )}

            {!danger && (
              <button className="mt-2 rounded bg-slate-800 px-3 py-1 text-[11px] text-white hover:bg-slate-700">
                执行同步
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ConflictRow({
  conflict,
  open,
  onToggle,
}: {
  conflict: Conflict
  open: boolean
  onToggle: () => void
}) {
  const [pick, setPick] = useState<'local' | 'remote' | null>(null)
  return (
    <div className="relative pl-6">
      <Marker tone="amber" />
      <div className="rounded border border-amber-200 bg-amber-50/50 px-3 py-2">
        <button onClick={onToggle} className="flex w-full items-baseline gap-2 text-left">
          <span className="text-xs font-medium text-slate-800">{conflict.path}</span>
          <span className="text-[10px] text-amber-700">无法自动合并</span>
          <span className="ml-auto text-[10px] text-slate-400">
            {conflict.at} · {open ? '收起' : '处理'}
          </span>
        </button>
        <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{conflict.copyName}</div>

        {open && (
          <div className="mt-2 border-t border-amber-200/70 pt-2">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['local', '本地（我的）', conflict.localBody],
                  ['remote', `远端（${conflict.from}）`, conflict.remoteBody],
                ] as const
              ).map(([key, title, body]) => (
                <button
                  key={key}
                  onClick={() => setPick(key)}
                  className={`rounded border-2 text-left transition ${
                    pick === key ? 'border-sky-500 bg-white' : 'border-transparent bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="border-b border-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">
                    {title}
                  </div>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap px-2 py-1.5 font-sans text-[11px] leading-[1.75] text-slate-600">
                    {body}
                  </pre>
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <button
                disabled={!pick}
                className={`rounded px-2.5 py-1 text-[11px] ${
                  pick ? 'bg-slate-800 text-white hover:bg-slate-700' : 'cursor-not-allowed bg-slate-200 text-slate-400'
                }`}
              >
                采用选中的版本
              </button>
              <span className="text-[10px] text-slate-400">另一份会保留为副本</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Marker({ tone }: { tone: 'slate' | 'sky' | 'amber' | 'red' | 'green' }) {
  const c = {
    slate: 'bg-slate-300',
    sky: 'bg-sky-400',
    amber: 'bg-amber-400',
    red: 'bg-red-400',
    green: 'bg-emerald-400',
  }[tone]
  return (
    <span
      className={`absolute left-0 top-[11px] h-2 w-2 rounded-full ring-2 ring-white ${c}`}
      style={{ left: '3px' }}
    />
  )
}

function MiniField({
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
      <div className="mb-0.5 text-[10px] text-slate-500">{label}</div>
      <input
        defaultValue={value}
        className={`w-full rounded border border-slate-300 px-2 py-0.5 text-[11px] outline-none focus:border-sky-500 ${
          mono ? 'font-mono text-[10px]' : ''
        }`}
      />
      {hint && <div className="mt-0.5 text-[10px] text-slate-400">{hint}</div>}
    </label>
  )
}
