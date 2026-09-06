// 文件树(规格 §8 树形态;数据来自主进程扫描/监听,渲染层只做展示与展开状态)。
// 排序/过滤由扫描层完成;本组件处理:层级缩进、展开折叠、当前文件高亮(相对路径)。

import { memo } from "react";
import { ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import type { TreeEntry } from "@shared/ipc";

export interface FileTreeProps {
  tree: TreeEntry[];
  /** 展开的目录相对路径集合。 */
  expanded: ReadonlySet<string>;
  /** 当前打开文件的相对路径(null 无高亮)。 */
  activeRel: string | null;
  onToggleDir: (relPath: string) => void;
  onOpenFile: (relPath: string) => void;
}

export const FileTree = memo(function FileTree({
  tree,
  expanded,
  activeRel,
  onToggleDir,
  onOpenFile,
}: FileTreeProps) {
  const renderLevel = (entries: TreeEntry[], depth: number): React.ReactNode =>
    entries.map((entry) => {
      const isDir = entry.kind === "dir";
      const isOpen = isDir && expanded.has(entry.relPath);
      const active = !isDir && activeRel !== null && entry.relPath === activeRel;
      const style: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        gap: 4,
        width: "100%",
        border: "none",
        background: active ? "var(--tree-active-bg, #d7e6f7)" : "transparent",
        color: "inherit",
        font: "inherit",
        fontSize: 13,
        fontWeight: isDir ? 500 : 400,
        textAlign: "left",
        padding: "3px 6px 3px 0",
        borderRadius: 4,
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
      };
      return (
        <div key={entry.relPath} style={{ paddingLeft: depth * 14 }}>
          {isDir ? (
            <button
              type="button"
              role="treeitem"
              aria-expanded={isOpen}
              data-rel={entry.relPath}
              title={entry.relPath}
              style={style}
              onClick={() => onToggleDir(entry.relPath)}
            >
              <ChevronRight
                size={13}
                style={{
                  flexShrink: 0,
                  transform: isOpen ? "rotate(90deg)" : undefined,
                  transition: "transform 0.1s",
                }}
              />
              {isOpen ? (
                <FolderOpen size={14} style={{ flexShrink: 0, opacity: 0.8 }} />
              ) : (
                <Folder size={14} style={{ flexShrink: 0, opacity: 0.8 }} />
              )}
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</span>
            </button>
          ) : (
            <button
              type="button"
              role="treeitem"
              data-rel={entry.relPath}
              title={entry.relPath}
              style={style}
              onClick={() => onOpenFile(entry.relPath)}
            >
              <span style={{ width: 13, flexShrink: 0 }} />
              <FileText size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {entry.name.replace(/\.md$/i, "")}
              </span>
            </button>
          )}
          {isOpen && entry.children && renderLevel(entry.children, depth + 1)}
        </div>
      );
    });

  return (
    <div role="tree" data-testid="file-tree" style={{ userSelect: "none" }}>
      {renderLevel(tree, 0)}
    </div>
  );
});
