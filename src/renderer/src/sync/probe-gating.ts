// 启动探测的渲染层纯逻辑(可单测;挂在 use-sync-probe 上)。
// 决议 8:启动后对远端根做**一次**只读探测,存在本机未知变更 → 页脚小圆点;
// 同步完成后圆点消失;未打开工作区不发任何请求。

import type { SyncOutcome } from "@shared/sync";

/**
 * 启动探测的目标工作区路径。null / 空白 = **未打开工作区 → 不探测**(零网络请求)。
 * 返回非空路径 = 该工作区调一次探测(是否已配置同步由主进程判定,未配置同样零请求)。
 */
export function probePathFor(workspacePath: string | null | undefined): string | null {
  const p = workspacePath?.trim();
  return p ? p : null;
}

/**
 * 同步结束后是否应清除圆点(决议 8:同步完成后圆点消失)。
 * 只在 **ok** 时清除:cancelled / error 时同步未真正完成,远端变更未必已纳入本地状态,
 * 保留圆点(绝不因为一次失败的同步而隐藏「该同步」的提示)。
 */
export function dotClearedByOutcome(outcome: SyncOutcome | null): boolean {
  return outcome?.status === "ok";
}
