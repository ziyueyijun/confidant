import { useCallback, useEffect, useRef, useState } from 'react'
import { 文件树, type FileTreeNode } from './data'
import { MarkdownEditor, type EditorApi } from './editor/MarkdownEditor'
import { EditorToolbar } from './editor/EditorToolbar'
import { TabBar, type TabItem } from './editor/TabBar'
import { SavePrompt } from './editor/SavePrompt'
import { useWorkspace } from './editor/useWorkspace'
import { Outline } from './Outline'
import { BottomBar } from './BottomBar'
import { SearchDialog } from './search/SearchDialog'
import { FindBar } from './editor/FindBar'
import {
  SidebarBar,
  SidebarIconButton,
  SidebarToggleButton,
} from './SidebarToolbar'
import { IconChevronRight, IconCollapseAll, IconExpandAll, IconFile, IconFolder, IconSearch } from './icons'
import { Seal } from './Seal'
import { ResizeHandle, usePanelWidth, type WidthRange } from './ResizeHandle'
import type { SyntaxReveal } from './editor/markdownLivePreview'
import type { SyncMock } from './sync/data'
import type { Theme } from './App'

/** 侧栏收起后的宽度。两条侧栏一样——收起来时左右对称。 */
const 收起宽度 = 36

/**
 * 两条侧栏的宽度范围。
 *
 * **下限**：两条侧栏顶部那条工具条现在都是 4 个按钮，4 × 24px（WCAG 2.5.8
 * 的可点下限）+ 3 个 2px 间隙 + 左右各 6px 内边距 = 114px，再算上底部栏
 * 左段（也是 4 个按钮，内边距更宽一点，119px）——**119px 是硬底**。
 * 取 172 是给文件名留出能读的宽度：再窄下去，树里就只剩省略号了。
 *
 * 上限：文件树 480、大纲 420——大纲的条目本来就短，不需要那么宽，
 * 放太宽只会把编辑区挤没。
 */
const 文件树宽度: WidthRange = { def: 220, min: 172, max: 480 }
const 大纲宽度: WidthRange = { def: 200, min: 140, max: 420 }

interface Props {
  reveal: SyntaxReveal
  sourceMode: boolean
  renderTables: boolean
  onSourceMode: (v: boolean) => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
  /** 同步状态。它由同步那一层给——底部栏只负责把它摆到正中间 */
  mock: SyncMock
  /** 底部栏那几个按钮要打开的弹窗。弹窗住在外面，这里只收回调 */
  onOpenSettings: () => void
  onOpenSync: () => void
  /** 浮在界面之上的东西（同步中心弹窗等） */
  overlay?: React.ReactNode
}

/**
 * 收集树里所有文件夹的路径。「全部折叠」要用——先把全集算出来，
 * 再整体塞进 collapsed 集合，比逐个递归调用 setState 干净。
 */
function collectFolderPaths(nodes: FileTreeNode[], prefix = ''): string[] {
  const out: string[] = []
  for (const n of nodes) {
    if (n.kind === 'folder') {
      const path = prefix ? `${prefix}/${n.name}` : n.name
      out.push(path)
      out.push(...collectFolderPaths(n.children, path))
    }
  }
  return out
}

/** 递归渲染任意层级文件树 */
function FileTreeNodeView({ node, depth, activePath, onEnter, folderPath, collapsedFolders, onToggleFolder }: {
  node: FileTreeNode
  depth: number
  activePath: string
  onEnter: (path: string) => void
  /** 这个节点在树里的路径。文件的展开状态由父文件夹管，这里用不到 */
  folderPath: string
  /** 被收起的文件夹路径集合。**由外面统一管**，「全部展开/折叠」才能一次改完 */
  collapsedFolders: Set<string>
  onToggleFolder: (path: string) => void
}) {
  if (node.kind === 'file') {
    const active = node.path === activePath
    return (
      <button
        onClick={() => onEnter(node.path)}
        className={`group flex w-full items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-sm transition-all ${
          active
            ? 'bg-[var(--accent-subtle)] font-medium'
            : 'hover:bg-[var(--surface-hover)]'
        }`}
        style={{
          paddingLeft: `${depth * 16 + 8}px`,
          color: active ? 'var(--accent)' : 'var(--content-primary)',
        }}
      >
        {/* 文件图标：折角纸页。折角是它与文件夹唯一的区分点，
            所以折角占满右上角四分之一。 */}
        <IconFile className="shrink-0" style={{ opacity: 0.75 }} />
        <span className="truncate">{node.title}</span>
      </button>
    )
  }

  const open = !collapsedFolders.has(folderPath)

  return (
    <div>
      <button
        onClick={() => onToggleFolder(folderPath)}
        className="group flex w-full items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-sm transition-all hover:bg-[var(--surface-hover)]"
        style={{
          paddingLeft: `${depth * 16 + 8}px`,
          color: open ? 'var(--content-primary)' : 'var(--content-secondary)',
        }}
      >
        {/* 展开箭头 */}
        <IconChevronRight
          className="shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', opacity: 0.7 }}
        />
        {/* 文件夹图标：带标签页的实心轮廓。与纸页的区别是「顶部的凸起标签」，
            而不是折角——两个图标的外轮廓因此完全不同。 */}
        <IconFolder className="shrink-0" style={{ opacity: 0.75 }} />
        <span className="truncate font-medium">{node.name}</span>
      </button>
      {open && node.children.map((child, i) => (
        <FileTreeNodeView
          key={i}
          node={child}
          depth={depth + 1}
          activePath={activePath}
          onEnter={onEnter}
          folderPath={child.kind === 'folder' ? `${folderPath}/${child.name}` : ''}
          collapsedFolders={collapsedFolders}
          onToggleFolder={onToggleFolder}
        />
      ))}
    </div>
  )
}

