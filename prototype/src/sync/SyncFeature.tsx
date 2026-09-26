import { useEffect, useState } from 'react'
import { AppShell } from '../AppShell'
import { SyncCenterDialog } from './SyncCenterDialog'
import { SettingsDialog, FirstSyncDialog, DeleteDialog } from './SettingsDialog'
import { ConflictCompare } from './SyncCenterDialog'
import { 取场景, type ScenarioKey, type Conflict } from './data'
import type { SyntaxReveal } from '../editor/markdownLivePreview'
import type { Theme } from '../App'

/**
 * 同步界面 —— **它是应用的一部分，不是一层可切换的皮**。
 *
 * 这一层管的是**弹窗**：同步中心、设置，以及首次同步 / 批量删除 /
 * 冲突对比这几个盖在最上面的。底部栏上那几个按钮**不在这里**——它们归外壳
 * （`AppShell`）管，因为左段要跟文件树同宽。这里只把"点开哪个弹窗"的回调
 * 递进去。
 *
 * 四个部件各答一个问题：
 * - **底部栏**：同步是**环境**。默认闭嘴，只在「正在进行 / 需要处理 /
 *   本次会话同步过」时说话。
 * - **同步中心**（弹窗）：专门处理一件事的界面，处理完就关掉。
 * - **设置**（弹窗）：编辑器 / 外观 / 快捷键 / 同步 / 工作空间 / 更新 / 关于。
 */
export function SyncFeature({
  theme,
  onThemeChange,
  scenario,
  reveal,
  sourceMode,
  renderTables,
  onReveal,
  onSourceMode,
}: {
  theme: Theme
  onThemeChange: (theme: Theme) => void
  scenario: ScenarioKey
  reveal: SyntaxReveal
  sourceMode: boolean
  renderTables: boolean
  onReveal: (v: SyntaxReveal) => void
  onSourceMode: (v: boolean) => void
}) {
  const mock = 取场景(scenario)
  const [syncOpen, setSyncOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [overlay, setOverlay] = useState<null | 'first' | 'delete' | { conflict: Conflict }>(null)

  // 切场景时重置——否则上一个场景的弹窗会挂在新场景上
  useEffect(() => {
    setSettingsOpen(false)
    setOverlay(null)
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
      onSourceMode={onSourceMode}
      theme={theme}
      onThemeChange={onThemeChange}
      mock={mock}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenSync={openSync}
      overlay={
        <>
          {syncOpen && (
            <SyncCenterDialog
              mock={mock}
              onClose={() => setSyncOpen(false)}
              onOverlay={setOverlay}
            />
          )}

          {/* 语法标记那三个档住在这里（不在工具栏上）——设置是它唯一的家 */}
          {settingsOpen && (
            <SettingsDialog
              onClose={() => setSettingsOpen(false)}
              reveal={reveal}
              onReveal={onReveal}
            />
          )}

          {overlay === 'first' && <FirstSyncDialog mock={mock} onClose={() => setOverlay(null)} />}
          {overlay === 'delete' && (
            <DeleteDialog count={mock.pendingDeletes} onClose={() => setOverlay(null)} />
          )}
          {overlay && typeof overlay === 'object' && (
            <ConflictCompare conflict={overlay.conflict} onClose={() => setOverlay(null)} />
          )}
        </>
      }
    />
  )
}
