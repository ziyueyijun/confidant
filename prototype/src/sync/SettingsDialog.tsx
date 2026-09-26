import { useState } from 'react'
import { 配置, 远端目录, type SyncMock, type TestOutcome } from './data'
import type { SyntaxReveal } from '../editor/markdownLivePreview'

/**
 * 设置——**从底部栏进入的弹窗**。
 *
 * 分组与顺序：编辑器 / 外观 / 快捷键 / 同步 / **工作空间** / 更新 / 关于知己笔记。
 *
 * **没有「文件关联」。** 装好 exe 之后用户在 Windows 设置里自己决定
 * 要不要设为默认程序——应用不该在这里再给一个入口，更不该检测与提醒。
 *
 * **「工作空间」在这里**，挨着「同步」：它管的是「打开哪个文件夹」，
 * 与同步同属"整个库的事"——两件都是低频、要停下来想一下的动作，挨着才顺。
 * 它确实不是一项偏好，但设置是它唯一的家：底部栏那一排只放每天都在用的入口。
 *
 * **「关于」排在「更新」下面**：两者都是"这个应用自己"的事，挨着看才顺。
 *
 * **弹窗高度固定**，不随分组变——理由见下面那段注释。
 */
const 设置分组 = [
  { key: 'editor', label: '编辑器' },
  { key: 'appearance', label: '外观' },
  { key: 'shortcuts', label: '快捷键' },
  { key: 'sync', label: '同步' },
  { key: 'workspace', label: '工作空间' },
  { key: 'update', label: '更新' },
  { key: 'about', label: '关于知己笔记' },
] as const

