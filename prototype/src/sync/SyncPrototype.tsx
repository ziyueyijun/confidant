import { VariantA } from './VariantA'
import { VariantB } from './VariantB'
import { VariantC } from './VariantC'
import { VariantD } from './VariantD'
import { 场景, type ScenarioKey } from './data'
import type { SyntaxReveal } from '../editor/markdownLivePreview'

/**
 * 同步界面原型的变体切换器。
 *
 * **D 是拼装后的选定形态**（状态栏 + 同步中心 + 独立设置），默认显示它。
 * A / B / C 保留作对照——它们是这个设计的来源，也是「为什么这么拼」的证据。
 *
 * D 跑在布局原型的外壳上（`VariantA`：文件树 / 标签页 / 编辑器 / 大纲），
 * 所以它需要编辑器的参数；A / B / C 用的是简化外壳，把同步界面放在内容区。
 */
export type SyncVariant = 'A' | 'B' | 'C' | 'D'

export function SyncPrototype({
  variant,
  scenario,
  dialogLayout = 'tabs',
  reveal,
  sourceMode,
  renderTables,
  onCapture,
  currentPath,
  onSelect,
}: {
  variant: SyncVariant
  scenario: string
  dialogLayout?: 'tabs' | 'sections'
  reveal: SyntaxReveal
  sourceMode: boolean
  renderTables: boolean
  onCapture: () => void
  currentPath: string
  onSelect: (path: string) => void
}) {
  const key = (场景.some((s) => s.key === scenario) ? scenario : 'idle') as ScenarioKey

  return (
    <>
      {variant === 'A' && <VariantA scenario={key} />}
      {variant === 'B' && <VariantB scenario={key} />}
      {variant === 'C' && <VariantC scenario={key} />}
      {variant === 'D' && (
        <VariantD
          scenario={key}
          layout={dialogLayout}
          reveal={reveal}
          sourceMode={sourceMode}
          renderTables={renderTables}
          onCapture={onCapture}
          currentPath={currentPath}
          onSelect={onSelect}
        />
      )}
    </>
  )
}
