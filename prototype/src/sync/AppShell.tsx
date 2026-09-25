import { useState } from 'react'
import { 文件树, type FileTreeNode, NOTES } from '../data'
import { AppMenu } from './AppMenu'

/**
 * 同步原型的**背景板**：一个简化但形状正确的应用外壳（左文件树 / 右内容区）。
 *
 * 内容区可以换成别的视图（`content`）——比如设置页；
 * 浮在界面之上的东西走 `overlay`（同步中心弹窗、状态栏）。
 *
 * 为什么同步界面要在**真实的密度**里被评判：一个空壳里的界面怎么看都成立。
 * 这里带真实文件树、真实正文、真实菜单。
 *
 * 这里是**静态**的——点文件树只切换右侧显示的内容，没有落盘、没有脏点。
 */
export interface DocStats {
  /** 非空白字符数（中文按字算） */
  chars: number
  lines: number
}

export function AppShell({
  content,
  overlay,
  onOpenSettings,
  statusBar,
}: {
  /** 内容区。不传则显示笔记正文。 */
  content?: React.ReactNode
  /** 浮在界面之上的东西（同步中心弹窗）。 */
  overlay?: React.ReactNode
  /** 菜单里的「设置…」点了做什么。 */
  onOpenSettings?: () => void
  /** 状态栏。外壳负责提供**文档信息**（字数），同步信息由调用方给。 */
  statusBar?: (stats: DocStats) => React.ReactNode
}) {
  const [active, setActive] = useState(NOTES[0].path)
  const note = NOTES.find((n) => n.path === active) ?? NOTES[0]

  // 字数：去掉 markdown 标记与空白后的字符数。原型够用，不做精确排版统计。
  const plain = note.body.replace(/[#*`>|\-\[\]()]/g, '')
  const stats: DocStats = {
    chars: plain.replace(/\s/g, '').length,
    lines: note.body.split('\n').length,
  }

  return (
    <div className="flex h-full bg-white">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50/70">
        <div className="flex items-center gap-1 px-2 py-2.5">
          <AppMenu onOpenSettings={onOpenSettings ?? (() => {})} />
          <span className="text-xs font-medium tracking-wide text-slate-500">知己笔记</span>
          <button
            className="ml-auto rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-200"
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
      {statusBar?.(stats)}
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