/**
 * 应用外壳：左文件树 / 中标签页 + 编辑器 / 右大纲 / 底部栏。
 *
 * **底部栏归外壳管**，虽然里面的按钮打开的是外面的弹窗（同步中心、设置）——
 * 因为左段要跟文件树同宽，而文件树的宽度就住在这里。
 *
 * **文件树那条工具条里的搜索也归外壳管**：它打开的是全局搜索面板，而面板
 * 要打开别的笔记（`ws.open`）、要把光标送到某个编辑器的某一行——那是整个
 * 外壳的事。右边大纲那条的搜索只筛自己列出来的标题，留在 `Outline` 里。
 */
export function AppShell({
  reveal,
  sourceMode,
  renderTables,
  theme,
  onThemeChange,
  mock,
  onOpenSettings,
  onOpenSync,
  overlay,
  onSourceMode,
}: Props) {
  const ws = useWorkspace()
  const editorRefs = useRef<Record<string, EditorApi | null>>({})
  const [headingLevels, setHeadingLevels] = useState<Record<string, number>>({})
  const [pendingClose, setPendingClose] = useState<{ paneId: string; path: string } | null>(null)
  // 两侧栏的展开/收起。收起后不消失，而是留一条窄栏——按钮还在原位，
  // 否则用户收起之后就再也找不回来了。
  const [treeOpen, setTreeOpen] = useState(true)
  const [outlineOpen, setOutlineOpen] = useState(true)
  // 两侧栏的宽度。拖过就记住（localStorage），下次打开还是那个宽度。
  const [treeWidth, setTreeWidth] = usePanelWidth('confidant:tree-width', 文件树宽度)
  const [outlineWidth, setOutlineWidth] = usePanelWidth('confidant:outline-width', 大纲宽度)
  /**
   * 专注模式：**两侧栏连顶栏一起消失**，只剩标签页与正文。
   *
   * 不是「收成窄栏」——那是另一回事（收起后按钮还在原位，随时能拉回来）。
   * 专注模式要的是「界面上没有别的东西」，留一条窄栏就已经不是了。
   * 出口在底部栏那个按钮上，它始终在。
   *
   * **不持久化**——它是"我现在要专心写一段"这个动作，不是一个偏好。
   * 存下来的话，某天打开应用会莫名其妙少了半个界面，而用户已经忘了
   * 自己什么时候开的。
   */
  const [focusMode, setFocusMode] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  /**
   * 哪一个分屏开着「在本文中查找」。存 paneId 而不是布尔值：
   * 分屏之后两个 pane 各有一个工具栏，按钮点的是**自己那个 pane**。
   */
  const [findPane, setFindPane] = useState<string | null>(null)
  /** 搜索选中一条结果后要滚到的那一行。等编辑器挂上再滚（见下面的 effect） */
  const [pendingJump, setPendingJump] = useState<number | null>(null)

  /**
   * 滚到搜索命中的那一行。
   *
   * **不能选中就立刻滚**：那条笔记可能还没打开过，编辑器是这一轮渲染才挂上
   * 去的。所以要等——先让 React 把编辑器挂好（ref 回调 + 它自己的 effect
   * 建出 CodeMirror 视图），再滚。用 rAF 重试几次比赌一个 setTimeout 稳。
   */
  useEffect(() => {
    if (pendingJump === null) return
    let raf = 0
    let tries = 0
    const tick = () => {
      const api = editorRefs.current[ws.activePane]
      if (api) {
        api.scrollToLine(pendingJump)
        setPendingJump(null)
      } else if (++tries < 10) {
        raf = requestAnimationFrame(tick)
      } else {
        setPendingJump(null)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [pendingJump, ws.activePane])

  /** 全局搜索：Ctrl+K。**不看焦点在哪**——在编辑器里打字时也要能唤出来 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // 被收起的**文件夹**路径（不是侧栏本身）。放在这里而不是每个节点自己管，
  // 「全部展开/折叠」才能一次改完——散在几十个组件里的 useState 没法批量操作。
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const expandAllFolders = useCallback(() => setCollapsedFolders(new Set()), [])
  const collapseAllFolders = useCallback(
    () => setCollapsedFolders(new Set(collectFolderPaths(文件树))),
    [],
  )
  const toggleFolder = useCallback((path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const requestClose = (paneId: string, path: string) => {
    if (ws.isDirty(path)) setPendingClose({ paneId, path })
    else ws.close(paneId, path)
  }

  /**
   * 关掉某个分屏的「在本文中查找」。
   *
   * **查找词要一起清掉**：只把那条栏收起来的话，正文里的高亮还在，
   * 而用户已经没有任何东西可以关掉它了——那是一片来路不明的黄。
   */
  const 关掉查找 = (paneId: string) => {
    editorRefs.current[paneId]?.setFindQuery('')
    setFindPane((p) => (p === paneId ? null : p))
  }

  const activePath = ws.activeDoc?.path ?? ''

  const body = ws.activeDoc?.draft ?? ''
  const plain = body.replace(/[#*`>|\-\[\]()]/g, '')
  const stats = {
    chars: plain.replace(/\s/g, '').length,
    lines: body ? body.split('\n').length : 0,
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--surface-center)' }}>
      {/* 内容区。pb-7（28px）给底部那条**固定定位**的状态栏让出空间——
          不让的话编辑区最后 28px 被状态栏压住，滚到底部时那几行点不到。
          只让 28px：原型控制条（`fixed bottom-11`）已用 pointer-events 处理掉
          穿透问题（见 index.css 的 .proto-control-bar），再为它加 padding
          会在底下留一大块空白。 */}
      <div className="flex min-h-0 flex-1 pb-7">
        {/* 左：文件树。收起后**整条侧栏**（含顶栏）缩成窄栏——顶栏改显示一个
            「知」字，字体字号与展开时的「知己笔记」完全一致，读起来是同一个
            标识的缩写，而不是另一个东西。
            专注模式下**整条不渲染**（连顶栏一起）——见 Props 里的说明。 */}
        {!focusMode && (
          <aside
            className="relative flex shrink-0 flex-col border-r"
            style={{
              width: treeOpen ? treeWidth : 收起宽度,
              backgroundColor: 'var(--surface-secondary)',
              borderColor: 'var(--border-color)',
            }}
          >
            {/* h-10 与中间标签栏、右侧大纲头部同高——三条横栏的下边缘对齐。
                文字居中：这一行只有标识，居中才跟右侧的「大纲」对称——
                操作都搬到下面那条工具条去了。
                **不画下边框**：它和下面的工具条、文件树是同一个面色，是
                一条连续的"框"。 */}
            <div className="flex h-10 shrink-0 items-center justify-center px-2">
              {treeOpen ? (
                <span className="truncate text-sm font-semibold" style={{ color: 'var(--content-primary)' }}>
                  知己笔记
                </span>
              ) : (
                /* 收起后不是"标题被截断了"，而是**同一枚印**——一个字本来就
                   是一个印。它跟展开时那四个字是同一个标识的两种写法。 */
                <Seal size={24} />
              )}
            </div>

            {/* 工具条：顶栏下面、和编辑器工具栏同一行。
                折叠按钮始终在；「全部展开 / 全部折叠 / 搜索」只在展开时才有意义
                ——收起后整条窄栏只有 36px，放不下四个按钮。 */}
            <SidebarBar side="left">
              <SidebarToggleButton side="left" open={treeOpen} name="文件树" onToggle={() => setTreeOpen((o) => !o)} />
              {treeOpen && (
                <>
                  <SidebarIconButton label="全部展开" onClick={expandAllFolders}>
                    <IconExpandAll />
                  </SidebarIconButton>
                  <SidebarIconButton label="全部折叠" onClick={collapseAllFolders}>
                    <IconCollapseAll />
                  </SidebarIconButton>
                  {/* 搜索**整个工作空间**的笔记（Ctrl+K 那个面板）——
                      与右侧大纲那条搜标题的按钮分工不同，见 `Outline` */}
                  <SidebarIconButton label="搜索全部笔记" onClick={() => setSearchOpen(true)}>
                    <IconSearch />
                  </SidebarIconButton>
                </>
              )}
            </SidebarBar>

            {treeOpen ? (
              <nav className="flex-1 overflow-auto px-1.5 py-2">
                {文件树.map((node, i) => (
                  <FileTreeNodeView
                    key={i}
                    node={node}
                    depth={0}
                    activePath={activePath}
                    onEnter={(p) => ws.open(p)}
                    folderPath={node.kind === 'folder' ? node.name : ''}
                    collapsedFolders={collapsedFolders}
                    onToggleFolder={toggleFolder}
                  />
                ))}
              </nav>
            ) : (
              <div className="flex-1" />
            )}

            {/* 收起时不给手柄：那会儿宽度是固定的 36px，拖也拖不动 */}
            {treeOpen && (
              <ResizeHandle
                side="left"
                width={treeWidth}
                range={文件树宽度}
                label="调整文件树宽度"
                onChange={setTreeWidth}
              />
            )}
          </aside>
        )}

        {/* 中：分屏区 */}
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
                className="flex min-w-0 flex-1 flex-col"
                style={{ borderColor: 'var(--border-color)' }}
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

                {doc && (
                  <EditorToolbar
                    getApi={() => editorRefs.current[pane.id] ?? null}
                    sourceMode={sourceMode}
                    onSourceMode={onSourceMode}
                    headingLevel={headingLevels[pane.id] ?? 0}
                    findOpen={findPane === pane.id}
                    onFind={() =>
                      findPane === pane.id ? 关掉查找(pane.id) : setFindPane(pane.id)
                    }
                  />
                )}

                {/* 查找条。**按文档重挂**（key）：换一篇笔记，上一个词就不该
                    还留在框里——它是"在这篇里找"，不是全局的。 */}
                {doc && findPane === pane.id && (
                  <FindBar
                    key={doc.path}
                    getApi={() => editorRefs.current[pane.id] ?? null}
                    onClose={() => 关掉查找(pane.id)}
                  />
                )}

                {doc ? (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <div className="h-full px-12 py-8">
                      <MarkdownEditor
                        key={`${doc.path}:${doc.rev}`}
                        ref={(el) => {
                          editorRefs.current[pane.id] = el
                        }}
                        initialDoc={doc.draft}
                        reveal={reveal}
                        sourceMode={sourceMode}
                        renderTables={renderTables}
                        onChange={(text) => ws.updateDraft(doc.path, text)}
                        onHeadingLevel={(level) =>
                          setHeadingLevels((m) => (m[pane.id] === level ? m : { ...m, [pane.id]: level }))
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="text-center">
                      {/* 不放图形：这句话本身已经把事说清楚了，上面再加一枚印
                          或一个图标都只是装饰。朱砂只留给**标识**那一个点
                          （收起后的文件树），这里多一枚就把它冲淡了。 */}
                      <p className="text-sm" style={{ color: 'var(--content-muted)' }}>从左侧选择一篇笔记</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 右：大纲。专注模式下与左栏一样整条不渲染 */}
        {!focusMode && ws.activeDoc && (
          <Outline
            key={ws.activeDoc.path}
            body={ws.activeDoc.draft}
            open={outlineOpen}
            onToggle={() => setOutlineOpen((o) => !o)}
            onJump={(line) => editorRefs.current[ws.activePane]?.scrollToLine(line)}
            width={outlineOpen ? outlineWidth : 收起宽度}
            resizeHandle={
              outlineOpen ? (
                <ResizeHandle
                  side="right"
                  width={outlineWidth}
                  range={大纲宽度}
                  label="调整大纲宽度"
                  onChange={setOutlineWidth}
                />
              ) : null
            }
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

      {searchOpen && (
        <SearchDialog
          onClose={() => setSearchOpen(false)}
          onOpen={(path, line) => {
            ws.open(path)
            setPendingJump(line)
          }}
        />
      )}

      <BottomBar
        mock={mock}
        stats={stats}
        theme={theme}
        onThemeChange={onThemeChange}
        focusMode={focusMode}
        onToggleFocus={() => setFocusMode((v) => !v)}
        onOpenSettings={onOpenSettings}
        onOpenSync={onOpenSync}
        /* 左段与文件树同宽——文件树收起、或专注模式下没有这一列可对齐，
           这时不传宽度，按钮缩成一组 */
        alignWidth={!focusMode && treeOpen ? treeWidth : undefined}
      />
    </div>
  )
}
