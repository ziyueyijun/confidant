import { useEffect, useState } from 'react'
import { VariantA } from '../variants/VariantA'
import { AppMenu } from './AppMenu'
import { StatusBar } from './StatusBar'
import { SyncCenterDialog, type DialogLayout } from './SyncCenterDialog'
import { SettingsDialog, FirstSyncDialog, DeleteDialog } from './SettingsDialog'
import { ConflictCompare } from './SyncCenterDialog'
import { 取场景, type ScenarioKey, type Conflict } from './data'

/**
 * 拼装版 —— **状态栏 + 同步中心弹窗 + 菜单里的设置**。
 *
 * ## 外壳复用布局原型
 *
 * 它直接跑在 `VariantA` 上（文件树 / 标签页 / 编辑器 / 大纲），
 * 不另做一套简化外壳——同步界面必须在**真实密度**里被评判，
 * 而一个只有文件树和静态正文的空壳会让每个方案都显得成立。
 *
 * 三个部件各答一个问题，不重叠：
 * - **状态栏**（常驻底部）：同步是**环境**。左同步、右字数，且默认闭嘴。
 * - **同步中心**（**弹窗**）：专门处理一件事的界面，处理完就关掉。
 * - **设置**（**从菜单进入**）：**不只服务 WebDAV**。
 */
export function VariantD({
  scenario,
  layout,
  reveal,
  sourceMode,
  renderTables,
  onCapture,
  currentPath,
  onSelect,
}: {
  scenario: ScenarioKey
  /** 弹窗内部布局：选项卡 vs 单页（冲突只在有冲突时出现）。原型里可对比。 */
  layout: DialogLayout
  reveal: Parameters<typeof VariantA>[0]['reveal']
  sourceMode: boolean
  renderTables: boolean
  onCapture: () => void
  currentPath: string
  onSelect: (path: string) => void
}) {
  const mock = 取场景(scenario)
  const [syncOpen, setSyncOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tab, setTab] = useState<'overview' | 'conflicts'>('overview')
  const [overlay, setOverlay] = useState<null | 'first' | 'delete' | { conflict: Conflict }>(null)
  const [armed, setArmed] = useState<null | '上传' | '下载'>(null)

  // 切场景时重置——否则上一个场景的弹窗会挂在新场景上
  useEffect(() => {
    setSettingsOpen(false)
    setOverlay(null)
    setArmed(null)
    setTab(scenario === 'conflicts' || scenario === 'manyConflicts' ? 'conflicts' : 'overview')
    // 有处境要说的场景直接把同步中心推到眼前
    setSyncOpen(
      scenario === 'failed' ||
        scenario === 'first' ||
        scenario === 'conflicts' ||
        scenario === 'manyConflicts' ||
        scenario === 'danger',
    )
  }, [scenario])

  const openSync = (t: 'overview' | 'conflicts' = 'overview') => {
    setTab(t)
    setSyncOpen(true)
  }

  return (
    <VariantA
      reveal={reveal}
      sourceMode={sourceMode}
      renderTables={renderTables}
      onCapture={onCapture}
      currentPath={currentPath}
      onSelect={onSelect}
      menu={
        <AppMenu
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenSyncCenter={() => openSync('overview')}
        />
      }
      overlay={
        <>
          {syncOpen && (
            <SyncCenterDialog
              mock={mock}
              layout={layout}
              tab={tab}
              setTab={setTab}
              armed={armed}
              setArmed={setArmed}
              onClose={() => setSyncOpen(false)}
              onOverlay={setOverlay}
            />
          )}

          {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}

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
        <StatusBar mock={mock} stats={stats} onOpenSync={() => openSync('overview')} />
      )}
    />
  )
}
