// 远端枚举:决议 45 只用深度 1 逐层遍历(不用无限深度)。解析、路径归一化都在客户端
// 真跑;本模块只负责「把远端根整棵树收成一张 relPath → 条目」的表,并套同步范围的
// 排除与上限规则(决议 16、17、61)。

import type { WebdavClient, WebdavEntry } from "./webdav-types";
import type { SyncIssue } from "./sync-types";
import { hasIllegalWindowsName, isExcludedName } from "./fs-local";

export interface RemoteSnapshot {
  files: Map<string, WebdavEntry>;
  dirs: Set<string>;
  skipped: SyncIssue[];
  /**
   * 远端根(`""`)一次列举返回的**原始**条目数——在排除名单过滤之前。决议 63 的列举
   * 闸门用它区分「远端真的空」与「列举静默返回空」:若为 0 而状态表非空 → 停止。
   * 根目录只含点开头条目时该值仍 > 0,不会误触闸门。
   */
  rootRawCount: number;
}

/**
 * 递归枚举远端。列举失败(非成功状态码)由客户端抛 WebdavError → 调用方按整体失败处理
 * (决议 63:绝不把「列举失败」当作「远端为空」)。空列举返回空数组,由票 05 的列举闸门
 * 结合状态表判定是否可疑。
 */
export async function scanRemote(
  client: WebdavClient,
  opts: { maxFileSizeBytes: number; signal?: AbortSignal; throwIfAborted: () => void },
): Promise<RemoteSnapshot> {
  const files = new Map<string, WebdavEntry>();
  const dirs = new Set<string>();
  const skipped: SyncIssue[] = [];
  let rootRawCount = 0;
  const queue: string[] = [""];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const rel = queue.shift()!;
    if (seen.has(rel)) continue;
    seen.add(rel);
    opts.throwIfAborted();

    const entries = await client.list(rel);
    if (rel === "") rootRawCount = entries.length; // 原始条目数(过滤前);列举闸门用
    for (const e of entries) {
      if (isExcludedName(e.name)) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isCollection) {
        dirs.add(childRel);
        queue.push(childRel);
        continue;
      }
      if (hasIllegalWindowsName(e.name)) {
        skipped.push({ relPath: childRel, reason: "文件名含 Windows 非法字符,已跳过" });
        continue;
      }
      if (e.size !== null && e.size > opts.maxFileSizeBytes) {
        skipped.push({
          relPath: childRel,
          reason: `超过单文件上限(${opts.maxFileSizeBytes} 字节),已跳过`,
        });
        continue;
      }
      files.set(childRel, e);
    }
  }

  return { files, dirs, skipped, rootRawCount };
}
