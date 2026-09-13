// 同步结果文案(纯逻辑,可单测)。决议 54/62:计数精确,跳过的绝不并入成功。
//
// 口径:成功数 N = 上传 + 下载;**跳过与失败单列**,只进分母 M,绝不进 N。
// 例:「已同步 498 / 500,2 个跳过(文件名含 Windows 非法字符,已跳过)」。

import type { SyncIssue, SyncReport } from "../../../../packages/sync";
import type { SyncOutcome } from "@shared/sync";

/** 把每条 issue 的原因去重后拼成一句(最多 3 类,超出以「等」收尾)。 */
function reasonSummary(issues: SyncIssue[]): string {
  const seen: string[] = [];
  for (const it of issues) {
    if (!seen.includes(it.reason)) seen.push(it.reason);
  }
  if (seen.length <= 3) return seen.join("、");
  return `${seen.slice(0, 3).join("、")}等`;
}

/** 把一次同步的结果整理成页脚可显示的一句话;无结果返回 null。 */
export function formatSyncOutcome(outcome: SyncOutcome | null): string | null {
  if (!outcome) return null;
  if (outcome.status === "error") return `同步失败:${outcome.message ?? "未知错误"}`;

  const r = outcome.report;
  if (!r) return outcome.status === "cancelled" ? "同步已取消" : "已同步";

  const noChange =
    r.uploaded === 0 &&
    r.downloaded === 0 &&
    r.conflicts === 0 &&
    r.skipped.length === 0 &&
    r.failed.length === 0 &&
    r.remainingLocalChanges === 0;
  if (noChange && outcome.status === "ok") return "已同步(无变化)";

  const synced = r.uploaded + r.downloaded;
  // 分母 = 需要处理且已定论的文件数:成功 + 冲突 + 跳过 + 失败。跳过只出现在分母,
  // 绝不加进 synced(决议 62「绝不把跳过的算作成功」)。
  const total = synced + r.conflicts + r.skipped.length + r.failed.length;

  const head = outcome.status === "cancelled" ? "已取消" : "已同步";
  const parts = [`${head} ${synced} / ${total}`];
  if (r.conflicts > 0) parts.push(`冲突 ${r.conflicts}`);
  if (r.skipped.length > 0) parts.push(`${r.skipped.length} 个跳过(${reasonSummary(r.skipped)})`);
  if (r.failed.length > 0) parts.push(`${r.failed.length} 个失败(${reasonSummary(r.failed)})`);
  // 决议 11:同步期间又被改动的文件(不自动重跑)。
  if (r.remainingLocalChanges > 0) parts.push(`还有 ${r.remainingLocalChanges} 个文件的改动未同步`);
  return parts.join("，");
}

/** 是否有「可重试」的整体失败(决议 60:整体失败给错误摘要 + 重试入口)。 */
export function isRetryable(outcome: SyncOutcome | null): boolean {
  if (!outcome) return false;
  if (outcome.status === "error") return true;
  return (outcome.report?.failed.length ?? 0) > 0;
}

/** 失败/跳过明细(供状态条 tooltip 展示逐条原因)。 */
export function summarizeIssues(report: SyncReport | undefined): string {
  if (!report) return "";
  const lines: string[] = [];
  for (const s of report.skipped) lines.push(`跳过 ${s.relPath}:${s.reason}`);
  for (const f of report.failed) lines.push(`失败 ${f.relPath}:${f.reason}`);
  return lines.join("\n");
}
