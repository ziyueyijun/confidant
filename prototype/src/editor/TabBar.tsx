/**
 * 标签栏。每块分屏各有一条。
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from '../icons'

export interface TabItem {
  path: string
  title: string
  dirty: boolean
}

interface Props {
  paneId: string
  tabs: TabItem[]
  active: string | null
  moveLabel: { label: string; enabled: boolean }
  onActivate: (paneId: string, path: string) => void
  onCloseRequest: (paneId: string, path: string) => void
  onCloseOthers: (paneId: string, path: string) => void
  onMove: (paneId: string, path: string) => void
  onRefresh: (paneId: string, path: string) => void
  onSave: (path: string) => void
}

interface MenuState {
  x: number
  y: number
  path: string
}

const MENU_WIDTH = 150
const MENU_HEIGHT = 170

export function TabBar({
  paneId,
  tabs,
  active,
  moveLabel,
  onActivate,
  onCloseRequest,
  onCloseOthers,
  onMove,
  onRefresh,
  onSave,
}: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  useEffect(() => {
    if (!menu) return
    const dismiss = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', dismiss)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('mousedown', dismiss)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', dismiss)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [menu])

  const items = menu
    ? [
        { label: '关闭标签', run: () => onCloseRequest(paneId, menu.path) },
        { label: '关闭其他标签', run: () => onCloseOthers(paneId, menu.path), disabled: tabs.length < 2 },
        { label: moveLabel.label, run: () => onMove(paneId, menu.path), disabled: !moveLabel.enabled },
        { label: '刷新', run: () => onRefresh(paneId, menu.path) },
        { label: '保存', run: () => onSave(menu.path) },
      ]
    : []

  return (
    <>
      <div
        /* h-10 与两侧的顶栏同高——三条横栏的下边缘对齐。
           shrink-0 是必须的：它住在 flex-col 的 pane 里，不加的话高度会被压。
           cm-tab-bar 是给测试用的稳定钩子：Tailwind 类名组合到处都是，
           拿它当选择器太脆（侧栏工具条也曾用过 items-stretch，一撞就选错）。 */
        className="cm-tab-bar flex h-10 shrink-0 items-stretch overflow-x-auto"
        /* 不画下边框：下面那条编辑器工具栏是同一个面色（--surface-secondary），
           两个连成一条"框"，中间不该有东西。 */
        style={{ backgroundColor: 'var(--surface-secondary)' }}
      >
        {tabs.map((t) => {
          const isActive = t.path === active
          return (
            <div
              key={t.path}
              onMouseDown={() => onActivate(paneId, t.path)}
              onContextMenu={(e) => {
                e.preventDefault()
                onActivate(paneId, t.path)
                setMenu({ x: e.clientX, y: e.clientY, path: t.path })
              }}
              title={t.path}
              className="group flex shrink-0 cursor-default items-center gap-2 rounded-t-md px-3 text-sm transition-colors"
              style={{
                // 标签之间不画竖线：选中的那个是**纸色**，它自己就分开了
                // 左右——原来每个标签右边一根线，标签栏读起来像一排格子。
                //
                // **只圆上边两角，底边保持通高**。这一条是有约束的：标签栏是
                // 框色，而它下面的工具栏、正文都是纸色——选中标签的纸色是
                // **一路通到正文**的，它的底边其实不存在。收底角（哪怕只收
                // 一点）会把这条纸带切断，标签就变成"浮在框上的一枚片"，那是
                // 另一个东西（试过，否了）。所以圆角只能开在上边。
                //
                // **形状靠一根线才读得出来**：纸（#F9F7F2）与框（#F1EEE7）
                // 只差 1.08，光收角几乎看不见（试过，用户说"没变化"）。这根
                // 线本来就是该画的——它是"框与纸的交界"，与侧栏竖边、底栏
                // 上边同属强档线。用内阴影而不是 border：border 会撑大 2px、
                // 让活动标签的文字挪 1px，内阴影不占布局，一个像素都不动。
                // 底边不画——纸要连着下面的正文。
                boxShadow: isActive
                  ? 'inset 0 1px 0 0 var(--border-color), inset 1px 0 0 0 var(--border-color), inset -1px 0 0 0 var(--border-color)'
                  : undefined,
                backgroundColor: isActive ? 'var(--surface-center)' : 'transparent',
                color: isActive ? 'var(--content-primary)' : 'var(--content-secondary)',
              }}
            >
              {t.dirty && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: 'var(--accent)' }}
                  title="有未保存的更改"
                />
              )}
              <span className="max-w-[8rem] truncate">{t.title}</span>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseRequest(paneId, t.path)
                }}
                title="关闭"
                className="shrink-0 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100"
                style={{ color: 'var(--content-muted)' }}
              >
                <IconClose size={14} />
              </button>
            </div>
          )
        })}
      </div>

      {menu &&
        createPortal(
          <div
            role="menu"
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              left: Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8),
              top: Math.min(menu.y, window.innerHeight - MENU_HEIGHT - 8),
              backgroundColor: 'var(--surface-primary)',
              borderColor: 'var(--border-color)',
              color: 'var(--content-primary)',
              // 浮起来的阴影用主题那一枚（暖的），不用 Tailwind 的 shadow-lg
              // ——后者是冷黑的。菜单这一档用 --shadow-pop：纸→浮只差 1.07，
              // 浮起来几乎全靠阴影，用弹窗那枚（--shadow-md）会显得透明。
              boxShadow: 'var(--shadow-pop)',
            }}
            className="fixed z-50 min-w-[9rem] overflow-hidden rounded-lg border py-1"
          >
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  it.run()
                  setMenu(null)
                }}
                /* 悬停要有一层墨：原来没有任何反馈，菜单项读起来像一行行文字。
                   enabled: 是必须的——禁用项也能被悬停，不给它底色才对。 */
                className="block w-full px-3 py-1.5 text-left text-sm transition-colors enabled:hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-50"
                style={{ color: it.disabled ? 'var(--content-muted)' : 'var(--content-primary)' }}
              >
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
