import { useEffect, useRef, useState } from 'react'
import type { EditorApi } from './MarkdownEditor'
import { tableSkeleton } from './tableParser'
import {
  IconBulletList,
  IconChevronDown,
  IconClearFormat,
  IconCodeBlock,
  IconImage,
  IconInlineCode,
  IconLink,
  IconNumberList,
  IconQuote,
  IconRule,
  IconSearch,
  IconSource,
  IconTable,
  IconTaskList,
} from '../icons'

export function EditorToolbar({
  getApi,
  sourceMode,
  onSourceMode,
  headingLevel,
  findOpen,
  onFind,
}: {
  getApi: () => EditorApi | null
  sourceMode: boolean
  onSourceMode: (v: boolean) => void
  headingLevel: number
  /** 这一栏的查找条开着没有——开着时「搜索」按钮自己亮着 */
  findOpen: boolean
  onFind: () => void
}) {
  const api = getApi

  return (
    <div
      /* 高度 30px（含 1px 下边框）：24px 的按钮 + 上下各 2.5px。与两条侧栏
         顶部那条工具条同一个数——三列的横栏因此一样高，横着看是一条线。
         用 `min-h` 而不是 `h`：窗口窄到按钮要换行时宁可长高，也不要切掉按钮。
         data-editor-toolbar 是给测试用的稳定钩子——类名组合到处都是，
         拿它当选择器太脆。 */
      data-editor-toolbar
      /* **整条居中**：按钮组在编辑区里居中，宽窄都跟着走——工具栏不该老是
         贴着左边。换行时每一行各自居中（justify-center 对每一行都生效）。 */
      className="flex min-h-[30px] shrink-0 flex-wrap items-center justify-center gap-1 border-b px-3"
      style={{ backgroundColor: 'var(--surface-center)', borderColor: 'var(--border-color)' }}
    >
      {/* 查找单独摆在最前，与后面隔着一条竖线：它不属于任何一组格式操作——
          那一串按钮改的是正文**长什么样**，它只是在正文里找几个字。
          顺序按「块 → 行内 → 格式」的粒度走：
          查找 | 标题 引用 | 列表 | 代码与图表 | 行内修饰 | 视图与清理
          标题与引用之间**不画竖线**：它俩同属"块级"这一组，一条线会把
          一组东西切成两半。

          **语法标记那三个档（整行 / 标记 / 不展开）不在这里**——它是
          "正文怎么显示"，不是"改正文"，跟格式按钮不是一回事；它在
          设置 › 编辑器 › 语法标记里。 */}
      <Btn label="搜索" hint="在本文中查找" active={findOpen} onClick={onFind}>
        <IconSearch />
      </Btn>

      <Sep />

      <HeadingMenu level={headingLevel} onPick={(l) => api()?.setHeading(l)} />
      <Btn label="引用" hint="引用块" onClick={() => api()?.prefixLines('> ')}>
        <IconQuote />
      </Btn>

      <Sep />

      <Btn label="无序列表" hint="项目符号" onClick={() => api()?.prefixLines('- ')}>
        <IconBulletList />
      </Btn>
      <Btn label="有序列表" hint="编号列表" onClick={() => api()?.prefixLines('1. ')}>
        <IconNumberList />
      </Btn>
      <Btn label="待办项" hint="复选框列表" onClick={() => api()?.prefixLines('- [ ] ')}>
        <IconTaskList />
      </Btn>

      <Sep />

      <Btn label="代码块" hint="围栏代码块" onClick={() => api()?.insertBlock('```\n\n```', 4)}>
        <IconCodeBlock />
      </Btn>
      <Btn label="图片" hint="插入图片" onClick={() => api()?.insert('![](assets/001/文件名.png)')}>
        <IconImage />
      </Btn>
      <Btn label="表格" hint="插入表格" onClick={() => api()?.insertBlock(tableSkeleton())}>
        <IconTable />
      </Btn>

      <Sep />

      {/* B / I / S 是**文字**而不是图形：它们就是 Markdown 的字面标记。
          I 和 S 给 500 字重——原来只有 B 是粗的，另外两个在 12px 下细得
          像没画上，三个按钮的重量对不齐。 */}
      <Btn label="粗体" hint="Ctrl+B" onClick={() => api()?.wrap('**', '**', '粗体')}>
        <span className="font-bold">B</span>
      </Btn>
      <Btn label="斜体" hint="Ctrl+I" onClick={() => api()?.wrap('*', '*', '斜体')}>
        <span className="font-medium italic">I</span>
      </Btn>
      <Btn label="删除线" hint="删除线" onClick={() => api()?.wrap('~~', '~~', '删除线')}>
        <span className="font-medium line-through">S</span>
      </Btn>
      <Btn label="分割线" hint="水平分隔" onClick={() => api()?.insertBlock('---')}>
        <IconRule />
      </Btn>
      <Btn label="链接" hint="插入链接" onClick={() => api()?.wrap('[', '](url)', '链接文字')}>
        <IconLink />
      </Btn>
      <Btn label="行内代码" hint="等宽显示" onClick={() => api()?.wrap('`', '`', 'code')}>
        <IconInlineCode />
      </Btn>

      <Sep />

      {/* 格式 */}
      <Btn
        label="源码"
        hint="切换源码模式"
        active={sourceMode}
        onClick={() => onSourceMode(!sourceMode)}
      >
        <IconSource />
      </Btn>
      <Btn label="清除格式" hint="去掉选区里的 Markdown 标记" onClick={() => api()?.clearFormat()}>
        <IconClearFormat />
      </Btn>
    </div>
  )
}

