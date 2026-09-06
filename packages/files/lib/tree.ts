// 工作区目录树扫描与排序(规格 §8:文件夹全显、仅 .md 文件、`.`/隐藏项不出现、
// 同层文件夹在前、组内名称自然升序)。

import { lstat, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";

export type TreeEntryKind = "dir" | "md";

export interface TreeEntry {
  name: string;
  /** 相对工作区根(正斜杠;根下第一层为裸名)。 */
  relPath: string;
  kind: TreeEntryKind;
  /** 目录的孩子(目录恒有,可为空数组)。 */
  children?: TreeEntry[];
}

/** 以 `.` 开头的名字(含系统隐藏常见的点目录)不显示。 */
export function isHiddenName(name: string): boolean {
  return name.startsWith(".");
}

const MD_RE = /\.md$/i;

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

/** 同层排序:文件夹在前,组内名称自然序(中文按系统语言序,数字按数值)。 */
export function compareTreeEntries(a: TreeEntry, b: TreeEntry): number {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return collator.compare(a.name, b.name);
}

async function walkDir(
  dirAbs: string,
  relPrefix: string,
  seen: Set<string>,
): Promise<TreeEntry[]> {
  let real = "";
  try {
    real = await realpath(dirAbs);
  } catch {
    return []; // 目录已消失(竞态),整枝为空
  }
  if (seen.has(real)) return []; // 环
  seen.add(real);

  let dirents;
  try {
    dirents = await readdir(dirAbs, { withFileTypes: true });
  } catch {
    return []; // 无权限/只读边缘:该目录视为空
  }

  const kids: Array<{ name: string; kind: TreeEntryKind | null }> = [];
  for (const d of dirents) {
    const name = d.name;
    if (isHiddenName(name)) continue;
    let kind: TreeEntryKind | null = null;
    if (d.isDirectory()) kind = "dir";
    else if (d.isFile()) {
      if (MD_RE.test(name)) kind = "md";
    } else if (d.isSymbolicLink()) {
      // 符号链接:跟随判断目标类型;悬空不显示
      try {
        const target = await realpath(join(dirAbs, name));
        const tst = await lstat(target);
        if (tst.isDirectory()) kind = "dir";
        else if (tst.isFile() && MD_RE.test(name)) kind = "md";
      } catch {
        kind = null;
      }
    }
    if (kind) kids.push({ name, kind });
  }

  kids.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
    return collator.compare(a.name, b.name);
  });

  const entries: TreeEntry[] = [];
  for (const k of kids) {
    const relPath = relPrefix ? `${relPrefix}/${k.name}` : k.name;
    const entry: TreeEntry = { name: k.name, relPath, kind: k.kind! };
    if (k.kind === "dir") {
      entry.children = await walkDir(join(dirAbs, k.name), relPath, seen);
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * 递归扫描工作区(目录全显含空目录;文件仅 .md;隐藏名跳过;
 * 符号链接跟随判断、环防住;单目录失败只影响该枝)。
 */
export async function scanWorkspaceTree(rootAbs: string): Promise<TreeEntry[]> {
  return walkDir(rootAbs, "", new Set<string>());
}

/** 树中是否至少有一个 .md(空态引导判定)。 */
export function countMarkdown(entries: TreeEntry[]): number {
  let n = 0;
  for (const e of entries) {
    if (e.kind === "md") n++;
    if (e.children) n += countMarkdown(e.children);
  }
  return n;
}

/** 收集树中全部 .md 相对路径(搜索/文件列表消费)。 */
export function collectMarkdownPaths(entries: TreeEntry[], out: string[] = []): string[] {
  for (const e of entries) {
    if (e.kind === "md") out.push(e.relPath);
    if (e.children) collectMarkdownPaths(e.children, out);
  }
  return out;
}

/** 行内子串命中(大小写不敏感;返回行号 1 基与整行文本)。 */
export function findLineHits(text: string, query: string, limit = 50): Array<{ line: number; text: string }> {
  const q = query.toLowerCase();
  const out: Array<{ line: number; text: string }> = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length && out.length < limit; i++) {
    if (lines[i]!.toLowerCase().includes(q)) out.push({ line: i + 1, text: lines[i]! });
  }
  return out;
}