export function SettingsDialog({
  onClose,
  reveal,
  onReveal,
}: {
  onClose: () => void
  /** 语法标记显示方式。**它是应用状态**（编辑器按它渲染），所以由外面给 */
  reveal: SyntaxReveal
  onReveal: (v: SyntaxReveal) => void
}) {
  const [section, setSection] = useState<(typeof 设置分组)[number]['key']>('editor')

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(26,23,20,0.15)' }}>
      {/* 高度**固定**，不随分组变。
          之前是 max-h：哪个分组内容长，窗口就跟着长——切一下分组整个弹窗
          跳一次，右边的滚动条、底下的留白全跟着动。用户在"切换分组"这个
          动作上不该付出任何注意力，所以取一个定值：640px（多数屏幕上放得下），
          窗口更矮时由 85vh 兜住——两种情况下**各分组都还是同一个高度**。 */}
      <div className="flex h-[640px] max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden shadow-2xl" style={{ borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--surface-primary)', border: '1px solid var(--border-color)' }}>
        <div className="flex shrink-0 items-center px-4 py-2.5" style={{ borderBottom: '1px solid var(--rule-soft)' }}>
          <span className="text-sm font-medium" style={{ color: 'var(--content-primary)' }}>设置</span>
          <button
            onClick={onClose}
            className="ml-auto rounded px-2 py-0.5 text-xs transition-colors hover:bg-[var(--surface-hover)]"
            style={{ color: 'var(--content-muted)' }}
          >
            关闭
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="w-28 shrink-0 py-2" style={{ borderRight: '1px solid var(--border-color)', backgroundColor: 'var(--surface-secondary)' }}>
            {设置分组.map((g) => (
              <button
                key={g.key}
                onClick={() => setSection(g.key)}
                /* 选中的那一项是**内缩的圆角行**，与文件树、大纲的选中行同一套：
                   原来是通栏的白块、四角直角，跟应用里所有"选中"都不一样。
                   mx-1.5 + px-1.5 加起来 12px = 原来的 px-3，文字位置没动；
                   去掉 w-full 是因为块级元素本来就撑满减掉 margin 的宽度。 */
                className="mx-1.5 block rounded-md px-1.5 py-1.5 text-left text-xs transition-colors"
                style={{
                  backgroundColor: section === g.key ? 'var(--surface-primary)' : 'transparent',
                  color: section === g.key ? 'var(--content-primary)' : 'var(--content-secondary)',
                  fontWeight: section === g.key ? 500 : 400,
                }}
              >
                {g.label}
              </button>
            ))}
          </nav>

          <div className="min-h-0 min-w-0 flex-1 overflow-auto" style={{ backgroundColor: 'var(--surface-secondary)' }}>
            <div className="p-5">
              {section === 'editor' && <EditorSection reveal={reveal} onReveal={onReveal} />}
              {section === 'appearance' && <AppearanceSection />}
              {section === 'shortcuts' && <ShortcutsSection />}
              {section === 'sync' && <SyncSection />}
              {section === 'workspace' && <WorkspaceSection />}
              {section === 'update' && <UpdateSection />}
              {section === 'about' && <AboutSection />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 基元

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-lg border p-4" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)' }}>
      <div className="mb-3 text-xs font-medium" style={{ color: 'var(--content-primary)' }}>{title}</div>
      {children}
    </section>
  )
}

/** 一行设置：左边是名称与说明，右边是控件。 */
function Row({
  label,
  desc,
  children,
}: {
  label: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4 border-b py-2 last:border-b-0" style={{ borderColor: 'var(--rule-soft)' }}>
      <div className="min-w-0 flex-1">
        <div className="text-xs" style={{ color: 'var(--content-primary)' }}>{label}</div>
        {desc && <div className="mt-0.5 text-[10px] leading-relaxed" style={{ color: 'var(--content-muted)' }}>{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-md border p-0.5" style={{ borderColor: 'var(--border-color)' }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          /* 段内 4px：外框 8px 减去 p-0.5（2px）的余量，内层不能比外层还圆 */
          className="rounded px-2 py-0.5 text-[11px] transition"
          style={{
            backgroundColor: value === o.value ? 'var(--solid-bg)' : 'transparent',
            color: value === o.value ? 'var(--solid-fg)' : 'var(--content-secondary)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ on }: { on: boolean }) {
  const [v, setV] = useState(on)
  return (
    <button
      onClick={() => setV((x) => !x)}
      className="flex h-4 w-7 items-center rounded-full px-0.5 transition"
      style={{ backgroundColor: v ? 'var(--accent)' : 'var(--surface-tertiary)' }}
    >
      <span
        className="h-3 w-3 rounded-full transition"
        style={{ backgroundColor: 'white', transform: v ? 'translateX(12px)' : '' }}
      />
    </button>
  )
}

function Select({ value, options }: { value: string; options: string[] }) {
  return (
    <select
      defaultValue={value}
      className="rounded-md border px-1.5 py-0.5 text-[11px] outline-none"
      style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-primary)' }}
    >
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  )
}

function NumberInput({ value, suffix }: { value: string; suffix?: string }) {
  return (
    <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--content-muted)' }}>
      <input
        defaultValue={value}
        className="w-12 rounded-md border px-1.5 py-0.5 text-[11px] outline-none"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-primary)' }}
      />
      {suffix}
    </span>
  )
}

// ---------------------------------------------------------------- 1 编辑器

/**
 * 编辑器。
 *
 * 「语法标记 → 显示方式」这一档是**真的**：它接在应用状态上，编辑器当场
 * 按它换渲染（另外几项还是假的——原型只验这一条）。原来它挂在编辑器工具栏
 * 右端，现在只留在这里：它是"正文怎么显示"，不是"改正文"。
 */
function EditorSection({
  reveal,
  onReveal,
}: {
  reveal: SyntaxReveal
  onReveal: (v: SyntaxReveal) => void
}) {
  return (
    <>
      <Card title="语法标记">
        <Row
          label="显示方式"
          desc="** 、## 、` 这些标记在正文里露出来多少。整行＝光标所在那一行全露；标记＝只露光标挨着的那个；不展开＝从不露"
        >
          <Segmented
            value={reveal}
            onChange={onReveal}
            options={[
              { value: 'line', label: '整行' },
              { value: 'marker', label: '标记' },
              { value: 'never', label: '不展开' },
            ]}
          />
        </Row>
        <Row label="源码视图" desc="始终以 Markdown 原文显示，不做渲染">
          <Toggle on={false} />
        </Row>
      </Card>

      <Card title="代码块">
        <Row label="自动换行" desc="长行不出现横向滚动条">
          <Toggle on />
        </Row>
        <Row label="显示行号">
          <Toggle on={false} />
        </Row>
      </Card>

      <Card title="编辑">
        <Row label="Tab 宽度">
          <NumberInput value="4" suffix="空格" />
        </Row>
        <Row label="表格渲染" desc="光标不在表内时显示为真实表格">
          <Toggle on />
        </Row>
        <Row label="自动保存" desc="停止输入后自动写入磁盘">
          <Toggle on />
        </Row>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------- 2 外观

function AppearanceSection() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')

  return (
    <>
      <Card title="主题">
        <Row label="模式">
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: '亮色' },
              { value: 'dark', label: '深色' },
              { value: 'system', label: '跟随系统' },
            ]}
          />
        </Row>
        <Row label="代码块配色">
          <Select value="浅色（与主题一致）" options={['浅色（与主题一致）', 'GitHub', 'Monokai', 'Solarized']} />
        </Row>
      </Card>

      <Card title="语言">
        <Row label="界面语言">
          <Select value="简体中文" options={['简体中文', '繁體中文', 'English']} />
        </Row>
        <Row label="拼写检查" desc="只对拉丁字母生效">
          <Toggle on={false} />
        </Row>
      </Card>
    </>
  )
}

// ---------------------------------------------------------------- 3 快捷键

/**
 * 快捷键列表。
 *
 * ⚠️ **这份清单是占位**——spec 里还没有快捷键表（除了原型里的
 * Ctrl+/ 切源码视图）。列出来是为了把「设置里该有什么」摆出来看，
 * 真正定案时要连同「是否允许自定义」一起定：允许自定义就要做冲突检测，
 * 那是另一块工作量。
 */
const 快捷键表: [string, string][] = [
  ['新建笔记', 'Ctrl + N'],
  ['搜索', 'Ctrl + K'],
  ['源码视图开关', 'Ctrl + /'],
  ['打开工作空间', 'Ctrl + O'],
  ['立即同步', 'Ctrl + Shift + S'],
  ['打开设置', 'Ctrl + ,'],
]

function ShortcutsSection() {
  return (
    <Card title="快捷键">
      <div className="mb-3 text-[11px] leading-relaxed" style={{ color: 'var(--content-muted)' }}>
        第一版只列出这些，暂不允许自定义。
      </div>
      {快捷键表.map(([name, keys]) => (
        <Row key={name} label={name}>
          <kbd className="rounded border px-2 py-0.5 font-mono text-[11px]" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-secondary)', color: 'var(--content-secondary)' }}>
            {keys}
          </kbd>
        </Row>
      ))}
    </Card>
  )
}

