// 侧栏(文件树 + 搜索占位 + 工作区名);宽度拖拽与折叠由父组件持有状态。

import { useRef, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react";
import type { TreeEntry } from "@shared/ipc";
import { FileTree } from "./FileTree";

export interface SidebarProps {
  workspaceName: string;
  tree: TreeEntry[] | null;
  expanded: ReadonlySet<string>;
  activeRel: string | null;
  width: number;
  onToggleDir: (relPath: string) => void;
  onOpenFile: (relPath: string) => void;
  onWidthChange: (width: number) => void;
  onWidthDragEnd: () => void;
  /** 行右键(树行)→ 调用方处理(10)。 */
  onRowContext?: (e: ReactMouseEvent, entry: TreeEntry) => void;
  /** 树空白区右键(10 空态引导可达)。 */
  onEmptyContext?: (e: ReactMouseEvent) => void;
  onDragStartEntry?: (e: ReactDragEvent, entry: TreeEntry) => void;
  onDropEntry?: (e: ReactDragEvent, entry: TreeEntry) => void;
  /** 树顶搜索框点击(14:唤起当前文件查找面板)。 */
  onSearchBoxClick?: () => void;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

export function Sidebar({
  workspaceName,
  tree,
  expanded,
  activeRel,
  width,
  onToggleDir,
  onOpenFile,
  onWidthChange,
  onWidthDragEnd,
  onRowContext,
  onEmptyContext,
  onDragStartEntry,
  onDropEntry,
  onSearchBoxClick,
}: SidebarProps) {
  const dragState = useRef<{ startX: number; startW: number } | null>(null);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    dragState.current = { startX: e.clientX, startW: width };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    const s = dragState.current;
    if (!s) return;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, s.startW + (e.clientX - s.startX)));
    onWidthChange(next);
  };
  const onPointerUp = (): void => {
    if (dragState.current) {
      dragState.current = null;
      onWidthDragEnd();
    }
  };

  return (
    <div
      data-testid="sidebar"
      style={{
        width,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--shell-border, var(--border))",
        background: "var(--shell-bg, var(--panel))",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: "8px 10px 4px",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={workspaceName}
      >
        {workspaceName}
      </div>
      {/* 搜索框位:14/15 激活;本票仅占位 */}
      <div style={{ padding: "0 8px 6px" }}>
        <input
          data-testid="tree-search-placeholder"
          readOnly
          placeholder="搜索笔记…"
          onClick={onSearchBoxClick}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "4px 8px",
            fontSize: 12.5,
            borderRadius: 6,
            border: "1px solid var(--shell-border, var(--border))",
            background: "transparent",
            color: "inherit",
            cursor: "text",
          }}
        />
      </div>
      <div
        style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px 4px" }}
        data-testid="tree-area"
        onContextMenu={(e) => {
          // 树行自身已 stopPropagation;到达此处即空白区
          if (!(e.target as Element).closest('[role="treeitem"]')) {
            onEmptyContext?.(e);
          }
        }}
      >
        {tree ? (
          <FileTree
            tree={tree}
            expanded={expanded}
            activeRel={activeRel}
            onToggleDir={onToggleDir}
            onOpenFile={onOpenFile}
            onRowContext={onRowContext}
            onDragStart={onDragStartEntry}
            onDropOn={onDropEntry}
          />
        ) : (
          <div style={{ padding: 8, color: "var(--muted)", fontSize: 13 }}>正在扫描…</div>
        )}
      </div>
      {/* 宽度拖拽把手 */}
      <div
        data-testid="sidebar-resizer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: "absolute",
          top: 0,
          right: -3,
          width: 6,
          height: "100%",
          cursor: "col-resize",
          zIndex: 5,
        }}
      />
    </div>
  );
}

/** 无工作区时的侧栏空态框体(27):框体与宽度记忆仍在,提示打开入口。 */
export function SidebarEmpty({ width }: { width: number }) {
  return (
    <div
      data-testid="sidebar"
      style={{
        width,
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid var(--shell-border, var(--border))",
        background: "var(--shell-bg, var(--panel))",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <p
          data-testid="sidebar-empty"
          style={{
            margin: 0,
            fontSize: 13,
            color: "var(--muted)",
            textAlign: "center",
            lineHeight: 1.8,
          }}
        >
          尚未打开工作区
          <br />
          请在「文件」菜单打开文件夹
        </p>
      </div>
    </div>
  );
}
