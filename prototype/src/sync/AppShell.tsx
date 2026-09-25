import { useState } from 'react'
import { 文件树, type FileTreeNode, NOTES } from '../data'

/**
 * 同步原型的**背景板**：一个简化但形状正确的应用外壳（左文件树 / 右内容区）。
 *
 * 内容区可以换成同步界面（`content`）——因为同步中心本来就该占住那块地方；
 * 也可以保留笔记正文，让同步界面以浮层形式叠在上面（变体 A）。
 *
 * 为什么不复用 VariantA：那是布局原型，带一整套标签页与工作区状态机。
 * 同步界面要在「真实的密度」里被评判，但不需要那套状态。
 *
 * 这里是**静态**的——点文件树只切换右侧显示的内容，没有落盘、没有脏点。
 */
export function AppShell({
  content,
  overlay,
  sidebarFooter,
}: {
  /** 内容区。不传则显示笔记正文。 */
  content?: React.ReactNode
  /** 浮在界面之上的东西（状态栏、弹层）。 */
  overlay?: React.ReactNode
  /** 侧栏底部——应用外壳里常驻的指示物（如同步徽标）挂这儿，不属于任何页面。 */
  sidebarFooter?: React.ReactNode
}) {
  const [active, setActive] = useState(NOTES[0].path)
  const note = NOTES.find((n) => n.path === active) ?? NOTES[0]

  return (
    <div className="flex h-full bg-white">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50/70">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs font-medium tracking-wide text-slate-500">知己笔记</span>
          <button
            className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-200"
            title="捕捉（Ctrl+Shift+Space）"
          >
            ＋
          </button>
        </div>
        <nav className="flex-1 overflow-auto px-1 pb-2">
          {文件树.map((node, i) => (
            <TreeNodeView key={i} node={node} depth={0} activePath={active} onEnter={setActive} />
          ))}
        </nav>
        {sidebarFooter}
      </aside>

      {content ?? (
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b border-slate-200 px-4">
            <span className="text-sm text-slate-700">{note.title}</span>
            <span className="text-xs text-slate-400">{note.path}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto max-w-[46rem] px-10 py-8">
              <div className="whitespace-pre-wrap text-[15px] leading-[1.85] text-slate-800">
                {note.body}
              </div>
            </div>
          </div>
        </div>
      )}

      {overlay}
    </div>
  )
}

function TreeNodeView({
  node,
  depth,
  activePath,
  onEnter,
}: {
  node: FileTreeNode
  depth: number
  activePath: string
  onEnter: (path: string) => void
}) {
  const [open, setOpen] = useState(true)

  if (node.kind === 'file') {
    const active = node.path === activePath
    return (
      <button
        onClick={() => onEnter(node.path)}
        className={`block w-full truncate rounded px-2 py-0.5 text-left text-sm transition-colors ${
          active ? 'bg-blue-100 font-medium text-blue-900' : 'text-slate-700 hover:bg-slate-200/60'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="mr-1 text-slate-400">📄</span>
        {node.title}
      </button>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 truncate rounded px-2 py-0.5 text-left text-xs text-slate-600 transition-colors hover:bg-slate-200/60"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="shrink-0 text-slate-400">{open ? '📂' : '📁'}</span>
        <span className="truncate font-medium">{node.name}</span>
        <span className="ml-auto shrink-0 text-slate-400">{open ? '▼' : '▶'}</span>
      </button>
      {open &&
        node.children.map((child, i) => (
          <TreeNodeView
            key={i}
            node={child}
            depth={depth + 1}
            activePath={activePath}
            onEnter={onEnter}
          />
        ))}
    </div>
  )
}
