import { VariantA } from './VariantA'
import { VariantB } from './VariantB'
import { VariantC } from './VariantC'
import { 场景, type ScenarioKey } from './data'

/**
 * 同步界面原型的变体切换器。
 *
 * 三种变体对「同步应该是界面里的什么东西」给出**结构上不同**的答案：
 * A 是环境（底部状态栏）、B 是地方（整页同步中心）、C 是历史（事件流）。
 *
 * 场景（`scenario`）与变体是两个独立轴：同一场景要在三种形态下各看一遍，
 * 才能判断哪种形态在「失败」「冲突」这些难看的时刻最站得住。
 */
export function SyncPrototype({
  variant,
  scenario,
}: {
  variant: 'A' | 'B' | 'C'
  scenario: string
}) {
  const key = (场景.some((s) => s.key === scenario) ? scenario : 'idle') as ScenarioKey

  return (
    <>
      {variant === 'A' && <VariantA scenario={key} />}
      {variant === 'B' && <VariantB scenario={key} />}
      {variant === 'C' && <VariantC scenario={key} />}
    </>
  )
}