// ---------------------------------------------------------------- 4 同步

/**
 * 同步。
 *
 * **没有「自动同步」。** 程序只允许手动同步：自动同步意味着应用会在用户
 * 没看着的时候动他的笔记，而这一票的结论是——同步是一件用户按下去、
 * 看得见结果的事。所以这里没有开关、没有间隔，只有连接与删除保护。
 */
function SyncSection() {
  return (
    <>
      <WebdavBlock />

      <Card title="批量删除保护">
        <Row
          label="一次删除超过多少篇时先确认"
          desc="误判的 stat 曾让别家的同步器删光过整个库，所以这一步故意做得不顺手"
        >
          <NumberInput value="10" suffix="篇" />
        </Row>
      </Card>
    </>
  )
}

/**
 * WebDAV 连接（同步 → 4.1）。
 *
 * 流程是**连接 → 选择 → 保存**三步，不能跳：
 * 1. **测试连接**——先证明地址、用户名、密码是对的。错了就不必往下走。
 * 2. 连上之后**列出远端的目录**，让用户**手动选**要同步哪一个。
 *    这一步不能省：远端往往不止一个目录，猜错会把笔记同步到别人家的库上。
 * 3. **保存**——记住配置。保存前必须已经选定了目录。
 *
 * ## 布局：两栏 + 底部保存行
 *
 * 三张卡竖着堆时实测 837px，要滚到底才按得到保存；而且**连接表单的
 * 输入框被拉到 534px 宽**——服务器地址根本用不了那么宽。所以：
 * - **左窄栏**放连接表单（输入框本来就短）
 * - **右宽栏**放远端目录（路径长，需要宽度）
 * - **保存行贴在这个区块底部**——它是这三步的终点
 */
