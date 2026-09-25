import { useEffect, useState } from 'react'
import { AppShell, type DocStats } from './AppShell'
import { StatusBar } from './StatusBar'
import { SyncCenterDialog, type DialogLayout } from './SyncCenterDialog'
import { SettingsDialog, FirstSyncDialog, DeleteDialog } from './SettingsDialog'
import { ConflictCompare } from './SyncCenterDialog'
import { 取场景, type ScenarioKey, type Conflict } from './data'

/**
 * 拼装版 —— **状态栏 + 同步中心弹窗 + 菜单里的设置**。
 *
 * 三个部件各答一个问题，不重叠：
 * - **状态栏**（常驻底部）：同步是**环境**。左边同步信息，右边文档字数。
 *   只做指示与入口，**不做操作**——避免同一件事有两个入口、两套样子。
 * - **同步中心**（**弹窗**）：一个要专门处理事情的界面，处理完就关掉。
 *   冲突是「要干活的地方」，弹窗够大、够专注，且不长期占着内容区。
 * - **设置**（**从菜单进入**）：**不只服务 WebDAV**——文件关联、自动更新、
 *   库切换都是设置，它们不该挤进同步中心。
 */
export function VariantD({
  scenario,
  layout,
}: {
  scenario: ScenarioKey
  /** 弹窗内部布局：选项卡 vs 单页（冲突只在有冲突时出现）。原型里可对比。 */
  layout: DialogLayout
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
    <AppShell
      onOpenSyncCenter={() => openSync('overview')}
      onOpenSettings={() => setSettingsOpen(true)}
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
      statusBar={(stats: DocStats) => (
        <StatusBar mock={mock} stats={stats} onOpenSync={() => openSync('overview')} />
      )}
    />
  )
}
