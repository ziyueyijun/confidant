// 工作区渲染层模型(纯函数;files 包为主进程侧 node 实现,渲染层不得运行时引用)。

import type { TreeEntry } from "@shared/ipc";
import { join } from "@shared/path";

export interface Workspace {
  root: string;
  name: string;
}

/** 绝对路径 → 相对工作区根的相对路径(正斜杠;不在树内返回 null)。 */
export function relPathOf(root: string, absPath: string): string | null {
  const r = root.replace(/[\\/]+$/, "").replace(/\\/g, "/");
  const a = absPath.replace(/\\/g, "/");
  if (a.toLowerCase() === r.toLowerCase()) return "";
  const prefix = `${r.toLowerCase()}/`;
  if (!a.toLowerCase().startsWith(prefix)) return null;
  return a.slice(r.length + 1);
}

/** 相对路径 → 绝对(供打开文件)。 */
export function wsJoin(root: string, relPath: string): string {
  return join(root, relPath);
}

/** 目录相对路径 → 其全部祖先相对路径(含自身;供自动展开/记忆)。 */
export function dirAncestorsOf(relPath: string): string[] {
  const parts = relPath.split("/");
  const out: string[] = [];
  for (let i = 1; i <= parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}


export { countMarkdown as countMdInTree } from "@shared/tree";