function WebdavBlock() {
  const [server, setServer] = useState(配置.server)
  const [username, setUsername] = useState(配置.username)
  const [password, setPassword] = useState('')

  const [test, setTest] = useState<TestOutcome>('idle')
  const [picked, setPicked] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  // 原型：用来对比「服务器上只有一个目录」与「有多个目录」两种情况
  const [onlyOne, setOnlyOne] = useState(false)
  const 目录 = onlyOne ? 远端目录.slice(0, 1) : 远端目录

  // 改了连接信息，之前测出来的目录就不再可信
  const dirty = (fn: (v: string) => void) => (v: string) => {
    fn(v)
    setTest('idle')
    setPicked(null)
    setSaved(false)
  }

  const runTest = () => {
    setTest('testing')
    setPicked(null)
    setSaved(false)
    // 原型：假装连上了。真机上这里是 webdav-client 的一次 PROPFIND。
    setTimeout(() => {
      setTest('ok')
      // 只有一个目录时自动选中——但**仍然把它显示出来**并注明是自动选的。
      // 悄悄替用户做决定，和没做这个优化一样糟：下次服务器上多了目录，
      // 用户不知道自己上次是怎么定的。
      if (目录.length === 1) setPicked(目录[0].path)
    }, 700)
  }

  const canSave = test === 'ok' && picked !== null
  const chosen = 目录.find((e) => e.path === picked)

  return (
    <section className="mb-4 overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)' }}>
      <div className="border-b px-4 py-2.5 text-xs font-medium" style={{ borderColor: 'var(--rule-soft)', color: 'var(--content-primary)' }}>
        4.1　WebDAV 同步
      </div>

      <div className="flex">
        {/* ---- 左：连接。窄栏——输入框本来就短，不需要 500px ---- */}
        <div className="w-56 shrink-0 border-r p-4" style={{ borderColor: 'var(--border-color)' }}>
          <div className="space-y-3">
            <Field label="服务器地址" value={server} onChange={dirty(setServer)} />
            <Field label="用户名" value={username} onChange={dirty(setUsername)} />
            <Field
              label="密码"
              value={password}
              placeholder="••••••••"
              type="password"
              onChange={dirty(setPassword)}
            />
          </div>

          <button
            onClick={runTest}
            disabled={test === 'testing'}
            className="mt-3 w-full rounded-md px-3 py-1.5 text-xs transition-colors"
            style={{
              backgroundColor: test === 'testing' ? 'var(--surface-tertiary)' : 'var(--solid-bg)',
              color: test === 'testing' ? 'var(--content-muted)' : 'var(--solid-fg)',
            }}
          >
            {test === 'testing' ? '正在连接…' : '测试连接'}
          </button>

          {test === 'ok' && (
            <div className="mt-2 flex items-center gap-1 text-[11px]" style={{ color: '#5A8A4A' }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: '#5A8A4A' }} />
              连接成功
            </div>
          )}
          {test === 'fail' && (
            <div className="mt-2 rounded-md border px-2 py-1.5 text-[11px] leading-relaxed" style={{ borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.05)', color: '#dc2626' }}>
              连接失败：401 未授权
              <div style={{ color: '#dc2626', opacity: 0.7 }}>用户名或密码不对</div>
            </div>
          )}

          <div className="mt-3 border-t pt-2 text-[10px] leading-relaxed" style={{ borderColor: 'var(--rule-soft)', color: 'var(--content-muted)' }}>
            密码存系统凭据库，不写进库文件——否则它会被同步到<b>它自己要连的那台服务器</b>上。
          </div>

          {/* 原型专用：手动切换结果，好把样子都看一遍 */}
          <div className="mt-3 border-t border-dashed pt-2 text-[10px]" style={{ borderColor: 'var(--rule-soft)', color: 'var(--content-muted)' }}>
            <div className="mb-1">原型开关</div>
            <div className="flex flex-wrap gap-1">
              {(['ok', 'fail'] as const).map((o) => (
                <button
                  key={o}
                  onClick={() => {
                    setTest(o)
                    setPicked(null)
                    setSaved(false)
                  }}
                  className="rounded-md border px-1.5 py-0.5 transition-colors hover:bg-[var(--surface-hover)]"
                  style={{ borderColor: 'var(--border-color)' }}
                >
                  {o === 'ok' ? '成功' : '失败'}
                </button>
              ))}
              <button
                onClick={() => {
                  setOnlyOne((v) => !v)
                  setTest('idle')
                  setPicked(null)
                  setSaved(false)
                }}
                className="rounded-md border px-1.5 py-0.5 transition-colors hover:bg-[var(--surface-hover)]"
                style={{ borderColor: 'var(--border-color)' }}
              >
                {onlyOne ? '多目录' : '单目录'}
              </button>
            </div>
          </div>
        </div>

        {/* ---- 右：远端目录。宽栏，路径长 ---- */}
        <div className="min-w-0 flex-1 p-4" style={{ backgroundColor: 'var(--surface-secondary)' }}>
          <div className="mb-2.5 text-[11px] font-medium" style={{ color: 'var(--content-secondary)' }}>选择远端目录</div>

          {test !== 'ok' ? (
            <div className="rounded-lg border border-dashed p-12 text-center" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)' }}>
              <div className="text-xs" style={{ color: 'var(--content-muted)' }}>先测试连接</div>
              <div className="mt-1 text-[11px]" style={{ color: 'var(--content-muted)' }}>
                连上之后这里会列出服务器上的目录
              </div>
            </div>
          ) : (
            <>
              <p className="mb-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--content-muted)' }}>
                {目录.length === 1 ? (
                  <>
                    服务器上只有一个目录，<b style={{ color: 'var(--content-secondary)' }}>已经替你选好了</b>。
                  </>
                ) : (
                  <>
                    选一个作为要同步的位置——
                    <b style={{ color: 'var(--content-secondary)' }}>选错了会把笔记同步到别的库上</b>。
                  </>
                )}
              </p>

              <ul className="overflow-hidden rounded-lg border" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)' }}>
                {目录.map((e) => {
                  const active = picked === e.path
                  return (
                    <li key={e.path}>
                      <button
                        onClick={() => {
                          setPicked(e.path)
                          setSaved(false)
                        }}
                        className="flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0 transition-colors"
                        style={{ borderColor: 'var(--border-color)', backgroundColor: active ? 'var(--accent-subtle)' : 'transparent' }}
                      >
                        <span
                          className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border"
                          style={{ borderColor: active ? 'var(--accent)' : 'var(--border-color)', backgroundColor: active ? 'var(--accent)' : 'transparent' }}
                        >
                          {active && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'white' }} />}
                        </span>
                        <span className="truncate font-mono text-xs" style={{ color: 'var(--content-primary)' }}>{e.path}</span>
                        {e.isVault && (
                          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px]" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                            已有库
                          </span>
                        )}
                        <span className="ml-auto shrink-0 text-[10px]" style={{ color: 'var(--content-muted)' }}>
                          {e.count} 项 · {e.modified}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>

              {chosen?.isVault && (
                <div className="mt-2.5 rounded-lg border px-3 py-2 text-[11px] leading-relaxed" style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--accent-subtle)', color: 'var(--accent-hover)' }}>
                  这个目录里已经有 <code className="rounded px-1" style={{ backgroundColor: 'var(--accent-subtle-hover)' }}>.confidant/</code>
                  ——它已经是一个知己笔记的库。选它等于**接上那个库**，
                  两边内容不同时首次同步会停下来问你。
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ---- 底部：保存。贴在这个区块底部，不随内容滚走 ---- */}
      <div className="flex items-center gap-3 border-t px-4 py-2.5" style={{ borderColor: 'var(--rule-soft)', backgroundColor: 'var(--surface-secondary)' }}>
        <div className="flex min-w-0 items-center gap-3 text-[11px]">
          <span className="shrink-0" style={{ color: 'var(--content-muted)' }}>将保存</span>
          <span className="truncate font-mono" style={{ color: 'var(--content-primary)' }}>{server || '（未填服务器）'}</span>
          <span className="shrink-0" style={{ color: 'var(--content-muted)' }}>→</span>
          <span className="truncate font-mono" style={{ color: picked ? 'var(--content-primary)' : 'var(--content-muted)' }}>
            {picked ?? '（未选目录）'}
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {saved ? (
            <span className="text-[11px]" style={{ color: '#5A8A4A' }}>已保存，下次打开还在</span>
          ) : (
            !canSave && (
              <span className="text-[11px]" style={{ color: 'var(--content-muted)' }}>
                {test !== 'ok' ? '先测试连接' : '先选一个远端目录'}
              </span>
            )
          )}
          <button
            onClick={() => canSave && setSaved(true)}
            disabled={!canSave || saved}
            className="rounded-md px-4 py-1.5 text-xs transition-colors"
            style={{
              backgroundColor: saved ? 'var(--accent-subtle)' : canSave ? 'var(--solid-bg)' : 'var(--surface-tertiary)',
              color: saved ? 'var(--accent)' : canSave ? 'var(--solid-fg)' : 'var(--content-muted)',
            }}
          >
            {saved ? '已保存' : '保存'}
          </button>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- 5 工作空间

/**
 * 工作空间。
 *
 * 「工作空间」是用户在界面上看到的名字；在库里它对应的就是那个文件夹
 * （`CONTEXT.md` 里叫「库」）。
 *
 * ## 只有两个按钮
 *
 * - **打开工作空间**——在文件管理器里打开当前这个文件夹。
 * - **切换工作空间**——**弹出系统文件夹选择器**，让用户自己挑位置。
 *
 * **不显示「最近打开的」列表。** 那是一个应用替用户维护的隐式状态：
 * 它会过期，会指向已删除的文件夹、会让用户以为「选过的东西就不用再想」。
 * 而切换工作空间是一件低频，需要明确知道自己在选什么的事——
 * 每次都从文件系统里现挑，比从一个可能过期的列表里挑更可靠。
 *
 * ## 为什么它住在设置里
 *
 * 它管的确实不是偏好，是「打开哪个文件夹」这种应用级动作。但底部栏那一排
 * 只放每天都在用的入口（设置、同步中心、主题、专注模式），而工作空间
 * 一个月也未必切一次——放在设置里挨着「同步」，与另一件"整个库的事"作伴。
 */
function WorkspaceSection() {
  const [picking, setPicking] = useState(false)

  return (
    <>
      <Card title="位置">
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-secondary)' }}>
          <div className="mb-1 text-[11px]" style={{ color: 'var(--content-secondary)' }}>当前</div>
          <div className="truncate font-mono text-xs" style={{ color: 'var(--content-primary)' }}>
            %USERPROFILE%\知己笔记
          </div>
          <div className="mt-1 text-[10px]" style={{ color: 'var(--content-secondary)' }}>1284 篇笔记</div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            className="flex-1 rounded-md px-3 py-2 text-xs transition-colors"
            style={{ backgroundColor: 'var(--solid-bg)', color: 'var(--solid-fg)' }}
          >
            打开工作空间
          </button>
          <button
            onClick={() => setPicking(true)}
            className="flex-1 rounded-md border px-3 py-2 text-xs transition-colors hover:bg-[var(--surface-hover)]"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-secondary)' }}
          >
            切换工作空间
          </button>
        </div>
      </Card>

      <Card title="同一时刻只打开一个">
        <div className="text-[11px] leading-relaxed" style={{ color: 'var(--content-secondary)' }}>
          切换会重新建立索引——搜索与反向链接都只作用于当前这一个。
        </div>
        <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--content-muted)' }}>
          没有「最近打开的」列表：那是应用替用户维护的隐式状态，会过期，
          也会指向已经删掉的文件夹。每次现挑，比从一个可能过期的列表里挑更可靠。
        </div>
      </Card>

      {picking && <FolderPicker onClose={() => setPicking(false)} />}
    </>
  )
}

