// 合并决策表(纯函数,无 IO)。
//
// ┌─────────┬─────────┬──────────────┬────────────────────────────────────────────┐
// │ 本地    │ 远端    │ 状态表        │ 行为                                       │
// ├─────────┼─────────┼──────────────┼────────────────────────────────────────────┤
// │ 无      │ 有      │ 无记录        │ 下载(逐级建目录)                           │
// │ 有      │ 无      │ 无记录        │ 上传                                       │
// │ 有      │ 有      │ 无记录        │ 下内容比对:同内容记基准;不同内容保留双份  │
// │ 无      │ 无      │ 任意          │ 无事                                       │
// └─────────┴─────────┴──────────────┴────────────────────────────────────────────┘
//
// 红线(决议 33 + 工程简报 §2.5):`load() === null`(无状态表)时**绝不产生删除**。
// 删除判定只允许出现在 `hasState === true` 的分支里,且由票 05 实现;本票对
// 「本应删除」的组合一律产出 `defer`(空操作),绝不删任何一侧。

import type { WebdavEntry } from "./webdav-types";
import type { SyncFileRecord } from "./sync-types";

export type PlanItem =
  | { type: "ensureDir"; relPath: string }
  | { type: "upload"; relPath: string }
  | { type: "download"; relPath: string }
  | { type: "resolveBoth"; relPath: string }
  | { type: "defer"; relPath: string; reason: string };

export interface PlanInput {
  localFiles: Map<string, unknown>;
  localDirs: string[];
  remoteFiles: Map<string, WebdavEntry>;
  remoteDirs: Set<string>;
  records: Record<string, SyncFileRecord>;
  /** 状态表是否存在(load() !== null)。false ⇒ 保守合并,绝不删除。 */
  hasState: boolean;
}

/**
 * 产出执行计划。删除相关组合在 hasState 分支里产出 `defer`(票 05 的插入点:
 * 届时在这里改判为 deleteRemote / deleteLocal)。
 */
export function buildPlan(input: PlanInput): PlanItem[] {
  const items: PlanItem[] = [];

  // 本地目录 → 远端缺失则逐级建目录(决议 46;ensureDir 内部逐级)。
  for (const d of input.localDirs) {
    if (!input.remoteDirs.has(d)) items.push({ type: "ensureDir", relPath: d });
  }

  const keys = new Set<string>([
    ...input.localFiles.keys(),
    ...input.remoteFiles.keys(),
  ]);

  for (const rel of [...keys].sort()) {
    const hasLocal = input.localFiles.has(rel);
    const hasRemote = input.remoteFiles.has(rel);
    const record: SyncFileRecord | undefined = input.records[rel];

    if (hasLocal && hasRemote) {
      items.push({ type: "resolveBoth", relPath: rel });
      continue;
    }
    if (hasLocal && !hasRemote) {
      if (input.hasState && record) {
        // 本应「远端已删 → 传删除」。票 05 的删除判定插入点。此刻绝不删。
        items.push({ type: "defer", relPath: rel, reason: "远端已删除,删除传播由票 05 处理" });
        continue;
      }
      items.push({ type: "upload", relPath: rel });
      continue;
    }
    if (!hasLocal && hasRemote) {
      if (input.hasState && record) {
        // 本应「本地已删 → 远端删除(本地进回收站)」。票 05 的删除判定插入点。
        items.push({ type: "defer", relPath: rel, reason: "本地已删除,删除传播由票 05 处理" });
        continue;
      }
      items.push({ type: "download", relPath: rel });
      continue;
    }
    // 两侧皆无
    if (record) {
      // 本应清墓碑/记录。票 05。
      items.push({ type: "defer", relPath: rel, reason: "两侧均已删除,记录清理由票 05 处理" });
    }
  }

  return items;
}

/** 计划项里真正要做的工作(排除 defer;进度与计数只算工作项)。 */
export function actionableItems(items: PlanItem[]): Exclude<PlanItem, { type: "defer" }>[] {
  return items.filter((i): i is Exclude<PlanItem, { type: "defer" }> => i.type !== "defer");
}
