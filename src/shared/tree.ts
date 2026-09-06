// 目录树纯计数(空态引导判定):渲染层 workspace 与主进程 files 共用,
// 避免跨层重复(countMarkdown/countMdInTree 收敛,24)。
// 结构参数取最小形状,兼容 @shared/ipc 与 packages/files 各自的 TreeEntry。

interface CountableEntry {
  kind: "dir" | "md";
  children?: CountableEntry[];
}

export function countMarkdown(entries: CountableEntry[]): number {
  let n = 0;
  for (const e of entries) {
    if (e.kind === "md") n++;
    if (e.children) n += countMarkdown(e.children);
  }
  return n;
}