/**
 * 系统文件夹选择器（原型里的样子）。
 *
 * 真机上这是 `dialog.showOpenDialog({ properties: ['openDirectory'] })`——
 * 由操作系统画的窗口，应用控制不了它的外观，也不该试图控制。
 * 这里画出来只是为了让流程看得见。
 */
function FolderPicker({ onClose }: { onClose: () => void }) {
  const [path, setPath] = useState('D:\\笔记\\工作')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(26,23,20,0.2)' }}>
      <div className="w-full max-w-lg overflow-hidden border shadow-2xl" style={{ borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-color)' }}>
        {/* 模仿系统窗口的标题栏 */}
        <div className="flex items-center gap-2 px-3 py-1.5" style={{ borderBottom: '1px solid var(--rule-soft)', backgroundColor: 'var(--surface-tertiary)' }}>
          <span className="text-[11px]" style={{ color: 'var(--content-secondary)' }}>选择文件夹</span>
          <span className="ml-auto text-[10px]" style={{ color: 'var(--content-muted)' }}>原型：这是系统窗口，不是应用画的</span>
        </div>

        <div className="p-3">
          <div className="mb-2 flex gap-2 text-[11px]">
            <button className="rounded-md border px-2 py-0.5 transition-colors hover:bg-[var(--surface-hover)]"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-secondary)' }}>
              ←
            </button>
            <button className="rounded-md border px-2 py-0.5 transition-colors hover:bg-[var(--surface-hover)]"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-secondary)' }}>
              →
            </button>
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              className="flex-1 rounded-md border px-2 py-0.5 font-mono text-[11px] outline-none"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-primary)' }}
            />
          </div>

          <div className="h-44 overflow-auto rounded-lg border p-1" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)' }}>
            {[
              ['技术'],
              ['思考'],
              ['写作'],
              ['旧稿'],
            ].map(([name]) => (
              <button
                key={name}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] transition-colors hover:bg-[var(--surface-hover)]"
                style={{ color: 'var(--content-secondary)' }}
              >
                <span>📁</span>
                {name}
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2">
            <span className="text-[11px]" style={{ color: 'var(--content-muted)' }}>文件夹名</span>
            <input
              defaultValue="工作"
              className="flex-1 rounded-md border px-2 py-0.5 text-[11px] outline-none"
              style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-primary)' }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: '1px solid var(--rule-soft)', backgroundColor: 'var(--surface-tertiary)' }}>
          <button
            onClick={onClose}
            className="ml-auto rounded-md border px-4 py-1 text-[11px] transition-colors hover:bg-[var(--surface-hover)]"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-secondary)', color: 'var(--content-secondary)' }}
          >
            取消
          </button>
          <button
            onClick={onClose}
            className="rounded-md px-4 py-1 text-[11px] transition-colors"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
          >
            选择文件夹
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 6 更新

