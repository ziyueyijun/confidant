/**
 * 标签栏。每块分屏各有一条。
 *
 * 右键菜单：关闭当前标签 / 关闭其他标签 / 向右分屏 / 刷新 / 保存。
 * 关闭按钮和菜单里的「关闭」都只发请求（onCloseRequest），由上层决定
 * 要不要先弹保存确认——脏状态只有上层知道。
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export interface TabItem {
  path: string
  title: string
  dirty: boolean
}

interface Props {
  paneId: string
  tabs: TabItem[]
  active: string | null
  /**
   * 挪动项的文案与可用性，由上层按当前栏的位置给出：「向右分屏」/
   * 「移到左栏」/「移到右栏」。disabled 时文案不变，只是置灰。
   */
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

  // 点别处、按 Esc、滚动或改窗口大小都收起菜单
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
        { label: '关闭当前标签', run: () => onCloseRequest(paneId, menu.path) },
        { label: '关闭其他标签', run: () => onCloseOthers(paneId, menu.path), disabled: tabs.length < 2 },
        {
          label: moveLabel.label,
          run: () => onMove(paneId, menu.path),
          disabled: !moveLabel.enabled,
        },
        { label: '刷新', run: () => onRefresh(paneId, menu.path) },
        { label: '保存', run: () => onSave(menu.path) },
      ]
    : []

  return (
    <>
      <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-slate-200 bg-slate-50/70">
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
              className={`group flex shrink-0 cursor-default items-center gap-1 border-r border-slate-200 px-3 text-xs transition-colors ${
                isActive
                  ? 'bg-white text-slate-800'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {t.dirty && (
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                  title="有未保存的更改"
                />
              )}
              <span className="max-w-[10rem] truncate">{t.title}</span>
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseRequest(paneId, t.path)
                }}
                title="关闭"
                className={`ml-0.5 shrink-0 rounded px-1 leading-none transition-opacity ${
                  isActive ? 'opacity-60 hover:bg-slate-200 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'
                }`}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>

      {menu &&
        createPortal(
          <div
            role="menu"
            // 拦下 mousedown，否则 window 上的 dismiss 会在 click 之前把菜单拆掉
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
            style={{
              left: Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8),
              top: Math.min(menu.y, window.innerHeight - MENU_HEIGHT - 8),
            }}
            className="fixed z-50 min-w-[9rem] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
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
                className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-default disabled:text-slate-300 disabled:hover:bg-transparent"
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
