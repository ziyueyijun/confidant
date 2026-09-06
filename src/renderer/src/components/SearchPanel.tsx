// 查找面板(14/15):作用域「当前文件 / 整个工作区」;输入即实时匹配,
// 命中行摘要点击 → 打开/定位并高亮(decoration 临时态);Esc/✕ 关闭清除。

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Engine } from "../../../../packages/engine";
import type { WorkspaceSearchFileHit } from "@shared/ipc";

export type SearchScope = "file" | "workspace";

export interface SearchPanelProps {
  engine: Engine | null;
  /** 焦点请求计数(每次 +1 强制聚焦输入框)。 */
  focusRequest: number;
  initialScope?: SearchScope;
  /** 工作区根(整个工作区作用域可用时)。 */
  workspaceRoot?: string | null;
  /** 打开并定位工作区命中文件(父层负责自动保存/高亮首个命中)。 */
  onOpenWorkspaceHit: (absPath: string, query: string) => void;
  onClose: () => void;
}

export function SearchPanel({
  engine,
  focusRequest,
  initialScope = "file",
  workspaceRoot,
  onOpenWorkspaceHit,
  onClose,
}: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>(initialScope);
  const [active, setActive] = useState(0);
  const [wsHits, setWsHits] = useState<WorkspaceSearchFileHit[]>([]);
  const [wsSearching, setWsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const treeTickRef = useRef(0);

  useEffect(() => {
    if (focusRequest > 0) inputRef.current?.focus();
  }, [focusRequest]);

  const hits = useMemo(() => {
    if (!engine || query.trim() === "") return [];
    return engine.findInDoc(query);
  }, [engine, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  // 工作区作用域:防抖实时搜索;树更新时重跑(与监听同源,不建索引)
  useEffect(() => {
    if (scope !== "workspace" || !workspaceRoot || query.trim() === "") {
      setWsHits([]);
      return;
    }
    const timer = setTimeout(() => {
      setWsSearching(true);
      void window.confidant.searchWorkspace(workspaceRoot, query).then((res) => {
        setWsHits(res.ok ? res.value : []);
        setWsSearching(false);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [query, scope, workspaceRoot, treeTickRef.current]);

  useEffect(() => {
    if (scope !== "workspace") return;
    return window.confidant.onWorkspaceTree(() => {
      treeTickRef.current += 1;
    });
  }, [scope]);

  const applyActive = (index: number): void => {
    if (!engine || hits.length === 0) return;
    const idx = Math.min(Math.max(index, 0), hits.length - 1);
    setActive(idx);
    engine.setSearchHighlights(hits, idx);
    const hit = hits[idx];
    if (hit) engine.revealRange(hit.from, hit.to);
  };

  useEffect(() => {
    if (scope !== "file") {
      engine?.clearSearchHighlights();
      return;
    }
    if (hits.length === 0) {
      engine?.clearSearchHighlights();
      return;
    }
    engine?.setSearchHighlights(hits, active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, hits.length]);

  const summary = (text: string): string => text.replace(/\s+/g, " ").trim() || "(空行)";
  const fileHitsCount = hits.length;
  const wsCount = wsHits.reduce((n, f) => n + f.lines.length, 0);
  const empty = query.trim() !== "" && ((scope === "file" && fileHitsCount === 0) || (scope === "workspace" && wsCount === 0 && !wsSearching));

  return (
    <div
      data-testid="search-panel"
      style={{
        position: "fixed",
        top: 44,
        right: 14,
        width: 400,
        maxHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        border: "1px solid #d5d5d5",
        borderRadius: 8,
        boxShadow: "0 3px 14px rgba(0,0,0,.15)",
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px" }}>
        <input
          ref={inputRef}
          data-testid="search-input"
          placeholder="搜索笔记…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyActive(active + (e.shiftKey ? -1 : 1));
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          style={{
            flex: 1,
            padding: "5px 8px",
            fontSize: 13,
            borderRadius: 6,
            border: "1px solid #c5c5c5",
            outline: "none",
          }}
        />
        <button
          type="button"
          aria-label="关闭查找"
          onClick={onClose}
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "#888" }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: "flex", gap: 4, padding: "0 12px 8px" }}>
        {(["file", "workspace"] as const).map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`scope-${s}`}
            disabled={s === "workspace" && !workspaceRoot}
            onClick={() => setScope(s)}
            style={{
              fontSize: 12,
              padding: "3px 10px",
              borderRadius: 12,
              border: "none",
              cursor: "pointer",
              background: scope === s ? "#2f6fbf" : "#ececec",
              color: scope === s ? "#fff" : "#666",
            }}
          >
            {s === "file" ? "当前文件" : "整个工作区"}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <span data-testid="search-count" style={{ fontSize: 12, color: "#999", alignSelf: "center" }}>
          {query.trim() === ""
            ? ""
            : wsSearching
              ? "搜索中…"
              : scope === "file"
                ? fileHitsCount > 0
                  ? `${fileHitsCount} 处命中`
                  : ""
                : wsCount > 0
                  ? `${wsHits.length} 个文件 / ${wsCount} 处`
                  : ""}
        </span>
      </div>
      <div style={{ overflowY: "auto", padding: "0 6px 8px" }}>
        {empty && (
          <div style={{ padding: "10px 8px", color: "#b0b0b0", fontSize: 13 }}>无结果</div>
        )}
        {scope === "file" &&
          hits.map((h, i) => (
            <button
              key={`${h.from}-${h.to}`}
              type="button"
              data-testid={`search-hit-row-${i}`}
              onClick={() => applyActive(i)}
              onMouseEnter={() => applyActive(i)}
              style={rowStyle(i === active)}
            >
              {summary(h.text)}
            </button>
          ))}
        {scope === "workspace" &&
          wsHits.map((f) => (
            <div key={f.path} style={{ marginBottom: 6 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#555",
                  padding: "2px 6px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={f.relPath}
              >
                {f.name}
              </div>
              {f.lines.map((l) => (
                <button
                  key={`${f.path}:${l.line}`}
                  type="button"
                  data-testid="ws-hit-row"
                  onClick={() => onOpenWorkspaceHit(f.path, query)}
                  style={{ ...rowStyle(false), fontFamily: "Consolas, monospace", fontSize: 12 }}
                >
                  <span style={{ color: "#aaa", marginRight: 6, userSelect: "none" }}>{l.line}</span>
                  {summary(l.text)}
                </button>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

function rowStyle(active: boolean): CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    border: "none",
    background: active ? "var(--tree-active-bg, #e3edf7)" : "transparent",
    padding: "4px 8px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12.5,
    color: "inherit",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };
}