function UpdateSection() {
  return (
    <Card title="版本">
      <dl className="space-y-1 text-[11px]">
        <div className="flex gap-2">
          <dt className="w-24" style={{ color: 'var(--content-muted)' }}>当前版本</dt>
          <dd style={{ color: 'var(--content-primary)' }}>v1.0.0</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24" style={{ color: 'var(--content-muted)' }}>上次检查</dt>
          <dd style={{ color: 'var(--content-primary)' }}>今天 09:12</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24" style={{ color: 'var(--content-muted)' }}>上次结果</dt>
          <dd style={{ color: 'var(--accent)' }}>下载失败：连接超时（下次启动自动重试）</dd>
        </div>
      </dl>
      <button className="mt-3 rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-hover)]" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-secondary)' }}>
        立即检查更新
      </button>
      <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--content-muted)' }}>
        启动时与每 24 小时自动检查。下载完会提示你，不会自动重启。
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------- 7 关于知己笔记

/**
 * 关于。
 *
 * 只放事实，不放「感谢使用」之类的客套——用户点进这一页通常是两种时候：
 * 想知道自己装的是哪个版本，或者想确认笔记到底存在哪儿。两件事答上，
 * 这一页就写完了。
 */
function AboutSection() {
  return (
    <>
      <Card title="知己笔记">
        <div className="flex items-start gap-3">
          {/* 与左栏顶栏那个「知」是同一个字——这里把它放大成标识 */}
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-semibold"
            style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--accent)' }}
          >
            知
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium" style={{ color: 'var(--content-primary)' }}>知己笔记</div>
            <div className="mt-0.5 font-mono text-[11px]" style={{ color: 'var(--content-muted)' }}>
              confidant v1.0.0
            </div>
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--content-secondary)' }}>
              本地优先的个人知识管理。笔记是你自己的纯 Markdown 文件——
              不用导出，也不锁在任何一种格式里。
            </p>
          </div>
        </div>
      </Card>

      <Card title="你的笔记在哪儿">
        <Row label="当前工作空间" desc="笔记就是这个文件夹里的 .md 文件，用别的编辑器也能打开">
          <span className="font-mono text-[11px]" style={{ color: 'var(--content-primary)' }}>
            %USERPROFILE%\知己笔记
          </span>
        </Row>
        <Row label="索引与回收站" desc=".confidant/ 子目录。删掉它不会丢笔记，下次打开重建">
          <span className="font-mono text-[11px]" style={{ color: 'var(--content-primary)' }}>.confidant/</span>
        </Row>
      </Card>
    </>
  )
}

