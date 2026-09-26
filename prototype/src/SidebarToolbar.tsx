/**
 * 侧栏顶部的工具条与按钮。
 *
 * 两侧栏（左文件树、右大纲）共用，因为它俩的行为完全对称：
 * 一条**撑满侧栏宽度**的工具条，里面四个只有图标的按钮。
 *
 * 三条设计约束：
 *
 * 1. **位置在顶栏下面，和编辑器工具栏同一行。** 两条横栏的下边缘因此对齐——
 *    左边一列读下来是「标识 → 这一列的操作 → 内容」，与中间
 *    「标签栏 → 编辑器工具栏 → 正文」是同一个节奏。
 * 2. **按钮贴着屏幕边缘那一侧。** 左栏的按钮组靠左、右栏的靠右——"折叠"
 *    这个按钮永远在最外侧，跟它控制的那条边一致。
 * 3. **按钮均分工具条宽度。** 侧栏 220px 宽而按钮只有 24px 时，右边会空出
 *    一大片——把每个按钮撑成 1/4 宽，整条工具条才是"填满"的。
 *
 * 高度 h-9（36px）是**照着编辑器工具栏定的**：那一条也是 py-1 + 28px 的按钮。
 * 两边同高，横着看过去才是一条线，而不是两条差不多高的线。
 */
import type { ReactNode } from 'react'
import { IconChevronLeft, IconChevronRight } from './icons'

/**
 * 侧栏顶部工具条。
 *
 * 宽度不写死——aside 是 flex-col，子元素默认 stretch，侧栏变宽变窄它都跟着。
 * 里面的按钮用 `flex-1` 均分这条宽度，整条工具条因此是"填满"的。
 *
 * **高度 30px**，和编辑器工具栏、底部栏一个数：24px 的按钮 + 上下各 3px。
 * 三列的横栏因此一样高，横着看过去是一条线。
 * 用 `min-h` 而不是 `h`：窗口窄到放不下时宁可长高，也不要切掉按钮。
 *
 * **不画边框**：它上面是顶栏、下面是文件树，三者是同一个面色
 * （--surface-secondary），本来就是一条连续的"框"——中间画线等于把一列
 * 切成三段。原来上下各一条（顶栏自己的 border-b + 这里的 border-b）还
 * 挨在一起，等于画了两遍。
 */
export function SidebarBar({ side, children }: { side: 'left' | 'right'; children: ReactNode }) {
  return (
    <div
      className={`flex min-h-[30px] shrink-0 items-center gap-0.5 px-1.5 ${
        // 按钮组贴屏幕边缘那一侧
        side === 'left' ? 'justify-start' : 'justify-end'
      }`}
    >
      {children}
    </div>
  )
}

/** 工具条里的图标按钮。只有图标，没有文字——`label` 供无障碍与 tooltip 用。 */
export function SidebarIconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string
  onClick: () => void
  /** 开关类按钮的按下态（如「搜索」——它开着一行输入框）。 */
  active?: boolean
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      /* flex-1 让几个按钮均分工具条宽度——不然 220px 的条里挤着 4 个 24px
         的按钮，右边空一大片。h-6 = 24px，正好是可点区域的下限
         （WCAG 2.5.8），与编辑器工具栏里那批按钮同高。 */
      className="flex h-6 min-w-0 flex-1 items-center justify-center rounded-md transition-colors hover:bg-[var(--surface-hover)]"
      /* content-secondary 而不是 muted：muted 在侧栏底色上只有约 2.6:1，
         低于图标的 3:1 底线——收起后整条窄栏就剩这一个按钮，它必须看得清。
         按下态用**实心墨色**（--solid-bg/--solid-fg，深色下自动反转），
         不用朱砂——朱砂留给"活着的东西"（链接、光标、未保存、同步中）。 */
      style={{
        backgroundColor: active ? 'var(--solid-bg)' : undefined,
        color: active ? 'var(--solid-fg)' : 'var(--content-secondary)',
      }}
    >
      {children}
    </button>
  )
}

/** 折叠/展开侧栏的按钮。箭头方向随状态翻转。 */
export function SidebarToggleButton({
  side,
  open,
  name,
  onToggle,
}: {
  side: 'left' | 'right'
  open: boolean
  /** 无障碍名称用的中文名（"文件树" / "大纲"）——按钮本身只有图标 */
  name: string
  onToggle: () => void
}) {
  const label = `${open ? '隐藏' : '显示'}${name}`
  // 展开时箭头指向"收起"方向，收起后指向"展开"方向
  const 指向左 = open ? side === 'left' : side === 'right'

  return (
    <SidebarIconButton label={label} onClick={onToggle}>
      {指向左 ? <IconChevronLeft /> : <IconChevronRight />}
    </SidebarIconButton>
  )
}
