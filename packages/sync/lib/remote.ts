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
  const queue: string[] = [""];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const rel = queue.shift()!;
    if (seen.has(rel)) continue;
    seen.add(rel);
    opts.throwIfAborted();

    const entries = await client.list(rel);
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

  return { files, dirs, skipped };
}
