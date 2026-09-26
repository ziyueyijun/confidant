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
        style={{ backgroundColor: 'var(--surface-secondary)', borderBottom: '1px solid var(--border-color)' }}
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
              className="group flex shrink-0 cursor-default items-center gap-2 border-r px-3 text-sm transition-colors"
              style={{
                borderColor: 'var(--border-color)',
                // 选中的标签用**正文那一块的面色**（surface-center）：它跟下面
                // 的工具栏、编辑区连成一片，读起来是"这一页正摊开在桌上"，
                // 而不是"另一个被选中的按钮"。未选中的透出标签栏底色。
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
            }}
            className="fixed z-50 min-w-[9rem] overflow-hidden rounded-lg border py-1 shadow-lg"
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
                className="block w-full px-3 py-1.5 text-left text-sm transition-colors disabled:cursor-default disabled:opacity-50"
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
