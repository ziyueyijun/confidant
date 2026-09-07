// 文件树(规格 §8 树形态;数据来自主进程扫描/监听,渲染层只做展示与展开状态)。
// 排序/过滤由扫描层完成;本组件处理:层级缩进、展开折叠、当前文件高亮(相对路径)。

import {
  memo,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
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
  /** 行右键(上下文操作;e.preventDefault 由调用方处理)。 */
  onRowContext?: (e: ReactMouseEvent, entry: TreeEntry) => void;
  /** 拖拽相关(11)。 */
  onDragStart?: (e: ReactDragEvent, entry: TreeEntry) => void;
  onDropOn?: (e: ReactDragEvent, entry: TreeEntry) => void;
}

export const FileTree = memo(function FileTree({
  tree,
  expanded,
  activeRel,
  onToggleDir,
  onOpenFile,
  onRowContext,
  onDragStart,
  onDropOn,
}: FileTreeProps) {
  const renderLevel = (entries: TreeEntry[], depth: number): ReactNode =>
    entries.map((entry) => {
      const isDir = entry.kind === "dir";
      const isOpen = isDir && expanded.has(entry.relPath);
      const active = !isDir && activeRel !== null && entry.relPath === activeRel;
      const style: CSSProperties = {
        display: "flex",
        alignItems: "center",
        gap: 4,
        width: "100%",
        border: "none",
        // 激活态:背景 + 4px 左边框(蓝图 A2 对齐项;01 token)
        background: active ? "var(--tree-active-bg)" : "transparent",
        borderLeft: active ? "4px solid var(--tree-active-border)" : "4px solid transparent",
        color: active ? "var(--tree-active-fg)" : "inherit",
        font: "inherit",
        fontSize: 13,
        fontWeight: isDir ? 500 : 400,
        textAlign: "left",
        padding: "3px 6px 3px 2px",
        borderRadius: 0,
        cursor: "pointer",
        whiteSpace: "nowrap",
        overflow: "hidden",
        boxSizing: "border-box",
      };
      const commonHandlers = {
        onContextMenu: (e: ReactMouseEvent) => onRowContext?.(e, entry),
        onDragStart: (e: ReactDragEvent) => onDragStart?.(e, entry),
        onDragOver: (e: ReactDragEvent) => {
          if (entry.kind === "dir") {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        },
        onDrop: (e: ReactDragEvent) => {
          if (entry.kind === "dir") {
            e.stopPropagation();
            onDropOn?.(e, entry);
          }
        },
      };
      return (
        <div key={entry.relPath} style={{ paddingLeft: depth * 14 }}>
          {isDir ? (
            <button
              type="button"
              role="treeitem"
              aria-expanded={isOpen}
              draggable={!!onDragStart}
              data-rel={entry.relPath}
              title={entry.relPath}
              style={style}
              {...commonHandlers}
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
              draggable={!!onDragStart}
              data-rel={entry.relPath}
              title={entry.relPath}
              style={style}
              {...commonHandlers}
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
    <div
      role="tree"
      data-testid="file-tree"
      style={{ userSelect: "none" }}
      onDragOver={(e) => {
        // 允许拖到空白区 → 移动进工作区根
        if (e.dataTransfer?.types.includes("application/x-confidant-entry")) e.preventDefault();
      }}
      onDrop={(e) => onDropOn?.(e, { name: "", relPath: "", kind: "dir" } as TreeEntry)}
    >
      {renderLevel(tree, 0)}
    </div>
  );
});
