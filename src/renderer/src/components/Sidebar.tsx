// 侧栏(03:文件树 + 大纲双 tab + 知识库搜索 + 工作区名);宽度拖拽与折叠由父组件持有状态。

import { useEffect, useRef, useState, type CSSProperties, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent } from "react";
import type { TreeEntry, WorkspaceSearchFileHit } from "@shared/ipc";
import { FileTree } from "./FileTree";
import { OutlinePanel } from "./OutlinePanel";
import type { OutlineItem } from "../editor/outline";

export interface SidebarProps {
  workspaceName: string;
  workspaceRoot: string;
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
  /** 内容命中打开并定位(反馈轮 01:侧边栏知识库搜索与顶部条共用跳转)。 */
  onOpenWorkspaceHit?: (absPath: string, query: string) => void;
  /** 大纲面板数据(03):标题列表与滚动跟随高亮。 */
  outlineItems: OutlineItem[];
  outlineActivePos: number | null;
  /** 源码模式下大纲禁用(空态)。 */
  outlineDisabled: boolean;
  onOutlineJump: (item: OutlineItem) => void;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;

export function Sidebar({
  workspaceName,
  workspaceRoot,
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
  onOpenWorkspaceHit,
  outlineItems,
  outlineActivePos,
  outlineDisabled,
  onOutlineJump,
}: SidebarProps) {
  const dragState = useRef<{ startX: number; startW: number } | null>(null);
  /** 文件/大纲双 tab(03):tab 态为界面局部态,宽度记忆两 tab 共享。 */
  const [tab, setTab] = useState<"files" | "outline">("files");
  /** 知识库搜索(反馈轮 01):就地输入;文件名匹配 + 内容命中。 */
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [searching, setSearching] = useState(false);
  const [fileHits, setFileHits] = useState<TreeEntry[]>([]);
  const [wsHits, setWsHits] = useState<WorkspaceSearchFileHit[]>([]);

  // 搜索:防抖 180ms——文件名匹配(客户端树遍历)+ 内容命中(searchWorkspace IPC)
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setFileHits([]);
      setWsHits([]);
      setSearching(false);
      return;
    }
    const timer = setTimeout(() => {
      // 文件名匹配:递归收集 md 文件,relPath/name 含查询(忽略大小写),前 20
      const hits: TreeEntry[] = [];
      const walk = (entries: TreeEntry[]): void => {
        for (const e of entries) {
          if (e.kind === "dir" && e.children) walk(e.children);
          else if (e.kind === "md" && (e.relPath.toLowerCase().includes(q.toLowerCase()) || e.name.toLowerCase().includes(q.toLowerCase()))) {
            hits.push(e);
            if (hits.length >= 20) return;
          }
        }
      };
      if (tree) walk(tree);
      setFileHits(hits);
      setSearching(true);
      void window.confidant.searchWorkspace(workspaceRoot, q).then((res) => {
        setWsHits(res.ok ? res.value : []);
        setSearching(false);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [searchQuery, tree, workspaceRoot]);

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
      {/* 文件/大纲双 tab(03):宽 84px、激活加粗 + 底部 4px currentColor 色条,
          下方 1px 分隔线(基线 §3.2);点击条目不自动收起侧边栏 */}
      <div
        data-testid="sidebar-tabs"
        style={{
          display: "flex",
          borderBottom: "1px solid var(--shell-border, var(--border))",
          flexShrink: 0,
        }}
      >
        {(["files", "outline"] as const).map((t) => (
          <button
            key={t}
            type="button"
            data-testid={`sidebar-tab-${t}`}
            onClick={() => setTab(t)}
            style={{
              width: 84,
              lineHeight: "2.4",
              fontSize: 13,
              border: "none",
              borderBottom: tab === t ? "4px solid currentColor" : "4px solid transparent",
              background: "transparent",
              color: "inherit",
              fontWeight: tab === t ? 700 : 400,
              opacity: tab === t ? 1 : 0.8,
              cursor: "pointer",
              boxSizing: "border-box",
            }}
          >
            {t === "files" ? "文件" : "大纲"}
          </button>
        ))}
      </div>
      {tab === "files" ? (
        <>
          {/* 搜索框(反馈轮 01):就地输入——文件名匹配 + 内容命中(知识库文件搜索);
              Ctrl+F 顶部条当前文件查找保持独立 */}
          <div style={{ padding: "0 8px 6px" }}>
            <input
              data-testid="tree-search-input"
              placeholder="搜索知识库…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => {
                // 延迟收起,允许点击命中项
                setTimeout(() => setSearchFocus(false), 150);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchQuery("");
                  setSearchFocus(false);
                }
              }}
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
                outline: "none",
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
            {searchFocus || searchQuery.trim() !== "" ? (
              <SidebarSearchResults
                tree={tree}
                query={searchQuery}
                searching={searching}
                fileHits={fileHits}
                wsHits={wsHits}
                onOpenFile={onOpenFile}
                onOpenWorkspaceHit={onOpenWorkspaceHit}
              />
            ) : tree ? (
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
        </>
      ) : (
        <div style={{ flex: 1, overflowY: "auto" }} data-testid="outline-area">
          <OutlinePanel
            items={outlineItems}
            activePos={outlineActivePos}
            disabled={outlineDisabled}
            onJump={onOutlineJump}
          />
        </div>
      )}
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

/** 知识库搜索命中列表(反馈轮 01):文件名匹配段 + 内容命中段。 */
function SidebarSearchResults({
  tree,
  query,
  searching,
  fileHits,
  wsHits,
  onOpenFile,
  onOpenWorkspaceHit,
}: {
  tree: TreeEntry[] | null;
  query: string;
  searching: boolean;
  fileHits: TreeEntry[];
  wsHits: WorkspaceSearchFileHit[];
  onOpenFile: (relPath: string) => void;
  onOpenWorkspaceHit?: (absPath: string, query: string) => void;
}) {
  const q = query.trim();
  const wsCount = wsHits.reduce((n, f) => n + f.lines.length, 0);
  const empty = q !== "" && fileHits.length === 0 && wsCount === 0 && !searching;
  return (
    <div data-testid="sidebar-search-results" style={{ padding: "4px 0 8px" }}>
      {q === "" && (
        <div style={{ padding: "8px 10px", color: "var(--muted)", fontSize: 12.5 }}>
          输入关键词搜索知识库(文件名与内容)
        </div>
      )}
      {searching && <div style={{ padding: "8px 10px", color: "var(--muted)", fontSize: 12.5 }}>搜索中…</div>}
      {empty && <div style={{ padding: "8px 10px", color: "var(--muted)", fontSize: 12.5 }}>无结果</div>}
      {fileHits.length > 0 && (
        <>
          <div style={{ padding: "2px 10px", fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>
            文件名匹配
          </div>
          {fileHits.map((e) => (
            <button
              key={e.relPath}
              type="button"
              data-testid="sidebar-file-hit"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => onOpenFile(e.relPath)}
              style={searchRowStyle}
            >
              {e.name.replace(/\.md$/i, "")}
            </button>
          ))}
        </>
      )}
      {wsHits.length > 0 && (
        <>
          <div style={{ padding: "2px 10px", fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>
            内容命中
          </div>
          {wsHits.map((f) => (
            <button
              key={f.path}
              type="button"
              data-testid="sidebar-ws-hit"
              onMouseDown={(ev) => ev.preventDefault()}
              onClick={() => onOpenWorkspaceHit?.(f.path, q)}
              style={searchRowStyle}
            >
              <span style={{ color: "var(--muted)", fontWeight: 600 }}>{f.name}</span>
              <span style={{ color: "var(--quote-fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.lines[0]?.text.slice(0, 40) ?? ""}
              </span>
            </button>
          ))}
        </>
      )}
      {tree === null && q !== "" && <div style={{ padding: "8px 10px", color: "var(--muted)", fontSize: 12.5 }}>正在扫描…</div>}
    </div>
  );
}

const searchRowStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: 1,
  width: "100%",
  textAlign: "left",
  border: "none",
  background: "transparent",
  color: "inherit",
  padding: "3px 10px",
  fontSize: 12.5,
  cursor: "pointer",
};
