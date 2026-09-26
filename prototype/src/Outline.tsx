/**
 * 大纲组件。
 * 从 markdown 文本提取 ATX 标题，支持折叠/展开，以及**在本篇大纲里搜标题**。
 *
 * ## 工具条为什么在顶栏下面
 *
 * 它和左边文件树那条工具条是对称的（见 `SidebarToolbar`）：顶栏（「大纲」）
 * 下面紧跟这一列自己的操作，再往下才是内容。两条侧栏因此和中间那一列
 * 同一个节奏——「标签栏 → 编辑器工具栏 → 正文」。
 *
 * ## 大纲里的「搜索」搜的是什么
 *
 * **当前这篇笔记的标题**，不是全文（全文由文件树那一条工具条的搜索负责）。
 * 两者图标一样、都在各自那一列的上方，靠 tooltip 与打开的东西区分。
 */
import { useRef, useState } from 'react'
import { SidebarBar, SidebarIconButton, SidebarToggleButton } from './SidebarToolbar'
import { IconChevronRight, IconCollapseAll, IconExpandAll, IconSearch } from './icons'

interface Heading {
  level: number
  text: string
  line: number
}

function parseHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  markdown.split('\n').forEach((line, idx) => {
    const m = line.match(/^(#{1,6})\s+(.+)/)
    if (m) {
      headings.push({
        level: m[1].length,
        text: m[2].replace(/[`*_]/g, '').trim(),
        line: idx,
      })
    }
  })
  return headings
}

interface Props {
  body: string
  /** 展开还是收起。收起时渲染成一条窄栏，按钮留在原位 */
  open: boolean
  onToggle: () => void
  onJump?: (line: number) => void
  /** 栏宽。由外面管——拖过之后要记住，记忆不在这个组件里 */
  width: number
  /** 左边框上的拖拽手柄。收起时外面传 null——那会儿宽度是固定的 */
  resizeHandle?: React.ReactNode
}

export function Outline({ body, open, onToggle, onJump, width, resizeHandle }: Props) {
  const headings = parseHeadings(body)
  const [active, setActive] = useState<number>(0)
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  /** 搜索行开着没有。关掉时**同时清词**——不留一个看不见的筛选条件 */
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLUListElement>(null)

  const toggle = (index: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  /** 标题是否应显示：递归检查所有祖先都未被折叠才算可见 */
  const isVisible = (index: number): boolean => {
    if (index === 0) return true
    const current = headings[index]
    for (let i = index - 1; i >= 0; i--) {
      if (headings[i].level < current.level) {
        // 找到最近的更低级别标题——它是当前标题的一个祖先
        // 只有当该祖先未被折叠，且该祖先本身可见，当前才可见
        return !collapsed.has(i) && isVisible(i)
      }
    }
    return true
  }

  const hasChildren = (index: number) =>
    headings.slice(index + 1).some((next) => next.level > headings[index].level)

  /** 全部展开 */
  const expandAll = () => setCollapsed(new Set())

  /** 全部折叠——只收**有子标题**的那些。叶子标题收不起来，塞进去只是脏数据。 */
  const collapseAll = () => {
    const all = new Set<number>()
    headings.forEach((_, i) => {
      if (hasChildren(i)) all.add(i)
    })
    setCollapsed(all)
  }

  const 关掉搜索 = () => {
    setSearchOpen(false)
    setQuery('')
  }

  const 词 = query.trim().toLowerCase()
  /** 搜着的时候列的是**平铺的命中**——折叠状态在这时不作数（见下） */
  const 命中 = headings
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => h.text.toLowerCase().includes(词))

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l"
      style={{ width, backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-color)' }}
    >
      {/* 顶栏：展开时「大纲」，收起时「己」。
          收起后的两个字合起来是「知己」——应用名的前两个字，两侧各占一个，
          比左边「知」右边「纲」更像一对。
          字体 / 字号 / 颜色**与左上的「知己笔记」完全一致**（text-sm font-semibold
          + content-primary）——两边是同一层级的标识，不该一个粗一个细。
          文字居中，宽度自适应所在的那一段。 */}
      <div
        className="flex h-10 shrink-0 items-center justify-center border-b px-2"
        style={{ borderColor: 'var(--border-color)' }}
      >
        <span className="truncate text-sm font-semibold" style={{ color: 'var(--content-primary)' }}>
          {open ? '大纲' : '己'}
        </span>
      </div>

      {/* 工具条。顺序：搜索 / 全部折叠 / 全部展开 / 隐藏大纲——
          **折叠按钮在最外侧**，跟它控制的那条边一致（与左侧文件树对称）。
          收起时只剩折叠按钮：窄栏 36px 放不下四个。 */}
      <SidebarBar side="right">
        {open && (
          <>
            <SidebarIconButton
              label="搜索标题"
              active={searchOpen}
              onClick={() => (searchOpen ? 关掉搜索() : setSearchOpen(true))}
            >
              <IconSearch />
            </SidebarIconButton>
            <SidebarIconButton label="全部折叠" onClick={collapseAll}>
              <IconCollapseAll />
            </SidebarIconButton>
            <SidebarIconButton label="全部展开" onClick={expandAll}>
              <IconExpandAll />
            </SidebarIconButton>
          </>
        )}
        <SidebarToggleButton side="right" open={open} name="大纲" onToggle={onToggle} />
      </SidebarBar>

      {open && searchOpen && (
        <div
          className="flex shrink-0 items-center gap-1 border-b px-2 py-1"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                关掉搜索()
              }
            }}
            placeholder="搜索标题"
            aria-label="搜索标题"
            className="min-w-0 flex-1 rounded border px-1.5 py-0.5 text-xs outline-none"
            style={{
              borderColor: 'var(--border-color)',
              backgroundColor: 'var(--surface-primary)',
              color: 'var(--content-primary)',
            }}
          />
          {query !== '' && (
            <button
              onClick={() => setQuery('')}
              title="清空"
              className="shrink-0 rounded px-1 py-0.5 text-[10px] transition-colors hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--content-muted)' }}
            >
              清空
            </button>
          )}
        </div>
      )}

      {!open ? (
        <div className="flex-1" />
      ) : headings.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-3 py-3">
          <p className="text-xs" style={{ color: 'var(--content-muted)' }}>无标题</p>
        </div>
      ) : 词 !== '' && 命中.length === 0 ? (
        <div className="flex flex-1 items-start justify-center px-3 py-3">
          <p className="text-xs leading-relaxed text-center" style={{ color: 'var(--content-muted)' }}>
            没有标题含「{query.trim()}」
          </p>
        </div>
      ) : (
        /* 标题列表 */
        <nav className="flex-1 overflow-auto px-1.5 py-2" ref={listRef}>
        <ul>
          {(词 === '' ? headings.map((h, i) => ({ h, i })) : 命中).map(({ h, i }) => {
            // 搜着的时候**不按折叠状态过滤**：命中的标题若挂在一个收起来的
            // 父标题下，按折叠过滤就等于"搜到了但看不见"——那比不搜还糟。
            if (词 === '' && !isVisible(i)) return null

            const isCollapsed = collapsed.has(i)
            const kids = hasChildren(i)
            const 在搜 = 词 !== ''

            return (
              <li key={i}>
                {/* 整行 hover + 选中效果：橙色背景覆盖整行 */}
                <div
                  className="group flex items-center rounded-md py-0.5 transition-colors hover:bg-[var(--surface-hover)]"
                  style={{
                    paddingLeft: `${(h.level - 1) * 12 + 8}px`,
                    paddingRight: '4px',
                    backgroundColor: active === i ? 'var(--accent-subtle)' : 'transparent',
                  }}
                >
                  {kids && !在搜 ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggle(i) }}
                      className="mr-1 shrink-0 rounded p-0.5"
                      title={isCollapsed ? '展开' : '折叠'}
                    >
                      {/* 与文件树一致的展开箭头。旋转语义照旧：收起时朝上、
                          展开时朝右——文件树也是这一套，两处必须一样。 */}
                      <IconChevronRight
                        style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', opacity: 0.7 }}
                      />
                    </button>
                  ) : (
                    <span className="mr-1 w-5 shrink-0" />
                  )}

                  <button
                    onClick={(e) => { e.stopPropagation(); setActive(i); onJump?.(h.line) }}
                    className="flex-1 truncate px-2 py-1 text-left text-sm transition-all"
                    style={{
                      backgroundColor: 'transparent',
                      color: active === i ? 'var(--accent)' : 'var(--content-primary)',
                      fontWeight: active === i ? 500 : 400,
                    }}
                    title={h.text}
                  >
                    {h.text
                      ? 在搜 ? 高亮(h.text, 词) : h.text
                      : <span className="italic" style={{ color: 'var(--content-muted)' }}>无标题</span>}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </nav>
      )}

      {/* 手柄**放在最后**：它是绝对定位的，DOM 里排第几都不影响样子，
          但顶栏必须是 aside 的第一个子元素——测试与阅读都按这个来找。 */}
      {resizeHandle}
    </aside>
  )
}

/** 把命中的那一段包成 `<mark>`。只标第一处——标题本来就短。 */
function 高亮(text: string, 词: string) {
  const i = text.toLowerCase().indexOf(词)
  if (i === -1) return text
  return (
    <>
      {text.slice(0, i)}
      <mark
        style={{
          backgroundColor: 'var(--accent-subtle-hover)',
          color: 'var(--accent-hover)',
          borderRadius: 2,
        }}
      >
        {text.slice(i, i + 词.length)}
      </mark>
      {text.slice(i + 词.length)}
    </>
  )
}