function Btn({
  label,
  hint,
  active,
  onClick,
  children,
}: {
  label: string
  hint: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={`${label}　${hint}`}
      aria-label={label}
      /* 开关类的按钮（源码、搜索）要能读出"现在是开着的" */
      aria-pressed={active}
      /* h-6 = 24px：可点区域的下限（WCAG 2.5.8）。text-xs 是给 B / I / S
         那几个字母用的——它们是文字，不跟着 svg 缩放，得自己定一个字号，
         否则 24px 的按钮里塞一个 16px 的 B。 */
      className="flex h-6 w-6 items-center justify-center rounded-md text-xs transition-all"
      /* 按下态用**实心墨色**（--solid-bg/--solid-fg，深色下自动反转），
         不用朱砂——朱砂留给"活着的东西"（链接、光标、未保存、同步中）。
         原来悬停、选中、开关打开三件事共用一个强调色，满屏实心色块，
         指示性反而没了。 */
      style={{
        backgroundColor: active ? 'var(--solid-bg)' : 'transparent',
        color: active ? 'var(--solid-fg)' : 'var(--content-secondary)',
      }}
    >
      {children}
    </button>
  )
}

const HEADING_ITEMS = [
  { level: 0, label: '正文', marker: '', size: 12 },
  { level: 1, label: 'H1', marker: '#', size: 14 },
  { level: 2, label: 'H2', marker: '##', size: 13 },
  { level: 3, label: 'H3', marker: '###', size: 12 },
  { level: 4, label: 'H4', marker: '####', size: 11 },
  { level: 5, label: 'H5', marker: '#####', size: 10.5 },
  { level: 6, label: 'H6', marker: '######', size: 10 },
] as const

function HeadingMenu({ level, onPick }: { level: number; onPick: (level: 0 | 1 | 2 | 3 | 4 | 5 | 6) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="标题"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-6 w-9 items-center justify-center gap-1 rounded-md text-xs font-medium transition-all"
        style={{
          backgroundColor: open ? 'var(--solid-bg)' : 'transparent',
          color: open ? 'var(--solid-fg)' : 'var(--content-secondary)',
        }}
      >
        <span>{level === 0 ? '正文' : `H${level}`}</span>
        {/* 菜单的收起标是**文字按钮里的小装饰**，不是工具图标——所以给它
            12px。同一支笔，只是画小一点；描边宽度会按尺寸反算，不会变细。 */}
        <IconChevronDown size={12} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border py-1 shadow-lg"
          style={{ backgroundColor: 'var(--surface-primary)', borderColor: 'var(--border-color)' }}
        >
          {HEADING_ITEMS.map((item) => (
            <button
              key={item.level}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                onPick(item.level)
              }}
              className="flex w-full items-center px-3 py-1.5 text-left transition-colors hover:bg-[var(--surface-hover)]"
              style={{ color: 'var(--content-primary)' }}
            >
              <span className="flex-1" style={{ fontSize: `${item.size}px` }}>
                {item.label}
              </span>
              <span className="text-xs" style={{ color: 'var(--content-muted)' }}>
                {item.marker || '—'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Sep() {
  return <span className="mx-1 h-4 w-px" style={{ backgroundColor: 'var(--border-color)' }} />
}