function Field({
  label,
  value,
  hint,
  mono,
  type,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  hint?: string
  mono?: boolean
  type?: string
  placeholder?: string
  onChange?: (v: string) => void
}) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px]" style={{ color: 'var(--content-muted)' }}>{label}</div>
      <input
        {...(onChange
          ? { value, onChange: (e) => onChange(e.target.value) }
          : { defaultValue: value })}
        type={type}
        placeholder={placeholder}
        className="w-full rounded-md border px-2 py-1 text-xs outline-none"
        style={{
          borderColor: 'var(--border-color)',
          backgroundColor: 'var(--surface-primary)',
          color: 'var(--content-primary)',
          fontFamily: mono ? 'inherit' : undefined,
          fontSize: mono ? '10px' : undefined,
        }}
      />
      {hint && <div className="mt-1 text-[10px]" style={{ color: 'var(--content-muted)' }}>{hint}</div>}
    </label>
  )
}

// ---------------------------------------------------------------- 首次同步 / 批量删除

export function FirstSyncDialog({ mock, onClose }: { mock: SyncMock; onClose: () => void }) {
  const f = mock.firstSync!
  const [pick, setPick] = useState<null | 'local' | 'remote' | 'merge'>(null)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(26,23,20,0.2)' }}>
      <div className="w-full max-w-2xl overflow-hidden shadow-2xl" style={{ borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--surface-primary)', border: '1px solid var(--border-color)' }}>
        <div className="border-b px-5 py-3" style={{ borderColor: 'var(--rule-soft)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--content-primary)' }}>远端已有一个库，两边内容不同</h3>
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--content-muted)' }}>
            第一次同步没有「上次同步」可参照，所以无法判断哪边更新。
            <b style={{ color: 'var(--content-secondary)' }}>不会自动合并</b>——选一个。
          </p>
        </div>

        <div className="grid grid-cols-2" style={{ borderColor: 'var(--border-color)' }}>
          {[
            ['本地', f.localCount, '刚刚'],
            ['远端', f.remoteCount, f.remoteAt],
          ].map(([title, count, when]) => (
            <div key={title as string} className="px-5 py-3" style={{ borderColor: 'var(--border-color)' }}>
              <div className="mb-1 text-xs font-medium" style={{ color: 'var(--content-primary)' }}>{title}</div>
              <div className="text-[11px]" style={{ color: 'var(--content-secondary)' }}>{count} 篇笔记</div>
              <div className="text-[11px]" style={{ color: 'var(--content-muted)' }}>最后改动 {when}</div>
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
              className="block w-full rounded-lg border-2 px-3 py-2 text-left transition"
              style={{
                borderColor: pick === key
                  ? (danger ? '#dc2626' : 'var(--accent)')
                  : 'var(--border-color)',
                backgroundColor: pick === key
                  ? (danger ? 'rgba(220,38,38,0.05)' : 'var(--accent-subtle)')
                  : 'transparent',
              }}
            >
              <div className="text-xs font-medium" style={{ color: danger ? '#dc2626' : 'var(--content-primary)' }}>
                {title}
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed" style={{ color: 'var(--content-muted)' }}>{desc}</div>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--rule-soft)', backgroundColor: 'var(--surface-secondary)' }}>
          <span className="text-[11px]" style={{ color: 'var(--content-muted)' }}>覆盖类操作执行前会自动落一份快照。</span>
          <button
            onClick={onClose}
            className="ml-auto rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-hover)]"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-secondary)' }}
          >
            取消
          </button>
          <button
            disabled={!pick}
            className="rounded-md px-3 py-1.5 text-xs"
            style={{
              backgroundColor: pick ? 'var(--solid-bg)' : 'var(--surface-tertiary)',
              color: pick ? 'var(--solid-fg)' : 'var(--content-muted)',
            }}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ backgroundColor: 'rgba(26,23,20,0.2)' }}>
      <div className="w-full max-w-lg overflow-hidden shadow-2xl" style={{ borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--surface-primary)', border: '1px solid var(--border-color)' }}>
        <div className="border-b px-5 py-3" style={{ borderColor: 'var(--rule-soft)' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#dc2626' }}>这次同步要删 {count} 篇笔记</h3>
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--content-muted)' }}>
            超过阈值（10 篇），所以停下来问你——误判的 stat 曾让别家的同步器删光过整个库。
          </p>
        </div>
        <div className="px-5 py-4">
          <div className="mb-3 max-h-40 overflow-auto rounded-md border p-2 font-mono text-[11px]" style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-secondary)', color: 'var(--content-secondary)' }}>
            {[
              '技术/待整理/旧草稿-01.md',
              '技术/待整理/旧草稿-02.md',
              '思考/废弃/方案A.md',
              '… 其余 44 篇',
            ].map((p) => (
              <div key={p}>{p}</div>
            ))}
          </div>
          <div className="text-[11px]" style={{ color: 'var(--content-secondary)' }}>
            删掉的内容会先进回收站（
            <code className="rounded px-1" style={{ backgroundColor: 'var(--surface-tertiary)' }}>.confidant/trash/</code>），可还原。
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-[11px]" style={{ color: 'var(--content-muted)' }}>
              输入 <span className="font-mono font-medium" style={{ color: 'var(--content-primary)' }}>删除</span> 确认
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="w-20 rounded-md border px-2 py-0.5 text-xs outline-none"
              style={{ borderColor: '#dc2626', backgroundColor: 'var(--surface-primary)', color: 'var(--content-primary)' }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3" style={{ borderColor: 'var(--rule-soft)', backgroundColor: 'var(--surface-secondary)' }}>
          <button
            onClick={onClose}
            className="ml-auto rounded-md border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-hover)]"
            style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--surface-primary)', color: 'var(--content-secondary)' }}
          >
            取消同步
          </button>
          <button
            disabled={!ok}
            className="rounded-md px-3 py-1.5 text-xs"
            style={{
              backgroundColor: ok ? '#dc2626' : 'var(--surface-tertiary)',
              color: ok ? 'white' : 'var(--content-muted)',
            }}
          >
            确认删除并继续
          </button>
        </div>
      </div>
    </div>
  )
}
