import { useEffect, useState } from 'react'
import { AppShell } from '../AppShell'
import { AppMenu } from './AppMenu'
import { StatusBar } from './StatusBar'
import { SyncCenterDialog } from './SyncCenterDialog'
import { SettingsDialog, FirstSyncDialog, DeleteDialog } from './SettingsDialog'
import { WorkspaceDialog } from './WorkspaceDialog'
import { ConflictCompare } from './SyncCenterDialog'
import { 取场景, type ScenarioKey, type Conflict } from './data'
import type { SyntaxReveal } from '../editor/markdownLivePreview'

/**
 * 同步界面 —— **它是应用的一部分，不是一层可切换的皮**。
 *
 * 状态栏常驻底部、同步中心是弹窗、设置从菜单进。三者各答一个问题：
 * - **状态栏**：同步是**环境**。默认闭嘴，只在「正在进行 / 需要处理 /
 *   本次会话同步过」时说话。
 * - **同步中心**（弹窗）：专门处理一件事的界面，处理完就关掉。
 * - **设置**（菜单进入）：编辑器 / 外观 / 快捷键 / 同步 / 更新。
 * - **工作空间**（菜单进入）：打开、切换、在文件管理器里看。
 */
export function SyncFeature({
  scenario,
  reveal,
  sourceMode,
  renderTables,
  currentPath,
  onSelect,
}: {
  scenario: ScenarioKey
  reveal: SyntaxReveal
  sourceMode: boolean
  renderTables: boolean
  currentPath: string
  onSelect: (path: string) => void
}) {
  const mock = 取场景(scenario)
  const [syncOpen, setSyncOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [overlay, setOverlay] = useState<null | 'first' | 'delete' | { conflict: Conflict }>(null)
  const [armed, setArmed] = useState<null | '上传' | '下载'>(null)

  // 切场景时重置——否则上一个场景的弹窗会挂在新场景上
  useEffect(() => {
    setSettingsOpen(false)
    setWorkspaceOpen(false)
    setOverlay(null)
    setArmed(null)
    // 有处境要说的场景直接把同步中心推到眼前
    setSyncOpen(
      scenario === 'failed' ||
        scenario === 'first' ||
        scenario === 'conflicts' ||
        scenario === 'manyConflicts' ||
        scenario === 'danger',
    )
  }, [scenario])

  const openSync = () => setSyncOpen(true)

  return (
    <AppShell
      reveal={reveal}
      sourceMode={sourceMode}
      renderTables={renderTables}
      currentPath={currentPath}
      onSelect={onSelect}
      menu={
        <AppMenu
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenWorkspace={() => setWorkspaceOpen(true)}
          onOpenSyncCenter={openSync}
        />
      }
      overlay={
        <>
          {syncOpen && (
            <SyncCenterDialog
              mock={mock}
              onClose={() => setSyncOpen(false)}
              onOverlay={setOverlay}
            />
          )}

          {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
          {workspaceOpen && <WorkspaceDialog onClose={() => setWorkspaceOpen(false)} />}

          {overlay === 'first' && <FirstSyncDialog mock={mock} onClose={() => setOverlay(null)} />}
          {overlay === 'delete' && (
            <DeleteDialog count={mock.pendingDeletes} onClose={() => setOverlay(null)} />
          )}
          {overlay && typeof overlay === 'object' && (
            <ConflictCompare conflict={overlay.conflict} onClose={() => setOverlay(null)} />
          )}
        </>
      }
      statusBar={(stats) => (
        <StatusBar mock={mock} stats={stats} onOpenSync={openSync} />
      )}
    />
  )
}
