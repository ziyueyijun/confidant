// packages/files —— 主进程磁盘服务(deep module)。
// 磁盘/文件语义的落地实现:读写、原子写、目录树、监听、回收站、shell 操作等,
// 随工单(02/04/05/10/11/12)渐进补齐。本包不依赖 Electron API(壳操作在 shell 入口)。

export { readTextFile } from "./lib/read-write";
export { writeTextFileAtomic } from "./lib/atomic-write";
export type { FsAdapter } from "./lib/atomic-write";

export { scanWorkspaceTree, compareTreeEntries, isHiddenName, countMarkdown, collectMarkdownPaths } from "./lib/tree";
export type { TreeEntry, TreeEntryKind } from "./lib/tree";
