// 同步结果文案(纯逻辑,可单测)。决议 54/62:计数精确,跳过的绝不并入成功。

import type { SyncOutcome } from "@shared/sync";

/** 把一次同步的结果整理成页脚可显示的一句话;无结果返回 null。 */
export function formatSyncOutcome(outcome: SyncOutcome | null): string | null {
  if (!outcome) return null;
  if (outcome.status === "error") return `同步失败:${outcome.message ?? "未知错误"}`;

  const r = outcome.report;
  if (!r) return outcome.status === "cancelled" ? "同步已取消" : "已同步";

  const parts = [`上传 ${r.uploaded} / 下载 ${r.downloaded}`];
  if (r.conflicts > 0) parts.push(`冲突 ${r.conflicts}`);
  if (r.skipped.length > 0) parts.push(`跳过 ${r.skipped.length}`);
  if (r.failed.length > 0) parts.push(`失败 ${r.failed.length}`);
  // 决议 11:同步期间又被改动的文件(不自动重跑)。
  if (r.remainingLocalChanges > 0) parts.push(`还有 ${r.remainingLocalChanges} 个文件的改动未同步`);

  const noChange =
    r.uploaded === 0 &&
    r.downloaded === 0 &&
    r.conflicts === 0 &&
    r.skipped.length === 0 &&
    r.failed.length === 0 &&
    r.remainingLocalChanges === 0;
  if (noChange && outcome.status === "ok") return "已同步(无变化)";

  const head = outcome.status === "cancelled" ? "已取消" : "已同步";
  return `${head} · ${parts.join(" / ")}`;
}
