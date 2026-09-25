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
 * 变体 B —— **同步中心**。
 *
 * 结构主张：同步是**一个地方**。它占据整个内容区（文件树还在左边），
 * 有自己的三个页签：概览 / 冲突 / 设置。
 *
 * 与 A 的根本分歧：A 把同步做成一条永远在场的细线，B 把它做成一个要主动进去的页面。
 * 所以 B 必须回答 A 不用回答的问题——**你怎么知道自己该进去**（左上角常驻徽标）。
 *
 * 三个按钮的区分方式：**命令行**——每条命令占一整行，右侧直接写出它的后果，
 * 覆盖类命令要求**输入确认词**才可执行。
 */
export function VariantB({ scenario }: { scenario: ScenarioKey }) {
  const mock = 取场景(scenario)
  const [tab, setTab] = useState<'overview' | 'conflicts' | 'settings'>('overview')
  const [overlay, setOverlay] = useState<null | 'first' | 'delete' | { conflict: Conflict }>(null)
  const [armed, setArmed] = useState<null | '上传' | '下载'>(null)

  useEffect(() => {
    setOverlay(null)
    setArmed(null)
    // 有冲突时默认停在冲突页——那是最需要处理的东西
    setTab(scenario === 'conflicts' ? 'conflicts' : 'overview')
  }, [scenario])

  return (
    <AppShell
      content={
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-1 border-b border-slate-200 px-4">
            <span className="mr-2 text-sm font-medium text-slate-700">同步</span>
            {(['overview', 'conflicts', 'settings'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded px-2 py-0.5 text-xs ${
                  tab === t ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {{ overview: '概览', conflicts: '冲突', settings: 'WebDAV 设置' }[t]}
                {t === 'conflicts' && mock.conflicts.length > 0 && (
                  <span className="ml-1 rounded bg-amber-400 px-1 text-[10px] text-slate-900">
                    {mock.conflicts.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto bg-slate-50">
            <div className="mx-auto max-w-3xl p-6">
              {tab === 'overview' && (
                <Overview
                  mock={mock}
                  armed={armed}
                  onArm={setArmed}
                  onFirstSync={() => setOverlay('first')}
                  onDanger={() => setOverlay('delete')}
                />
              )}
              {tab === 'conflicts' && (
                <Conflicts conflicts={mock.conflicts} onOpen={(c) => setOverlay({ conflict: c })} />
              )}
              {tab === 'settings' && <Settings />}
            </div>
          </div>
        </div>
      }
      sidebarFooter={
        <div className="border-t border-slate-200 px-3 py-2">
          <Badge mock={mock} onClick={() => setTab('overview')} />
        </div>
      }
      overlay={
        <>
          {overlay === 'first' && <FirstSyncDialog mock={mock} onClose={() => setOverlay(null)} />}
          {overlay === 'delete' && (
            <DeleteDialog count={mock.pendingDeletes} onClose={() => setOverlay(null)} />
          )}
          {overlay && typeof overlay === 'object' && (
            <ConflictCompare conflict={overlay.conflict} onClose={() => setOverlay(null)} />
          )}
        </>
      }
    />
  )
}

function Badge({ mock, onClick }: { mock: SyncMock; onClick: () => void }) {
  const s = mock.status
  const text =
    s.phase === 'failed'
      ? '同步失败'
      : s.phase === 'syncing'
        ? '同步中'
        : s.phase === 'unconfigured'
          ? '未配置'
          : s.phase === 'never'
            ? '未同步'
            : `${s.minutesAgo} 分钟前`
  const tone =
    s.phase === 'failed'
      ? 'bg-amber-100 text-amber-900 border-amber-300'
      : s.phase === 'syncing'
        ? 'bg-sky-100 text-sky-900 border-sky-300'
        : s.phase === 'unconfigured' || s.phase === 'never'
          ? 'bg-slate-100 text-slate-600 border-slate-300'
          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
  return (
    <button
      onClick={onClick}
      className={`w-full truncate rounded-full border px-2 py-0.5 text-left text-[11px] ${tone}`}
      title="打开同步中心"
    >
      {text}
      {mock.conflicts.length > 0 && ` · 冲突 ${mock.conflicts.length}`}
    </button>
  )
}

// ---------------------------------------------------------------- 概览

function Overview({
  mock,
  armed,
  onArm,
  onFirstSync,
  onDanger,
}: {
  mock: SyncMock
  armed: null | '上传' | '下载'
  onArm: (a: null | '上传' | '下载') => void
  onFirstSync: () => void
  onDanger: () => void
}) {
  const s = mock.status
  const byKind = (k: string) => mock.changes.filter((c) => c.kind === k).length

  return (
    <div className="space-y-4">
      {/* 状态卡 */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-800">{状态文字(s)}</div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {s.phase === 'unconfigured'
                ? '填好服务器信息后就能开始同步。'
                : `远端 ${配置.server}${配置.path}`}
            </div>
          </div>
          {s.phase === 'never' && (
            <button
              onClick={onFirstSync}
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
      {(byKind('upload') > 0 || byKind('download') > 0 || mock.conflicts.length > 0) && (
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-2.5 text-xs font-medium text-slate-700">待处理</div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="本地改动待上传" value={byKind('upload')} />
            <Stat label="远端改动待下载" value={byKind('download')} />
            <Stat label="冲突待处理" value={mock.conflicts.length} tone="amber" />
          </div>
        </section>
      )}

      {/* 命令区 */}
      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-medium text-slate-700">
          操作
        </div>

        <CommandRow
          title="同步"
          desc="合并两边的改动"
          consequence="不覆盖任何一侧；两边都改过的走冲突处理"
          tone="safe"
          action={<button className="rounded bg-slate-800 px-3 py-1.5 text-xs text-white hover:bg-slate-700">执行</button>}
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
                onCancel={() => onArm(null)}
              />
            ) : (
              <button
                onClick={() => onArm('上传')}
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
                onCancel={() => onArm(null)}
              />
            ) : (
              <button
                onClick={() => onArm('下载')}
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
            onClick={onDanger}
            className="mt-2 rounded bg-amber-700 px-3 py-1.5 text-xs text-white hover:bg-amber-600"
          >
            查看并确认
          </button>
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'amber' }) {
  return (
    <div
      className={`rounded border px-2.5 py-2 ${
        tone === 'amber' && value > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className="text-base font-semibold text-slate-800">{value}</div>
    </div>
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
          <span className={`text-sm font-medium ${tone === 'danger' ? 'text-red-800' : 'text-slate-800'}`}>
            {title}
          </span>
          <span className="text-[11px] text-slate-500">{desc}</span>
        </div>
        <div className={`mt-0.5 text-[11px] ${tone === 'danger' ? 'text-red-600' : 'text-slate-400'}`}>
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
          ok ? 'bg-red-700 text-white hover:bg-red-600' : 'cursor-not-allowed bg-slate-200 text-slate-400'
        }`}
      >
        执行
      </button>
      <button onClick={onCancel} className="rounded px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100">
        取消
      </button>
    </div>
  )
}

// ---------------------------------------------------------------- 冲突页

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

function ConflictCompare({ conflict, onClose }: { conflict: Conflict; onClose: () => void }) {
  const [pick, setPick] = useState<'local' | 'remote' | null>(null)
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-6">
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
                pick === key ? 'border-sky-500 bg-sky-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
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
              pick ? 'bg-slate-800 text-white hover:bg-slate-700' : 'cursor-not-allowed bg-slate-200 text-slate-400'
            }`}
          >
            采用选中的版本
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 首次同步

function FirstSyncDialog({ mock, onClose }: { mock: SyncMock; onClose: () => void }) {
  const f = mock.firstSync!
  const [pick, setPick] = useState<null | 'local' | 'remote' | 'merge'>(null)
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-6">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">远端已有一个库，两边内容不同</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            第一次同步没有「上次同步」可参照，所以无法判断哪边更新。
            <b className="text-slate-700">不会自动合并</b>——选一个。
          </p>
        </div>

        <div className="grid grid-cols-2 divide-x divide-slate-200">
          {[
            ['本地', f.localCount, '刚刚'],
            ['远端', f.remoteCount, f.remoteAt],
          ].map(([title, count, when]) => (
            <div key={title as string} className="px-5 py-3">
              <div className="mb-1 text-xs font-medium text-slate-700">{title}</div>
              <div className="text-[11px] text-slate-600">{count} 篇笔记</div>
              <div className="text-[11px] text-slate-400">最后改动 {when}</div>
            </div>
          ))}
        </div>

        <div className="space-y-2 px-5 py-4">
          {(
            [
              ['local', '以本地为准（覆盖远端）', `远端那 ${f.remoteCount} 篇被覆盖，远端独有的内容丢失。`, true],
              ['remote', '以远端为准（覆盖本地）', `本地那 ${f.localCount} 篇被覆盖，本地独有的内容丢失。`, true],
              ['merge', '两边合并', '保留两边全部内容，但同名的会产生大量冲突副本要你逐条处理。', false],
            ] as const
          ).map(([key, title, desc, danger]) => (
            <button
              key={key}
              onClick={() => setPick(key)}
              className={`block w-full rounded border-2 px-3 py-2 text-left transition ${
                pick === key
                  ? danger
                    ? 'border-red-500 bg-red-50'
                    : 'border-sky-500 bg-sky-50'
                  : danger
                    ? 'border-red-200 bg-red-50/40 hover:bg-red-50'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div className={`text-xs font-medium ${danger ? 'text-red-800' : 'text-slate-800'}`}>
                {title}
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{desc}</div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <span className="text-[11px] text-slate-500">覆盖类操作执行前会自动落一份快照。</span>
          <button onClick={onClose} className="ml-auto rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
            取消
          </button>
          <button
            disabled={!pick}
            className={`rounded px-3 py-1.5 text-xs ${
              pick ? 'bg-slate-800 text-white hover:bg-slate-700' : 'cursor-not-allowed bg-slate-200 text-slate-400'
            }`}
          >
            继续
          </button>
        </div>
      </div>
    </div>
  )
}

function DeleteDialog({ count, onClose }: { count: number; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const ok = typed === '删除'
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-6">
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-red-800">这次同步要删 {count} 篇笔记</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            超过阈值（10 篇），所以停下来问你——误判的 stat 曾让别家的同步器删光过整个库。
          </p>
        </div>
        <div className="px-5 py-4">
          <div className="mb-3 max-h-40 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-600">
            {['技术/待整理/旧草稿-01.md', '技术/待整理/旧草稿-02.md', '思考/废弃/方案A.md', '… 其余 44 篇'].map(
              (p) => (
                <div key={p}>{p}</div>
              ),
            )}
          </div>
          <div className="text-[11px] text-slate-600">
            删掉的内容会先进回收站（<code className="rounded bg-slate-100 px-1">.confidant/trash/</code>），可还原。
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px] text-slate-500">
              输入 <span className="font-mono font-medium text-slate-700">删除</span> 确认
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-20 rounded border border-red-300 px-2 py-0.5 text-xs outline-none focus:border-red-500"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button onClick={onClose} className="ml-auto rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
            取消同步
          </button>
          <button
            disabled={!ok}
            className={`rounded px-3 py-1.5 text-xs ${
              ok ? 'bg-red-700 text-white hover:bg-red-600' : 'cursor-not-allowed bg-slate-200 text-slate-400'
            }`}
          >
            确认删除并继续
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 设置

function Settings() {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 text-xs font-medium text-slate-700">连接</div>
        <div className="space-y-3">
          <Field label="服务器地址" value={配置.server} />
          <Field label="远端路径" value={配置.path} />
          <Field label="用户名" value={配置.username} />
          <Field label="密码" value={配置.passwordMask} hint="存系统凭据库，不写进库文件" />
          <Field label="库标识" value={配置.vaultUuid} mono hint="随库同步，用来认领远端那一份" />
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 text-xs font-medium text-slate-700">自动同步</div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" defaultChecked />
          启用自动同步
        </label>
        <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
          间隔
          <input
            defaultValue="10"
            className="w-12 rounded border border-slate-300 px-1.5 py-0.5 text-xs outline-none focus:border-sky-500"
          />
          分钟
        </div>
        <div className="mt-2 text-[11px] leading-relaxed text-slate-400">
          另有两次自动同步：应用启动时、本地攒下一批改动之后。
        </div>
      </section>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
        密码存在系统侧而不是库里——否则它会被同步到<b>它自己要连的那台服务器</b>上。
        代价是换台电脑要重新输一次。
      </div>
    </div>
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
