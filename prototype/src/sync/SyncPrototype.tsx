import { VariantA } from './VariantA'
import { VariantB } from './VariantB'
import { VariantC } from './VariantC'
import { VariantD } from './VariantD'
import { 场景, type ScenarioKey } from './data'

/**
 * 同步界面原型的变体切换器。
 *
 * **D 是拼装后的选定形态**（状态栏 + 同步中心 + 独立设置），默认显示它。
 * A / B / C 保留作对照——它们是这个设计的来源，也是「为什么这么拼」的证据。
 *
 * 场景（`scenario`）与变体是两个独立轴：同一场景要在各形态下各看一遍，
 * 才能判断哪种形态在「失败」「冲突」这些难看的时刻最站得住。
 */
export type SyncVariant = 'A' | 'B' | 'C' | 'D'

export function SyncPrototype({
  variant,
  scenario,
}: {
  variant: SyncVariant
  scenario: string
}) {
  const key = (场景.some((s) => s.key === scenario) ? scenario : 'idle') as ScenarioKey

  return (
    <>
      {variant === 'A' && <VariantA scenario={key} />}
      {variant === 'B' && <VariantB scenario={key} />}
      {variant === 'C' && <VariantC scenario={key} />}
      {variant === 'D' && <VariantD scenario={key} />}
    </>
  )
}
