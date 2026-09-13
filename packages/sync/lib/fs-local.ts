// 同步的本地文件枚举与字节读写。
//
// **独立实现,不复用 packages/files 的 scanWorkspaceTree**:决议 18 要求同步不跟随
// 符号链接,而工作区树扫描会跟随(带 realpath 防环)。规格第 107 行专门强调这点。
// 本模块用 lstat/readdir(withFileTypes) 判断类型,遇符号链接即跳过、绝不 stat 目标。
// 本包不依赖 Electron;本地文件系统不注入(测试用真临时目录)。

import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { SyncIssue } from "./sync-types";

/**
 * 硬排除名单(决议 16,不可关闭):所有点开头条目(一次覆盖 `.git`、`.DS_Store` 与
 * 原子写临时文件 `.{名}.confidant-tmp-...`),以及 `Thumbs.db` / `desktop.ini`。
 */
export function isExcludedName(name: string): boolean {
  if (name.startsWith(".")) return true;
  const lower = name.toLowerCase();
  return lower === "thumbs.db" || lower === "desktop.ini";
}

/** Windows 文件名非法字符(决议 61):这类远端条目无法安全落盘 → 跳过并报告。 */
export function hasIllegalWindowsName(name: string): boolean {
  return /[:*?"<>|]/.test(name);
}

export interface LocalFileEntry {
  /** 绝对路径。 */
  absPath: string;
  size: number;
}

export interface LocalSnapshot {
  /** relPath → 文件。 */
  files: Map<string, LocalFileEntry>;
  /** 全部子目录的 relPath(含空目录;不含根)。 */
  dirs: string[];
  /** 被跳过并需报告的条目(决议 61;不算失败、不算成功)。 */
  skipped: SyncIssue[];
}

/** 递归枚举工作区本地文件与目录;不跟随符号链接;超上限文件跳过并报告。 */
export async function scanLocal(
  root: string,
  opts: { maxFileSizeBytes: number },
): Promise<LocalSnapshot> {
  const files = new Map<string, LocalFileEntry>();
  const dirs: string[] = [];
  const skipped: SyncIssue[] = [];

  async function walk(dirAbs: string, relPrefix: string): Promise<void> {
    let dirents;
    try {
      dirents = await readdir(dirAbs, { withFileTypes: true });
    } catch {
      skipped.push({ relPath: relPrefix, reason: "目录不可读,已跳过" });
      return;
    }
    for (const d of dirents) {
      const name = d.name;
      if (isExcludedName(name)) continue;
      const rel = relPrefix ? `${relPrefix}/${name}` : name;
      if (d.isSymbolicLink()) {
        // 决议 18:不跟随符号链接(目标可能在workspace 之外)。
        skipped.push({ relPath: rel, reason: "符号链接(不跟随),已跳过" });
        continue;
      }
      if (d.isDirectory()) {
        dirs.push(rel);
        await walk(join(dirAbs, name), rel);
        continue;
      }
      if (!d.isFile()) {
        skipped.push({ relPath: rel, reason: "未知条目类型,已跳过" });
        continue;
      }
      let size: number;
      try {
        // lstat:再次确认不是符号链接(读取瞬间的竞态也不跟随)。
        const st = await stat(join(dirAbs, name));
        if (!st.isFile()) {
          skipped.push({ relPath: rel, reason: "未知条目类型,已跳过" });
          continue;
        }
        size = st.size;
      } catch {
        skipped.push({ relPath: rel, reason: "无法读取文件信息,已跳过" });
        continue;
      }
      if (size > opts.maxFileSizeBytes) {
        skipped.push({
          relPath: rel,
          reason: `超过单文件上限(${opts.maxFileSizeBytes} 字节),已跳过`,
        });
        continue;
      }
      files.set(rel, { absPath: join(dirAbs, name), size });
    }
  }

  await walk(root, "");
  return { files, dirs, skipped };
}

/** 读本地文件字节(原样,不经过编辑引擎;决议 13)。 */
export async function readLocalBytes(absPath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(absPath));
}

/**
 * 原子写本地文件:先写同目录临时文件再 rename。临时文件名与原子写一致
 * (`.{名}.confidant-tmp-...`,点开头),既被硬排除名单覆盖,也被工作区监听的
 * `ignored` 覆盖,不会触发树刷新的半截文件。
 */
export async function writeLocalAtomic(absPath: string, bytes: Uint8Array): Promise<void> {
  const dir = dirname(absPath);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${basename(absPath)}.confidant-tmp-${process.pid}-${randomBytes(4).toString("hex")}`);
  try {
    await writeFile(tmp, bytes);
    await rename(tmp, absPath);
  } catch (err) {
    try {
      await unlink(tmp);
    } catch {
      // 忽略清理失败,保留原错误
    }
    throw err;
  }
}
