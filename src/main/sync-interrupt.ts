// 同步中断语义(票 06;决议 64)——关窗确认、切工作区取消、熔断确认文案。
// 全部做成注入依赖的纯逻辑,便于单测;Electron 的 dialog / 窗口回调由 src/main/index.ts
// 与 src/main/sync-run.ts 注入。本文件不依赖 Electron。
//
// 红线:确认**不阻止关窗**,只是「取消同步 + 让已完成的进度落盘」;状态表本就每完成
// 一个文件写一次(决议 34),取消时已完成的部分已在本机。

import type { DeleteGuardPrompt } from "../../packages/sync";

/**
 * 关窗中断确认文案(决议 64 原话):
 *   「同步尚未完成(已完成 123 / 540),关闭将中断。已完成的进度会保存。」
 */
export function buildSyncInterruptMessage(done: number, total: number): { message: string; detail: string } {
  return {
    message: `同步尚未完成(已完成 ${done} / ${total}),关闭将中断。`,
    detail: "已完成的进度会保存。",
  };
}

export interface CloseInterruptDeps {
  isSyncRunning: () => boolean;
  /** 进行中同步的进度。 */
  progress: () => { done: number; total: number };
  /** 弹一次确认;true = 继续关窗。 */
  confirm: (message: string, detail: string) => Promise<boolean>;
  /** 取消进行中的同步(已完成的操作保留)。 */
  cancel: () => void;
}

/**
 * 关窗时若有同步在跑:弹**一次**确认。
 *  - 确认 → 取消同步(进度已落盘)→ 返回 true(继续关窗,不阻止);
 *  - 否认 → 返回 false(窗口不关);
 *  - 无同步 → 直接返回 true(不弹窗)。
 */
export async function handleCloseInterrupt(deps: CloseInterruptDeps): Promise<boolean> {
  if (!deps.isSyncRunning()) return true;
  const { done, total } = deps.progress();
  const text = buildSyncInterruptMessage(done, total);
  const confirmed = await deps.confirm(text.message, text.detail);
  if (!confirmed) return false;
  deps.cancel();
  return true;
}

export interface WorkspaceSwitchDeps {
  isSyncRunning: () => boolean;
  cancel: () => void;
}

/**
 * 切换 / 关闭工作区(决议 64):取消当前同步并让已完成的进度落盘。返回是否确实取消了。
 * 取消后引擎会返回已完成的报告,状态表按文件落盘(决议 34)。
 */
export function cancelSyncForWorkspaceSwitch(deps: WorkspaceSwitchDeps): boolean {
  if (!deps.isSyncRunning()) return false;
  deps.cancel();
  return true;
}

/** 熔断确认对话框的内容(决议 27;实际弹窗在 sync-run.ts)。 */
export function buildDeleteGuardMessage(prompt: DeleteGuardPrompt): {
  message: string;
  detail: string;
  buttons: [string, string];
} {
  const reasons: string[] = [];
  if (prompt.triggeredByMax) reasons.push(`要删除的文件数超过 ${prompt.maxFiles} 个`);
  if (prompt.triggeredByRatio) reasons.push(`超过该侧文件总数的 ${Math.round(prompt.ratioLimit * 100)}%`);
  const shown = prompt.relPaths.slice(0, 20);
  const more = prompt.relPaths.length > shown.length ? `\n…(共 ${prompt.relPaths.length} 个)` : "";
  return {
    message:
      `本次同步要删除 ${prompt.count} 个文件(本地 ${prompt.localDeletes} 个 / 远端 ${prompt.remoteDeletes} 个),` +
      `超过安全阈值。`,
    detail:
      `原因:${reasons.join(";")}。\n` +
      `本地共 ${prompt.localTotal} 个文件,远端共 ${prompt.remoteTotal} 个。\n` +
      `选择「取消」将不删除任何文件(远端删除不可恢复,请谨慎)。\n\n` +
      shown.join("\n") +
      more,
    buttons: ["取消(不删除)", "继续删除"],
  };
}
