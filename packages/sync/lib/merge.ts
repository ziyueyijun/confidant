// 合并决策表(纯函数,无 IO)。
//
// ┌─────────┬─────────┬──────────────┬────────────────────────────────────────────┐
// │ 本地    │ 远端    │ 状态表        │ 行为                                       │
// ├─────────┼─────────┼──────────────┼────────────────────────────────────────────┤
// │ 无      │ 有      │ 无记录        │ 下载(逐级建目录)                           │
// │ 有      │ 无      │ 无记录        │ 上传                                       │
// │ 有      │ 有      │ 无记录        │ 下内容比对:同内容记基准;不同内容保留双份  │
// │ 有      │ 有      │ 有记录        │ resolveBoth(增量/冲突判定在引擎)          │
// │ 有      │ 无      │ 有记录        │ deleteLocal(远端已删;执行时比本地 hash)   │
// │ 无      │ 有      │ 有记录        │ deleteRemote(本地已删;执行时比远端 hash)  │
// │ 无      │ 无      │ 有记录        │ forgetRecord(两侧皆无,清记录)             │
// └─────────┴─────────┴──────────────┴────────────────────────────────────────────┘
//
// 红线(决议 26/33 + 工程简报 §2.5):`load() === null`(无状态表)时**绝不产生删除**;
// 删除判定只允许出现在 `hasState === true` 且状态表里有该文件记录(`record`)的分支里。
// `buildPlan` 只产出「删除候选」——真正的删除条件(本地 hash 是否仍等于基准、远端是否
// 真被删)由引擎在执行时用内容 hash 定夺(决议 26:远端删除必须靠基准版本判定)。
//
// 注意:`store.upsert()` 在表不存在时会建一张新表,所以「表不存在」与「表被清空」绝不
// 能混为一谈——后者会让下一次同步把用户的全部笔记当成「远端已删」。本模块用
// `hasState` 严格区分:false ⇒ 上面的「无记录」各行,只补不删。

import type { WebdavEntry } from "./webdav-types";
import type { SyncFileRecord } from "./sync-types";

export type PlanItem =
  | { type: "ensureDir"; relPath: string }
  | { type: "upload"; relPath: string }
  | { type: "download"; relPath: string }
  | { type: "resolveBoth"; relPath: string }
  /** 候选:远端已无、本地仍在、状态表有记录。执行时比本地 hash 与基准。 */
  | { type: "deleteLocal"; relPath: string }
  /** 候选:本地已无、远端仍在、状态表有记录。执行时比远端内容与基准。 */
  | { type: "deleteRemote"; relPath: string }
  /** 两侧皆无但有记录 → 清除记录(不碰任何文件)。 */
  | { type: "forgetRecord"; relPath: string };

export interface PlanInput {
  localFiles: Map<string, unknown>;
  localDirs: string[];
  remoteFiles: Map<string, WebdavEntry>;
  remoteDirs: Set<string>;
  records: Record<string, SyncFileRecord>;
  /** 状态表是否存在(load() !== null)。false ⇒ 保守合并,绝不删除。 */
  hasState: boolean;
  /**
   * 被跳过、无法安全处理的相对路径(决议 61:符号链接、超上限、非法字符、大小写冲突、
   * 超长路径、未知类型)。这些条目在 `localFiles` / `remoteFiles` 里缺失,**但缺失不等于
   * 「对方已删」**——若不排除,跳过会退化成「把另一侧的文件当远端/本地删除处理掉」。
   * 因此这些键一律不产出任何计划项(既不删,也不传),留待下次重新判定。
   */
  unmanaged?: ReadonlySet<string>;
}

/**
 * 产出执行计划。删除组合只在 `hasState && record` 时产出 deleteLocal / deleteRemote /
 * forgetRecord;`hasState === false` 时一律走「只补不删」。
 */
export function buildPlan(input: PlanInput): PlanItem[] {
  const items: PlanItem[] = [];

  // 本地目录 → 远端缺失则逐级建目录(决议 46;ensureDir 内部逐级)。
  for (const d of input.localDirs) {
    if (!input.remoteDirs.has(d)) items.push({ type: "ensureDir", relPath: d });
  }

  // 迭代键必须含状态表里的记录:两侧皆无但记录尚存的路径,唯有在 records 的键里
  // 才会被访问到 → 产出 forgetRecord(否则陈旧记录永远清不掉)。无状态表时 records
  // 为空,不引入任何键。
  const keys = new Set<string>([
    ...input.localFiles.keys(),
    ...input.remoteFiles.keys(),
    ...(input.hasState ? Object.keys(input.records) : []),
  ]);

  for (const rel of [...keys].sort()) {
    // 跳过项(决议 61)绝不产出计划项:缺失是「无法处理」,不是「对方已删」。
    if (input.unmanaged?.has(rel)) continue;

    const hasLocal = input.localFiles.has(rel);
    const hasRemote = input.remoteFiles.has(rel);
    const record: SyncFileRecord | undefined = input.hasState ? input.records[rel] : undefined;

    if (hasLocal && hasRemote) {
      items.push({ type: "resolveBoth", relPath: rel });
      continue;
    }
    if (hasLocal && !hasRemote) {
      if (record) {
        // 远端已删(候选):执行时若本地内容仍等于基准 ⇒ 认定远端删除 → 本地进回收站;
        // 本地已改 ⇒ 改 vs 删冲突 → 保留本地、绝不删除(决议 26)。
        items.push({ type: "deleteLocal", relPath: rel });
        continue;
      }
      items.push({ type: "upload", relPath: rel });
      continue;
    }
    if (!hasLocal && hasRemote) {
      if (record) {
        // 本地已删(候选):执行时若远端内容仍等于基准 ⇒ 认定本地删除 → 删远端;
        // 远端已改 ⇒ 删 vs 改冲突 → 保留远端内容,不删远端。
        items.push({ type: "deleteRemote", relPath: rel });
        continue;
      }
      items.push({ type: "download", relPath: rel });
      continue;
    }
    // 两侧皆无
    if (record) {
      items.push({ type: "forgetRecord", relPath: rel });
    }
  }

  return items;
}
