import { useEffect, useRef, useState } from 'react'

/**
 * 应用菜单——**应用级入口都住在这里**。
 *
 * 顺序：设置 / 工作空间 / 同步中心 / 关于知己笔记。
 *
 * **「工作空间」是一项，不是一个设置分组。** 它管的是「打开哪个文件夹」
 * 这种应用级动作，不是一项偏好——所以它在这里，不在设置弹窗里。
 * 它的面板里提供「打开工作空间」等动作；原先散在菜单里的
 * 「在文件管理器中打开笔记库」也收进那里，菜单不再重复。
 *
 * 状态栏右下角是**文档级信息**（字数统计），不是应用级入口；
 * 两者混在一处会让人分不清「这一栏是关于什么的」。
 */
export function AppMenu({
  onOpenSettings,
  onOpenWorkspace,
  onOpenSyncCenter,
}: {
  onOpenSettings: () => void
  onOpenWorkspace: () => void
  onOpenSyncCenter: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // 点外面关掉
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const go = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded px-1.5 py-0.5 text-slate-500 hover:bg-slate-200 ${
          open ? 'bg-slate-200' : ''
        }`}
        title="菜单"
      >
        ☰
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-xl">
          <MenuItem onClick={go(onOpenSettings)}>设置…</MenuItem>
          <MenuItem onClick={go(onOpenWorkspace)}>工作空间…</MenuItem>
          <MenuItem onClick={go(onOpenSyncCenter)}>同步中心…</MenuItem>
          <div className="my-1 h-px bg-slate-100" />
          <MenuItem onClick={() => setOpen(false)}>关于知己笔记</MenuItem>
        </div>
      )}
    </div>
  )
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100"
    >
      {children}
    </button>
  )
}
