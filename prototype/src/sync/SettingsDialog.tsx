import { useState } from 'react'
import { 配置, type SyncMock } from './data'

/**
 * 设置——**从菜单进入的弹窗**，且**不只服务 WebDAV**。
 *
 * 按设置项分五组：WebDAV / 同步 / 文件关联 / 更新 / 笔记库。
 * 这一节的存在理由就是：文件关联、自动更新、库切换同样是设置，
 * 它们不该挤进同步中心。后续加新设置只需加一组。
 */
const 设置分组 = [
  { key: 'webdav', label: 'WebDAV' },
  { key: 'sync', label: '同步' },
  { key: 'files', label: '文件关联' },
  { key: 'update', label: '更新' },
  { key: 'vault', label: '笔记库' },
] as const

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<(typeof 设置分组)[number]['key']>('webdav')

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30 p-6">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex shrink-0 items-center border-b border-slate-200 px-4 py-2.5">
          <span className="text-sm font-medium text-slate-700">设置</span>
          <button
            onClick={onClose}
            className="ml-auto rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            关闭
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="w-40 shrink-0 border-r border-slate-200 bg-slate-50/70 py-2">
            {设置分组.map((g) => (
              <button
                key={g.key}
                onClick={() => setSection(g.key)}
                className={`block w-full px-3 py-1.5 text-left text-xs ${
                  section === g.key
                    ? 'bg-white font-medium text-slate-900'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {g.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-auto bg-slate-50">
            <div className="p-5">
              {section === 'webdav' && <WebdavSection />}
              {section === 'sync' && <SyncSection />}
              {section === 'files' && <FilesSection />}
              {section === 'update' && <UpdateSection />}
              {section === 'vault' && <VaultSection />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-3 text-xs font-medium text-slate-700">{title}</div>
      {children}
    </section>
  )
}

function WebdavSection() {
  return (
    <>
      <Card title="连接">
        <div className="space-y-3">
          <Field label="服务器地址" value={配置.server} />
          <Field label="远端路径" value={配置.path} />
          <Field label="用户名" value={配置.username} />
          <Field label="密码" value={配置.passwordMask} hint="存系统凭据库，不写进库文件" />
          <Field label="库标识" value={配置.vaultUuid} mono hint="随库同步，用来认领远端那一份" />
        </div>
      </Card>
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
        密码存在系统侧而不是库里——否则它会被同步到<b>它自己要连的那台服务器</b>上。
        代价是换台电脑要重新输一次。
      </div>
    </>
  )
}

function SyncSection() {
  return (
    <>
      <Card title="自动同步">
        {/* 默认不勾选——这是刻意的：软件装好后不该自己开始动用户的笔记。
            用户明确打开它，才意味着「我接受它在后台跑」。 */}
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" />
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
        <div className="mt-2 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
          <b className="text-slate-600">默认关闭。</b>
          不勾选时应用不会在后台动你的笔记——你仍然可以随时手动同步。
          勾选后左下角会出现同步状态；不勾选时它保持安静。
        </div>
      </Card>
      <Card title="批量删除保护">
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          一次删除超过
          <input
            defaultValue="10"
            className="w-12 rounded border border-slate-300 px-1.5 py-0.5 text-xs outline-none focus:border-sky-500"
          />
          篇时先确认
        </div>
        <div className="mt-2 text-[11px] leading-relaxed text-slate-400">
          误判的 stat 曾让别家的同步器删光过整个库，所以这一步故意做得不顺手。
        </div>
      </Card>
    </>
  )
}

function FilesSection() {
  return (
    <Card title="打开方式">
      <div className="text-[11px] leading-relaxed text-slate-600">
        知己笔记目前不是 <code className="rounded bg-slate-100 px-1">.md</code>{' '}
        文件的默认打开程序。
      </div>
      <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
        Windows 不允许应用自行设置，需要在系统设置中手动选择。
      </div>
      <button className="mt-2.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
        打开系统设置
      </button>
    </Card>
  )
}

function UpdateSection() {
  return (
    <Card title="版本">
      <dl className="space-y-1 text-[11px]">
        <div className="flex gap-2">
          <dt className="w-24 text-slate-400">当前版本</dt>
          <dd className="text-slate-700">v1.0.0</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 text-slate-400">上次检查</dt>
          <dd className="text-slate-700">今天 09:12</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 text-slate-400">上次结果</dt>
          <dd className="text-amber-700">下载失败：连接超时（下次启动自动重试）</dd>
        </div>
      </dl>
      <button className="mt-3 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
        立即检查更新
      </button>
      <div className="mt-2 text-[11px] leading-relaxed text-slate-400">
        启动时与每 24 小时自动检查。下载完会提示你，不会自动重启。
      </div>
    </Card>
  )
}

function VaultSection() {
  return (
    <Card title="当前笔记库">
      <div className="mb-2 font-mono text-[11px] text-slate-700">%USERPROFILE%\知己笔记</div>
      <div className="mb-3 text-[11px] leading-relaxed text-slate-400">
        同一时刻打开一个库。切换库会重新建立索引——搜索与反向链接都只作用于当前库。
      </div>
      <div className="flex gap-2">
        <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
          切换笔记库…
        </button>
        <button className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100">
          在文件管理器中打开
        </button>
      </div>
    </Card>
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

// ---------------------------------------------------------------- 首次同步 / 批量删除

export function FirstSyncDialog({ mock, onClose }: { mock: SyncMock; onClose: () => void }) {
  const f = mock.firstSync!
  const [pick, setPick] = useState<null | 'local' | 'remote' | 'merge'>(null)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
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
          <button
            onClick={onClose}
            className="ml-auto rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100"
          >
            取消
          </button>
          <button
            disabled={!pick}
            className={`rounded px-3 py-1.5 text-xs ${
              pick
                ? 'bg-slate-800 text-white hover:bg-slate-700'
                : 'cursor-not-allowed bg-slate-200 text-slate-400'
            }`}
          >
            继续
          </button>
        </div>
      </div>
    </div>
  )
}

export function DeleteDialog({ count, onClose }: { count: number; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const ok = typed === '删除'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6">
      <div className="w-full max-w-lg overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-red-800">这次同步要删 {count} 篇笔记</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            超过阈值（10 篇），所以停下来问你——误判的 stat 曾让别家的同步器删光过整个库。
          </p>
        </div>
        <div className="px-5 py-4">
          <div className="mb-3 max-h-40 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-600">
            {[
              '技术/待整理/旧草稿-01.md',
              '技术/待整理/旧草稿-02.md',
              '思考/废弃/方案A.md',
              '… 其余 44 篇',
            ].map((p) => (
              <div key={p}>{p}</div>
            ))}
          </div>
          <div className="text-[11px] text-slate-600">
            删掉的内容会先进回收站（
            <code className="rounded bg-slate-100 px-1">.confidant/trash/</code>），可还原。
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
          <button
            onClick={onClose}
            className="ml-auto rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100"
          >
            取消同步
          </button>
          <button
            disabled={!ok}
            className={`rounded px-3 py-1.5 text-xs ${
              ok
                ? 'bg-red-700 text-white hover:bg-red-600'
                : 'cursor-not-allowed bg-slate-200 text-slate-400'
            }`}
          >
            确认删除并继续
          </button>
        </div>
      </div>
    </div>
  )
}
