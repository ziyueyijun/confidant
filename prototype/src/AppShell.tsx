import { useRef, useState } from 'react'
import { 文件树, type FileTreeNode } from './data'
import { MarkdownEditor, type EditorApi } from './editor/MarkdownEditor'
import { TabBar, type TabItem } from './editor/TabBar'
import { SavePrompt } from './editor/SavePrompt'
import { useWorkspace } from './editor/useWorkspace'
import { Outline } from './Outline'
import type { SyntaxReveal } from './editor/markdownLivePreview'

interface Props {
  reveal: SyntaxReveal
  sourceMode: boolean
  renderTables: boolean
  currentPath: string
  onSelect: (path: string) => void
  /** 侧栏顶部「☰」点了做什么。不传则不显示菜单按钮。 */
  menu?: React.ReactNode
  /** 浮在界面之上的东西（同步中心弹窗等） */
  overlay?: React.ReactNode
  /** 底部状态栏。外壳提供**文档信息**（字数、行数），同步信息由调用方给。 */
  statusBar?: (stats: { chars: number; lines: number }) => React.ReactNode
}

/** 递归渲染任意层级文件树 */
function FileTreeNodeView({ node, depth, activePath, onEnter }: {
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
          active
            ? 'bg-blue-100 text-blue-900 font-medium'
            : 'text-slate-700 hover:bg-slate-200/60'
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
        className={`flex w-full items-center gap-1 truncate rounded px-2 py-0.5 text-left text-xs transition-colors ${
          open ? 'text-slate-600 hover:bg-slate-200/60' : 'text-slate-400 hover:bg-slate-200/60'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <span className="shrink-0 text-slate-400">{open ? '📂' : '📁'}</span>
        <span className="truncate font-medium">{node.name}</span>
        <span className="ml-auto shrink-0 text-slate-400">{open ? '▼' : '▶'}</span>
      </button>
      {open && node.children.map((child, i) => (
        <FileTreeNodeView
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

/**
 * 应用外壳：左文件树 / 中标签页 + 编辑器（可向右分屏）/ 右大纲。
 *
 * 默认不预选笔记——内容区留白，等用户从左侧文件树点进来。
 */
export function AppShell({
  reveal,
  sourceMode,
  renderTables,
  menu,
  overlay,
  statusBar,
}: Props) {
  const ws = useWorkspace()
  const editorRefs = useRef<Record<string, EditorApi | null>>({})
  // 待确认关闭的标签；非空时弹保存确认
  const [pendingClose, setPendingClose] = useState<{ paneId: string; path: string } | null>(null)

  const requestClose = (paneId: string, path: string) => {
    if (ws.isDirty(path)) setPendingClose({ paneId, path })
    else ws.close(paneId, path)
  }

  const activePath = ws.activeDoc?.path ?? ''

  // 状态栏要的字数——从当前标签的编辑内容算，与大纲同源
  const body = ws.activeDoc?.draft ?? ''
  const plain = body.replace(/[#*`>|\-\[\]()]/g, '')
  const stats = {
    chars: plain.replace(/\s/g, '').length,
    lines: body ? body.split('\n').length : 0,
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex min-h-0 flex-1">
        {/* 左：知识库文件树 */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-slate-50/70">
          <div className="flex items-center gap-1 px-2 py-2.5">
            {menu}
            <span className="text-xs font-medium tracking-wide text-slate-500">知己笔记</span>
          </div>
          <nav className="flex-1 overflow-auto px-1 pb-2">
            {文件树.map((node, i) => (
              <FileTreeNodeView
                key={i}
                node={node}
                depth={0}
                activePath={activePath}
                onEnter={(p) => ws.open(p)}
              />
            ))}
          </nav>
        </aside>

        {/* 中：分屏区，每块一条标签栏 + 一个编辑器 */}
        <div className="flex min-w-0 flex-1">
          {ws.panes.map((pane) => {
            const doc = pane.active ? ws.docs[pane.active] : null
            const tabs: TabItem[] = pane.tabs.map((p) => ({
              path: p,
              title: ws.docs[p]?.title ?? p,
              dirty: ws.isDirty(p),
            }))

            return (
              <div
                key={pane.id}
                className="flex min-w-0 flex-1 flex-col border-r border-slate-200 last:border-r-0"
              >
                <TabBar
                  paneId={pane.id}
                  tabs={tabs}
                  active={pane.active}
                  moveLabel={ws.moveLabel(pane.id)}
                  onActivate={ws.activate}
                  onCloseRequest={requestClose}
                  onCloseOthers={ws.closeOthers}
                  onMove={ws.moveAcross}
                  onRefresh={(_paneId, path) => ws.revert(path)}
                  onSave={ws.save}
                />

                {doc ? (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <div className="mx-auto max-w-[46rem] px-10 py-8">
                      <MarkdownEditor
                        // path + rev：换笔记或刷新都重挂，其余时候由编辑器自己持有状态
                        key={`${doc.path}:${doc.rev}`}
                        ref={(el) => {
                          editorRefs.current[pane.id] = el
                        }}
                        initialDoc={doc.draft}
                        reveal={reveal}
                        sourceMode={sourceMode}
                        renderTables={renderTables}
                        onChange={(text) => ws.updateDraft(doc.path, text)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center">
                    <p className="text-sm text-slate-300">从左侧选择一篇笔记</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 右：大纲（跟随当前分屏的当前标签） */}
        {ws.activeDoc && (
          <Outline
            key={ws.activeDoc.path}
            body={ws.activeDoc.draft}
            onJump={(line) => editorRefs.current[ws.activePane]?.scrollToLine(line)}
          />
        )}

        {pendingClose && (
          <SavePrompt
            title={ws.docs[pendingClose.path]?.title ?? pendingClose.path}
            onSave={() => {
              ws.save(pendingClose.path)
              ws.close(pendingClose.paneId, pendingClose.path)
              setPendingClose(null)
            }}
            onDiscard={() => {
              ws.revert(pendingClose.path)
              ws.close(pendingClose.paneId, pendingClose.path)
              setPendingClose(null)
            }}
            onCancel={() => setPendingClose(null)}
          />
        )}
      </div>

      {overlay}
      {statusBar?.(stats)}
    </div>
  )
}
